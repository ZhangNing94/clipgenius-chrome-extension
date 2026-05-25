// ClipGenius - Popup UI Logic

let currentClip = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Update daily count
  updateDailyCount();
  
  // Extract page content
  await extractAndProcess();
  
  // Button handlers
  document.getElementById('saveBtn').addEventListener('click', saveClip);
  document.getElementById('copyMdBtn').addEventListener('click', copyMarkdown);
  document.getElementById('notionBtn').addEventListener('click', exportToNotion);
  document.getElementById('retryBtn').addEventListener('click', extractAndProcess);
  
  // Navigation
  document.getElementById('historyBtn').addEventListener('click', showHistory);
  document.getElementById('settingsBtn').addEventListener('click', showSettings);
  document.getElementById('backBtn').addEventListener('click', showMain);
  document.getElementById('settingsBackBtn').addEventListener('click', showMain);
  
  // History filters
  document.getElementById('searchInput').addEventListener('input', loadClips);
  document.getElementById('tagFilter').addEventListener('change', loadClips);
  
  // Settings
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  loadSettings();
});

async function updateDailyCount() {
  const count = await chrome.runtime.sendMessage({ action: 'checkLimit' });
  document.getElementById('dailyCount').textContent = `${count.count}/${count.limit}`;
  if (count.count >= count.limit) {
    document.getElementById('dailyCount').style.background = 'rgba(255,255,255,0.4)';
  }
}

async function extractAndProcess() {
  showState('loading');
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });
    
    if (!response || !response.content || !response.content.body || response.content.body.length < 50) {
      showState('error');
      return;
    }
    
    // Display content
    document.getElementById('clipTitle').textContent = response.content.title;
    document.getElementById('clipDomain').textContent = response.content.domain;
    document.getElementById('clipUrl').href = response.content.url;
    
    // Generate AI tags & summary
    const aiResult = await chrome.runtime.sendMessage({
      action: 'generateTags',
      content: response.content
    });
    
    if (aiResult.success) {
      renderTags(aiResult.tags);
      document.getElementById('summaryText').textContent = aiResult.summary;
      document.getElementById('summaryText').classList.remove('summary-loading');
    } else {
      document.getElementById('tagsContainer').innerHTML = '<span class="tag-loading">Tags unavailable</span>';
      document.getElementById('summaryText').textContent = 'Summary generation failed. Try again.';
      document.getElementById('summaryText').classList.remove('summary-loading');
    }
    
    // Store for later save
    currentClip = {
      title: response.content.title,
      url: response.content.url,
      domain: response.content.domain,
      body: response.content.body,
      tags: aiResult.success ? aiResult.tags : [],
      summary: aiResult.success ? aiResult.summary : ''
    };
    
    showState('result');
  } catch (error) {
    console.error('Extraction error:', error);
    showState('error');
  }
}

function renderTags(tags) {
  const container = document.getElementById('tagsContainer');
  container.innerHTML = tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
}

async function saveClip() {
  if (!currentClip) return;
  
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.textContent = '⏳ Saving...';
  saveBtn.disabled = true;
  
  const result = await chrome.runtime.sendMessage({
    action: 'saveClip',
    clip: currentClip
  });
  
  if (result.success) {
    const feedback = document.getElementById('saveFeedback');
    feedback.classList.remove('hidden');
    setTimeout(() => feedback.classList.add('hidden'), 2000);
    updateDailyCount();
    
    // Update currentClip with id for later reference
    currentClip.id = result.clip.id;
  }
  
  saveBtn.textContent = '💾 Save Clip';
  saveBtn.disabled = false;
}

