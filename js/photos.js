'use strict';

// A photo marker is placed on the plan first, then a photo from photos/unprocessed is attached to
// it. Attaching renames the file after the marker's room and moves it to
// photos/processed/<floor>/<room>/. A marker with no photo yet has an empty `file`.
//
// A marker can hold several photos taken from the same spot. The first is kept on the marker
// itself (`file`, `original`, `dir`); the others are in `more`, each with its own `id`, `file`,
// `original` and the direction it faces, `dir`. Together they are the marker's shots.

const shotsOf = (ph) => [ph, ...(ph.more || [])];
// The photo of the selected marker that is being looked at and turned. Which one that is, is
// kept on the selection as `sel.shot`.
function selShot() {
  const ph = selPhoto();
  return ph ? shotsOf(ph)[sel.shot || 0] || ph : null;
}

let unprocessed = []; // file names in photos/unprocessed
const urls = new Map(); // path -> promise of an object URL

function photoUrl(path) {
  if (!urls.has(path)) {
    urls.set(path, store.file(path).then((f) => URL.createObjectURL(f)).catch((e) => {
      urls.delete(path);
      throw e;
    }));
  }
  return urls.get(path);
}

// Small copies for the photo grid, so a folder of full-size phone photos stays quick to browse.
// They live in memory only; the files on disk are never altered.
const thumbs = new Map(); // path -> promise of an object URL
let thumbChain = Promise.resolve();

async function makeThumb(path) {
  const bmp = await createImageBitmap(await store.file(path), { resizeWidth: 240, resizeQuality: 'medium' });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  c.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close();
  return URL.createObjectURL(await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 }));
}

function thumbUrl(path) {
  if (!thumbs.has(path)) {
    const made = thumbChain.then(() => makeThumb(path));
    thumbChain = made.catch(() => {});
    made.catch(() => thumbs.delete(path));
    thumbs.set(path, made);
  }
  return thumbs.get(path);
}

function dropUrl(path) {
  for (const cache of [urls, thumbs]) {
    cache.get(path)?.then((u) => URL.revokeObjectURL(u), () => {});
    cache.delete(path);
  }
}

function hydrateImages(el) {
  for (const img of el.querySelectorAll('img[data-photo]')) {
    const path = img.dataset.photo;
    ('thumb' in img.dataset ? thumbUrl(path) : photoUrl(path)).then((u) => { img.src = u; }, () => noPreview(img, path));
    img.onerror = () => noPreview(img, path);
  }
}

// RAW and HEIC files, among others, cannot be drawn by the browser. They can still be placed.
function noPreview(img, path) {
  const box = document.createElement('div');
  box.className = 'noPreview';
  box.textContent = `No preview (${extOf(path) || 'unknown type'})`;
  img.replaceWith(box);
}

async function refreshUnprocessed() {
  const files = await store.list(DIR_UNPROCESSED);
  unprocessed = files.filter((e) => e.kind === 'file' && IMAGE_EXT.test(e.name)).map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  renderPhotos();
  if (selPhoto()) renderInspector(); // it lists the photos that can be attached
}

// ---------- shrinking photos as they come in ----------
// A phone photo is several megabytes, far more than a plan of a house needs, and a few hundred
// of them make a project too large to move about or to hand to anything else. So the copy made
// when a photo is added is a smaller one: no longer than the size chosen in the settings along
// its long edge, saved as a JPEG. The file it was copied from is never touched.

const PHOTO_QUALITY = 0.82;
const SMALL_PHOTO = 1.5 * 1024 * 1024; // a photo already this light, and small enough, is copied as it is
let importNote = ''; // what the last lot of photos added came to, shown above the photo grid

const megabytes = (n) => (n < 10 * 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) : Math.round(n / 1024 / 1024)) + ' MB';

