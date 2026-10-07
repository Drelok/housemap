'use strict';

// The start page: open a known project, start a new one (a short wizard), open an existing
// project folder, or delete a project.

let known = []; // projects listed on the start page
let deleting = false; // picking a project to delete
let doomed = null; // the project named in the delete dialog

async function showLanding(note = '') {
  $('#editor').hidden = true;
  $('#landing').hidden = false;
  $('#wizard').hidden = true;
  $('#landingHome').hidden = false;
  document.title = 'House Map & Issue Tracker';
  $('#btnOpenFolder').hidden = !store.canPickFolder;
  $('#storageNote').hidden = store.canPickFolder;
  $('#btnCreate').textContent = store.canPickFolder ? 'Choose folder and create' : 'Create project';
  $('#landingNote').textContent = note;
  $('#landingNote').hidden = !note;
  deleting = false;
  known = await projects.list();
  if (!store.canPickFolder) {
    for (const p of await projects.inBrowser()) {
      const listed = await Promise.all(known.map((k) => k.handle.isSameEntry(p.handle)));
      if (!listed.includes(true)) known.push(p);
    }
  }
  renderProjects();
}

function renderProjects() {
  $('#projectList').className = deleting ? 'deleting' : '';
  $('#projectList').innerHTML = (deleting ? '<p class="warn">Choose the project to delete.</p>' : '')
    + known.map((p, i) => `<button class="project" data-i="${i}"><b>${esc(p.name)}</b><span>${esc(p.handle.name)}</span></button>`).join('');
  $('#btnTrash').hidden = !known.length;
  $('#btnTrash').classList.toggle('active', deleting);
  $('#btnTrash').title = deleting ? 'Cancel deleting' : 'Delete a project';
}

async function startEditor(p) {
  await store.dir(DIR_UNPROCESSED, true);
  await store.dir(DIR_PROCESSED, true);
  plan = p;
  floorId = plan.floors[0].id;
  sel = null;
  sheetViews = {};
  onIssues = onHouse = false;
  showSide('details');
  $('#aerial').dataset.file = '';
  $('#underlay').removeAttribute('src');
  projects.remember(store.root, plan.name);
  // A project kept in the browser is asked to be held on to, so the browser does not clear it
  // out when the device runs short of space or the app goes unused for a while.
  if (!store.canPickFolder) navigator.storage.persist?.().catch(() => {});
  resetHistory();
  showSaveState('saved');
  for (const k of Object.keys(layers)) layers[k] = true;
  showOutline = true;
  $('#landing').hidden = true;
  $('#editor').hidden = false;
  setTool('select');
  fitView();
  renderAll();
  await refreshUnprocessed();
  showTips(floor().kind);
}

async function readPlan(file) {
  try {
    const p = JSON.parse(await file.text());
    return isPlan(p) ? normalizePlan(p) : null;
  } catch {
    return null;
  }
}

async function openProject(root) {
  store.root = root;
  let name = await store.findPlanFile();
  let p = name && await readPlan(await store.file(name));
  // A plan that is missing or cannot be read is brought back from the copy saved beside it.
  const backup = p ? null : await store.findBackup(name);
  const restored = backup && await readPlan(await store.file(backup));
  if (restored) {
    p = restored;
    name ||= backup.slice(0, -BACKUP_EXT.length);
  }
  if (!p) {
    store.root = null;
    await tell(name ? `${name} is not a House Map plan.` : 'That folder has no plan file. Use “New project” to set it up.');
    return;
  }
  store.planFile = name;
  await startEditor(p);
  if (restored) {
    unsaved = true;
    await flushSave();
    tell(`The plan file was missing or damaged, so it has been restored from its backup copy (${backup}). The last change or two made before the app was closed may be missing; check your most recent work.`);
  }
}

async function closeProject() {
  await flushSave();
  await projects.remember(store.root, plan.name);
  for (const path of [...urls.keys()]) dropUrl(path);
  store.root = null;
  plan = null;
  // The photo preview and the full-size viewer float over the page, so they are put away too.
  sel = null;
  $('#popover').hidden = true;
  $('#popover').dataset.key = '';
  closeLightbox();
  showLanding();
}

const landingError = (e) => {
  if (e.name !== 'AbortError') tell('Could not open the project: ' + e.message);
};

// ---------- deleting a project ----------

async function countFiles(dir) {
  let n = 0;
  for await (const h of dir.values()) n += h.kind === 'file' ? 1 : await countFiles(h);
  return n;
}

// What the app keeps in a project folder. Nothing else in the folder is ever touched.
async function projectContents(root) {
  const found = { plans: [], photos: 0, reference: 0, quotes: 0 };
  for await (const [name, h] of root.entries()) {
    if (h.kind === 'file' && (name.endsWith('.housemap.json') || name.endsWith('.housemap.json' + BACKUP_EXT))) found.plans.push(name);
    if (h.kind === 'directory' && name === 'photos') found.photos = await countFiles(h);
    if (h.kind === 'directory' && name === 'reference') found.reference = await countFiles(h);
    if (h.kind === 'directory' && name === 'quotes') found.quotes = await countFiles(h);
  }
  return found;
}

