'use strict';

// A satellite or aerial picture of the lot, kept in the project's reference folder. It shows in a
// small window on the exterior sheet and, once scaled, under the grid so the outline can be traced.

const DIR_REFERENCE = 'reference';

const MEASURING_TIPS = `<details class="tips">
  <summary>Measuring tips</summary>
  <ul>
    <li><b>Start from something you have taped.</b> Draw one simple part, such as the garage, type its real width and length, and work outward from it. An aerial picture shows where things sit; it is not accurate enough to measure from, so do not expect shapes to line up with it exactly.</li>
    <li><b>Mind the roof overhang.</b> An aerial picture shows the roof, not the walls, and eaves usually stick out a foot or two on every side. If you traced the roof edge, measure the roof edge (drip line to drip line). If you want wall-to-wall sizes, trace inside the eaves and measure the walls. Mixing the two makes everything come out slightly small.</li>
    <li><b>Use the longest wall you can measure.</b> A small tracing error matters far less on a 60 ft wall than on a 12 ft one.</li>
    <li><b>Measure the outside, corner to corner,</b> along the same line you traced.</li>
    <li><b>Check a second wall</b> that runs the other way against its label, then work out which kind of error you have.</li>
    <li><b>Off by the same amount everywhere?</b> If a 22 ft wall and a 38 ft wall both read about 6 ft long, the scale is fine and the outline sits outside the walls, usually on the roof edge. Fix each wall with <i>Set one wall's length…</i>. Do not rescale.</li>
    <li><b>Off in proportion?</b> If longer walls are off by more, the scale is wrong. Fix it with <i>Set scale…</i> on the aerial picture or <i>Resize everything from a wall…</i>.</li>
    <li><b>Right one way, wrong the other?</b> If walls running one way match the tape and walls running the other way are all short or long by the same percentage, the picture was not taken from straight overhead. Get one direction right first, then use <i>Resize everything from a wall…</i> on a wall running the other way and tick the stretch box.</li>
    <li><b>Do this before drawing rooms.</b> Only the exterior sheet is resized; rooms already drawn on the floors stay as they are.</li>
    <li>Sizes will no longer be round numbers afterwards. That is expected.</li>
    <li><b>All measurements here are approximate,</b> kept to the nearest quarter of an inch. Round what you read off the tape to the nearest 1/4". A plan made this way is not a professional architectural drawing or a survey.</li>
  </ul>
</details>`;

// The exterior sheet's "is the outline true to size yet" controls, shown in the side panel.
const sizedHtml = () => `<label class="check"><input type="checkbox" id="chkSized"${plan.exteriorSized ? ' checked' : ''}> The outline is true to size</label>
  ${MEASURING_TIPS}`;

// Shown over every floor until the outline has been sized, since floors are not resized with it.
function renderSizeWarning() {
  $('#sizeWarning').hidden = onExterior() || plan.exteriorSized;
}

$('#sizeWarning').addEventListener('click', (e) => {
  if (e.target.id === 'btnGoExterior') floorId = exteriorFloor().id;
  else if (e.target.id === 'btnSizedAlready') plan.exteriorSized = true;
  else return;
  sel = null;
  save();
  fitView();
  renderAll();
});

let measureTo = null; // where the scale line would end if clicked now

// Shift keeps a line from `from` level or upright, whichever is closer.
function straighten(e, from, p) {
  if (!e.shiftKey) return p;
  return Math.abs(p.x - from.x) > Math.abs(p.y - from.y) ? { x: p.x, y: from.y } : { x: from.x, y: p.y };
}

let measure = null; // points clicked while setting the picture's scale

const onExterior = () => floor().kind === 'exterior';

