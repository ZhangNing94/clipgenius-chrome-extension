// ClipGenius - AI Web Clipper with Auto Tags
// Content Script: Extracts page content using Readability-like algorithm

const DEEPSEEK_API_KEY = 'sk-28cbb9c2e8c34e00b3aa0b7a0b5c6d8e';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MAX_CONTENT_LENGTH = 3000;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extract') {
    const content = extractPageContent();
    sendResponse({ content });
  }
  return true;
});

function extractPageContent() {
  const title = document.title || '';
  const url = window.location.href;
  const domain = window.location.hostname;
  
  // Get main content using Readability-like heuristic
  const body = getMainContent();
  
  return {
    title,
    url,
    domain,
    body: body.substring(0, MAX_CONTENT_LENGTH)
  };
}

function getMainContent() {
  // Try article/meta selectors first
  const selectors = [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content',
    '#content',
    '.post-body',
    '.article-body'
  ];
  
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim().length > 200) {
      return cleanText(el.textContent);
    }
  }
  
  // Fallback: extract from body, removing nav/footer/sidebar noise
  const body = document.body.cloneNode(true);
  const noiseSelectors = 'nav, footer, header, aside, .sidebar, .nav, .menu, .footer, .header, .comments, script, style, noscript, iframe, .ad, .advertisement, .cookie, [role="navigation"], [role="banner"], [role="contentinfo"]';
  body.querySelectorAll(noiseSelectors).forEach(el => el.remove());
  
  return cleanText(body.textContent);
}

function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}