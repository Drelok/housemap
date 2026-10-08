'use strict';

function field(label, obj, name, value, opts = {}) {
  const attrs = `data-obj="${obj}" data-field="${name}"`
    + (opts.num ? ` data-num type="number" step="${opts.step || 1}"` : '')
    + (opts.list ? ` list="${opts.list}"` : '');
  if (opts.options) {
    const o = opts.options.map(([v, l]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(l)}</option>`).join('');
    return `<label>${label}<select ${attrs}>${o}</select></label>`;
  }
  if (opts.area) return `<label>${label}<textarea ${attrs}>${esc(value)}</textarea></label>`;
  return `<label>${label}<input ${attrs} value="${esc(value)}"></label>`;
}

// The photo markers linked to an issue, with a way to link more.
function issuePhotosHtml(i) {
  const linked = i.photoIds.map((id) => plan.photos.find((p) => p.id === id)).filter(Boolean);
  const tiles = linked.map((ph) => `<div class="thumb">
      ${ph.file
        ? `<img data-thumb data-photo="${esc(ph.file)}" data-open-photo="${ph.id}" alt="" title="Open full size">`
        : `<div class="noPreview" data-goto-photo="${ph.id}" title="Go to this marker to choose its photo">No photo yet</div>`}
      <span>${esc(photoCaption(ph))}</span>
      <button data-unlink-photo="${ph.id}" title="Unlink from this issue (the photo marker stays)">Unlink</button>
    </div>`).join('');
  const floorName = (ph) => plan.floors.find((f) => f.id === ph.floorId)?.name;
  const others = plan.photos.filter((ph) => !i.photoIds.includes(ph.id))
    .sort((a, b) => (b.floorId === i.floorId) - (a.floorId === i.floorId));
  const options = others.map((ph) => `<option value="${ph.id}">${esc(floorName(ph) + ' · ' + photoCaption(ph))}</option>`).join('');
  return `<label>Photos</label>
    ${linked.length ? `<div class="thumbs">${tiles}</div>` : ''}
    <div class="actions">
      ${others.length ? `<select id="linkPhoto"><option value="">Link a photo marker…</option>${options}</select>` : ''}
      ${pinned(i) ? '<button id="btnPhotoHere" title="Places a photo marker at this issue, links it, and lets you choose its photo">New photo here</button>' : ''}
    </div>
    ${i.photo ? field('Photo note', 'issue', 'photo', i.photo) : ''}`;
}

// A length shown and edited as two boxes, feet and inches.
function lengthField(label, obj, name, value) {
  const v = feetInches(value);
  const box = (part, val, extra) => `<input data-obj="${obj}" data-field="${name}" data-part="${part}" ${extra} value="${val}">`;
  // Inches is a text box so that fractions such as 5 5/8 can be typed.
  return `<label>${label}<span class="ftin">${box('ft', v.ft, 'type="number" min="0" step="1"')}<i>ft</i>${box('in', fmtInches(v.in), 'inputmode="decimal" title="Fractions are fine: 5 3/4"')}<i>in</i></span></label>`;
}

let moreOpen = false; // whether "More about this" is folded open on the issue in the side panel

// The fixed questions about an issue, folded away under its description until they are wanted.
function issueMoreHtml(i) {
  const answered = ISSUE_MORE.filter(([key]) => i[key]).length;
  const box = ([key, label, kind]) => field(label, 'issue', key, i[key] || '', Array.isArray(kind) ? { options: kind } : { area: kind === 'area' });
  return `<details class="quote" id="issueMore"${moreOpen ? ' open' : ''}>
      <summary><span>More about this</span><b class="muted">${answered} of ${ISSUE_MORE.length} answered</b></summary>
      <p class="muted small">Answer what you can. These are the things a tradesperson, or an AI assistant, asks first.</p>
      ${ISSUE_MORE.map(box).join('')}
    </details>`;
}

// The issues this one has to wait for, each with a button to take it off, and a list to add another
// from. An issue that already waits for this one, directly or through others, is not offered, so
// the order can never go round in a circle.
function afterHtml(i) {
  const before = afterOf(i);
  const free = plan.issues.filter((x) => x !== i && !before.includes(x) && !waitsFor(x, i)).sort(byIssueNum);
  const waiting = waitingFor(i);
  return `<div class="afterField">
      <label title="Issues that have to be done before this one can be, such as fixing the roof before the ceiling under it">Must be done after</label>
      <div class="afterList">${before.map((x) => `<span class="chip">#${issueNum(x)} ${esc(x.title)}<button type="button" data-after-drop="${x.id}" title="This issue no longer waits for that one" aria-label="Remove">×</button></span>`).join('') || '<span class="muted small">Nothing: it can be done at any time.</span>'}</div>
      ${free.length ? `<select id="afterAdd"><option value="">Add an issue it must wait for…</option>${free.map((x) => `<option value="${x.id}">#${issueNum(x)} ${esc(x.title)}</option>`).join('')}</select>` : ''}
      ${waiting.length ? `<p class="muted small">Waiting for this one: ${waiting.map((x) => `#${issueNum(x)} ${esc(x.title)}`).join(', ')}.</p>` : ''}
    </div>`;
}

// Said under Applies to for a pinned issue. A pin on a floor that is in no room and in no wall is
// often meant for the whole floor, so that is pointed out; whether it is, is for the owner to say.
// On the exterior sheet a pin out in the open is normal: the yard, the driveway, a fence.
function pinNote(i) {
  const f = issueFloor(i);
  if (f.kind === 'floor' && f.rooms.length && !issueRoom(i)) {
    return `<p class="note small" id="pinOutside">This pin is not in any room. If it stands for the whole floor, choose <i>The whole of ${esc(f.name)}</i> above; if it marks a real spot, leave it as it is.</p>`;
  }
  return '<p class="muted small">For something with no one spot, such as the roof, the wiring, the pipes or lead paint, choose the whole floor or the whole house here, so that it is not described by where its pin happens to be.</p>';
}

// What an issue is about: the spot its pin marks, a whole floor, or the whole house.
function issueScopeHtml(i) {
  const options = [
    ['pin', pinned(i) ? `One spot: its pin on ${issueFloor(i).name}` : 'One spot: put a pin on the plan…'],
    ...plan.floors.map((f) => [f.id, `The whole of ${f.name}`]),
    ['house', 'The whole house'],
  ];
  const now = pinned(i) ? 'pin' : issueFloor(i) ? i.floorId : 'house';
  return `<label>Applies to<select id="issueScope">${options.map(([v, l]) => `<option value="${esc(v)}"${v === now ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    ${pinned(i) ? pinNote(i) : `<p class="muted small">This issue has no pin. To give it one, choose <i>One spot</i> above${issueFloor(i) ? '' : ' while the sheet it is on is open'}, then click the place on the plan.</p>`}`;
}

// Said under a room's name when another room on the floor has the same one.
function twinNote(r) {
  const twins = floor().rooms.filter((x) => x !== r && roomTitle(x).trim().toLowerCase() === roomTitle(r).trim().toLowerCase()).length;
  return twins ? `${twins === 1 ? 'Another room' : `${twins} other rooms`} on this sheet ${twins === 1 ? 'is' : 'are'} also called “${r.name}”. Their photos go in one folder, and lists and reports cannot tell them apart. A name of its own, such as “${r.name} 2” or “${r.name}, north”, avoids that.` : '';
}

const DUP_BUTTON = '<button id="btnDuplicate" title="Makes a copy beside this one, selected and ready to drag into place">Duplicate <kbd>Ctrl+D</kbd></button>';

function renderInspector() {
  const r = selRoom();
  const i = selIssue();
  const ph = selPhoto();
  const o = selOpening();
  const it = selItem();
  const f = floor();
  let s;
  if (o) {
    s = openingInspector(o);
  } else if (it) {
    s = itemInspector(it);
  } else if (r) {
    const size = isPoly(r)
      ? `<p class="muted">${r.points.length} points${hasCurves(r) ? `, ${r.points.filter((p) => p.curve).length} of them on a curve (yellow)` : ''}. Drag one on the plan to reshape it. Double-click a corner to make the wall curve through it; double-click a yellow curve point to take it out.${hasCurves(r) ? ' The area follows the curved walls.' : ''}</p>`
      : `${lengthField('Width', 'room', 'w', r.w)}
        ${lengthField('Length', 'room', 'h', r.h)}
        <p class="muted small">Round to the nearest 1/4 inch. Fractions are fine: 5 3/4.</p>
        <div class="row">${field('Left edge (grid ft)', 'room', 'x', r.x, { num: true, step: 0.5 })}${field('Top edge (grid ft)', 'room', 'y', r.y, { num: true, step: 0.5 })}</div>`;
    s = `<h2>${f.kind === 'exterior' ? 'Outline' : 'Room'}</h2>
      ${field('Name', 'room', 'name', r.name, { list: f.kind === 'exterior' ? '' : 'roomNames' })}
      <p class="note step" id="twinNote"${twinNote(r) ? '' : ' hidden'}>${esc(twinNote(r))}</p>
      ${size}
      <p class="muted">Area: <span id="area">${Math.round(shapeArea(r))}</span> sq ft</p>
      ${f.kind === 'exterior' ? '' : partOfHtml(r) + levelHtml(r)}
      <label class="check" title="A locked shape can still be selected and changed here in the side panel, but dragging on it moves the view instead of the shape, and it has no handles to catch by accident"><input type="checkbox" id="chkLocked"${r.locked ? ' checked' : ''}> Locked in place <kbd>L</kbd>: dragging on it moves the view, not the ${f.kind === 'exterior' ? 'shape' : 'room'}</label>
      ${f.basement ? `<label class="check" title="Finished, heated living space in a basement counts toward the Total House Area. Unfinished space, such as storage or a utility room, does not."><input type="checkbox" id="chkFinished"${r.finished ? ' checked' : ''}> Finished basement: counted in the Total House Area</label>` : ''}
      <label class="check" title="For a carport, shed, deck or anything else that is not part of the house itself"><input type="checkbox" id="chkSeparate"${r.separate ? ' checked' : ''}> Separate structure: not counted in the total, never combined</label>
      <div class="actions">
        ${!r.separate && f.rooms.some((x) => x !== r && !x.separate) ? '<button id="btnCombine" title="Join this shape and every shape that overlaps or shares an edge with it into one outline">Combine with touching shapes</button>' : ''}
        <button id="btnWallLen" title="Click a wall and enter its length. You choose which end of the wall moves; the other end and the walls beyond it stay as they are.">Set one wall's length…</button>
        <button id="btnBend" title="Press on a wall and drag to bend it into a curve. A point is added that the wall curves through; add more for a longer or tighter curve.">Bend a wall…</button>
        ${f.kind === 'exterior' ? '' : '<button id="btnSplit" title="Cuts a closet drawn as part of this room into a room of its own, with a wall between. Click one end of the opening of the closet, then click across it.">Split off a closet…</button>'}
        ${f.kind === 'exterior' ? '<button id="btnWallSize" title="Click a wall and enter its real length. Everything on this sheet, including the aerial picture, is resized to match. Use this to correct the scale.">Resize everything from a wall…</button>' : ''}
        ${DUP_BUTTON}
        <button class="danger" id="btnDelete">Delete</button>
      </div>
      ${f.kind === 'exterior' ? sizedHtml() : ''}`;
  } else if (i) {
    s = `<h2>Issue #${issueNum(i)}</h2>
      ${field('Title', 'issue', 'title', i.title)}
      ${issueScopeHtml(i)}
      <div class="row">
        ${field('Category', 'issue', 'category', i.category, { options: CATS.map((c) => [c.id, c.label]) })}
        ${field('Status', 'issue', 'status', i.status, { options: STATUSES.map((v) => [v, v]) })}
      </div>
      ${afterHtml(i)}
      ${field('Description', 'issue', 'description', i.description, { area: true })}
      ${issueMoreHtml(i)}
      <label title="Your own rough idea of what this will cost, as a range. It is what the totals use until a quote is accepted.">My estimate</label>
      <div class="row">${field('Low ($)', 'issue', 'costLow', i.costLow, { num: true, step: 50 })}${field('High ($)', 'issue', 'costHigh', i.costHigh, { num: true, step: 50 })}</div>
      <p class="muted small">Leave both empty if you have no figure yet. The issue is then listed as <i>not priced</i>, which is not the same as $0.</p>
      ${field('This estimate is', 'issue', 'costSource', i.costSource || '', { options: COST_SOURCES })}
      ${quotesHtml(i)}
      ${issuePhotosHtml(i)}
      <div class="actions">${DUP_BUTTON}<button class="danger" id="btnDelete">Delete issue</button></div>`;
  } else if (ph) {
    s = photoInspector(ph);
  } else {
    s = `<h2>House</h2>
      ${field('Name', 'plan', 'name', plan.name)}
      ${field('Address', 'plan', 'address', plan.address)}
      ${field('North is toward', 'plan', 'north', northSet() ? String(plan.north) : '', { options: NORTH_CHOICES })}
      <h2>${f.kind === 'exterior' ? 'Exterior sheet' : 'Floor'}</h2>
      ${field('Name', 'floor', 'name', f.name)}
      <p class="muted">${f.kind === 'exterior'
        ? 'Outline the house and anything else on the lot here. The outline shows faintly under every floor.'
        : `${f.rooms.length} rooms drawn`}</p>
      <p class="muted areas">${f.kind === 'exterior' ? 'Footprint' : 'Floor area'}: <b>${sqft(floorArea(f))}</b>${f.basement ? `, of which finished: <b>${sqft(countedArea(f))}</b>` : ''}
        <br>Total House Area: <b>${sqft(houseArea())}</b> <span title="The rooms drawn on every floor above ground, plus the basement rooms marked as finished. The exterior sheet's footprint, unfinished basement rooms and anything marked as a separate structure are left out.">(${plan.floors.some((x) => x.basement) ? 'floors above ground, plus finished basement' : 'all floors'})</span>
        ${separateArea(f) ? `<br>Separate structures on this sheet: ${sqft(separateArea(f))}, not counted` : ''}</p>
      ${f.kind === 'exterior' ? sizedHtml() : standardsHtml()}
      ${f.kind !== 'exterior' && f.rooms.length ? '<div class="actions"><button id="btnAddWalls" title="For rooms drawn edge to edge: moves their walls back so that a standard wall fits between them, and inside the exterior outline">Put walls between touching rooms…</button></div>' : ''}
      ${f.rooms.length ? `<div class="actions"><button id="btnLockAll" title="A locked shape cannot be dragged or reshaped by accident: dragging on it moves the view instead. Each one can be unlocked in its own side panel.">${f.rooms.every((x) => x.locked) ? 'Unlock' : 'Lock'} every ${f.kind === 'exterior' ? 'shape' : 'room'} on this sheet</button></div>` : ''}
      ${f.kind === 'exterior' ? '' : `<label class="check" title="A basement is kept at the end of the row of sheets and is not counted when new floors are numbered"><input type="checkbox" id="chkBasement"${f.basement ? ' checked' : ''}> This sheet is a basement</label>`}
      ${f.kind === 'exterior' ? '' : `<label class="check"><input type="checkbox" id="chkOutline"${showOutline ? ' checked' : ''}> Show exterior outline</label>`}
      ${plan.floors.length > 1 ? '<button class="danger" id="btnDeleteFloor">Delete this sheet</button>' : ''}`;
  }
  $('#inspector').innerHTML = s;
  hydrateImages($('#inspector'));
  placeInspector();
}

// The side panel shows one thing at a time, chosen by the tabs at its top. What is selected is
// shown under the tab it belongs to: a photo marker above the photos, an issue above the list of
// issues, and anything else under Details, which shows the house and the sheet when nothing is
// selected. Selecting something brings its tab forward.
let sideSel = ''; // the selection the tabs last followed
function placeInspector() {
  const side = sel?.type === 'photo' ? 'photos' : sel?.type === 'issue' ? 'issues' : 'details';
  const home = { photos: $('#photosPanel'), issues: $('#issues'), details: $('#detailsPanel') }[side];
  if ($('#inspector').parentNode !== home) home.prepend($('#inspector'));
  $('#detailsNote').hidden = side === 'details';
  $('#detailsNote').textContent = side === 'photos'
    ? 'The selected photo marker is under the Photos tab. Click an empty part of the plan to see the house and this sheet here.'
    : 'The selected issue is under the Issues tab. Click an empty part of the plan to see the house and this sheet here.';
  const key = sel ? sel.type + ' ' + sel.id : '';
  if (key !== sideSel && sel) showSide(side);
  sideSel = key;
}

$('#inspector').addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'chkSeparate') {
    selRoom().separate = t.checked;
    save();
    return renderAll();
  }
  if (t.id === 'chkLocked') return toggleLock(selRoom());
  if (t.id === 'chkBasement') return markBasement(floor(), t.checked);
  if (t.id === 'chkFinished') {
    const r = selRoom();
    if (t.checked) r.finished = true;
    else delete r.finished;
    save();
    return renderAll();
  }
  if (t.id === 'chkWell') {
    if (t.checked) selOpening().well = true;
    else delete selOpening().well;
    save();
    return renderAll();
  }
  if (t.id === 'chkSized') {
    plan.exteriorSized = t.checked;
    return save();
  }
  if (t.id === 'chkOutline') {
    showOutline = t.checked;
    return renderAll();
  }
  if (!t.dataset.field) return;
  const obj = { room: selRoom(), issue: selIssue(), photo: selPhoto(), opening: selOpening(), item: selItem(), shot: selShot(), plan, floor: floor() }[t.dataset.obj];
  if (!obj) return;
  if (t.dataset.part) {
    const typed = (p) => $(`#inspector [data-field="${t.dataset.field}"][data-part="${p}"]`).value;
    const feet = fine((parseFloat(typed('ft')) || 0) + parseInches(typed('in')) / 12);
    // A step's height is typed as a plain length; which way it goes is kept in the sign of `level`.
    if (t.dataset.field === 'step') obj.level = feet * (obj.level < 0 ? -1 : 1);
    else obj[t.dataset.field] = feet;
  } else if (t.dataset.obj === 'opening' && t.dataset.field === 'style') {
    // A new kind of window starts at its usual width and sill height.
    const k = windowKind(t.value);
    Object.assign(obj, { style: k.id, w: fine(k.w), sill: fine(k.sill) });
    save();
    return renderAll();
  } else if (t.dataset.obj === 'opening' && t.dataset.field === 'onto') {
    if (t.value) obj.onto = t.value;
    else delete obj.onto;
    save();
    return renderAll();
  } else if (t.dataset.obj === 'opening' && t.dataset.field === 'kind') {
    // A new type starts at its standard width.
    obj.kind = t.value;
    fitOpening(obj);
    save();
    return renderAll();
  } else if (t.dataset.obj === 'item' && t.matches('select')) {
    setItemField(obj, t.dataset.field, t.value);
    save();
    return renderAll();
  } else if (t.dataset.obj === 'issue' && /^cost(Low|High)$/.test(t.dataset.field)) {
    // An empty box is no estimate, which is kept apart from an estimate of nothing.
    obj[t.dataset.field] = t.value.trim() === '' ? null : parseFloat(t.value) || 0;
  } else if (t.dataset.field === 'north') {
    // Which way north points on the sheets, in degrees clockwise from the top; null until it is chosen.
    plan.north = t.value === '' ? null : +t.value;
  } else {
    obj[t.dataset.field] = 'num' in t.dataset ? parseFloat(t.value) || 0 : t.value || (t.dataset.field === 'roomId' ? null : '');
  }
  const r = selRoom();
  if (r && $('#area')) $('#area').textContent = Math.round(shapeArea(r));
  if (r && $('#twinNote')) {
    $('#twinNote').textContent = twinNote(r);
    $('#twinNote').hidden = !twinNote(r);
  }
  save(true);
  renderCanvas();
  renderTabs();
  renderIssues();
  renderTitle();
});

// Whether "More about this" is folded open is remembered while the panel is redrawn.
$('#inspector').addEventListener('toggle', (e) => {
  if (e.target.id === 'issueMore') moreOpen = e.target.open;
}, true);

// Enter or Escape finishes a field, so the tool keys work again.
$('#inspector').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' && !e.target.matches('textarea')) || e.key === 'Escape') e.target.blur();
});

// Photo folders are named after the floor and room, so they follow a finished rename.
$('#inspector').addEventListener('change', (e) => {
  if (e.target.id === 'linkPhoto' && e.target.value) {
    selIssue().photoIds.push(e.target.value);
    save();
    return renderInspector();
  }
  if (e.target.id === 'selLevel') return setLevelDir(selRoom(), e.target.value);
  if (e.target.id === 'afterAdd' && e.target.value) {
    const i = selIssue();
    i.after = [...(i.after || []), e.target.value];
    save();
    return renderAll();
  }
  if (e.target.id === 'issueScope') {
    const i = selIssue();
    const to = e.target.value;
    if (to === 'pin') return placePin(i);
    // A whole floor or the whole house: the pin, if there was one, goes.
    Object.assign(i, { floorId: to === 'house' ? null : to, x: null, y: null });
    save();
    return renderAll();
  }
  const { obj, field: name } = e.target.dataset;
  if (name === 'roomId' || (name === 'name' && (obj === 'room' || obj === 'floor'))) syncPhotos();
});

$('#inspector').addEventListener('click', async (e) => {
  const drop = e.target.closest('[data-after-drop]')?.dataset.afterDrop;
  if (drop) {
    const i = selIssue();
    i.after = (i.after || []).filter((id) => id !== drop);
    if (!i.after.length) delete i.after;
    save();
    return renderAll();
  }
  if (e.target.id === 'btnDelete') deleteSelection();
  if (e.target.closest('#btnDuplicate')) duplicateSelection();
  if (e.target.id === 'btnCombine') combineSelection();
  if (e.target.id === 'btnWallSize' || e.target.id === 'btnWallLen') {
    setTool(e.target.id === 'btnWallSize' ? 'wall' : 'wallLen');
    renderCanvas();
  }
  if (e.target.id === 'btnStandards') openStandards();
  if (e.target.id === 'btnAddWalls') addWalls();
  if (e.target.id === 'btnLockAll') {
    const lock = !floor().rooms.every((r) => r.locked);
    for (const r of floor().rooms) {
      if (lock) r.locked = true;
      else delete r.locked;
    }
    save();
    renderAll();
  }
  if (e.target.id === 'btnBend') {
    setTool('bend');
    renderCanvas();
  }
  if (e.target.id === 'btnSplit') {
    setTool('split');
    renderCanvas();
  }
  if (e.target.id === 'btnSpan') {
    fitOpening(selOpening());
    save();
    renderAll();
  }
  if (e.target.id === 'btnHinge' || e.target.id === 'btnSwing') {
    const o = selOpening();
    const side = e.target.id === 'btnHinge' ? 'hinge' : 'swing';
    o[side] = o[side] ? 0 : 1;
    save();
    renderCanvas();
  }
  if (e.target.id === 'btnOpenSel') openLightbox(selShot().file, photoCaption(selPhoto(), selShot()));
  if (e.target.id === 'btnDetach') detachPhoto(selPhoto(), selShot());
  const { openPhoto, gotoPhoto, unlinkPhoto } = e.target.dataset;
  if (openPhoto) {
    const ph = plan.photos.find((p) => p.id === openPhoto);
    openLightbox(ph.file, photoCaption(ph));
  }
  if (gotoPhoto) {
    const ph = plan.photos.find((p) => p.id === gotoPhoto);
    return goTo({ floorId: ph.floorId, sel: { type: 'photo', id: ph.id }, points: [ph] });
  }
  if (unlinkPhoto) {
    const i = selIssue();
    i.photoIds = i.photoIds.filter((id) => id !== unlinkPhoto);
    save();
    renderInspector();
  }
  if (e.target.id === 'btnPhotoHere') {
    const i = selIssue();
    // The marker goes on the issue's own sheet, which from the Issues sheet may not be the one last open.
    goTo({ floorId: i.floorId, sel, points: [i] });
    // Beside the pin rather than under it, so both can still be clicked.
    addMarker(i.x + 14 * feetPerPx(), i.y, 0);
    i.photoIds.push(sel.id);
    save();
    renderAll();
  }
  if (e.target.id === 'btnAddHere') $('#photoInput').click();
  if (e.target.id === 'btnTakeHere') $('#cameraInput').click();
  const pick = e.target.closest('[data-attach]');
  if (pick) attachPhoto(selPhoto(), pick.dataset.attach);
  if (e.target.id === 'btnDeleteFloor') {
    const f = floor();
    const sure = await ask(`Delete “${f.name}” with its rooms and issues? Its photos go back to photos/unprocessed.`, { ok: 'Delete sheet', danger: true });
    if (!sure) return;
    const photos = plan.photos.filter((p) => p.floorId === f.id);
    plan.floors = plan.floors.filter((x) => x !== f);
    plan.issues = plan.issues.filter((i) => i.floorId !== f.id);
    floorId = plan.floors[0].id;
    sel = null;
    fitView();
    unlinkPhotos(photos);
  }
});

// Marks a sheet as a basement, or as an ordinary floor again. A house usually has one basement,
// so marking a second is checked first: it is right only where there is more than one level
// below ground.
async function markBasement(f, on) {
  const others = plan.floors.filter((x) => x !== f && x.basement);
  const sure = !on || !others.length || await ask(`This house already has a basement: ${others.map((x) => `“${x.name}”`).join(', ')}.\nMark “${f.name}” as a basement as well?`, {
    ok: 'Yes, there is more than one',
    cancel: 'No, leave it',
    detail: 'Only do this if the house has more than one level below ground, such as a basement and a sub-basement. Each basement is kept at the end of the row of sheets and is not counted when new floors are numbered. If the wrong sheet is marked as the basement, untick it there first.',
  });
  if (on && sure) f.basement = true;
  else delete f.basement;
  save();
  renderAll(); // also puts the tick back as it was after a "no"
}

// A locked room stays where it is, and so do the doors in its walls.
function toggleLock(r) {
  if (r.locked) delete r.locked;
  else r.locked = true;
  save();
  renderAll();
}

function combineSelection() {
  const r = selRoom();
  const f = floor();
  const res = mergeShapes(r, f.rooms.filter((x) => x !== r && !x.separate), 1);
  if (!res) return flash('Those shapes could not be combined cleanly. Nudge one so the edges clearly overlap, then try again.');
  if (!res.used.length) return flash('No other shape overlaps or shares an edge with this one.');
  const { points, used } = res;
  for (const k of ['x', 'y', 'w', 'h']) delete r[k];
  r.points = points;
  f.rooms = f.rooms.filter((x) => !used.includes(x));
  for (const p of plan.photos) if (used.some((x) => x.id === p.roomId)) p.roomId = r.id;
  for (const x of f.rooms) if (used.some((u) => u.id === x.partOf)) x.partOf = r.id;
  syncPhotos();
}

// A copy of the selected room, fixture, stairs or issue, set down just beside the original and
// selected in its place, ready to be dragged to where it belongs. A copy of a locked room is not
// locked, or it could not be moved off the original.
function duplicateSelection() {
  const r = selRoom();
  const it = selItem();
  const i = selIssue();
  const src = r || it || i;
  if (!src) return flash(sel ? 'Rooms, fixtures, stairs and issues can be duplicated. Doors and photo markers cannot.' : 'Select a room, fixture, stairs or issue to duplicate first.');
  const copy = structuredClone(src);
  copy.id = uid();
  delete copy.quotes; // a quote and its file belong to the one issue
  delete copy.locked;
  if (i) copy.num = plan.nextIssueNum++; // a copy is an issue of its own, with its own number
  const d = r ? 2 : it ? 1 : fine(16 * feetPerPx()); // an issue's pin moves clear of the one it was copied from
  // An issue without a pin has no place to be moved from.
  for (const p of copy.points || [copy]) if (p.x != null) Object.assign(p, { x: fine(p.x + d), y: fine(p.y + d) });
  if (r) floor().rooms.push(copy);
  else if (it) floor().items.push(copy);
  else plan.issues.push(copy);
  sel = { type: sel.type, id: copy.id };
  save();
  renderAll();
}

function deleteSelection() {
  if (!sel) return;
  const ph = selPhoto();
  const { type, id } = sel;
  const issue = selIssue();
  sel = null;
  if (ph) return unlinkPhotos([ph]);
  if (issue && quotesOf(issue).some((q) => q.doc)) return deleteIssueWithQuotes(issue);
  if (type === 'room') {
    floor().rooms = floor().rooms.filter((r) => r.id !== id);
    for (const p of plan.photos) if (p.roomId === id) p.roomId = null;
    for (const x of floor().rooms) if (x.partOf === id) delete x.partOf;
    return syncPhotos();
  }
  if (type === 'opening') floor().openings = floor().openings.filter((o) => o.id !== id);
  else if (type === 'item') floor().items = floor().items.filter((it) => it.id !== id);
  else plan.issues = plan.issues.filter((i) => i.id !== id);
  save();
  renderAll();
}

// The exterior sheet and the floors in order, then the button that adds a floor, and a basement
// last of all, so that new floors always appear beside the ones already there.
function renderTabs() {
  const tab = (f) => {
    const n = plan.issues.filter((i) => i.floorId === f.id).length;
    return `<button data-floor="${f.id}" class="${f.id === floorId && !onList() ? 'active' : ''}">${esc(f.name)}${n ? ' (' + n + ')' : ''}</button>`;
  };
  const todo = plan.issues.filter((i) => i.status !== 'Done').length;
  $('#tabs').innerHTML = plan.floors.filter((f) => !f.basement).map(tab).join('')
    + '<button id="btnAddFloor" title="Adds the next floor up">+ Floor</button>'
    + plan.floors.filter((f) => f.basement).map(tab).join('')
    + `<button id="tabHouse" class="${onHouse ? 'active' : ''}" title="What is known about the house as a whole: its facts, your goals and a walkthrough checklist">House</button>`
    + `<button id="tabIssues" class="${onIssues ? 'active' : ''}" title="Every issue in the house as one list">Issues${todo ? ' (' + todo + ' to do)' : ''}</button>`;
}

// Every sheet uses the same measurements, so going from one floor to another keeps the view
// exactly where it is: the same part of the house, at the same zoom. The exterior sheet is
// worked on at a different scale, so it and the floors each go back to the view they were last
// left at, or to the whole sheet the first time.
function keepView(from) {
  sheetViews[from] = { ...view };
  const to = floor().kind;
  if (to === from) return;
  if (sheetViews[to]) view = { ...sheetViews[to] };
  else fitView();
}

$('#tabs').addEventListener('click', (e) => {
  const from = floor().kind;
  if (e.target.id === 'tabHouse') {
    onHouse = true;
    onIssues = false;
    sel = null;
    setTool('select');
    showSide('details');
    return renderAll();
  }
  if (e.target.id === 'tabIssues') {
    // The floor that was open stays the current one underneath, with its view as it was.
    onIssues = true;
    onHouse = false;
    if (sel?.type !== 'issue') sel = null;
    setTool('select');
    showSide('issues');
    return renderAll();
  }
  if (e.target.id === 'btnAddFloor') {
    // Named as the next floor up: Main floor, 2nd floor, 3rd floor. A basement is not counted.
    const f = { id: uid(), name: floorName(upperFloors().length + 1), kind: 'floor', rooms: [], openings: [], items: [] };
    plan.floors.push(f);
    floorId = f.id;
  } else if (e.target.dataset.floor) {
    floorId = e.target.dataset.floor;
  } else {
    return;
  }
  sel = null;
  draft = null;
  onIssues = onHouse = false;
  applySheet(); // the plan has to be back on screen before the view is worked out
  if (INTERIOR_TOOLS.includes(tool)) setTool('select'); // not offered on the exterior sheet
  save();
  keepView(from);
  renderAll();
  showTips(floor().kind);
});

function renderIssues() {
  renderIssuesSheet();
  const only = $('#onlyFloor').checked;
  const shown = plan.issues.filter((i) => !only || i.floorId === floorId);
  const open = shown.filter((i) => i.status !== 'Done');

  let t = '<table><tr><th>Open issues</th><th class="num">#</th><th class="num">Low</th><th class="num">High</th></tr>';
  for (const c of CATS) {
    const g = open.filter((i) => i.category === c.id);
    if (!g.length) continue;
    t += `<tr><td><span class="dot" style="background:${c.color}"></span>${c.label}</td><td class="num">${g.length}</td>
      <td class="num">${sumCell(g, costLow)}</td><td class="num">${sumCell(g, costHigh)}</td></tr>`;
  }
  t += `<tr class="total"><td>Total</td><td class="num">${open.length}</td>
    <td class="num">${money(costLow(open))}</td><td class="num">${money(costHigh(open))}</td></tr></table>`
    + (open.some(unpriced) ? `<p class="muted small">${open.filter(unpriced).length} of these ${open.filter(unpriced).length === 1 ? 'is' : 'are'} not priced yet, and so ${open.filter(unpriced).length === 1 ? 'adds' : 'add'} nothing to the totals.</p>` : '');
  $('#totals').innerHTML = t;

  if (!shown.length) {
    $('#issueList').innerHTML = '<p class="muted">No issues yet. Choose <i>Issue</i> in the toolbar and click the spot on the plan, or use the button above for something with no one spot.</p>';
    return;
  }
  $('#issueList').innerHTML = '<table>' + shown.map((i) => {
    const cls = (sel?.type === 'issue' && sel.id === i.id ? 'sel ' : '') + (i.status === 'Done' ? 'done' : '');
    return `<tr data-id="${i.id}" class="${cls}">
      <td><span class="dot" style="background:${cat(i.category).color}"></span>${issueNum(i)}</td>
      <td>${esc(i.title)}<div class="muted">${esc(issuePlace(i))} · ${esc(i.status)}</div></td>
      <td class="num"${issueCost(i).quoted ? ' title="Accepted quote"' : ''}>${issueCost(i).quoted ? money(issueCost(i).low) + ' quoted' : estimateText(i, '–')}</td></tr>`;
  }).join('') + '</table>';
}

$('#issueList').addEventListener('click', (e) => {
  const row = e.target.closest('tr[data-id]');
  if (!row) return;
  const i = plan.issues.find((x) => x.id === row.dataset.id);
  // On a plan this goes to the issue's pin. On the Issues sheet it only selects it there.
  if (!onIssues) return goTo({ floorId: i.floorId, sel: { type: 'issue', id: i.id }, points: [i] });
  sel = { type: 'issue', id: i.id };
  renderAll();
});

$('#onlyFloor').addEventListener('change', renderIssues);

function showSide(name) {
  for (const b of document.querySelectorAll('#sideTabs button')) b.classList.toggle('active', b.dataset.side === name);
  $('#detailsPanel').hidden = name !== 'details';
  $('#photosPanel').hidden = name !== 'photos';
  $('#issues').hidden = name !== 'issues';
  renderViewBar();
}

// ---------- one view at a time on a phone ----------
// The plan and each of the side panel's three tabs take the whole screen in turn, chosen by the
// bar along the bottom. Selecting something on the plan stays on the plan, and puts a dot on the
// button for the view that shows it.
const viewsOn = () => getComputedStyle($('#viewBar')).display !== 'none';

function showView(name) {
  $('main').classList.toggle('panel', name !== 'plan');
  if (name !== 'plan') showSide(name);
  renderViewBar();
  if (plan && name === 'plan') renderCanvas();
}

function renderViewBar() {
  const panel = $('main').classList.contains('panel');
  const side = $('#sideTabs .active')?.dataset.side;
  const holds = sel?.type === 'photo' ? 'photos' : sel?.type === 'issue' ? 'issues' : sel ? 'details' : '';
  for (const b of document.querySelectorAll('#viewBar button')) {
    b.classList.toggle('active', panel ? b.dataset.view === side : b.dataset.view === 'plan');
    b.classList.toggle('has', !panel && b.dataset.view === holds);
  }
}

$('#viewBar').addEventListener('click', (e) => {
  const view = e.target.closest('[data-view]')?.dataset.view;
  if (view) showView(view);
});

// Something just placed, or chosen from a list, needs reading or filling in, so on a phone the
// view that shows it is brought forward.
function revealPanel() {
  if (viewsOn()) showView($('#sideTabs .active').dataset.side);
}

$('#sideTabs').addEventListener('click', (e) => {
  if (e.target.dataset.side) showSide(e.target.dataset.side);
});

function renderTitle() {
  $('#planTitle').textContent = plan.name;
  document.title = plan.name + ' · House Map';
}

let flashTimer = null;
function flash(msg) {
  const h = $('#hint');
  h.textContent = msg;
  h.title = msg;
  h.classList.add('flash');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    h.classList.remove('flash');
    h.textContent = HINTS[tool];
  }, 6000);
}