function renderAerial() {
  const box = $('#aerial');
  const a = plan.aerial;
  box.hidden = !onExterior();
  if (box.hidden) return;
  if (box.dataset.file !== (a?.file || 'none')) {
    box.dataset.file = a?.file || 'none';
    box.innerHTML = a
      ? `<img data-photo="${esc(a.file)}" alt="" title="Open full size">
        <label class="check"><input type="checkbox" id="chkAerial"> Show under the grid</label>
        <div class="actions">
          <button id="btnAerialScale" title="Click two points a known distance apart to size the picture">Set scale…</button>
          <button id="btnAerialAdd">Replace…</button>
          <button id="btnAerialRemove" class="danger">Remove</button>
        </div>`
      : `<h2>Aerial view</h2>
        <p class="muted">Add a satellite or aerial picture of the lot to trace the outline from.</p>
        <button id="btnAerialAdd">Add picture…</button>`;
    hydrateImages(box);
    if (a) photoUrl(a.file).then((u) => { $('#underlay').src = u; }, () => {});
  }
  if (a) $('#chkAerial').checked = a.show;
}

// Keeps the picture lined up with the plan as the view pans and zooms.
function placeUnderlay() {
  const a = plan.aerial;
  const img = $('#underlay');
  img.hidden = !(a?.show && onExterior());
  if (img.hidden) return;
  const u = feetPerPx();
  img.style.left = (a.x - view.x) / u + 'px';
  img.style.top = (a.y - view.y) / u + 'px';
  img.style.width = a.w / u + 'px';
  img.style.height = (a.w * a.aspect) / u + 'px';
}

async function setAerial(file) {
  let aspect;
  try {
    const bmp = await createImageBitmap(file);
    aspect = bmp.height / bmp.width;
    bmp.close();
  } catch {
    return tell('The browser cannot display that picture. Try a JPEG or PNG.');
  }
  const path = `${DIR_REFERENCE}/aerial${extOf(file.name)}`;
  const old = plan.aerial?.file;
  await io(async () => {
    if (old && old !== path) await store.remove(old).catch(() => {});
    await store.write(path, file);
  });
  for (const p of [old, path]) if (p) dropUrl(p);
  // 200 ft wide is only a starting guess; "Set scale" makes it true to size.
  plan.aerial = { file: path, x: 0, y: 0, w: 200, aspect, show: true };
  $('#aerial').dataset.file = '';
  view = { x: -20, y: -20, w: 260 };
  save();
  resetHistory(); // the picture file was written, which undo cannot reverse
  renderAll();
  flash('Picture added at a rough size. Use “Set scale…” so it matches the grid, then trace it with Polygon.');
}

// Resizes everything on a sheet, keeping `origin` where it is: shapes, the aerial picture, photo
// markers and issue pins all stay lined up with each other. Normally both directions use the same
// factor. Giving a different one for up-and-down stretches the sheet, which corrects a picture
// that was not taken from straight overhead.
function scaleSheet(f, origin, kx, ky = kx) {
  const at = (p) => ({ x: fine(origin.x + (p.x - origin.x) * kx), y: fine(origin.y + (p.y - origin.y) * ky) });
  for (const r of f.rooms) {
    if (isPoly(r)) r.points = r.points.map((p) => ({ ...p, ...at(p) }));
    else Object.assign(r, at(r), { w: fine(r.w * kx), h: fine(r.h * ky) });
  }
  for (const item of [...plan.photos, ...plan.issues.filter(pinned)]) if (item.floorId === f.id) Object.assign(item, at(item));
  const a = plan.aerial;
  if (a && f.kind === 'exterior') Object.assign(a, at(a), { w: fine(a.w * kx), aspect: (a.aspect * ky) / kx });
}

// Makes the two clicked points `feet` apart by resizing the whole exterior sheet, so anything
// already traced stays lined up with the picture. The first point stays where it is.
function applyScale([p, q], feet) {
  scaleSheet(exteriorFloor(), p, feet / Math.hypot(q.x - p.x, q.y - p.y));
  save();
}

