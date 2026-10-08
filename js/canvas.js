'use strict';

const svg = $('#canvas');

// While a sheet is being drawn for printing, these stand in for the size of the drawing area.
let printWidth = 0;
let printAspect = 0;

function feetPerPx() {
  return view.w / (printWidth || svg.getBoundingClientRect().width || 1000);
}

// Worked out from the view itself, not from what is on screen, so that it is right the moment
// the view moves, before the plan has been redrawn.
function toFeet(e) {
  const box = svg.getBoundingClientRect();
  const u = view.w / (box.width || 1000);
  return { x: view.x + (e.clientX - box.left) * u, y: view.y + (e.clientY - box.top) * u };
}

// Height over width of the drawing area; a sane default while it has no size yet.
function canvasAspect() {
  if (printAspect) return printAspect;
  const box = svg.getBoundingClientRect();
  return box.width > 0 && box.height > 0 ? box.height / box.width : 0.6;
}

// Grid squares are 1 ft, growing to 10 ft and 100 ft as the view zooms out. Every tenth line is bold.
function gridStep() {
  const u = feetPerPx();
  return [1, 10, 100].find((s) => s / u >= 10) || 1000;
}

// The exterior sheet opens zoomed out to lot scale; floors open at room scale. The scale is the
// one a computer screen shows, with the sheet about 1040 pixels across, so that a smaller screen
// shows less of the sheet at the same size of grid square rather than shrinking the squares. It
// still shows at least a lot's or a house's width.
const defaultView = () => {
  const [at, w, least] = floor().kind === 'exterior' ? [-40, 300, 100] : [-5, 90, 30];
  const across = svg.getBoundingClientRect().width || 1040;
  return { x: at, y: at, w: Math.min(w, Math.max(least, (w * across) / 1040)) };
};

let cursor = null; // last pointer position, in feet

// Shift and Alt for a screen with no keyboard: the Square and Free switches on the touch bar.
// They stay on until the tool changes.
const held = { square: false, free: false };
const squareKey = (e) => e.shiftKey || held.square;
const freeKey = (e) => e.altKey || held.free;

// Handles, pins and photo markers are bigger where the pointer is a finger.
const grip = () => (coarsePointer.matches && !printWidth ? 1.7 : 1);

// ---------- zoom ----------
const ZOOM_FULL = 10; // pixels to the foot at 100%: the scale at which the grid squares become 1 ft
const viewCentre = () => ({ x: view.x + view.w / 2, y: view.y + (view.w * canvasAspect()) / 2 });

// Makes the view k times as wide, keeping the given point where it is on screen.
function zoomBy(k, p = viewCentre()) {
  const w = Math.min(3000, Math.max(10, view.w * k));
  k = w / view.w;
  view = { x: p.x - (p.x - view.x) * k, y: p.y - (p.y - view.y) * k, w };
  renderCanvas();
  refreshPointer(); // zooming part way through a drag keeps what is being drawn under the pointer
}

$('#btnZoomIn').addEventListener('click', () => zoomBy(0.8));
$('#btnZoomOut').addEventListener('click', () => zoomBy(1.25));
$('#btnZoomLevel').addEventListener('click', () => zoomBy(1 / (feetPerPx() * ZOOM_FULL)));

function liveSize() {
  if (drag?.size) return drag.size();
  if (drag?.type === 'draw') return `${fmtLen(drag.rect.w)} × ${fmtLen(drag.rect.h)}`;
  if (drag?.type === 'resize') return `${fmtLen(drag.room.w)} × ${fmtLen(drag.room.h)}`;
  if (measure?.length === 1 && measureTo) return `${fmtLen(Math.hypot(measureTo.x - measure[0].x, measureTo.y - measure[0].y))} on the grid`;
  if (tool === 'ruler' && measure?.length === 2) return `${fmtLen(Math.hypot(measure[1].x - measure[0].x, measure[1].y - measure[0].y))} measured`;
  if (draft) return `Side ${fmtLen(Math.hypot(draft.cursor.x - draft.points.at(-1).x, draft.cursor.y - draft.points.at(-1).y))}`;
  return '';
}

function renderReadout() {
  if (!printWidth) $('#btnZoomLevel').textContent = Math.round(100 / (feetPerPx() * ZOOM_FULL)) + '%';
  const step = gridStep();
  const size = liveSize();
  $('#readout').innerHTML = (size ? `<b>${size}</b> · ` : '')
    + (cursor ? `${cursor.x.toFixed(1)}, ${cursor.y.toFixed(1)} ft · ` : '')
    + `Grid: ${step} ft squares, bold line every ${step * 10} ft · Snap: ½ ft, corners${floor().kind === 'exterior' ? '' : ' and wall gaps'} (Alt: grid only)`;
}

// Degrees clockwise from the top of the plan.
const angleTo = (from, p) => Math.round((Math.atan2(p.y - from.y, p.x - from.x) * 180) / Math.PI + 450) % 360;
const samePoint = (a, b) => a.x === b.x && a.y === b.y;
const pointList = (pts) => pts.map((p) => `${p.x},${p.y}`).join(' ');

function shapeSvg(r, cls) {
  if (hasCurves(r)) return `<path class="${cls}" d="${outlinePath(r.points)}"/>`;
  if (isPoly(r)) return `<polygon class="${cls}" points="${pointList(r.points)}"/>`;
  return `<rect class="${cls}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`;
}

