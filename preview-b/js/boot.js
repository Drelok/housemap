'use strict';

// Runs first, from the page's head. It is a file rather than a script written into the page
// because the page's security policy only runs scripts that come from files.

// Browsers tend to keep running old copies of these files after they change. A fresh address on
// every load makes sure the current ones are used.
const fresh = (path) => path + '?v=' + Date.now();
document.write(`<link rel="stylesheet" href="${fresh('css/style.css')}">`);

// Installing the app needs the manifest and the service worker (sw.js), which keeps a copy of the
// app so that it opens with no connection. Neither works for a page opened straight from disk.
// The service worker is used where the app is hosted; on this computer only when asked for with
// ?pwa, so that testing always runs the files as they are on disk.
if (location.protocol.startsWith('http')) {
  document.write('<link rel="manifest" href="manifest.webmanifest">');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if ('serviceWorker' in navigator && (!local || /[?&]pwa\b/.test(location.search))) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
