'use strict';

// For the local desktop application, Tally runs at http://127.0.0.1:5610/task
// If you are testing within the AI Studio preview, you can change this to your Development App URL /api/task (e.g. http://localhost:3000/api/task)
const TALLY = 'http://127.0.0.1:5610/task';

function extractItem(url) {
  if (!url || !url.includes('monday.com')) return null;
  const m = url.match(/\/(?:pulses|items)\/(\d+)/) || url.match(/[?&]item_id=(\d+)/);
  return m ? m[1] : null;
}

function extractBoard(url) {
  const m = url && url.match(/\/boards\/(\d+)/);
  return m ? m[1] : null;
}

function parseTitle(title, url) {
  // Derive a clean label from whatever page the user navigated to
  let hostname = '';
  try { hostname = new URL(url).hostname.replace(/^www\./, ''); } catch (_) {}

  if (!title) return hostname || url;

  // Strip leading notification counts: "(3) Title" or "[3] Title"
  let t = title.replace(/^[\(\[]\d+[\)\]]\s+/, '');

  // Strip email addresses embedded in titles (Gmail-style)
  t = t.replace(/\s*[-–]\s*[\w.+%-]+@[\w.-]+/g, '');

  // Split on common separators to get [page, ..., app] parts
  const parts = t.split(/\s*[-–—|·•]\s*/).map(s => s.trim()).filter(Boolean);

  if (parts.length === 0) return hostname || url;
  if (parts.length === 1) return parts[0];

  // Last part is usually the app/service name; first is the document title
  const app  = parts[parts.length - 1];
  const page = parts[0];

  return app === page ? app : `${app} / ${page}`;
}

function post(payload) {
  fetch(TALLY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {});
}

// Per-tab last-sent key so we don't flood on every load event
const tabState = {};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== 'complete') return;

  const url   = changeInfo.url || tab.url || '';
  const title = tab.title || '';
  const item  = extractItem(url);
  const board = extractBoard(url);
  const prev  = tabState[tabId] || '';

  if (item) {
    // Monday task open — send task IDs
    const key = `${board}:${item}`;
    if (key !== prev) {
      tabState[tabId] = key;
      post({ board_id: board, task_id: item });
    }
  } else {
    // Not on a Monday task — send page context instead of nulls
    const label = parseTitle(title, url);
    const key   = `ctx:${url}`;
    if (key !== prev) {
      tabState[tabId] = key;
      post({ board_id: null, task_id: null, page_title: label, page_url: url });
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabState[tabId];
});