function setTool(t) {
  if (onList() && t !== 'select') return; // nothing can be drawn on a list
  if (t !== 'poly') draft = null;
  pinFor = ''; // placing a pin for an existing issue ends with any change of tool
  held.square = held.free = false; // the touch bar's Shift and Alt are let go
  guides = [];
  measure = t === 'scale' || t === 'ruler' || t === 'split' ? [] : null;
  measureTo = null;
  tool = t;
  for (const b of document.querySelectorAll('#tools button')) b.classList.toggle('active', b.dataset.tool === t);
  // A menu shows which of its tools is in use, and closes once one has been chosen.
  for (const m of document.querySelectorAll('#tools .menu')) {
    const on = m.querySelector(`[data-tool="${t}"]`);
    const b = m.querySelector('.menuBtn');
    b.classList.toggle('active', !!on);
    b.firstElementChild.textContent = b.dataset.menu + (on ? ': ' + on.firstChild.textContent.trim() : '');
    m.querySelector('.menuList').hidden = true;
  }
  clearTimeout(flashTimer); // a tool change makes any earlier message out of date
  $('#hint').classList.remove('flash');
  $('#hint').textContent = HINTS[tool];
  svg.setAttribute('class', 'plan tool-' + t);
}

// The ticks in the View menu, and a note on its button when something is hidden so that it is
// not forgotten. Whatever is selected is always shown: choosing an issue from the list, or
// placing a photo, turns its layer back on.
function renderLayers() {
  const mine = LAYER_OF[sel?.type];
  if (mine) layers[mine] = true;
  const state = { ...layers, outline: showOutline };
  for (const box of document.querySelectorAll('#viewMenu [data-layer]')) box.checked = state[box.dataset.layer];
  const off = Object.values(state).filter((v) => !v).length;
  $('#viewMenu .menuBtn').classList.toggle('some', off > 0);
  $('#viewMenu .menuBtn span').textContent = off ? `View: ${off} hidden` : 'View';
}

$('#viewMenu').addEventListener('change', (e) => {
  const key = e.target.dataset.layer;
  if (!key) return;
  if (key === 'outline') showOutline = e.target.checked;
  else layers[key] = e.target.checked;
  if (LAYER_OF[sel?.type] === key && !e.target.checked) sel = null; // what was selected has just been hidden
  renderAll();
});

function renderAll() {
  if (!plan) return;
  applySheet();
  renderLayers();
  // Doors, stairs and fixtures are placed on the floors.
  $('#menuPlace').hidden = floor().kind === 'exterior';
  renderTitle();
  renderTabs();
  renderCanvas();
  renderInspector();
  renderIssues();
  renderHouseSheet();
  renderAerial();
  renderSizeWarning();
  renderPhotoSummary();
  renderViewBar();
}