// Which wall of the selected shape is under the pointer, or -1.
function nearestWall(p) {
  const pts = shapePoints(selRoom());
  let best = -1;
  let reach = 15 * feetPerPx();
  pts.forEach((_, i) => {
    // A curved wall is tried along the curve itself.
    const path = wallPoints(pts, i);
    const d = Math.min(...path.slice(1).map((b, n) => distToSegment(p, path[n], b)));
    if (d < reach) {
      reach = d;
      best = i;
    }
  });
  return best;
}

// "Resize everything from a wall": click a wall of the selected outline, say how long it really
// is, and the whole sheet is resized to make that true. This corrects the scale.
function wallClick(p) {
  const pts = shapePoints(selRoom());
  const i = nearestWall(p);
  if (i < 0) return flash('Click on one of the walls of the selected outline.');
  const wall = [pts[i], pts[(i + 1) % pts.length]];
  measure = wall;
  renderCanvas();
  const now = fine(Math.hypot(wall[1].x - wall[0].x, wall[1].y - wall[0].y));
  const question = `That wall is ${fmtLen(now)} long on the grid right now.\nHow long is it really?`;
  const detail = 'This resizes everything on the sheet by the same amount, so use it when every measurement is off in proportion. Measure along the line you traced: if you traced the roof edge, measure the roof edge, not the wall.';
  // A wall that runs straight across or straight up the sheet can also be used to stretch the
  // sheet in that one direction, leaving the other alone.
  const across = Math.abs(wall[1].y - wall[0].y) < 0.03 * now;
  const upright = Math.abs(wall[1].x - wall[0].x) < 0.03 * now;
  const check = across || upright ? {
    label: `Stretch ${across ? 'side to side' : 'up and down'} only. Use this for a second wall, when a wall running the other way is already right: it corrects a picture that was not taken from straight overhead.`,
    checked: false,
  } : null;
  ask(question, { length: true, ok: 'Resize everything', detail, check }).then((answer) => {
    const feet = check ? answer?.feet : answer;
    const oneWay = !!(check && answer?.checked);
    const done = feet > 0 && now > 0;
    if (done) {
      const k = feet / now;
      scaleSheet(floor(), wall[0], oneWay && upright ? 1 : k, oneWay && across ? 1 : k);
      plan.exteriorSized = true;
      save();
      fitView();
    }
    setTool('select');
    renderAll();
    if (done) flash(oneWay ? 'Stretched in that direction only. Check a wall each way against its label.' : 'Resized. Now check a wall that runs the other way against its label.');
  });
}

// Makes wall i of a shape `feet` long. `move` says which end gives: 'a' the wall's first corner,
// 'b' its second, or 'both' to share the change. The wall joined to a moving end slides with it,
// and the end that stays keeps every wall beyond it exactly as it was. Nothing else on the sheet
// moves.
function setWallLength(r, i, feet, move) {
  const pts = shapePoints(r).map((p) => ({ ...p }));
  const n = pts.length;
  const prev = (i + n - 1) % n;
  const next = (i + 1) % n;
  const len = Math.hypot(pts[next].x - pts[i].x, pts[next].y - pts[i].y);
  const dir = { x: (pts[next].x - pts[i].x) / len, y: (pts[next].y - pts[i].y) / len };
  const change = len - feet; // positive shortens the wall
  const atA = move === 'a' ? change : move === 'b' ? 0 : change / 2;
  const slide = (corners, d) => {
    if (!d) return;
    for (const k of new Set(corners)) pts[k] = { ...pts[k], x: fine(pts[k].x + dir.x * d), y: fine(pts[k].y + dir.y * d) };
  };
  slide(n >= 4 ? [prev, i] : [i], atA);
  slide(n >= 4 ? [next, (i + 2) % n] : [next], atA - change);
  if (isPoly(r)) {
    r.points = pts;
  } else {
    const b = shapeBounds({ points: pts });
    Object.assign(r, { x: b.x0, y: b.y0, w: fine(b.x1 - b.x0), h: fine(b.y1 - b.y0) });
  }
}

