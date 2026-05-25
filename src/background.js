// ClipGenius - AI Web Clipper with Auto Tags
// Background Service Worker: Calls DeepSeek API for tags + summary

const DEEPSEEK_API_KEY = 'sk-28cbb9c2e8c34e00b3aa0b7a0b5c6d8e';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DAILY_LIMIT = 5;

async function getDailyCount() {
  const today = new Date().toISOString().split('T')[0];
  const result = await chrome.storage.local.get(['dailyCount', 'dailyDate']);
  if (result.dailyDate !== today) {
    await chrome.storage.local.set({ dailyCount: 0, dailyDate: today });
    return 0;
  }
  return result.dailyCount || 0;
}

async function incrementDailyCount() {
  const count = await getDailyCount();
  await chrome.storage.local.set({ dailyCount: count + 1 });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateTags') {
    generateTagsAndSummary(request.content).then(sendResponse);
    return true;
  }
  if (request.action === 'checkLimit') {
    getDailyCount().then(count => sendResponse({ count, limit: DAILY_LIMIT }));
    return true;
  }
  if (request.action === 'saveClip') {
    saveClip(request.clip).then(result => sendResponse(result));
    return true;
  }
  if (request.action === 'getClips') {
    getClips(request.filter).then(clips => sendResponse(clips));
    return true;
  }
  if (request.action === 'deleteClip') {
    deleteClip(request.id).then(() => sendResponse({ success: true }));
    return true;
  }
  if (request.action === 'exportToNotion') {
    exportToNotion(request.clip).then(sendResponse);
    return true;
  }
});

async function generateTagsAndSummary(content) {
  const prompt = `Analyze the following webpage content and generate:
1) 3-5 English tags (single words or short phrases, comma separated)
2) A one-sentence English summary (under 150 characters)

Content: ${content.body}

Title: ${content.title}
Domain: ${content.domain}

Respond in JSON format: {"tags": ["tag1", "tag2", "tag3"], "summary": "one sentence summary"}`;

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a precise content classifier. Always respond in valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 200
      })
    });

    const data = await response.json();
    const raw = data.choices[0].message.content;
    
    // Parse JSON from response
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Try to extract JSON from markdown code block
      const match = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      if (match) {
        parsed = JSON.parse(match[1]);
      } else {
        throw new Error('Could not parse AI response');
      }
    }
    
    return { success: true, tags: parsed.tags, summary: parsed.summary };
  } catch (error) {
    console.error('DeepSeek API error:', error);
    return { success: false, error: error.message };
  }
}

async function saveClip(clip) {
  const result = await chrome.storage.local.get(['clips']);
  const clips = result.clips || [];
  
  clip.id = Date.now().toString();
  clip.createdAt = new Date().toISOString();
  
  clips.unshift(clip);
  
  // Keep max 500 clips
  if (clips.length > 500) {
    clips.length = 500;
  }
  
  await chrome.storage.local.set({ clips });
  await incrementDailyCount();
  
  return { success: true, clip };
}

async function getClips(filter) {
  const result = await chrome.storage.local.get(['clips']);
  let clips = result.clips || [];
  
  if (filter?.tag) {
    clips = clips.filter(c => c.tags && c.tags.includes(filter.tag));
  }
  
  if (filter?.date) {
    clips = clips.filter(c => c.createdAt && c.createdAt.startsWith(filter.date));
  }
  
  if (filter?.search) {
    const q = filter.search.toLowerCase();
    clips = clips.filter(c => 
      (c.title && c.title.toLowerCase().includes(q)) ||
      (c.summary && c.summary.toLowerCase().includes(q)) ||
      (c.tags && c.tags.some(t => t.toLowerCase().includes(q)))
    );
  }
  
  return clips;
}

async function deleteClip(id) {
  const result = await chrome.storage.local.get(['clips']);
  const clips = result.clips || [];
  const filtered = clips.filter(c => c.id !== id);
  await chrome.storage.local.set({ clips: filtered });
}

async function exportToNotion(clip) {
  const settings = await chrome.storage.local.get(['notionApiKey', 'notionDatabaseId']);
  
  if (!settings.notionApiKey || !settings.notionDatabaseId) {
    return { success: false, error: 'Notion API Key or Database ID not configured' };
  }
  
  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.notionApiKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        parent: { database_id: settings.notionDatabaseId },
        properties: {
          Name: { title: [{ text: { content: clip.title } }] },
          URL: { url: clip.url },
          Tags: { multi_select: (clip.tags || []).map(t => ({ name: t })) },
          Summary: { rich_text: [{ text: { content: clip.summary || '' } }] },
          Domain: { rich_text: [{ text: { content: clip.domain || '' } }] }
        },
        children: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ text: { content: clip.body ? clip.body.substring(0, 2000) : '' } }]
            }
          }
        ]
      })
    });
    
    const data = await response.json();
    if (response.ok) {
      return { success: true, notionUrl: data.url };
    } else {
      return { success: false, error: data.message || 'Notion API error' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}