// The copy of a photo to keep: { name, data }. `edge` is the longest its long edge may be, in
// pixels, or 0 to keep it as it is. A photo the browser cannot draw (RAW, usually HEIC) is kept
// as it is and marked `unread`, and so is a GIF, which may move, and anything that would not come
// out smaller.
async function shrinkPhoto(file, edge) {
  const same = { name: file.name, data: file };
  if (!edge || extOf(file.name) === '.gif') return same;
  let bmp;
  try {
    bmp = await createImageBitmap(file); // turned the right way up, as the camera recorded
  } catch {
    return { ...same, unread: true };
  }
  const k = Math.min(1, edge / Math.max(bmp.width, bmp.height));
  if (k === 1 && file.size <= SMALL_PHOTO) {
    bmp.close();
    return same;
  }
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const small = k < 1 ? await createImageBitmap(bmp, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' }) : bmp;
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; // a JPEG has no see-through parts
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(small, 0, 0);
  bmp.close();
  small.close();
  const data = await c.convertToBlob({ type: 'image/jpeg', quality: PHOTO_QUALITY });
  if (data.size >= file.size) return same;
  return { name: /^\.jpe?g$/.test(extOf(file.name)) ? file.name : stemOf(file.name) + '.jpg', data };
}

function addPhotos(files) {
  const images = [...files].filter((f) => IMAGE_EXT.test(f.name));
  if (!images.length) return flash('Those files are not photos.');
  // A photo whose name is already in photos/unprocessed is taken to be the same photo picked
  // twice. It is left out, and named afterwards, instead of being copied in again as a duplicate.
  const skipped = [];
  let before = 0;
  let after = 0;
  return io(async () => {
    const have = new Set((await store.list(DIR_UNPROCESSED)).map((e) => e.name.toLowerCase()));
    for (const [n, f] of images.entries()) {
      if (have.has(f.name.toLowerCase())) {
        skipped.push(f.name);
        continue;
      }
      importNote = `Adding photo ${n + 1} of ${images.length}…`;
      renderPhotoSummary();
      // A shrunk photo may be saved under another name, as IMG_1.png is under IMG_1.jpg.
      const copy = await shrinkPhoto(f, setting('photoEdge'));
      if (have.has(copy.name.toLowerCase())) {
        skipped.push(f.name);
        continue;
      }
      await store.write(`${DIR_UNPROCESSED}/${copy.name}`, copy.data);
      have.add(copy.name.toLowerCase());
      before += f.size;
      after += copy.data.size;
    }
  }).then(async () => {
    const added = images.length - skipped.length;
    importNote = !added ? '' : `Added ${added === 1 ? '1 photo' : `${added} photos`}: ${after < before ? `${megabytes(before)} shrunk to ${megabytes(after)}` : `${megabytes(after)}, kept at full size`}.`;
    await refreshUnprocessed();
    if (!skipped.length) return;
    const names = skipped.slice(0, 15).join('\n') + (skipped.length > 15 ? `\n… and ${skipped.length - 15} more` : '');
    tell(`${skipped.length === 1 ? 'This photo was' : `These ${skipped.length} photos were`} not added, because a photo with the same name is already in photos/unprocessed:\n\n${names}\n\n${added ? `The other ${added === 1 ? 'photo was' : `${added} photos were`} added.` : 'Nothing was added.'} If one of these is a different photo that happens to share a name, rename the file and add it again.`);
  }, (e) => {
    importNote = '';
    renderPhotoSummary();
    photoError(e);
  });
}

function photoDir(ph) {
  const f = plan.floors.find((x) => x.id === ph.floorId);
  const r = f?.rooms.find((x) => x.id === ph.roomId);
  // Outdoors there are no rooms: a photo on the exterior sheet that is not on one of its
  // structures is simply an exterior photo.
  return `${DIR_PROCESSED}/${slug(f?.name, 'floor')}/${r ? slug(r.name, 'room') : f?.kind === 'exterior' ? 'exterior' : 'unassigned'}`;
}

function photoError(e) {
  flash('Photo problem: ' + e.message);
}

function addMarker(x, y, dir) {
  const room = [...floor().rooms].reverse().find((r) => shapeContains(r, { x, y }));
  const ph = { id: uid(), floorId, roomId: room?.id ?? null, x: fine(x), y: fine(y), dir, file: '', original: '', note: '' };
  plan.photos.push(ph);
  sel = { type: 'photo', id: ph.id };
  setTool('select');
  showSide('photos');
}

async function returnFile(ph) {
  const name = await store.freeName(DIR_UNPROCESSED, stemOf(ph.original), extOf(ph.original));
  await store.move(ph.file, `${DIR_UNPROCESSED}/${name}`);
  dropUrl(ph.file);
  await store.prune(dirOf(ph.file));
  await store.prune(dirOf(dirOf(ph.file)));
}

const afterPhotoChange = () => {
  save();
  renderAll();
  return refreshUnprocessed();
};

// After a photo file has been moved on or off a marker, which undo cannot reverse.
const afterFileChange = () => {
  const done = afterPhotoChange();
  resetHistory();
  return done;
};

// Gives a marker one of the unprocessed photos. A marker that already has a photo keeps it and
// gains this one as well, facing the same way to begin with.
function attachPhoto(ph, name) {
  return io(async () => {
    const to = photoDir(ph);
    const file = `${to}/${await store.freeName(to, baseOf(to), extOf(name), true)}`;
    await store.move(`${DIR_UNPROCESSED}/${name}`, file);
    dropUrl(`${DIR_UNPROCESSED}/${name}`);
    if (!ph.file) Object.assign(ph, { file, original: name });
    else (ph.more ||= []).push({ id: uid(), dir: ph.dir, file, original: name });
    // The new photo is the one shown, ready for its arrow to be turned.
    if (selPhoto() === ph) sel = { type: 'photo', id: ph.id, shot: shotsOf(ph).length - 1 };
  }).then(afterFileChange, photoError);
}

// Takes one photo off a marker and puts it back in photos/unprocessed. The marker stays, with
// any other photos it holds.
function detachPhoto(ph, shot = ph) {
  return io(async () => {
    await returnFile(shot).catch(() => flash(`${shot.file} was not found, so it was only taken off the marker.`));
    if (shot !== ph) {
      ph.more = ph.more.filter((s) => s !== shot);
    } else if (ph.more?.length) {
      // The next photo takes the first one's place.
      const next = ph.more.shift();
      Object.assign(ph, { dir: next.dir, file: next.file, original: next.original });
    } else {
      Object.assign(ph, { file: '', original: '' });
    }
    if (ph.more && !ph.more.length) delete ph.more;
    if (selPhoto() === ph) sel = { type: 'photo', id: ph.id };
  }).then(afterFileChange, photoError);
}

// Moves every linked photo whose floor or room has been renamed or reassigned.
function syncPhotos() {
  return io(async () => {
    let failed = 0;
    for (const ph of plan.photos) {
      for (const shot of shotsOf(ph).filter((v) => v.file)) {
        const want = photoDir(ph);
        const from = dirOf(shot.file);
        if (from === want) continue;
        try {
          const to = `${want}/${await store.freeName(want, baseOf(want), extOf(shot.file), true)}`;
          await store.move(shot.file, to);
          dropUrl(shot.file);
          shot.file = to;
          await store.prune(from);
          await store.prune(dirOf(from));
        } catch {
          failed++;
        }
      }
    }
    if (failed) flash(`${failed} photo file(s) could not be moved. Were they changed outside the app?`);
  }).then(() => {
    save();
    renderAll();
  });
}

// Removes the markers and puts any attached files back in photos/unprocessed.
function unlinkPhotos(list) {
  plan.photos = plan.photos.filter((p) => !list.includes(p));
  for (const i of plan.issues) i.photoIds = i.photoIds.filter((id) => !list.some((p) => p.id === id));
  return io(async () => {
    for (const shot of list.flatMap(shotsOf).filter((v) => v.file)) {
      await returnFile(shot).catch(() => flash(`${shot.file} was not found, so only its marker was removed.`));
    }
  }).then(list.some((v) => v.file) ? afterFileChange : afterPhotoChange);
}

// A marker's room and photo. Given one of its photos, names that one; otherwise names the first
// and says how many more there are.
function photoCaption(ph, shot = null) {
  const f = plan.floors.find((x) => x.id === ph.floorId);
  const r = f?.rooms.find((x) => x.id === ph.roomId);
  const one = shot || ph;
  const others = shot ? 0 : shotsOf(ph).length - 1;
  const where = r ? r.name : f?.kind === 'exterior' ? 'Exterior' : 'No room';
  return `${where} · ${one.file ? baseOf(one.file) : 'no photo yet'}${others ? ` + ${others} more` : ''}`;
}

// ---------- side panel for a marker ----------

function photoInspector(ph) {
  const shots = shotsOf(ph);
  const shot = selShot();
  // The issues this marker's photos are linked to, each a way back to that issue.
  const issueLinks = plan.issues.filter((i) => i.photoIds.includes(ph.id)).map((i) => `<p class="note issueLink">
      <span class="dot" style="background:${cat(i.category).color}"></span>Photo for issue #${issueNum(i)}: <b>${esc(i.title)}</b>
      <button data-goto-issue="${i.id}" title="Selects that issue on the plan and shows it here">Go to issue</button></p>`).join('');
  const details = `<div class="row">
      ${floor().kind === 'exterior'
        ? field('Taken at', 'photo', 'roomId', ph.roomId || '', { options: [['', 'Exterior'], ...floor().rooms.map((x) => [x.id, x.name])] })
        : field('Room', 'photo', 'roomId', ph.roomId || '', { options: [['', '(no room)'], ...floor().rooms.map((x) => [x.id, roomTitle(x)])] })}
      ${field('Facing (°, 0 = up)', 'shot', 'dir', shot.dir, { num: true, step: 5 })}
    </div>
    <p class="muted">To turn the arrow, drag the round handle at its tip, or type the direction above.${shots.length > 1 ? ' Each photo has its own arrow; click a photo above to choose which one you are turning.' : ''}</p>
    ${issueLinks}
    ${field('Note', 'photo', 'note', ph.note, { area: true })}`;
  const picker = `<p class="note pick">${unprocessed.length ? `Choose ${ph.file ? 'another photo' : 'the photo'} taken here:` : `${ph.file ? 'There are' : 'No photo attached, and there are'} no unprocessed photos to choose from yet.`}</p>
    <div class="thumbs" id="attachList">${unprocessed.map((name) => thumbButton(name, 'data-attach')).join('')}</div>`;
  if (!ph.file) {
    return `<h2>Photo marker</h2>
      ${picker}
      ${details}
      <div class="actions">
        <button id="btnAddHere">Add photos…</button>
        <button class="danger" id="btnDelete">Delete marker</button>
      </div>`;
  }
  const many = shots.length > 1;
  const strip = many ? `<div class="thumbs shots">${shots.map((s, i) => `<button class="thumb${s === shot ? ' on' : ''}" data-shot="${i}" title="${esc(baseOf(s.file))}">
      <img data-thumb data-photo="${esc(s.file)}" alt=""><span>${i + 1} of ${shots.length}</span></button>`).join('')}</div>` : '';
  return `<h2>Photo marker${many ? ` · ${shots.length} photos` : ''}</h2>
    ${strip}
    <img class="preview" id="btnOpenSel" data-photo="${esc(shot.file)}" alt="" title="Open full size">
    <div class="actions">
      <button id="btnAddMore" title="For another photo taken from this same spot. It gets its own arrow, so it can face a different way.">${sel.adding ? 'Done adding' : 'Add another photo here…'}</button>
      <button id="btnDetach" title="Puts this photo's file back in photos/unprocessed. ${many ? 'The other photos stay on the marker.' : 'The marker stays, ready for another photo.'}">Remove ${many ? 'this ' : ''}photo</button>
    </div>
    ${sel.adding ? `${picker}<div class="actions"><button id="btnAddHere">Add photos…</button></div>` : ''}
    ${details}
    <p class="muted path">${esc(shot.file)}<br>Originally ${esc(shot.original)}</p>
    <div class="actions">
      <button class="danger" id="btnDelete" title="Removes the marker and puts ${many ? 'all its files' : 'its file'} back in photos/unprocessed">Delete marker</button>
    </div>`;
}

$('#inspector').addEventListener('click', (e) => {
  if (!selPhoto()) return;
  const issue = plan.issues.find((i) => i.id === e.target.dataset.gotoIssue);
  if (issue) return goTo({ floorId: issue.floorId, sel: { type: 'issue', id: issue.id }, points: [issue] });
  const pick = e.target.closest('[data-shot]');
  if (pick) {
    sel = { ...sel, shot: +pick.dataset.shot };
    return renderAll();
  }
  if (e.target.id === 'btnAddMore') {
    sel = { ...sel, adding: !sel.adding };
    renderInspector();
  }
});

// ---------- photos panel ----------

const thumbButton = (name, attr) => `<button class="thumb" ${attr}="${esc(name)}" title="${esc(name)}">
  <img data-thumb data-photo="${esc(DIR_UNPROCESSED + '/' + name)}" alt=""><span>${esc(name)}</span></button>`;

function renderPhotoSummary() {
  const empty = plan.photos.filter((p) => !p.file).length;
  const placed = plan.photos.flatMap(shotsOf).filter((s) => s.file).length;
  $('#photoSummary').textContent = `${unprocessed.length} unprocessed · ${placed} on the plan`
    + (empty ? ` · ${empty} marker(s) waiting for a photo. ` : '. ')
    + 'Place a marker with the Photo tool, then choose its photo.';
  $('#importNote').textContent = importNote;
  $('#importNote').hidden = !importNote;
}

function renderPhotos() {
  renderPhotoSummary();
  $('#thumbs').innerHTML = unprocessed.map((name) => thumbButton(name, 'data-name')).join('');
  hydrateImages($('#thumbs'));
}

// With a marker selected that is waiting for a photo, or having another added, clicking a photo
// here attaches it. Otherwise it opens for a closer look.
$('#thumbs').addEventListener('click', (e) => {
  const b = e.target.closest('.thumb');
  if (!b) return;
  const ph = selPhoto();
  if (ph && (!ph.file || sel.adding)) attachPhoto(ph, b.dataset.name);
  else openLightbox(`${DIR_UNPROCESSED}/${b.dataset.name}`, b.dataset.name);
});

$('#thumbs').addEventListener('dblclick', (e) => {
  const b = e.target.closest('.thumb');
  if (b) openLightbox(`${DIR_UNPROCESSED}/${b.dataset.name}`, b.dataset.name);
});

$('#btnAddPhotos').addEventListener('click', () => $('#photoInput').click());
$('#btnRefreshPhotos').addEventListener('click', async () => {
  await refreshUnprocessed();
  await findStrayPhotos();
});

// Every photo file under a folder, as paths from the project folder.
async function photoFilesIn(dir) {
  const found = [];
  for (const e of await store.list(dir)) {
    if (e.kind === 'directory') found.push(...await photoFilesIn(`${dir}/${e.name}`));
    else if (IMAGE_EXT.test(e.name)) found.push(`${dir}/${e.name}`);
  }
  return found;
}

// Photos sitting in photos/processed that no marker on the plan holds: typically a photos folder
// copied in from another project, whose plan did not come with it. They cannot be seen or placed
// from there, so Refresh offers to move them to photos/unprocessed, where they can be.
async function findStrayPhotos() {
  const held = new Set(plan.photos.flatMap(shotsOf).map((s) => s.file.toLowerCase()));
  const strays = (await io(() => photoFilesIn(DIR_PROCESSED)).catch(() => [])).filter((path) => !held.has(path.toLowerCase()));
  if (!strays.length) return;
  const sure = await ask(`${strays.length === 1 ? 'There is 1 photo' : `There are ${strays.length} photos`} in photos/processed that ${strays.length === 1 ? 'is' : 'are'} not on this plan.
Move ${strays.length === 1 ? 'it' : 'them'} to photos/unprocessed so ${strays.length === 1 ? 'it' : 'they'} can be placed?`, {
    ok: strays.length === 1 ? 'Move it' : 'Move them',
    cancel: 'Leave them',
    detail: 'This happens when a photos folder is copied in from another project without the plan that goes with it: the photos were filed under rooms there, but this plan has no markers for them. Moved photos keep their current file names. If you meant to bring the whole project across, copy its plan.housemap.json as well, or use Import plan, and leave them where they are.',
  });
  if (!sure) return;
  await io(async () => {
    for (const path of strays) {
      const name = await store.freeName(DIR_UNPROCESSED, stemOf(baseOf(path)), extOf(path));
      await store.move(path, `${DIR_UNPROCESSED}/${name}`);
      dropUrl(path);
      await store.prune(dirOf(path));
      await store.prune(dirOf(dirOf(path)));
    }
  }).catch(photoError);
  await refreshUnprocessed();
}
$('#photoInput').addEventListener('change', (e) => {
  addPhotos(e.target.files);
  e.target.value = '';
});

$('#photosPanel').addEventListener('dragover', (e) => e.preventDefault());
$('#photosPanel').addEventListener('drop', (e) => {
  e.preventDefault();
  addPhotos(e.dataTransfer.files);
});

// ---------- preview popover and full-size viewer ----------

function renderPopover() {
  const pop = $('#popover');
  const ph = drag ? null : selPhoto();
  const shot = ph && selShot();
  if (!ph || !shot.file || !setting('preview')) {
    pop.hidden = true;
    pop.dataset.key = '';
    return;
  }
  if (pop.dataset.key !== ph.id + shot.file) {
    pop.dataset.key = ph.id + shot.file;
    // A marker with several photos gets arrows to step through them.
    const shots = shotsOf(ph);
    const at = shots.indexOf(shot);
    const step = shots.length > 1 ? `<span class="steps"><button data-step="-1" title="Previous photo on this marker" aria-label="Previous photo">&lt;</button><i>${at + 1} of ${shots.length}</i><button data-step="1" title="Next photo on this marker" aria-label="Next photo">&gt;</button></span>` : '';
    pop.innerHTML = `<img data-photo="${esc(shot.file)}" alt=""><div class="cap"><span>${esc(photoCaption(ph, shot))}</span>${step}<button>Open</button></div>`;
    hydrateImages(pop);
    pop.querySelector('img').onload = renderPopover; // its height is only known once loaded
  }
  pop.hidden = false;
  const at = new DOMPoint(ph.x, ph.y).matrixTransform(svg.getScreenCTM());
  // The preview sits behind the marker, on the side away from where its arrow points, so that it
  // never covers the arrow or the handle that turns it.
  // With several photos it keeps clear of where their arrows point on the whole, so that it stays
  // put, with its buttons under the pointer, while they are stepped through.
  const aim = shotsOf(ph).reduce((v, s) => {
    const t = ((s.dir - 90) * Math.PI) / 180;
    return { x: v.x + Math.cos(t), y: v.y + Math.sin(t) };
  }, { x: 0, y: 0 });
  // Each way, it goes on the far side from the arrow if there is room for it in the window there.
  const side = (pos, toward, size, room) => {
    const before = pos - 18 - size;
    const after = pos + 18;
    const want = toward > 0.01 ? before : after;
    return want >= 8 && want + size <= room - 8 ? want : Math.max(8, Math.min(want === before ? after : before, room - size - 8));
  };
  pop.style.left = side(at.x, aim.x, pop.offsetWidth, innerWidth) + 'px';
  pop.style.top = side(at.y, aim.y, pop.offsetHeight, innerHeight) + 'px';
}

$('#popover').addEventListener('click', (e) => {
  const ph = selPhoto();
  if (!ph) return;
  const step = e.target.closest('[data-step]');
  if (step) {
    // Round and round: past the last photo comes the first again.
    const n = shotsOf(ph).length;
    sel = { ...sel, shot: ((sel.shot || 0) + +step.dataset.step + n) % n };
    return renderAll();
  }
  if (e.target.closest('img, button')) openLightbox(selShot().file, photoCaption(ph, selShot()));
});

function openLightbox(path, caption) {
  const box = $('#lightbox');
  box.innerHTML = `<img data-photo="${esc(path)}" alt=""><div class="cap">${esc(caption)} <button>Close</button></div>`;
  hydrateImages(box);
  box.hidden = false;
}

function closeLightbox() {
  $('#lightbox').hidden = true;
}

$('#lightbox').addEventListener('click', (e) => {
  if (!e.target.matches('img')) closeLightbox();
});