async function askDelete(p) {
  let found;
  try {
    if (!(await allowed(p.handle))) return;
    found = await projectContents(p.handle);
  } catch {
    if (await ask(`The folder for “${p.name}” can no longer be found. Remove it from this list?`, { ok: 'Remove from list' })) {
      await projects.forget(p.handle);
      showLanding();
    }
    return;
  }
  doomed = p;
  const items = [
    ...found.plans.map((n) => `the plan file <code>${esc(n)}</code>`),
    found.photos ? `the <code>photos</code> folder and the ${found.photos} file(s) in it, placed and unplaced` : 'the <code>photos</code> folder',
    found.reference ? `the <code>reference</code> folder (${found.reference} file(s), including the aerial picture)` : '',
    found.quotes ? `the <code>quotes</code> folder (${found.quotes} quote file(s) attached to issues)` : '',
  ].filter(Boolean);
  $('#deleteTitle').textContent = `Delete “${p.name}”?`;
  $('#deleteBody').innerHTML = `<p>This permanently deletes, from the folder <code>${esc(p.handle.name)}</code>:</p>
    <ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul>
    <p>The folder itself is removed too if nothing else is left in it. Any other files in it are not touched.</p>
    <p class="warn">Deleted files do not go to the Recycle Bin and cannot be brought back.</p>`;
  $('#deleteSure').checked = false;
  $('#btnDeleteProject').disabled = true;
  $('#deleteDialog').returnValue = '';
  $('#deleteDialog').showModal();
}

async function deleteProject(p) {
  const root = p.handle;
  const found = await projectContents(root);
  for (const name of found.plans) await root.removeEntry(name);
  for (const name of ['photos', 'reference', 'quotes']) {
    await root.removeEntry(name, { recursive: true }).catch((e) => {
      if (e.name !== 'NotFoundError') throw e;
    });
  }
  let folderGone = false;
  try {
    await root.remove(); // only succeeds on an empty folder
    folderGone = true;
  } catch {
    // Other files are still in it, or this browser cannot remove a folder it was given.
  }
  await projects.forget(root);
  return folderGone;
}

$('#btnTrash').addEventListener('click', () => {
  deleting = !deleting;
  renderProjects();
});

$('#deleteSure').addEventListener('change', (e) => {
  $('#btnDeleteProject').disabled = !e.target.checked;
});

$('#deleteDialog').addEventListener('close', async (e) => {
  const p = doomed;
  doomed = null;
  if (e.target.returnValue !== 'delete' || !$('#deleteSure').checked) return showLanding();
  try {
    const gone = await deleteProject(p);
    showLanding(gone
      ? `“${p.name}” and its folder were deleted.`
      : `“${p.name}” was deleted. The folder ${p.handle.name} was left in place; delete it yourself if it is no longer needed.`);
  } catch (err) {
    showLanding(`“${p.name}” could not be fully deleted: ${err.message}`);
  }
});

// ---------- opening and creating ----------

$('#projectList').addEventListener('click', async (e) => {
  const p = known[e.target.closest('.project')?.dataset.i];
  if (!p) return;
  if (deleting) return askDelete(p);
  try {
    if (await allowed(p.handle)) await openProject(p.handle);
  } catch (err) {
    if (err.name === 'NotFoundError' && await ask(`The folder for “${p.name}” can no longer be found. Remove it from this list?`, { ok: 'Remove from list' })) {
      await projects.forget(p.handle);
      return showLanding();
    }
    landingError(err);
  }
});

$('#btnStartNew').addEventListener('click', () => {
  $('#landingHome').hidden = true;
  $('#wizard').hidden = false;
  $('#wizName').focus();
});

$('#btnWizBack').addEventListener('click', () => showLanding());

$('#btnOpenFolder').addEventListener('click', () => store.pickFolder().then(openProject).catch(landingError));

$('#wizPlan').addEventListener('change', (e) => {
  $('#wizFloorRow').hidden = e.target.files.length > 0;
  $('#wizPlanNote').hidden = !e.target.files.length;
});

$('#wizard').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#wizName').value.trim() || 'Untitled house';
  try {
    // The folder picker has to come first, while the click still counts as a user action.
    store.root = store.canPickFolder ? await store.pickFolder() : await store.browserFolder(name);
    const existing = await store.findPlanFile();
    if (existing) {
      if (await ask(`That folder already holds a project (${existing}). Open it instead?`, { ok: 'Open it' })) return await openProject(store.root);
      store.root = null;
      return;
    }
    let p = newPlan({ name, address: $('#wizAddress').value.trim(), floors: +$('#wizFloors').value || 1, basement: $('#wizBasement').checked });
    const file = $('#wizPlan').files[0];
    if (file) {
      const button = $('#btnCreate');
      const label = button.textContent;
      const zipped = /\.zip$/i.test(file.name);
      try {
        p = zipped ? await unpackProject(file, (i, n) => { button.textContent = `Unpacking ${i} of ${n}…`; }) : await readPlan(file);
      } finally {
        button.textContent = label;
      }
      if (!p) {
        store.root = null;
        return tell(zipped ? 'That zip file does not hold a House Map project.' : 'That file is not a House Map plan.');
      }
      // What was typed here is what the new project is called; the file's own name and address
      // belong to the project it came from.
      p.name = name;
      if ($('#wizAddress').value.trim()) p.address = $('#wizAddress').value.trim();
    }
    store.planFile = PLAN_FILE;
    await store.write(PLAN_FILE, planFileText(p));
    await store.write(PLAN_FILE + BACKUP_EXT, planFileText(p));
    $('#wizard').reset();
    $('#wizFloorRow').hidden = false;
    $('#wizPlanNote').hidden = true;
    await startEditor(p);
    if (file) reportMissingPhotos();
  } catch (err) {
    store.root = null;
    landingError(err);
  }
});