// A room's name and size, laid out to fit inside it. A room too narrow for the usual two lines
// gets its size split over two, turned to read up the room if it is tall and thin, or cut back
// to the area alone and finally to just the name. The text grows with the room as the view zooms
// in, and shrinks a little before anything is left out. Returns the drawing and the space it
// takes up.
function roomLabel(r, u) {
  const b = labelBox(r);
  const c = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  const room = { w: (b.x1 - b.x0) / u - 8, h: (b.y1 - b.y0) / u - 6 }; // in pixels, less a margin
  const dims = isPoly(r) ? '' : `${fmtLen(r.w)} × ${fmtLen(r.h)}`;
  const area = `${Math.round(shapeArea(r))} sf${r.separate ? ' · not counted' : ''}${r.finished && floor().basement ? ' · finished' : ''}${r.level ? ' · ' + levelText(r) : ''}`;
  const name = { text: r.name, cls: '', size: 13 };
  const small = (text) => ({ text, cls: 'dims', size: 11 });
  const size = (lines) => ({
    w: Math.max(...lines.map((l) => l.text.length * l.size * 0.56)),
    h: lines.reduce((a, l) => a + l.size + 3, 0),
  });
  // In order of preference: everything reading across, everything turned, then less and less.
  const full = dims ? [[name, small(`${dims} · ${area}`)], [name, small(dims), small(area)]] : [[name, small(area)]];
  const less = dims ? [[name, small(area)], [name]] : [[name]];
  const options = [
    ...full.map((lines) => ({ lines, turned: false })),
    ...full.map((lines) => ({ lines, turned: true })),
    ...less.flatMap((lines) => [{ lines, turned: false }, { lines, turned: true }]),
  ];
  // How many times over a layout would fit in the room at its normal size.
  const roomFits = (o) => {
    const s = size(o.lines);
    return o.turned ? Math.min(room.h / s.w, room.w / s.h) : Math.min(room.w / s.w, room.h / s.h);
  };
  // A layout is used if it fits at four fifths of normal size. A room too small even for its
  // name still shows it.
  const { lines, turned } = options.find((o) => roomFits(o) >= 0.8) || { lines: [name], turned: false };
  // With room to spare the text grows to fill seven tenths of it, up to two and a half times
  // normal size.
  const fit = roomFits({ lines, turned });
  const k = Math.max(Math.min(1, Math.max(fit, 0.8)), Math.min(2.5, fit * 0.7));
  const base = size(lines);
  const s = { w: base.w * k, h: base.h * k };
  let y = c.y - (s.h / 2) * u;
  let text = '';
  for (const l of lines) {
    y += (l.size + 3) * k * u;
    text += `<text class="${l.cls}" x="${c.x}" y="${y - 4 * k * u}" font-size="${l.size * k * u}" stroke-width="${l.size * k * u * 0.3}">${esc(l.text)}</text>`;
  }
  const half = turned ? { w: (s.h / 2) * u, h: (s.w / 2) * u } : { w: (s.w / 2) * u, h: (s.h / 2) * u };
  return { svg: turned ? `<g transform="rotate(-90 ${c.x} ${c.y})">${text}</g>` : text, c, half };
}

// Things on the sheet that a wall's length label should not be written over: the names of the
// rooms, and the doors and openings.
function labelObstacles(u) {
  const boxes = floor().rooms.map((r) => roomLabel(r, u));
  for (const o of floor().openings) {
    const along = o.w / 2 + 3 * u;
    const kind = openingKind(o.kind);
    const across = o.t / 2 + 5 * u + (kind.leaf ? o.w : kind.fold ? o.w * 0.2 : 0); // room for the door itself
    boxes.push({ c: o, half: o.along === 'x' ? { w: along, h: across } : { w: across, h: along } });
  }
  return boxes;
}

// The length of each wall of a shape, written just outside it. Each label is tied to the middle of
// its wall by a short line, and is moved inside the shape or further off when it would land on
// another label. A curved wall gives its length along the curve.
function wallLabels(r, u) {
  const pts = shapePoints(r);
  const walls = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const path = wallPoints(pts, i);
    const curved = path.length > 2;
    const len = path.slice(1).reduce((sum, q, j) => sum + Math.hypot(q.x - path[j].x, q.y - path[j].y), 0) || 1;
    const chord = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const m = curved ? path[path.length >> 1] : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let n = { x: -(b.y - a.y) / chord, y: (b.x - a.x) / chord };
    // Point the label away from the inside of the shape, whichever way round it was drawn.
    if (shapeContains(r, { x: m.x + n.x * 3 * u, y: m.y + n.y * 3 * u })) n = { x: -n.x, y: -n.y };
    return { len, m, n, text: fmtLen(len) + (curved ? ' curved' : '') };
  }).filter((w) => w.len > 10 * u).sort((a, b) => b.len - a.len); // long walls get the closest spots

  // Labels also keep clear of the corner handles.
  const placed = [...pts.map((c) => ({ c, half: { w: 9 * u, h: 9 * u } })), ...labelObstacles(u)];
  let ticks = '';
  let labels = '';
  for (const w of walls) {
    const half = { w: (w.text.length * 6.4 + 8) * u / 2, h: 9 * u };
    const clear = 7 * u + Math.abs(w.n.x) * half.w + Math.abs(w.n.y) * half.h; // just off the wall
    // Just outside the wall is best. Where something is in the way there, the label goes just
    // inside instead, and only then further off, a step at a time on either side.
    const spot = (d) => ({ x: w.m.x + w.n.x * d, y: w.m.y + w.n.y * d });
    const free = (c) => !placed.some((q) => Math.abs(c.x - q.c.x) < half.w + q.half.w && Math.abs(c.y - q.c.y) < half.h + q.half.h);
    let c = null;
    for (let step = 0; step < 8 && !c; step++) {
      c = [1, -1].map((side) => spot(side * (clear + step * 17 * u))).find(free) || null;
    }
    c ||= spot(clear);
    placed.push({ c, half });
    ticks += `<line class="wallTick" x1="${w.m.x}" y1="${w.m.y}" x2="${c.x}" y2="${c.y}"/><circle class="wallTick" cx="${w.m.x}" cy="${w.m.y}" r="${2.5 * u}"/>`;
    labels += `<text class="wall" x="${c.x}" y="${c.y + 4 * u}" font-size="${11 * u}" stroke-width="${4 * u}">${w.text}</text>`;
  }
  return ticks + labels;
}