// "Set one wall's length": click a wall and type its real length.
function wallLengthClick(p) {
  const r = selRoom();
  const pts = shapePoints(r);
  const i = nearestWall(p);
  if (i < 0) return flash('Click on one of the walls of the selected shape.');
  if (isCurvedWall(pts, i)) return tell('That wall is curved, so it has no single length to set. Drag the points it bends through instead; its length along the curve is shown beside it.');
  const wall = [pts[i], pts[(i + 1) % pts.length]];
  measure = wall;
  renderCanvas();
  const now = fine(Math.hypot(wall[1].x - wall[0].x, wall[1].y - wall[0].y));
  const question = `That wall is ${fmtLen(now)} long on the grid right now.\nHow long should it be?`;
  const detail = 'Only this shape changes. The end that moves takes the wall joined to it along; the end that stays keeps the rest of the shape exactly as it is.';
  // The ends are named by where they sit on the sheet. The one nearer the click starts out chosen.
  const [a, b] = wall;
  const across = Math.abs(b.x - a.x) > Math.abs(b.y - a.y);
  const aFirst = across ? a.x < b.x : a.y < b.y;
  const names = across ? ['left', 'right'] : ['top', 'bottom'];
  const nameOf = { a: names[aFirst ? 0 : 1], b: names[aFirst ? 1 : 0] };
  const choices = [
    ...(aFirst ? ['a', 'b'] : ['b', 'a']).map((v) => ({ value: v, label: `Move the ${nameOf[v]} end; the ${nameOf[v === 'a' ? 'b' : 'a']} end stays where it is` })),
    { value: 'both', label: 'Move both ends by the same amount' },
  ];
  const choice = Math.hypot(p.x - a.x, p.y - a.y) < Math.hypot(p.x - b.x, p.y - b.y) ? 'a' : 'b';
  ask(question, { length: true, ok: 'Set length', detail, choices, choice }).then((answer) => {
    const done = answer?.feet > 0 && now > 0;
    if (done) {
      setWallLength(r, i, answer.feet, answer.choice);
      save();
    }
    setTool('select');
    renderAll();
    if (done) flash(answer.choice === 'both' ? 'Length set. Both ends moved by the same amount.' : `Length set. The ${nameOf[answer.choice]} end moved.`);
  });
}

function measureClick(p) {
  measure.push(p);
  renderCanvas();
  if (measure.length < 2) return;
  const pts = measure;
  const now = fine(Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
  const question = `Those two points are ${fmtLen(now)} apart on the grid right now.\nHow far apart are they really?`;
  ask(question, { length: true, ok: 'Set scale' }).then((feet) => {
    if (feet > 0 && now > 0) applyScale(pts, feet);
    setTool('select');
    renderAll();
  });
}

$('#aerial').addEventListener('click', async (e) => {
  const a = plan.aerial;
  if (e.target.id === 'btnAerialAdd') $('#aerialInput').click();
  if (e.target.matches('img')) openLightbox(a.file, 'Aerial view');
  if (e.target.id === 'btnAerialScale') {
    a.show = true;
    setTool('scale');
    renderAll();
  }
  if (e.target.id === 'btnAerialRemove') {
    const sure = await ask('Remove the aerial picture from this project? Its copy in the reference folder is deleted. Shapes you traced stay.', { ok: 'Remove', danger: true });
    if (!sure) return;
    io(() => store.remove(a.file)).catch(() => {});
    dropUrl(a.file);
    plan.aerial = null;
    save();
    resetHistory();
    renderAll();
  }
});

$('#aerial').addEventListener('change', (e) => {
  if (e.target.id !== 'chkAerial') return;
  plan.aerial.show = e.target.checked;
  save();
  renderCanvas();
});

$('#aerialInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) setAerial(file);
});
