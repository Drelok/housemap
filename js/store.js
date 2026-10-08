'use strict';

// A project is a folder on disk. Everything the app reads or writes goes through `store`,
// using paths relative to that folder.

const PLAN_FILE = 'plan.housemap.json';
const BACKUP_EXT = '.bak'; // the second copy of the plan kept beside it: plan.housemap.json.bak
const DIR_UNPROCESSED = 'photos/unprocessed';
const DIR_PROCESSED = 'photos/processed';
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i;
// The preview of a change waiting to be merged is published under /preview/ on the same site, so
// it would share the browser's storage with the app itself. It keeps its own instead: its projects,
// its list of recent projects and its settings never mix with the real ones.
const PREVIEW = /\/preview\//.test(location.pathname);
const STORE_NAME = PREVIEW ? 'housemap-preview' : 'housemap'; // the browser's database for the list of projects
const PROJECTS_DIR = PREVIEW ? 'preview-projects' : 'projects'; // the folder in the browser's storage for projects kept there

const store = {
  root: null,
  planFile: PLAN_FILE,
  // Without a folder picker (Firefox, Safari) projects live in the browser's private storage.
  canPickFolder: 'showDirectoryPicker' in window && !/[?&]storage=browser/.test(location.search),

  pickFolder() {
    return window.showDirectoryPicker({ mode: 'readwrite' });
  },

  async browserFolder(name) {
    const projects = await (await navigator.storage.getDirectory()).getDirectoryHandle(PROJECTS_DIR, { create: true });
    return projects.getDirectoryHandle(slug(name, 'house') + '-' + uid(), { create: true });
  },

  // The tutorial house always has the same folder in the browser's storage, wherever the
  // user's own projects are kept, so opening it again finds the copy already there.
  async tutorialFolder() {
    const projects = await (await navigator.storage.getDirectory()).getDirectoryHandle(PROJECTS_DIR, { create: true });
    return projects.getDirectoryHandle('tutorial-house', { create: true });
  },

  async dir(path, create = false) {
    let d = this.root;
    for (const part of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(part, { create });
    return d;
  },

  async list(path) {
    const out = [];
    try {
      for await (const [name, h] of (await this.dir(path)).entries()) out.push({ name, kind: h.kind });
    } catch {
      // A folder that does not exist yet is just empty.
    }
    return out;
  },

  async file(path) {
    return (await (await this.dir(dirOf(path))).getFileHandle(baseOf(path))).getFile();
  },

  async write(path, data) {
    const h = await (await this.dir(dirOf(path), true)).getFileHandle(baseOf(path), { create: true });
    const w = await h.createWritable();
    await w.write(data);
    await w.close();
  },

  async remove(path) {
    await (await this.dir(dirOf(path))).removeEntry(baseOf(path));
  },

  async move(from, to) {
    await this.write(to, await this.file(from));
    await this.remove(from);
  },

  // Removes a folder only if it is empty.
  async prune(path) {
    try {
      await this.remove(path);
    } catch {
      // Not empty, or already gone.
    }
  },

  // numbered: base-01.ext, base-02.ext ...; otherwise base.ext, then base-2.ext ...
  async freeName(dir, base, ext, numbered = false) {
    const taken = new Set((await this.list(dir)).map((e) => e.name.toLowerCase()));
    for (let n = 1; ; n++) {
      const name = (numbered ? `${base}-${String(n).padStart(2, '0')}` : n === 1 ? base : `${base}-${n}`) + ext;
      if (!taken.has(name.toLowerCase())) return name;
    }
  },

  async findPlanFile() {
    const names = (await this.list('')).filter((e) => e.kind === 'file').map((e) => e.name);
    return names.includes(PLAN_FILE) ? PLAN_FILE : names.find((n) => n.endsWith('.housemap.json')) || null;
  },

  // The second copy of a plan, for when the plan itself is missing or cannot be read.
  async findBackup(planName) {
    const names = (await this.list('')).filter((e) => e.kind === 'file').map((e) => e.name);
    const wanted = (planName || PLAN_FILE) + BACKUP_EXT;
    return names.includes(wanted) ? wanted : names.find((n) => n.endsWith('.housemap.json' + BACKUP_EXT)) || null;
  },
};

// File operations run one at a time, in the order they were asked for.
let ioChain = Promise.resolve();
function io(fn) {
  const run = ioChain.then(fn);
  ioChain = run.catch(() => {});
  return run;
}

async function allowed(handle) {
  if (!handle.queryPermission) return true;
  const o = { mode: 'readwrite' };
  return (await handle.queryPermission(o)) === 'granted' || (await handle.requestPermission(o)) === 'granted';
}

// ---------- last opened project (IndexedDB can hold folder handles) ----------

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(STORE_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      // Safari cannot keep a folder handle here and throws instead of failing the request. Left
      // uncaught, that would leave the promise waiting forever, and whatever awaits it with it.
      try {
        const tx = open.result.transaction('kv', mode);
        const req = fn(tx.objectStore('kv'));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = tx.onabort = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    };
  });
}

// Projects opened in this browser, most recent first: [{ name, handle }].
const projects = {
  async list() {
    const saved = await idb('readonly', (s) => s.get('projects')).catch(() => null);
    if (saved) return saved;
    // Earlier versions remembered only the last project.
    const last = await idb('readonly', (s) => s.get('recent')).catch(() => null);
    return last ? [last] : [];
  },

  // Projects kept in the browser's own storage can always be found again by looking there.
  async inBrowser() {
    const found = [];
    try {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(PROJECTS_DIR);
      for await (const handle of dir.values()) {
        if (handle.kind !== 'directory') continue;
        const plan = await handle.getFileHandle(PLAN_FILE).then((h) => h.getFile()).then((f) => f.text()).then(JSON.parse).catch(() => null);
        if (plan) found.push({ name: plan.name || handle.name, handle });
      }
    } catch {
      // Nothing stored in the browser.
    }
    return found;
  },

  async without(handle) {
    const rest = [];
    for (const p of await this.list()) if (!(await p.handle.isSameEntry(handle))) rest.push(p);
    return rest;
  },

  async remember(handle, name) {
    const list = [{ name, handle }, ...(await this.without(handle))];
    await idb('readwrite', (s) => s.put(list, 'projects')).catch(() => {});
  },

  async forget(handle) {
    const list = await this.without(handle);
    await idb('readwrite', (s) => s.put(list, 'projects')).catch(() => {});
  },
};
