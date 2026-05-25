// ClipGenius - Options page logic

document.addEventListener('DOMContentLoaded', async () => {
  // Load saved settings
  const settings = await chrome.storage.local.get(['notionApiKey', 'notionDatabaseId']);
  document.getElementById('notionApiKey').value = settings.notionApiKey || '';
  document.getElementById('notionDatabaseId').value = settings.notionDatabaseId || '';

  // Load usage stats
  const count = await chrome.runtime.sendMessage({ action: 'checkLimit' });
  document.getElementById('todayClips').textContent = count.count;
  
  const clips = await chrome.runtime.sendMessage({ action: 'getClips', filter: {} });
  document.getElementById('totalClips').textContent = clips.length;

  // Save handler
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const notionApiKey = document.getElementById('notionApiKey').value.trim();
    const notionDatabaseId = document.getElementById('notionDatabaseId').value.trim();
    await chrome.storage.local.set({ notionApiKey, notionDatabaseId });
    
    const feedback = document.getElementById('feedback');
    feedback.classList.add('show');
    setTimeout(() => feedback.classList.remove('show'), 2000);
  });
});