function photoSvg(ph, u, on) {
  // One arrow for each photo the marker holds. On a selected marker the photo being looked at
  // gets a longer arrow ending in a yellow handle. Its arrowhead is drawn on top of the handle
  // with its tip at the centre, so the direction reads clearly and the handle shows exactly
  // where it points.
  const shots = [ph, ...(ph.more || [])];
  const current = on ? selShot() : null;
  // A marker with no photo yet gets a "not ready" sign: a red ring with a slash through it.
  const empty = ph.file === '';
  const cls = `photo${on ? ' sel' : ''}${empty ? ' empty' : ''}`;
  let arrows = '';
  let handle = '';
  // The arrows are drawn only while the marker is selected or being placed: left on all the
  // time, those of a few markers cover a good part of a room and catch clicks meant for what is
  // under them. A printed sheet keeps them, since nothing can be selected on paper.
  for (const shot of on || ph === drag || printWidth ? shots : []) {
    const a = ((shot.dir - 90) * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const aimed = shot === current;
    const reach = (aimed ? 42 : 30) * u;
    const tx = ph.x + c * reach;
    const ty = ph.y + s * reach;
    const back = (aimed ? 9 : 10) * u;
    const bx = tx - c * back;
    const by = ty - s * back;
    const head = `<polygon points="${tx},${ty} ${bx - s * 5.5 * u},${by + c * 5.5 * u} ${bx + s * 5.5 * u},${by - c * 5.5 * u}"/>`;
    arrows += `<line x1="${ph.x}" y1="${ph.y}" x2="${bx}" y2="${by}"/>${aimed ? '' : head}`;
    if (aimed) {
      handle = `<circle class="handle" data-kind="aim" cx="${tx}" cy="${ty}" r="${11 * u * grip()}"><title>Drag to turn the arrow</title></circle>
        <g class="${cls} aimHead">${head}</g>`;
    }
  }
  const k = 6.4 * u;
  const slash = empty ? `<line class="slash" x1="${ph.x - k}" y1="${ph.y - k}" x2="${ph.x + k}" y2="${ph.y + k}"/>` : '';
  // A marker holding several photos shows how many.
  const count = shots.length > 1 ? `<text class="photoNum" x="${ph.x}" y="${ph.y + 3.5 * u}" font-size="${10 * u}">${shots.length}</text>` : '';
  return `<g class="${cls}" data-kind="photo" data-id="${ph.id || ''}">
    ${arrows}<circle cx="${ph.x}" cy="${ph.y}" r="${(empty ? 9 : shots.length > 1 ? 8 : 7) * u * grip()}"/>${slash}${count}</g>${handle}`;
}

// A handle on every corner of a box; dragging one leaves the opposite corner where it is.
function cornerHandles(r, u) {
  u *= grip();
  return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([ix, iy]) => `<rect class="handle resize${ix === iy ? '' : ' rising'}" data-kind="handle" data-ix="${ix}" data-iy="${iy}" x="${r.x + ix * r.w - 6 * u}" y="${r.y + iy * r.h - 6 * u}" width="${12 * u}" height="${12 * u}"/>`).join('');
}