async function copyMarkdown() {
  if (!currentClip) return;
  
  const tags = (currentClip.tags || []).map(t => `#${t}`).join(' ');
  const md = `# ${currentClip.title}\n\n${tags}\n\n> ${currentClip.summary}\n\n**Source:** ${currentClip.url}\n\n---\n\n${currentClip.body}`;
  
  try {
    await navigator.clipboard.writeText(md);
    const btn = document.getElementById('copyMdBtn');
    const original = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch {
    alert('Failed to copy to clipboard');
  }
}

async function exportToNotion() {
  if (!currentClip) return;
  
  const btn = document.getElementById('notionBtn');
  btn.textContent = '⏳ Exporting...';
  btn.disabled = true;
  
  const result = await chrome.runtime.sendMessage({
    action: 'exportToNotion',
    clip: currentClip
  });
  
  if (result.success) {
    btn.textContent = '✅ Exported!';
    setTimeout(() => { btn.textContent = '📤 Notion'; }, 2000);
  } else {
    btn.textContent = '❌ Failed';
    if (result.error === 'Notion API Key or Database ID not configured') {
      showSettings();
    }
    setTimeout(() => { btn.textContent = '📤 Notion'; }, 2000);
  }
  btn.disabled = false;
}

// ============== Navigation ==============

function showState(state) {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('clipResult').classList.add('hidden');
  document.getElementById('errorState').classList.add('hidden');
  
  switch (state) {
    case 'loading':
      document.getElementById('loadingState').classList.remove('hidden');
      break;
    case 'result':
      document.getElementById('clipResult').classList.remove('hidden');
      break;
    case 'error':
      document.getElementById('errorState').classList.remove('hidden');
      break;
  }
}

function showMain() {
  document.getElementById('mainView').classList.remove('hidden');
  document.getElementById('historyView').classList.add('hidden');
  document.getElementById('settingsView').classList.add('hidden');
}

function showHistory() {
  document.getElementById('mainView').classList.add('hidden');
  document.getElementById('settingsView').classList.add('hidden');
  document.getElementById('historyView').classList.remove('hidden');
  loadClips();
}

function showSettings() {
  document.getElementById('mainView').classList.add('hidden');
  document.getElementById('historyView').classList.add('hidden');
  document.getElementById('settingsView').classList.remove('hidden');
  loadSettings();
}

// ============== History ==============

async function loadClips() {
  const search = document.getElementById('searchInput').value;
  const tag = document.getElementById('tagFilter').value;
  
  const clips = await chrome.runtime.sendMessage({
    action: 'getClips',
    filter: { search: search || undefined, tag: tag || undefined }
  });
  
  const list = document.getElementById('clipsList');
  
  if (!clips || clips.length === 0) {
    list.innerHTML = '<p class="empty-state">No clips saved yet. Start clipping!</p>';
    return;
  }
  
  // Update tag filter options
  updateTagFilter(clips);
  
  list.innerHTML = clips.map(clip => `
    <div class="clip-item">
      <div class="clip-item-title">${escapeHtml(clip.title)}</div>
      <div class="clip-item-meta">
        <div class="clip-item-tags">
          ${(clip.tags || []).map(t => `<span class="clip-item-tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        <div class="clip-item-actions">
          <button data-id="${clip.id}" data-action="copy" title="Copy as Markdown">📋</button>
          <button data-id="${clip.id}" data-action="open" title="Open URL">🔗</button>
          <button data-id="${clip.id}" data-action="delete" title="Delete">🗑️</button>
        </div>
      </div>
    </div>
  `).join('');
  
  // Add event listeners to clip items
  list.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const clip = clips.find(c => c.id === id);
      
      if (action === 'copy' && clip) {
        const tags = (clip.tags || []).map(t => `#${t}`).join(' ');
        const md = `# ${clip.title}\n\n${tags}\n\n> ${clip.summary}\n\n**Source:** ${clip.url}\n\n---\n\n${clip.body}`;
        await navigator.clipboard.writeText(md);
        btn.textContent = '✅';
        setTimeout(() => { btn.textContent = '📋'; }, 1500);
      } else if (action === 'open' && clip) {
        chrome.tabs.create({ url: clip.url });
      } else if (action === 'delete') {
        await chrome.runtime.sendMessage({ action: 'deleteClip', id });
        loadClips();
      }
    });
  });
}

function updateTagFilter(allClips) {
  const allTags = new Set();
  allClips.forEach(c => (c.tags || []).forEach(t => allTags.add(t)));
  
  const select = document.getElementById('tagFilter');
  const currentValue = select.value;
  
  select.innerHTML = '<option value="">All Tags</option>' +
    [...allTags].sort().map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  
  select.value = currentValue;
}

// ============== Settings ==============

async function loadSettings() {
  const settings = await chrome.storage.local.get(['notionApiKey', 'notionDatabaseId']);
  document.getElementById('notionKey').value = settings.notionApiKey || '';
  document.getElementById('notionDbId').value = settings.notionDatabaseId || '';
}

async function saveSettings() {
  const notionApiKey = document.getElementById('notionKey').value.trim();
  const notionDatabaseId = document.getElementById('notionDbId').value.trim();
  
  await chrome.storage.local.set({ notionApiKey, notionDatabaseId });
  
  const feedback = document.getElementById('settingsFeedback');
  feedback.classList.remove('hidden');
  setTimeout(() => feedback.classList.add('hidden'), 2000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}