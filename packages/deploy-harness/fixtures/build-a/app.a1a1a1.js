// Build A shell. Content-hashed (a1a1a1). Exposes window.app for the harness to drive.
const BUILD_ID = 'A';
const SCHEMA = 1;

function setCookie(n, v) { document.cookie = `${n}=${v}; path=/`; }
function delCookie(n) { document.cookie = `${n}=; path=/; max-age=0`; }
function getCookie(n) { return (document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')) || [])[1]; }

function idb(fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('appdb', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      try { fn(db, resolve, reject); } catch (e) { reject(e); }
    };
  });
}
const idbPut = (user) => idb((db, res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ user, secret: 'idb-of-' + user }, 'currentUser'); tx.oncomplete = () => res(true); });
const idbClear = () => idb((db, res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').clear(); tx.oncomplete = () => res(true); });
const idbKeys = () => idb((db, res) => { const tx = db.transaction('kv', 'readonly'); const rq = tx.objectStore('kv').getAll(); rq.onsuccess = () => res(rq.result); });

async function signIn(user) {
  setCookie('sid', 'tok-' + user);
  localStorage.setItem('user:' + user + ':profile', JSON.stringify({ user, secret: 'ls-of-' + user }));
  localStorage.setItem('currentUser', user);
  await idbPut(user);
  const cache = await caches.open('user-data');
  await cache.put('/u/' + user, new Response('cache-of-' + user));
}

async function signOut() {
  delCookie('sid'); delCookie('sid2');
  for (const k of Object.keys(localStorage)) if (/^user:/.test(k)) localStorage.removeItem(k);
  localStorage.removeItem('currentUser');
  await caches.delete('user-data');
  await idbClear();
}

function authState() { return getCookie('sid') || getCookie('sid2') ? 'authed' : 'signed-out'; }

async function loadRoute() {
  try {
    const mod = await import('/chunk.a1a1a1.js');
    sessionStorage.removeItem('chunk-reloaded');
    return mod.routeBuild;
  } catch (e) {
    if (!sessionStorage.getItem('chunk-reloaded')) {
      sessionStorage.setItem('chunk-reloaded', '1'); // guard against a reload loop
      location.reload();
      return new Promise(() => {});
    }
    throw e;
  }
}

// Waits (bounded) for a new SW to reach 'installed' while this tab already has a controller —
// i.e. an update genuinely available, not just first install. Never resolves indefinitely
// (P-503: a waiting worker must be surfaced, not sat on forever).
function waitForRegistrationUpdate() {
  return navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) return null;
    return new Promise((resolve) => {
      let done = false;
      const finish = (w) => { if (!done) { done = true; resolve(w || null); } };
      if (reg.waiting && navigator.serviceWorker.controller) return finish(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) finish(nw);
        });
      });
      reg.update().catch(() => {});
      setTimeout(() => finish(reg.waiting), 5000);
    });
  });
}

// Explicit, user-confirmed-style activation of a waiting worker. Never fires on its own —
// only in response to this call (P-504: skipWaiting must not swap assets under a live tab
// unless the app chose to activate it).
async function applyUpdate() {
  const waiting = await waitForRegistrationUpdate();
  if (!waiting) return false;
  const changed = new Promise((res) => navigator.serviceWorker.addEventListener('controllerchange', res, { once: true }));
  waiting.postMessage({ type: 'skip-waiting' });
  await changed;
  return true;
}

// A breaking version must not just be flagged — the client must actually converge on it.
async function forceUpdateNow() {
  await applyUpdate();
  location.reload();
}

async function checkUpdate() {
  const v = await fetch('/version.json', { cache: 'no-store' }).then((r) => r.json());
  if (v.build !== BUILD_ID) {
    window.app.updateState = v.breaking ? 'forced' : 'available';
    if (v.breaking) await forceUpdateNow();
  }
  return window.app.updateState;
}

async function callApi() {
  const data = await fetch('/api/data.json', { cache: 'no-store' }).then((r) => r.json());
  if (data.minClient && data.minClient !== BUILD_ID && data.minClient > BUILD_ID) {
    window.app.apiSkew = true;
    window.app.updateState = 'forced'; // old shell vs new API -> force update, never blank
    return { handled: true, skew: true };
  }
  return { handled: true, skew: false };
}

async function swBuildId() {
  await navigator.serviceWorker.ready;
  const sw = navigator.serviceWorker.controller;
  if (!sw) return null;
  return new Promise((res) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => res(e.data);
    sw.postMessage({ type: 'build-id' }, [ch.port2]);
  });
}

function boot() {
  let booted = false;
  try {
    // A persists its own state shape so a later build must migrate it.
    localStorage.setItem('appState', JSON.stringify({ schema: SCHEMA, data: { legacy: true } }));
    document.getElementById('app').textContent = 'Build ' + BUILD_ID;
    booted = true;
  } catch (e) {
    document.getElementById('app').textContent = 'Build ' + BUILD_ID + ' (recovered)';
    booted = true;
  }
  window.app.booted = booted;
}

window.app = {
  buildId: BUILD_ID,
  schema: SCHEMA,
  booted: false,
  updateState: 'none',
  apiSkew: false,
  loadRoute, signIn, signOut, authState, checkUpdate, callApi, swBuildId,
  waitForRegistrationUpdate, applyUpdate,
  lsKeys: () => Object.keys(localStorage),
  idbKeys,
  async cacheKeys() {
    if (!('caches' in window)) return [];
    const names = await caches.keys();
    const out = [];
    for (const n of names) { const c = await caches.open(n); out.push(...(await c.keys()).map((r) => r.url)); }
    return out;
  },
};

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
boot();
