(function () {
  'use strict';

  // Handles SPA navigation within Monday.com — pushState/replaceState events
  // and DOM mutations that open task panels without triggering a full URL change.
  // The background service worker handles cross-tab URL changes and clears.

  // For the local desktop application, Tally runs at http://127.0.0.1:5610/task
  // If you are testing within the AI Studio preview, you can change this to your Development App URL /api/task (e.g. http://localhost:3000/api/task)
  const TALLY = 'http://127.0.0.1:5610/task';
  let lastKey = '';
  let debounce = null;

  function extractIds() {
    const url = location.href;
    const board = (url.match(/\/boards\/(\d+)/) || [])[1] || null;
    const item  = (url.match(/\/(?:pulses|items)\/(\d+)/) || url.match(/[?&]item_id=(\d+)/) || [])[1] || null;
    return { board, item };
  }

  function ping() {
    const { board, item } = extractIds();
    if (!item) return;
    const key = (board || '') + ':' + item;
    if (key === lastKey) return;
    lastKey = key;
    fetch(TALLY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board_id: board, task_id: item })
    }).catch(() => {});
  }

  // Intercept History API (Monday is a React SPA)
  ['pushState', 'replaceState'].forEach(function (fn) {
    var orig = history[fn].bind(history);
    history[fn] = function () { orig.apply(history, arguments); schedule(); };
  });
  window.addEventListener('popstate', schedule);

  function schedule() {
    clearTimeout(debounce);
    debounce = setTimeout(ping, 400);
  }

  // Watch for task panels that open by changing data attributes without a URL change
  new MutationObserver(schedule).observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['data-item-id', 'data-pulse-id']
  });

  ping();
})();