function renderCanvas() {
  if (!plan) return;
  const h = view.w * canvasAspect();
  const u = feetPerPx();
  svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${h}`);
  svg.setAttribute('class', 'plan tool-' + tool);

  let s = '';
  const step = gridStep();
  const bold = step * 10;
  const weight = (v) => (v % bold === 0 ? ' major' : v % (step * 5) === 0 ? ' mid' : '');
  let labels = '';
  for (let x = Math.floor(view.x / step) * step; x <= view.x + view.w; x += step) {
    if (x % bold === 0) labels += `<text class="axis" x="${x + 3 * u}" y="${view.y + 13 * u}" font-size="${11 * u}">${x} ft</text>`;
    s += `<line class="g${weight(x)}" x1="${x}" y1="${view.y}" x2="${x}" y2="${view.y + h}"/>`;
  }
  for (let y = Math.floor(view.y / step) * step; y <= view.y + h; y += step) {
    if (y % bold === 0) labels += `<text class="axis" x="${view.x + 3 * u}" y="${y - 3 * u}" font-size="${11 * u}">${y} ft</text>`;
    s += `<line class="g${weight(y)}" x1="${view.x}" y1="${y}" x2="${view.x + view.w}" y2="${y}"/>`;
  }

  s += labels;

  for (const r of outlineShapes()) s += shapeSvg(r, 'outline' + (r.separate ? ' separate' : ''));

  // Stairs lie underneath everything they overlap, rooms included, so that a small room, a door
  // or a fixture at the foot of them can still be seen and clicked. Selecting the stairs brings
  // them to the top, further down, so that they can be worked on.
  const isSelItem = (it) => sel?.type === 'item' && sel.id === it.id;
  for (const it of layers.items ? floor().items : []) if (isStairs(it) && !isSelItem(it)) s += itemSvg(it, u, false);

  // The selected shape is drawn last so that it, and its handles, sit on top of any shape overlapping it.
  const isSel = (r) => sel?.type === 'room' && sel.id === r.id;
  let onTop = ''; // the selected room's wall lengths and handles, which nothing should cover
  let names = ''; // the rooms' names and sizes, written over the fixtures and doors standing in them
  for (const r of [...floor().rooms].sort((a, b) => isSel(a) - isSel(b))) {
    const on = isSel(r);
    s += `<g data-kind="room" data-id="${r.id}">${shapeSvg(r, 'room' + (on ? ' sel' : '') + (r.separate ? ' separate' : ''))}</g>`;
    if (layers.names) names += roomLabel(r, u).svg;
    if (on) onTop += wallLabels(r, u);
    // A locked shape shows its wall lengths but has nothing to drag.
    if (on && !r.locked) {
      // A bar in the middle of each level or upright wall drags that whole wall in or out, which
      // keeps the corners square. Walls too short to hold one beside the corner handles go without.
      shapePoints(r).forEach((a, i, pts) => {
        const b = pts[(i + 1) % pts.length];
        const k = a.x === b.x ? 'x' : a.y === b.y ? 'y' : null;
        if (!k || isCurvedWall(pts, i) || Math.hypot(b.x - a.x, b.y - a.y) < 40 * u) return;
        const [w, h] = k === 'x' ? [6 * u * grip(), 16 * u] : [16 * u, 6 * u * grip()];
        onTop += `<rect class="handle side ${k === 'x' ? 'upright' : 'level'}" data-kind="side" data-i="${i}" x="${(a.x + b.x) / 2 - w / 2}" y="${(a.y + b.y) / 2 - h / 2}" width="${w}" height="${h}" rx="${3 * u}"><title>Drag to move this wall</title></rect>`;
      });
    }
    if (on && r.locked) {
      // no handles
    } else if (on && isPoly(r)) {
      r.points.forEach((p, i) => {
        onTop += `<circle class="handle${p.curve ? ' curvePt' : ''}" data-kind="vertex" data-i="${i}" cx="${p.x}" cy="${p.y}" r="${6 * u * grip()}"><title>${p.curve ? 'The wall curves through this point. Drag to move it; double-click to take it out.' : 'Drag to move this corner; double-click to make the wall curve through it.'}</title></circle>`;
      });
    } else if (on) {
      onTop += cornerHandles(r, u);
    }
  }

  // Fixtures stand on the floor of the rooms. Counters go down first, so that a sink or a stove
  // set into one shows on top of it.
  for (const it of layers.items ? [...floor().items].sort((a, b) => (b.kind === 'counter') - (a.kind === 'counter')) : []) {
    if (!isStairs(it)) s += itemSvg(it, u, isSelItem(it));
  }
  if (selItem()) onTop += itemHandles(selItem(), u);

  // Doors and openings go over the rooms, so that they break the wall lines on either side.
  for (const o of floor().openings) s += openingSvg(o, u, sel?.type === 'opening' && sel.id === o.id);
  if (floor().kind === 'exterior') s += basementOutsideSvg(u);
  s += `<g class="roomNames">${names}</g>`;
  if (selItem() && isStairs(selItem())) s += itemSvg(selItem(), u, true);
  for (const it of layers.items ? floor().items : []) s += stairsButton(it, u);
  s += onTop;

  if (drag?.type === 'draw') s += shapeSvg(drag.rect, 'draft');
  if (draft) {
    s += `<path class="draft" d="${outlinePath([...draft.points, draft.cursor], false)}"/>
      <circle class="start" cx="${draft.points[0].x}" cy="${draft.points[0].y}" r="${6 * u * grip()}"/>`;
  }

  plan.issues.forEach((i) => {
    if (i.floorId !== floorId || !layers.issues || !pinned(i)) return;
    const on = sel?.type === 'issue' && sel.id === i.id;
    s += `<g data-kind="pin" data-id="${i.id}">
      <circle class="pin${on ? ' sel' : ''}${i.status === 'Done' ? ' done' : ''}" cx="${i.x}" cy="${i.y}" r="${10 * u * grip()}" fill="${cat(i.category).color}"/>
      <text class="pinNum" x="${i.x}" y="${i.y + 4 * u}" font-size="${11 * u}">${issueNum(i)}</text>
    </g>`;
  });

  for (const ph of plan.photos) {
    if (ph.floorId === floorId && layers.photos) s += photoSvg(ph, u, sel?.type === 'photo' && sel.id === ph.id);
  }
  if (drag?.type === 'place') s += photoSvg(drag, u, false);
  const gapLabels = [];
  for (const g of guides) {
    if (g.wall) {
      // A snapped wall gap: a bar across the wall, labelled with its thickness. At a corner two
      // bars meet, so a second label says nothing new if it matches the first, and otherwise
      // moves up clear of it.
      const m = midpoint([g.from, g.to]);
      const [dx, dy] = g.k === 'x' ? [0, -7] : [34, 4];
      const text = `${fmtShort(g.wall)} wall`;
      const at = { x: m.x + dx * u, y: m.y + dy * u, text };
      const near = (q, tall) => Math.abs(q.x - at.x) < 70 * u && Math.abs(q.y - at.y) < tall * u;
      s += `<line class="guide wallGap" x1="${g.from.x}" y1="${g.from.y}" x2="${g.to.x}" y2="${g.to.y}"/>`;
      if (gapLabels.some((q) => near(q, 45) && q.text === text)) continue;
      while (gapLabels.some((q) => near(q, 16))) at.y -= 16 * u;
      gapLabels.push(at);
      s += `<text class="wall ruler" x="${at.x}" y="${at.y}" font-size="${11 * u}" stroke-width="${4 * u}">${text}</text>`;
      continue;
    }
    s += `<line class="guide" x1="${g.from.x}" y1="${g.from.y}" x2="${g.to.x}" y2="${g.to.y}"/>
      <circle class="guide" cx="${g.from.x}" cy="${g.from.y}" r="${4 * u}"/>`;
  }
  if (measure?.length) {
    const ends = measure.length === 1 && measureTo ? [measure[0], measureTo] : measure;
    if (tool === 'ruler' && ends.length === 2) {
      const d = Math.hypot(ends[1].x - ends[0].x, ends[1].y - ends[0].y);
      s += `<text class="wall ruler" x="${(ends[0].x + ends[1].x) / 2}" y="${(ends[0].y + ends[1].y) / 2 - 8 * u}" font-size="${13 * u}" stroke-width="${4 * u}">${fmtLen(d)}</text>`;
    }
    s += `<polyline class="measure" points="${pointList(measure.length === 1 && measureTo ? [measure[0], measureTo] : measure)}"/>`
      + measure.map((p) => `<circle class="start" cx="${p.x}" cy="${p.y}" r="${5 * u}"/>`).join('');
  }

  svg.innerHTML = s;
  renderPopover();
  renderReadout();
  placeUnderlay();
  renderTouchBar();
}

// Shows the whole sheet, or just the shapes given.
function fitView(shapes = [...floor().rooms, ...outlineShapes()]) {
  if (!shapes.length) {
    view = defaultView();
    return;
  }
  const aspect = canvasAspect();
  const b = shapes.map(shapeBounds);
  const x0 = Math.min(...b.map((v) => v.x0));
  const y0 = Math.min(...b.map((v) => v.y0));
  const x1 = Math.max(...b.map((v) => v.x1));
  const y1 = Math.max(...b.map((v) => v.y1));
  const w = Math.max(x1 - x0, (y1 - y0) / aspect) * 1.2;
  view = { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - (w * aspect) / 2, w };
}

function addRoom(shape) {
  const f = floor();
  const n = f.rooms.length + 1;
  const name = f.kind === 'exterior' ? (n === 1 ? 'House outline' : 'Structure ' + n) : 'Room ' + n;
  const room = { id: uid(), name, ...shape };
  f.rooms.push(room);
  sel = { type: 'room', id: room.id };
  setTool('select');
  guides = [];
  save();
  renderAll();
}

// "Bend a wall": puts a curve point on the wall of the selected shape that was pressed and starts
// dragging it, so pressing on a wall and pulling bends it in one go. A rectangle becomes a polygon.
function bendPress(p) {
  const r = selRoom();
  const i = r ? nearestWall(p) : -1;
  if (i < 0) return flash('Press on one of the walls of the selected shape and drag to bend it.');
  const pts = shapePoints(r).map((q) => ({ ...q }));
  pts.splice(i + 1, 0, { x: fine(p.x), y: fine(p.y), curve: true });
  for (const k of ['x', 'y', 'w', 'h']) delete r[k];
  r.points = pts;
  setTool('select');
  const targets = snapTargets(r);
  targets.push(...pts.filter((_, n) => n !== i + 1));
  drag = { type: 'vertex', room: r, i: i + 1, targets };
  renderAll();
}

// Double-clicking a corner of a polygon makes the wall curve through it. Double-clicking a curve
// point takes it out again, which straightens a wall that was bent.
let lastCorner = null; // the corner last pressed, and when
function cornerPressedTwice(r, i) {
  const again = lastCorner?.room === r && lastCorner.i === i && performance.now() - lastCorner.t < 400;
  lastCorner = again ? null : { room: r, i, t: performance.now() };
  if (!again) return false;
  if (!r.points[i].curve) r.points[i] = { ...r.points[i], curve: true };
  else if (r.points.length > 3) r.points.splice(i, 1);
  else delete r.points[i].curve;
  save();
  renderAll();
  return true;
}

function finishPolygon() {
  if (draft?.points.length >= 3) addRoom({ points: draft.points });
}

// ---------- snapping ----------
// Points land on the half-foot grid, unless an existing corner is close on either axis, in which
// case they line up with that corner instead. On a floor they also catch on the lines that leave
// a standard wall between two rooms, or between a room and the outline. Holding Alt turns all of
// that off and leaves the grid.

let guides = []; // { k: 'x' | 'y', from, to } lines showing what a point is lined up with; `wall` on one is the thickness of a wall gap
let snapOff = false;

// Corners to line up with, with the wall-gap lines for the sheet carried alongside as `walls`.
function snapTargets(skip) {
  const pts = [];
  for (const r of [...floor().rooms, ...outlineShapes()]) if (r !== skip) pts.push(...shapePoints(r));
  if (draft) pts.push(...draft.points);
  pts.walls = wallLines(skip);
  return pts;
}

function snapPoint(p, targets, round = snap) {
  const out = { x: round(p.x), y: round(p.y) };
  guides = [];
  if (snapOff) return out;
  const reach = 8 * feetPerPx();
  const walls = [];
  for (const [k, o] of [['x', 'y'], ['y', 'x']]) {
    let best = null;
    for (const v of targets) {
      const d = Math.abs(v[k] - p[k]);
      if (d > reach) continue;
      const far = Math.abs(v[o] - p[o]);
      if (!best || d < best.d || (d === best.d && far < best.far)) best = { d, far, v };
    }
    for (const w of targets.walls?.[k] || []) {
      const d = Math.abs(w.v - p[k]);
      if (d > reach) continue;
      const far = Math.max(0, w.lo - p[o], p[o] - w.hi);
      if (!best || d < best.d || (d === best.d && far <= best.far)) best = { d, far, w };
    }
    if (best?.w) {
      out[k] = best.w.v;
      walls.push({ k, w: best.w });
    } else if (best) {
      out[k] = best.v[k];
      guides.push({ k, from: best.v, to: out });
    }
  }
  for (const { k, w } of walls) guides.push(wallGuide(k, w, out));
  return out;
}

// How far to nudge a shape being moved so that one of its corners lines up with an existing one,
// or sits a wall's thickness from a neighbour.
function snapMove(points, targets) {
  const adj = { x: 0, y: 0 };
  guides = [];
  if (snapOff) return adj;
  const reach = 8 * feetPerPx();
  const found = [];
  for (const k of ['x', 'y']) {
    let best = null;
    for (const a of points) {
      for (const v of targets) {
        const d = v[k] - a[k];
        if (Math.abs(d) <= reach && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, a, v };
      }
      for (const w of targets.walls?.[k] || []) {
        const d = w.v - a[k];
        if (Math.abs(d) <= reach && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, a, w };
      }
    }
    if (best) {
      adj[k] = best.d;
      found.push({ k, ...best });
    }
  }
  guides = found.map((g) => {
    const to = { x: g.a.x + adj.x, y: g.a.y + adj.y };
    return g.w ? wallGuide(g.k, g.w, to) : { k: g.k, from: g.v, to };
  });
  return adj;
}

// Where the next corner of a new shape goes. Shift keeps a polygon side level or upright.
function cornerPoint(e, p) {
  const q = snapPoint(p, snapTargets());
  if (tool === 'poly' && (e.ctrlKey || e.metaKey)) q.curve = true; // the wall curves through this one
  const last = draft?.points.at(-1);
  if (last && squareKey(e)) {
    const k = Math.abs(p.x - last.x) > Math.abs(p.y - last.y) ? 'y' : 'x';
    q[k] = last[k];
    guides = guides.filter((g) => g.k !== k);
  }
  return q;
}

// Pointer moves can arrive several times per frame; one redraw per frame is enough.
let renderQueued = false;
function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderCanvas();
  });
}

// Without this the browser may start its own text selection or drag-and-drop mid-drag. That
// swallows the pointer until the button is released and leaves our drag stuck to the cursor.
svg.addEventListener('mousedown', (e) => e.preventDefault());
$('#stage').addEventListener('dragstart', (e) => e.preventDefault());

// Dragging the view about: on empty space, on a locked shape, or anywhere with the middle button.
const panFrom = (e) => ({ type: 'pan', cx: e.clientX, cy: e.clientY, vx: view.x, vy: view.y, u: feetPerPx() });

let lastMove = null; // the pointer's latest move over the plan
let pressedAt = null; // where the button went down
let draggedFar = false; // whether the pointer has left that spot, as it does in a real drag

svg.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') return touchDown(e);
  press(e);
});

function press(e) {
  // The middle button moves the view whatever tool is in use, even part way through a polygon.
  if (e.button === 1 && !drag) {
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    drag = panFrom(e);
    return;
  }
  if (e.button !== 0) return;
  pressedAt = { x: e.clientX, y: e.clientY };
  draggedFar = false;
  e.preventDefault();
  document.activeElement?.blur(); // preventDefault also stops the click from taking focus off a field
  getSelection()?.removeAllRanges();
  const p = toFeet(e);
  snapOff = freeKey(e);
  const q = tool === 'rect' || tool === 'poly' ? cornerPoint(e, p) : { x: snap(p.x), y: snap(p.y) };
  const hit = e.target.closest('[data-kind]');
  if (!svg.hasPointerCapture(e.pointerId)) svg.setPointerCapture(e.pointerId);

  if (tool === 'rect') {
    drag = { type: 'draw', x0: q.x, y0: q.y, rect: { ...q, w: 0, h: 0 }, targets: snapTargets() };
  } else if (tool === 'poly') {
    if (!draft) {
      draft = { points: [q], cursor: q };
    } else {
      const first = draft.points[0];
      const last = draft.points.at(-1);
      const closing = Math.hypot(p.x - first.x, p.y - first.y) < (e.pointerType === 'touch' ? 24 : 10) * feetPerPx() || samePoint(q, first) || samePoint(q, last);
      if (closing && draft.points.length >= 3) return finishPolygon();
      if (!samePoint(q, last)) draft.points.push(q);
    }
    renderCanvas();
  } else if (tool === 'pin') {
    // Either a new issue, or the pin of one that was made without a pin.
    const waiting = plan.issues.find((i) => i.id === pinFor);
    const issue = waiting || newIssue();
    Object.assign(issue, { floorId, ...q });
    if (!waiting) plan.issues.push(issue);
    sel = { type: 'issue', id: issue.id };
    setTool('select');
    save();
    renderAll();
    revealPanel();
    $('#inspector input')?.select();
  } else if (tool === 'ruler') {
    // Measuring changes nothing: two clicks show a distance, and a third starts a new one.
    if (measure.length >= 2) measure = [];
    measure.push(measure.length === 1 ? straighten(e, measure[0], p) : p);
    measureTo = null;
    renderCanvas();
  } else if (tool === 'scale') {
    measureClick(measure.length === 1 ? straighten(e, measure[0], p) : p);
  } else if (tool === 'wall') {
    wallClick(p);
  } else if (tool === 'wallLen') {
    wallLengthClick(p);
  } else if (tool === 'split') {
    splitClick(p);
  } else if (tool === 'bend') {
    bendPress(p);
  } else if (tool === 'photo') {
    drag = { type: 'place', x: p.x, y: p.y, dir: 0 };
    renderCanvas();
  } else if (tool === 'door') {
    placeOpening(p);
  } else if (tool === 'window') {
    placeWindow(p);
  } else if (tool === 'stairs' || tool === 'item') {
    placeItem(p, tool === 'stairs' ? 'stairs' : '');
  } else if (itemDown(hit, p, e)) {
    // A fixture, stairs, or one of their handles: the drag carries its own `step`.
  } else if (hit?.dataset.kind === 'opening') {
    sel = { type: 'opening', id: hit.dataset.id };
    const o = selOpening();
    // A door in the wall of a locked room is held in place along with it.
    drag = lockedBy(o) ? panFrom(e) : { type: 'slide', o, d: p[o.along] - o[o.along] };
    renderAll();
  } else if (hit?.dataset.kind === 'handle') {
    const r = selRoom();
    // `left` and `top` say which edges the dragged corner moves; `far` is the corner that stays.
    const left = hit.dataset.ix === '0';
    const top = hit.dataset.iy === '0';
    drag = { type: 'resize', room: r, left, top, axes: ['x', 'y'], far: { x: left ? r.x + r.w : r.x, y: top ? r.y + r.h : r.y }, targets: snapTargets(r) };
  } else if (hit?.dataset.kind === 'side') {
    const r = selRoom();
    const i = +hit.dataset.i;
    const pts = shapePoints(r);
    const k = pts[i].x === pts[(i + 1) % pts.length].x ? 'x' : 'y'; // the direction this wall moves in
    if (isPoly(r)) {
      const targets = snapTargets(r);
      targets.push(...pts.filter((_, n) => n !== i && n !== (i + 1) % pts.length));
      drag = { type: 'wall', room: r, i, k, targets };
    } else {
      // A rectangle's walls run top, right, bottom, left; moving one is a resize along one axis.
      drag = { type: 'resize', room: r, left: i === 3, top: i === 0, axes: [k], far: { x: i === 3 ? r.x + r.w : r.x, y: i === 0 ? r.y + r.h : r.y }, targets: snapTargets(r) };
    }
  } else if (hit?.dataset.kind === 'vertex') {
    const r = selRoom();
    const i = +hit.dataset.i;
    if (cornerPressedTwice(r, i)) return;
    const targets = snapTargets(r);
    targets.push(...r.points.filter((_, n) => n !== i));
    // A curve point keeps its place under the pointer, so pressing on it does not shift it.
    drag = { type: 'vertex', room: r, i, targets, dx: r.points[i].x - p.x, dy: r.points[i].y - p.y };
  } else if (hit?.dataset.kind === 'aim') {
    drag = { type: 'aim', photo: selShot(), at: selPhoto() }; // the arrow of the photo being looked at
  } else if (hit?.dataset.kind === 'room') {
    sel = { type: 'room', id: hit.dataset.id };
    const r = selRoom();
    // A locked shape is selected but stays put: dragging on it moves the view, as on empty space.
    drag = r.locked ? panFrom(e) : isPoly(r)
      ? { type: 'movePoly', room: r, start: p, orig: r.points, targets: snapTargets(r) }
      : { type: 'move', obj: r, dx: p.x - r.x, dy: p.y - r.y, targets: snapTargets(r) };
    renderAll();
  } else if (hit?.dataset.kind === 'pin') {
    sel = { type: 'issue', id: hit.dataset.id };
    drag = { type: 'move', obj: selIssue(), dx: 0, dy: 0 };
    renderAll();
  } else if (hit?.dataset.kind === 'photo') {
    sel = { type: 'photo', id: hit.dataset.id };
    const ph = selPhoto();
    drag = { type: 'move', obj: ph, dx: p.x - ph.x, dy: p.y - ph.y, free: true };
    renderAll();
  } else {
    sel = null;
    drag = panFrom(e);
    renderAll();
  }
}

// ---------- fingers ----------
// A touch is held back until it is clearly a tap or a drag. A fingertip always wobbles a little,
// so a tap acts where the finger landed and moves nothing, and a second finger can still turn the
// touch into a pinch, which zooms and moves the view, before anything has been done.
const SLOP = 10; // pixels a finger may wander before a touch counts as a drag
const touches = new Map(); // the fingers on the plan, by pointerId: where each last was
let waiting = null; // the first finger's press, not acted on yet
let pinch = null;
let spent = false; // a finger left over from a pinch does nothing until it is lifted

function touchDown(e) {
  e.preventDefault();
  svg.setPointerCapture(e.pointerId);
  touches.set(e.pointerId, e);
  if (touches.size === 1) {
    waiting = e;
    spent = false;
    return;
  }
  if (touches.size === 2) startPinch();
}

function startPinch() {
  // A second finger ends whatever the first one began, and the two of them hold the view. A shape
  // being drawn, or a photo marker being aimed, is dropped rather than left half made.
  waiting = null;
  if (drag?.type === 'draw' || drag?.type === 'place') {
    drag = null;
    guides = [];
    renderCanvas();
  } else if (drag) {
    endDrag();
  }
  const [a, b] = touches.values();
  const mid = { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 };
  pinch = { apart: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, w: view.w, at: toFeet(mid) };
}

// The two fingers keep the same spot of the plan between them, at the scale they spread it to.
function pinchTo() {
  const [a, b] = touches.values();
  const box = svg.getBoundingClientRect();
  const apart = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
  const w = Math.min(3000, Math.max(10, (pinch.w * pinch.apart) / apart));
  const u = w / (box.width || 1000);
  view = { x: pinch.at.x - ((a.clientX + b.clientX) / 2 - box.left) * u, y: pinch.at.y - ((a.clientY + b.clientY) / 2 - box.top) * u, w };
  queueRender();
}

// Acts on a press that was held back. Dragging something that was not already selected moves the
// view instead, as dragging empty space does, so that a finger panning across the plan does not
// pick up the rooms and pins it starts on. A tap selects it; a drag after that moves it.
function pressTouch(down, tap) {
  const before = sel && sel.type + sel.id;
  press(down);
  const now = sel && sel.type + sel.id;
  if (!tap && drag && drag.type !== 'pan' && now !== before) drag = panFrom(down);
}

// Whether a finger's move goes on to be handled as a mouse move would.
function touchMove(e) {
  if (!touches.has(e.pointerId)) return false;
  touches.set(e.pointerId, e);
  if (pinch) {
    pinchTo();
    return false;
  }
  if (spent) return false;
  if (waiting) {
    if (Math.hypot(e.clientX - waiting.clientX, e.clientY - waiting.clientY) < SLOP) return false;
    const down = waiting;
    waiting = null;
    pressTouch(down, false);
  }
  return true;
}

// A second finger that lands off the plan, on the side panel or the toolbar, while one is on the
// plan, joins in the pinch as if it were on the plan too.
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' || !touches.size || svg.contains(e.target)) return;
  touchDown(e);
}, true);

// Moves and releases of a finger that joined from off the plan, in case the browser does not send
// them to the plan as it was asked to.
document.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId) && !svg.contains(e.target)) touchMove(e);
});
for (const type of ['pointerup', 'pointercancel']) {
  document.addEventListener(type, (e) => {
    if (touches.has(e.pointerId) && !svg.contains(e.target)) touchUp(e);
  });
}

// Safari on an iPad scrolls and zooms the whole page under a finger on the plan, even though the
// stylesheet says not to, and pulling down far enough reloads it. Once it has taken the touch over
// it cancels it for the plan, which used to end a rectangle where it began. Its own touch and
// gesture events can still be refused: a finger moving on the plan does not move the page, and
// while a finger is on the plan a pinch zooms the plan and not the page.
const onPlan = (t) => $('#stage').contains(t.target);
const onDrawing = (t) => svg.contains(t.target);
document.addEventListener('touchstart', (e) => {
  if (e.touches.length > 1 && [...e.touches].some(onPlan)) e.preventDefault();
}, { passive: false });
document.addEventListener('touchmove', (e) => {
  if ([...e.touches].some(onDrawing) || (e.touches.length > 1 && [...e.touches].some(onPlan))) e.preventDefault();
}, { passive: false });
for (const type of ['gesturestart', 'gesturechange']) {
  document.addEventListener(type, (e) => {
    if (touches.size) e.preventDefault();
  });
}

function touchUp(e) {
  if (!touches.delete(e.pointerId)) return;
  if (pinch || spent) {
    pinch = null;
    spent = touches.size > 0;
    return;
  }
  const down = waiting;
  waiting = null;
  if (down && e.type === 'pointerup') pressTouch(down, true); // a tap
  // A touch the browser called off leaves a shape being drawn, or a marker being aimed, unmade.
  if (e.type === 'pointercancel' && (drag?.type === 'draw' || drag?.type === 'place')) {
    drag = null;
    guides = [];
    return renderCanvas();
  }
  endDrag();
}

// The keys a drawing needs, as buttons over the plan, for a screen with no keyboard: Enter,
// Backspace and Esc while drawing, and the Shift and Alt switches.
function renderTouchBar() {
  const bar = $('#touchBar');
  const shown = coarsePointer.matches && !onList() && (tool !== 'select' || ['room', 'item', 'opening'].includes(sel?.type));
  bar.hidden = !shown;
  if (!shown) return;
  $('#btnTouchFinish').hidden = !(draft?.points.length >= 3);
  $('#btnTouchBack').hidden = !draft;
  $('#btnTouchCancel').hidden = tool === 'select';
  $('#btnTouchSquare').classList.toggle('active', held.square);
  $('#btnTouchFree').classList.toggle('active', held.free);
}

$('#touchBar').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'btnTouchFinish') return finishPolygon();
  if (b.id === 'btnTouchBack') {
    draft.points.pop();
    if (!draft.points.length) draft = null;
  } else if (b.id === 'btnTouchSquare') {
    held.square = !held.square;
  } else if (b.id === 'btnTouchFree') {
    held.free = !held.free;
  } else if (b.id === 'btnTouchCancel') {
    setTool('select');
  }
  renderCanvas();
});

svg.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' && !touchMove(e)) return;
  if (drag && e.buttons === 0) return endDrag(); // the release was missed, so do not keep dragging
  lastMove = e;
  if (pressedAt && Math.hypot(e.clientX - pressedAt.x, e.clientY - pressedAt.y) > 8) draggedFar = true;
  pointerTo(e);
  if (drag && !edgeTimer) edgeTimer = requestAnimationFrame(edgePan);
});

// Whatever is being drawn or dragged follows the pointer again after the view has moved under
// it: by the wheel, the arrow keys, or scrolling at the edge.
function refreshPointer() {
  if (lastMove && (drag || draft || measure?.length === 1)) pointerTo(lastMove);
}

// While something is being dragged, holding the pointer at the edge of the plan, or beyond it,
// scrolls the view that way, faster the further out it is. That lets a room be drawn or moved
// past what was on screen when the drag began.
const EDGE = 28; // pixels from the edge at which scrolling starts
let edgeTimer = null;
function edgePan() {
  edgeTimer = null;
  if (!drag || drag.type === 'pan' || !lastMove) return;
  const box = svg.getBoundingClientRect();
  const past = (v, lo, hi) => Math.max(-70, Math.min(70, v < lo + EDGE ? v - lo - EDGE : v > hi - EDGE ? v - hi + EDGE : 0));
  const dx = past(lastMove.clientX, box.left, box.right);
  const dy = past(lastMove.clientY, box.top, box.bottom);
  // A press that has not moved is a click near the edge, not a drag toward it.
  if (draggedFar && (dx || dy) && setting('edgeScroll')) {
    const u = feetPerPx();
    view.x += dx * u * 0.15;
    view.y += dy * u * 0.15;
    pointerTo(lastMove);
  }
  edgeTimer = requestAnimationFrame(edgePan);
}

function pointerTo(e) {
  if (drag?.type === 'pan') {
    view.x = drag.vx - (e.clientX - drag.cx) * drag.u;
    view.y = drag.vy - (e.clientY - drag.cy) * drag.u;
    return queueRender();
  }
  const p = toFeet(e);
  cursor = p;
  snapOff = freeKey(e);
  if (measure?.length === 1) {
    // One straight line follows the pointer from the first point until the second is clicked.
    // A cut through a room is shown where it would actually be made.
    measureTo = tool === 'split' ? splitEnd(selRoom(), measure[0], p) || p : straighten(e, measure[0], p);
    return queueRender();
  }
  if (!drag && !draft) return renderReadout();
  if (!drag) {
    draft.cursor = cornerPoint(e, p);
  } else if (drag.step) {
    drag.step(p);
  } else if (drag.type === 'draw') {
    const c = snapPoint(p, drag.targets);
    let dx = c.x - drag.x0;
    let dy = c.y - drag.y0;
    if (squareKey(e)) {
      guides = [];
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      dx = side * (dx < 0 ? -1 : 1);
      dy = side * (dy < 0 ? -1 : 1);
    }
    drag.rect = { x: Math.min(drag.x0, drag.x0 + dx), y: Math.min(drag.y0, drag.y0 + dy), w: Math.abs(dx), h: Math.abs(dy) };
  } else if (drag.type === 'resize') {
    const c = snapPoint(p, drag.targets);
    const { room, far, axes } = drag;
    guides = guides.filter((g) => axes.includes(g.k));
    // Never smaller than a foot, and never dragged through to the other side.
    if (axes.includes('x')) {
      room.w = Math.max(1, drag.left ? far.x - c.x : c.x - far.x);
      room.x = drag.left ? far.x - room.w : far.x;
    }
    if (axes.includes('y')) {
      room.h = Math.max(1, drag.top ? far.y - c.y : c.y - far.y);
      room.y = drag.top ? far.y - room.h : far.y;
    }
    renderInspector();
  } else if (drag.type === 'move') {
    drag.obj.x = drag.free ? fine(p.x - drag.dx) : snap(p.x - drag.dx);
    drag.obj.y = drag.free ? fine(p.y - drag.dy) : snap(p.y - drag.dy);
    if (drag.targets) {
      const adj = snapMove(shapePoints(drag.obj), drag.targets);
      drag.obj.x += adj.x;
      drag.obj.y += adj.y;
    }
  } else if (drag.type === 'movePoly') {
    const dx = snap(p.x - drag.start.x);
    const dy = snap(p.y - drag.start.y);
    const moved = drag.orig.map((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    const adj = snapMove(moved, drag.targets);
    drag.room.points = moved.map((v) => ({ ...v, x: v.x + adj.x, y: v.y + adj.y }));
  } else if (drag.type === 'vertex') {
    const pts = drag.room.points;
    const curve = pts[drag.i].curve;
    // A point on a curve is placed to the quarter inch; a corner keeps to the half-foot grid.
    let c = curve ? snapPoint({ x: p.x + (drag.dx || 0), y: p.y + (drag.dy || 0) }, drag.targets, fine) : snapPoint(p, drag.targets);
    if (squareKey(e)) {
      // Square the corner up with the corners on either side of it.
      const a = pts[(drag.i + pts.length - 1) % pts.length];
      const b = pts[(drag.i + 1) % pts.length];
      const options = [{ x: a.x, y: b.y }, { x: b.x, y: a.y }];
      c = options.sort((m, n) => Math.hypot(m.x - p.x, m.y - p.y) - Math.hypot(n.x - p.x, n.y - p.y))[0];
      guides = [{ k: 'x', from: a, to: c }, { k: 'y', from: b, to: c }];
    }
    pts[drag.i] = curve ? { ...c, curve: true } : c;
  } else if (drag.type === 'wall') {
    // Both ends of the wall move together, so the walls joined to it just get longer or shorter.
    const pts = drag.room.points;
    const v = snapPoint(p, drag.targets)[drag.k];
    guides = guides.filter((g) => g.k === drag.k);
    for (const n of [drag.i, (drag.i + 1) % pts.length]) pts[n] = { ...pts[n], [drag.k]: v };
  } else if (drag.type === 'slide') {
    drag.o[drag.o.along] = fine(p[drag.o.along] - drag.d); // a door only slides along its wall
  } else if (drag.type === 'aim') {
    drag.photo.dir = angleTo(drag.at, p);
  } else if (drag.type === 'place') {
    if (Math.hypot(p.x - drag.x, p.y - drag.y) > 6 * feetPerPx()) drag.dir = angleTo(drag, p);
  }
  queueRender();
}

function endDrag() {
  if (!drag) return;
  const d = drag;
  drag = null;
  guides = [];
  if (d.type === 'draw') {
    if (d.rect.w >= 1 && d.rect.h >= 1) return addRoom(d.rect);
  } else if (d.type === 'place') {
    addMarker(d.x, d.y, d.dir);
  }
  save();
  renderAll();
}

for (const type of ['pointerup', 'pointercancel']) {
  svg.addEventListener(type, (e) => (e.pointerType === 'touch' ? touchUp(e) : endDrag()));
}

svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomBy((e.deltaY > 0) !== setting('wheelReversed') ? 1.1 : 0.9, toFeet(e));
}, { passive: false });
