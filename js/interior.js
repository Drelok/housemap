'use strict';

// Working indoors: the house standards, the wall gaps that rooms snap to, doors and openings, and
// rooms that sit a step above or below the rest of their floor.
//
// A room is the clear space inside it, from wall face to wall face, which is what a tape measure
// reads. Walls are the gaps left between rooms, and between a room and the exterior outline.

// ---------- house standards ----------

// Asks for the project's wall thicknesses and door widths, starting from its own values or, the
// first time, from the suggested ones.
function openStandards() {
  $('#standardsBody').innerHTML = STANDARDS.map((s) => {
    const v = feetInches(std(s.key));
    const box = (part, val, extra) => `<input data-std="${s.key}" data-part="${part}" ${extra} value="${val}">`;
    return `<label>${s.label}<span class="ftin">${box('ft', v.ft, 'type="number" min="0" step="1"')}<i>ft</i>${box('in', fmtInches(v.in), 'inputmode="decimal" autocomplete="off"')}<i>in</i></span></label>
      <p class="muted small">Typical: ${fmtShort(s.typical)}. ${s.note}</p>`;
  }).join('');
  $('#standardsCancel').hidden = !plan.standards;
  $('#standardsClose').hidden = !plan.standards;
  $('#standardsDialog').returnValue = '';
  $('#standardsDialog').showModal();
}

// A floor cannot be laid out sensibly until the standards are set, so the first visit asks.
function checkStandards() {
  if (plan && floor().kind === 'floor' && !plan.standards && !document.querySelector('dialog[open]')) openStandards();
}

$('#btnStandardsTypical').addEventListener('click', () => {
  for (const s of STANDARDS) {
    const v = feetInches(s.typical);
    $(`#standardsBody [data-std="${s.key}"][data-part="ft"]`).value = v.ft;
    $(`#standardsBody [data-std="${s.key}"][data-part="in"]`).value = fmtInches(v.in);
  }
});

// Until a project has standards there is nothing to go back to, so Escape does not dismiss it.
$('#standardsDialog').addEventListener('cancel', (e) => {
  if (!plan.standards) e.preventDefault();
});

$('#standardsDialog').addEventListener('close', (e) => {
  if (e.target.returnValue !== 'ok') return;
  const typed = (key, part) => $(`#standardsBody [data-std="${key}"][data-part="${part}"]`).value;
  // A box left at nothing falls back to the suggested value rather than a wall of no thickness.
  plan.standards = Object.fromEntries(STANDARDS.map((s) => [s.key, fine((parseFloat(typed(s.key, 'ft')) || 0) + parseInches(typed(s.key, 'in')) / 12) || s.typical]));
  save();
  renderAll();
});

$('#tipsDialog').addEventListener('close', checkStandards);

const standardsHtml = () => `<p class="muted">Walls: ${fmtShort(std('exteriorWall'))} outside, ${fmtShort(std('interiorWall'))} inside · Doors: ${fmtShort(std('door'))}, open doorways ${fmtShort(std('opening'))}, exterior ${fmtShort(std('exteriorDoor'))} · Ceiling: ${fmtLen(std('ceiling'))}</p>
  <div class="actions"><button id="btnStandards" title="Wall thicknesses and door widths used when drawing rooms and placing doors">House standards…</button></div>`;

// ---------- wall gaps ----------

// The level and upright edges of a shape. Each sits at `v` on axis `k`, runs from `lo` to `hi` on
// the other axis `o`, starts at corner `i` of the shape, and has the outside of the shape on its
// `out` side (+1 or -1).
function straightEdges(r) {
  const pts = shapePoints(r);
  const edges = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const k = a.x === b.x ? 'x' : a.y === b.y ? 'y' : null;
    if (!k || samePoint(a, b) || isCurvedWall(pts, i)) return; // a curved wall is not a straight edge
    const o = k === 'x' ? 'y' : 'x';
    const m = midpoint([a, b]);
    edges.push({ i, k, o, v: a[k], lo: Math.min(a[o], b[o]), hi: Math.max(a[o], b[o]), out: shapeContains(r, { ...m, [k]: m[k] + 0.01 }) ? -1 : 1 });
  });
  return edges;
}

// Lines a room's edge can sit on so that a standard wall fits beside it: one interior wall out
// from each edge of the other rooms, and one exterior wall in from the outline.
function wallLines(skip) {
  const lines = { x: [], y: [] };
  if (floor().kind === 'exterior') return lines;
  const add = (r, t, side) => {
    for (const e of straightEdges(r)) lines[e.k].push({ v: fine(e.v + e.out * side * t), from: e.v, o: e.o, lo: e.lo, hi: e.hi, t });
  };
  for (const r of floor().rooms) if (r !== skip) add(r, std('interiorWall'), 1);
  for (const r of outlineShapes()) add(r, std('exteriorWall'), -1);
  return lines;
}

// The short line drawn across a wall gap that a point has snapped to, labelled with its thickness.
function wallGuide(k, w, at) {
  const pos = Math.max(w.lo, Math.min(w.hi, at[w.o]));
  return { k, from: { [k]: w.from, [w.o]: pos }, to: { [k]: w.v, [w.o]: pos }, wall: w.t };
}

// ---------- doors and openings ----------
// An opening sits in a wall: `x`, `y` is its centre, in the middle of the wall's thickness `t`;
// `along` is the direction the wall runs ('x' across the sheet, 'y' up and down); `w` is its width.

const openingKind = (id) => OPENING_KINDS.find((k) => k.id === id) || OPENING_KINDS[0];

// The wall under the pointer: the nearest straight edge of a room, and the gap behind it up to
// the next room or the exterior outline. The ends and sides of a staircase count as well, so
// that a door can stand at the top or bottom of the stairs, or between them and the wall they
// run up to.
function wallAt(p) {
  let edge = null;
  let reach = 15 * feetPerPx();
  const stairs = floor().items.filter(isStairs).flatMap((it) => stairParts(it).map((part) => ({ points: part.quad })));
  for (const r of [...floor().rooms, ...stairs]) {
    for (const e of straightEdges(r)) {
      const d = Math.hypot(p[e.k] - e.v, p[e.o] - Math.max(e.lo, Math.min(e.hi, p[e.o])));
      if (d < reach) {
        reach = d;
        edge = { ...e, r };
      }
    }
  }
  if (!edge) return null;
  const pos = Math.max(edge.lo, Math.min(edge.hi, p[edge.o]));
  let gap = null;
  let outside = false;
  let touching = false;
  const facing = (r, isOutline) => {
    for (const f of straightEdges(r)) {
      const d = (f.v - edge.v) * edge.out;
      if (f.k !== edge.k || pos < f.lo || pos > f.hi) continue;
      if (!isOutline && Math.abs(d) < 1 / 96 && f.out !== edge.out) touching = true;
      if (d < 1 / 96 || d > 1.5 || (gap !== null && d >= gap)) continue;
      gap = d;
      outside = isOutline;
    }
  };
  for (const r of floor().rooms) if (r !== edge.r) facing(r, false);
  for (const r of exteriorFloor()?.rooms || []) facing(r, true);
  // Two rooms drawn edge to edge have no wall between them. With nothing drawn on the far side
  // yet, assume a standard interior wall.
  const t = touching ? 0 : gap ?? std('interiorWall');
  return { ...edge, pos, t, touching, outside: outside && !touching, mid: edge.v + (edge.out * t) / 2 };
}

// The stretch of wall an opening could fill: where the edges of the rooms on its two sides run
// alongside each other, or the whole edge when there is a room on one side only.
function sharedStretch(o) {
  const c = o.along === 'x' ? 'y' : 'x';
  let lo = -Infinity;
  let hi = Infinity;
  for (const r of openingSides(o)) {
    const near = r && straightEdges(r)
      .filter((e) => e.k === c && Math.abs(e.v - o[c]) <= o.t / 2 + 0.1 && o[o.along] >= e.lo && o[o.along] <= e.hi)
      .sort((a, b) => Math.abs(a.v - o[c]) - Math.abs(b.v - o[c]))[0];
    if (!near) continue;
    lo = Math.max(lo, near.lo);
    hi = Math.min(hi, near.hi);
  }
  return hi > lo && Number.isFinite(hi - lo) ? { lo, hi } : null;
}

// Gives an opening the width its type starts at: the standard for a door or doorway, the whole
// shared wall for an open side or a half wall.
function fitOpening(o) {
  const kind = openingKind(o.kind);
  if (kind.window) return; // a window keeps the width its kind or the owner gave it
  const span = sharedStretch(o);
  if (kind.width) o.w = std(kind.width) * (kind.times || 1);
  // A door wider than the wall it is in, such as sliding doors on a small closet, is cut down to fit.
  if (!span || (kind.width && o.w <= span.hi - span.lo)) return;
  o.w = fine(span.hi - span.lo);
  o[o.along] = fine((span.lo + span.hi) / 2);
}

function placeOpening(p) {
  const wall = wallAt(p);
  if (!wall) return flash('Click on the edge of a room, where the door or opening is.');
  // A door starts out opening into the room whose wall was clicked.
  const o = { id: uid(), kind: 'door', along: wall.o, x: 0, y: 0, w: 0, t: fine(wall.t), hinge: 0, swing: wall.out < 0 ? 1 : 0 };
  o[wall.k] = fine(wall.mid);
  o[wall.o] = fine(wall.pos);
  // Its type is read from what is around it: rooms that meet with no wall between them are open
  // to each other, a wall with the outline behind it is an outside wall, and a closet gets a
  // bifold door that folds out into the room. The side panel changes it.
  const closets = openingSides(o).map(isCloset);
  if (wall.touching) o.kind = 'open';
  else if (wall.outside) o.kind = 'exterior';
  else if (closets[0] !== closets[1]) {
    o.kind = 'bifold';
    o.swing = closets[0] ? 1 : 0;
  }
  fitOpening(o);
  // Kept clear of the ends of the wall where it fits.
  if (wall.hi - wall.lo > o.w) o[wall.o] = fine(Math.max(wall.lo + o.w / 2, Math.min(wall.hi - o.w / 2, o[wall.o])));
  else o[wall.o] = fine((wall.lo + wall.hi) / 2);
  floor().openings.push(o);
  sel = { type: 'opening', id: o.id };
  setTool('select');
  save();
  renderAll();
}

// The rooms on either side of an opening: [the one above or to the left, the one below or to the right].
function openingSides(o, f = floor()) {
  const c = o.along === 'x' ? 'y' : 'x';
  return [-1, 1].map((g) => f.rooms.find((r) => shapeContains(r, { x: o.x, y: o.y, [c]: o[c] + g * (o.t / 2 + 0.1) })) || null);
}

// The locked room an opening is in a wall of, if there is one. Such an opening cannot be slid
// along its wall until the room is unlocked.
const lockedBy = (o) => openingSides(o).find((r) => r?.locked) || null;

// The height of the step through an opening, or 0 when both sides are level or one is outdoors.
// Nobody walks through a half wall, so it never counts as a step.
function stepAt(o) {
  if (o.kind === 'half' || o.kind === 'window') return 0;
  const [a, b] = openingSides(o);
  return a && b ? Math.abs((a.level || 0) - (b.level || 0)) : 0;
}

const levelText = (r) => (r.level ? `${fmtShort(r.level)} ${r.level < 0 ? 'down' : 'up'}` : '');

function openingSvg(o, u, on) {
  const A = o.along === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const at = (a, c) => ({ x: o.x + A.x * a + A.y * c, y: o.y + A.y * a + A.x * c }); // a along the wall, c across it
  const box = (half) => {
    const p = at(-o.w / 2, -half);
    const q = at(o.w / 2, half);
    return `x="${p.x}" y="${p.y}" width="${q.x - p.x}" height="${q.y - p.y}"`;
  };
  const line = (cls, p, q) => `<line class="${cls}" x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>`;
  const h = o.t / 2;
  const g = o.swing ? 1 : -1; // the side the door swings into
  let s = `<rect class="hit" ${box(Math.max(h, 7 * u))}/><rect class="gap" ${box(h + 2 * u)}/>`
    + line('jamb', at(-o.w / 2, -h), at(-o.w / 2, h)) + line('jamb', at(o.w / 2, -h), at(o.w / 2, h));
  if (o.kind === 'window') {
    // The usual plan symbol: the two faces of the wall carried across, and the glass between them.
    s += line('glass', at(-o.w / 2, -h), at(o.w / 2, -h)) + line('glass', at(-o.w / 2, h), at(o.w / 2, h)) + line('glass', at(-o.w / 2, 0), at(o.w / 2, 0));
    if (o.well) s += wellSvg(o, outsideOf(o), at, h);
    return `<g class="opening window${on ? ' sel' : ''}" data-kind="opening" data-id="${o.id}"><title>${esc(windowKind(o.style).label)}${o.well ? ', with a window well' : ''}</title>${s}</g>`;
  }
  // An open side keeps a faint line so the two rooms can still be told apart; a half wall is a
  // lighter band than a full one.
  if (o.kind === 'open') s += line('openEdge', at(-o.w / 2, 0), at(o.w / 2, 0));
  if (o.kind === 'half') s += `<rect class="halfWall" ${box(Math.max(h, 2.5 * u))}/>`;
  if (o.kind === 'sliding') {
    // Two panels on separate tracks, overlapping in the middle.
    const off = Math.max(h / 3, 1.5 * u);
    s += line('leaf', at(-o.w / 2, -off), at(o.w * 0.05, -off)) + line('leaf', at(-o.w * 0.05, off), at(o.w / 2, off));
  }
  if (openingKind(o.kind).fold) {
    // A pair of panels folding out from each jamb.
    for (const e of [-1, 1]) {
      const pts = [at((e * o.w) / 2, g * h), at(e * o.w * 0.375, g * (h + o.w * 0.2)), at(e * o.w * 0.25, g * h)];
      s += `<path class="hit" d="M${pointList(pts).replaceAll(' ', ' L')}"/><polyline class="leaf fold" points="${pointList(pts)}"/>`;
    }
  }
  if (openingKind(o.kind).leaf) {
    const e = o.hinge ? 1 : -1;
    const hinge = at((e * o.w) / 2, g * h);
    const tip = at((e * o.w) / 2, g * (h + o.w));
    const latch = at((-e * o.w) / 2, g * h);
    const sweep = (tip.x - hinge.x) * (latch.y - hinge.y) - (tip.y - hinge.y) * (latch.x - hinge.x) > 0 ? 1 : 0;
    const arc = `M${tip.x},${tip.y} A${o.w},${o.w} 0 0 ${sweep} ${latch.x},${latch.y}`;
    s += `<path class="hit" d="M${hinge.x},${hinge.y} L${tip.x},${tip.y} ${arc}"/><path class="swing" d="${arc}"/>` + line('leaf', hinge, tip);
  }
  const rise = stepAt(o);
  if (rise) {
    // The label goes on the side the door does not swing into.
    const c = at(0, -g * (h + (o.along === 'x' ? 12 : 30) * u));
    s += line('step', at(-o.w / 2, 0), at(o.w / 2, 0))
      + `<text class="stepLabel" x="${c.x}" y="${c.y + 4 * u}" font-size="${11 * u}" stroke-width="${4 * u}">Step ${fmtShort(rise)}</text>`;
  }
  return `<g class="opening ${o.kind}${on ? ' sel' : ''}" data-kind="opening" data-id="${o.id}">${s}</g>`;
}

function openingInspector(o) {
  if (o.kind === 'window') return windowInspector(o);
  const [a, b] = openingSides(o);
  const name = (r) => (r ? esc(roomTitle(r)) + (r.level ? ` (${levelText(r)})` : '') : 'outside, or a space not drawn yet');
  const rise = stepAt(o);
  return `<h2>Door or opening</h2>
    ${field('Type', 'opening', 'kind', o.kind, { options: OPENING_KINDS.filter((k) => !k.window).map((k) => [k.id, k.label]) })}
    ${o.kind === 'exterior' && floor().basement ? `${field('Opens onto', 'opening', 'onto', o.onto || '', { options: DOOR_ONTO })}<p class="muted small">A basement door to the outside is also shown on the exterior sheet, with the stairwell if it has one.</p>` : ''}
    ${lengthField('Width', 'opening', 'w', o.w)}
    ${lengthField('Wall thickness here', 'opening', 't', o.t)}
    <p class="muted small">Round to the nearest 1/4 inch. Fractions are fine: 5 3/4. Choosing a type sets its width: the standard for a door or doorway, or the whole wall the two rooms share for an open side or a half wall. Type a different width if only part of it applies.</p>
    <p class="muted">Between ${name(a)} and ${name(b)}. ${lockedBy(o) ? `It is held in place because ${esc(roomTitle(lockedBy(o)))} is locked; unlock that room to slide it.` : 'Drag it to slide it along the wall.'}</p>
    ${rise ? `<p class="note step"><b>Step of ${fmtShort(rise)} here.</b>${rise > MAX_RISER ? ` That is taller than the ${fmtShort(MAX_RISER)} the current residential code allows for one step. Older houses often differ, but it may be worth tagging as an issue.` : ''}</p>` : ''}
    <div class="actions">
      ${openingKind(o.kind).leaf ? '<button id="btnHinge" title="Moves the hinges to the other end of the opening">Flip hinge side</button>' : ''}
      ${openingKind(o.kind).leaf || openingKind(o.kind).fold ? '<button id="btnSwing" title="Makes the door open into the room on the other side of the wall">Swing the other way</button>' : ''}
      ${openingKind(o.kind).width ? '' : '<button id="btnSpan" title="Stretches this over the whole length of wall the two rooms share">Fit to the shared wall</button>'}
      <button class="danger" id="btnDelete">Delete</button>
    </div>`;
}

// ---------- windows ----------
// A window is an opening of its own kind, placed and slid along a wall as a door is. It keeps its
// kind of window in `style`, its sill height above the floor in `sill`, and `well` when a window
// well is dug outside it.

async function placeWindow(p) {
  const wall = wallAt(p);
  if (!wall) return flash('Click on the wall of a room, where the window is.');
  const basement = !!floor().basement;
  // On a basement sheet the basement kinds come first. Nothing is picked until the owner picks it.
  const kinds = basement ? [...WINDOW_KINDS.filter((k) => k.basement), ...WINDOW_KINDS.filter((k) => !k.basement)] : WINDOW_KINDS;
  const picked = await ask('What kind of window is it?', {
    ok: 'Place window',
    choices: kinds.map((k) => ({ value: k.id, label: k.label })),
    mustChoose: true,
    check: { label: 'It has a window well dug outside it', checked: false },
    detail: basement ? 'In a walk-out basement, a window on the side where the ground is level with the floor is a standard window.' : '',
  });
  const well = $('#askCheck').checked;
  setTool('select');
  if (!picked || picked === true) return renderCanvas();
  const k = windowKind(picked);
  const o = { id: uid(), kind: 'window', style: k.id, along: wall.o, x: 0, y: 0, w: fine(k.w), t: fine(wall.t), sill: fine(k.sill) };
  if (well) o.well = true;
  o[wall.k] = fine(wall.mid);
  o[wall.o] = wall.hi - wall.lo > o.w ? fine(Math.max(wall.lo + o.w / 2, Math.min(wall.hi - o.w / 2, wall.pos))) : fine((wall.lo + wall.hi) / 2);
  floor().openings.push(o);
  sel = { type: 'opening', id: o.id };
  save();
  renderAll();
}

function windowInspector(o) {
  const room = openingSides(o).find(Boolean);
  const k = windowKind(o.style);
  return `<h2>Window</h2>
    ${field('Kind', 'opening', 'style', o.style, { options: WINDOW_KINDS.map((x) => [x.id, x.label]) })}
    ${lengthField('Width', 'opening', 'w', o.w)}
    ${lengthField('Sill height above the floor', 'opening', 'sill', o.sill ?? k.sill)}
    <p class="muted small">Choosing a kind sets the usual width and sill height for it. Type your own where this one differs.</p>
    ${o.style === 'egress' && o.sill > EGRESS_SILL + 1 / 96 ? `<p class="note step">The sill is higher than the ${fmtShort(EGRESS_SILL)} building codes allow for an egress window. It may be worth tagging as an issue if this is a bedroom.</p>` : ''}
    <label class="check"><input type="checkbox" id="chkWell"${o.well ? ' checked' : ''}> It has a window well dug outside it</label>
    ${field('Note', 'opening', 'note', o.note || '')}
    <p class="muted">In the wall of ${room ? esc(roomTitle(room)) : 'a space not drawn yet'}. Drag it to slide it along the wall.${o.well && floor().basement ? ' Its well is also shown on the exterior sheet.' : ''}</p>
    <div class="actions"><button class="danger" id="btnDelete">Delete</button></div>`;
}

// Which side of its wall an opening has the outdoors on: -1 above or to the left, 1 below or to the
// right, or 0 where that cannot be told. A room on one side only means outdoors on the other; with
// no room on either side, the exterior outline says which side is inside the house.
function outsideOf(o, f = floor()) {
  const [a, b] = openingSides(o, f);
  if (!a !== !b) return a ? 1 : -1;
  if (a) return 0;
  const c = o.along === 'x' ? 'y' : 'x';
  const inHouse = (g) => (exteriorFloor()?.rooms || []).some((r) => shapeContains(r, { x: o.x, y: o.y, [c]: o[c] + g * (o.t / 2 + 0.5) }));
  return inHouse(-1) && !inHouse(1) ? 1 : inHouse(1) && !inHouse(-1) ? -1 : 0;
}

// A window well: a half circle dug outside the wall, a little wider than the window.
function wellSvg(o, g, at, h) {
  if (!g) return '';
  const r = o.w / 2 + 0.25;
  const pts = Array.from({ length: 13 }, (_, n) => at(-r * Math.cos((n * Math.PI) / 12), g * (h + r * Math.sin((n * Math.PI) / 12))));
  return `<polygon class="well" points="${pointList(pts)}"/>`;
}

// What the basement shows outside the house, drawn on the exterior sheet: window wells, doors to
// the outside, and the stairwell up to the yard that such a door may open onto. Every sheet uses
// the same measurements, so each is drawn where it is on the basement sheet.
function basementOutsideSvg(u) {
  let s = '';
  for (const f of plan.floors.filter((x) => x.basement)) {
    for (const o of f.openings) {
      const well = o.kind === 'window' && o.well;
      if (!well && o.kind !== 'exterior') continue;
      const g = outsideOf(o, f);
      if (!g) continue;
      const A = o.along === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 };
      const at = (a, c) => ({ x: o.x + A.x * a + A.y * c, y: o.y + A.y * a + A.x * c });
      const h = o.t / 2;
      let depth = 0;
      let label = '';
      if (well) {
        s += wellSvg(o, g, at, h);
        depth = o.w / 2 + 0.25;
        label = o.style === 'egress' ? 'Basement egress window' : 'Basement window well';
      } else {
        s += `<line class="bsmtDoor" x1="${at(-o.w / 2, g * h).x}" y1="${at(-o.w / 2, g * h).y}" x2="${at(o.w / 2, g * h).x}" y2="${at(o.w / 2, g * h).y}"/>`;
        label = 'Basement door';
        if (o.onto === 'stairwell') {
          // A stairwell about 5 ft out from the wall, with a line for each step.
          depth = 5;
          const p = at(-o.w / 2 - 0.5, g * h);
          const q = at(o.w / 2 + 0.5, g * (h + depth));
          s += `<rect class="stairwell" x="${Math.min(p.x, q.x)}" y="${Math.min(p.y, q.y)}" width="${Math.abs(q.x - p.x)}" height="${Math.abs(q.y - p.y)}"/>`;
          for (let d = 0.9; d < depth; d += 0.9) s += `<line class="stairwell tread" x1="${at(-o.w / 2 - 0.5, g * (h + d)).x}" y1="${at(-o.w / 2 - 0.5, g * (h + d)).y}" x2="${at(o.w / 2 + 0.5, g * (h + d)).x}" y2="${at(o.w / 2 + 0.5, g * (h + d)).y}"/>`;
          label = 'Basement door and stairwell';
        } else if (o.onto === 'grade') {
          label = 'Basement walk-out door';
        }
      }
      // Beyond it, away from the house: centred off a top or bottom wall, and reading outward off a side one.
      const t = at(0, g * (h + depth + (o.along === 'x' ? 9 : 4) * u));
      const anchor = o.along === 'x' ? 'middle' : g < 0 ? 'end' : 'start';
      s += `<text class="bsmtLabel" x="${t.x}" y="${t.y + 3 * u}" font-size="${10 * u}" stroke-width="${3 * u}" style="text-anchor:${anchor}">${label}</text>`;
    }
  }
  return s;
}

// ---------- floor levels ----------
// A room's `level` is how far its floor sits above (positive) or below (negative) the rest of
// the sheet, in feet. A sunken family room 8" down has level -8/12.

function levelHtml(r) {
  const dir = r.level < 0 ? 'down' : r.level > 0 ? 'up' : '';
  const options = [['', 'Level with the rest of this floor'], ['down', 'Lower: you step down into it'], ['up', 'Higher: you step up into it']]
    .map(([v, l]) => `<option value="${v}"${v === dir ? ' selected' : ''}>${l}</option>`).join('');
  return `<label>Floor level<select id="selLevel">${options}</select></label>
    ${r.level ? lengthField('Height of the step', 'room', 'step', Math.abs(r.level)) : ''}`;
}

async function setLevelDir(r, dir) {
  if (!dir) {
    delete r.level;
  } else if (r.level) {
    r.level = Math.abs(r.level) * (dir === 'down' ? -1 : 1);
  } else {
    const feet = await ask(`How high is the step ${dir} into “${r.name}”?`, { length: true, ok: 'Set step', detail: 'Measure from one floor surface to the other. A single step is usually 7 to 8 inches.' });
    if (feet > 0) r.level = fine(feet) * (dir === 'down' ? -1 : 1);
  }
  save();
  renderAll();
}

// ---------- closets and other spaces that belong to a room ----------
// A room's `partOf` is the id of the room it belongs to, such as a bedroom for its closet.

const parentRoom = (r) => (r.partOf && floor().rooms.find((x) => x.id === r.partOf)) || null;
const isCloset = (r) => !!r && (/closet/i.test(r.name) || !!parentRoom(r));
// "Bedroom 2 · Closet" where a list of rooms has to tell several closets apart.
const roomTitle = (r) => (parentRoom(r) ? `${parentRoom(r).name} · ${r.name}` : r.name);

function partOfHtml(r) {
  const rooms = floor().rooms;
  const parts = rooms.filter((x) => x.partOf === r.id);
  if (parts.length) {
    const total = parts.reduce((a, x) => a + shapeArea(x), shapeArea(r));
    return `<p class="muted">With ${esc(parts.map((x) => x.name).join(', '))}: ${Math.round(total)} sq ft</p>`;
  }
  const others = rooms.filter((x) => x !== r && !x.partOf);
  if (!others.length) return '';
  return field('Belongs to', 'room', 'partOf', r.partOf || '', { options: [['', 'No other room'], ...others.map((x) => [x.id, x.name])] });
}

// ---------- splitting a closet off a room ----------
// A closet drawn as a bump on its room has no wall across its mouth to put a door in. Two clicks
// cut the room along a level or upright line: the smaller piece becomes a closet belonging to the
// room, set back from the cut by an interior wall.

// The spot on the outline of a shape nearest to p: a corner if one is close, otherwise a point
// on a wall. Null when p is not near the outline.
function boundaryPoint(r, p) {
  const pts = shapePoints(r);
  const reach = 12 * feetPerPx();
  const far = (c) => Math.hypot(c.x - p.x, c.y - p.y);
  const corner = pts.filter((c) => far(c) < reach).sort((a, b) => far(a) - far(b))[0];
  if (corner) return { ...corner };
  let best = null;
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2)) : 0;
    const q = { x: fine(a.x + (b.x - a.x) * t), y: fine(a.y + (b.y - a.y) * t) };
    if (far(q) < reach && (!best || far(q) < far(best))) best = q;
  });
  return best;
}

// Where a cut that starts at `a` on the outline, and heads level or upright toward `toward`,
// comes out of the shape again. Null if it would not pass through the inside of the shape.
function splitEnd(r, a, toward) {
  const ax = Math.abs(toward.x - a.x) > Math.abs(toward.y - a.y) ? 'x' : 'y';
  const o = ax === 'x' ? 'y' : 'x';
  const s = Math.sign(toward[ax] - a[ax]) || 1;
  const pts = shapePoints(r);
  let far = Infinity;
  pts.forEach((u, i) => {
    const v = pts[(i + 1) % pts.length];
    if (u[o] === v[o] || a[o] < Math.min(u[o], v[o]) || a[o] > Math.max(u[o], v[o])) return;
    const d = (u[ax] + ((v[ax] - u[ax]) * (a[o] - u[o])) / (v[o] - u[o]) - a[ax]) * s;
    if (d > 1 / 96 && d < far) far = d;
  });
  if (!Number.isFinite(far)) return null;
  const end = { [ax]: fine(a[ax] + s * far), [o]: a[o] };
  return shapeContains(r, midpoint([a, end])) ? end : null;
}

// Corners in a row along one wall add nothing; a four-cornered square shape is a plain rectangle.
function tidyShape(points) {
  const pts = points.filter((p, i) => {
    const a = points[(i + points.length - 1) % points.length];
    const b = points[(i + 1) % points.length];
    return Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > 1e-7;
  });
  if (pts.length !== 4 || !isSquareCornered({ points: pts })) return { points: pts };
  const b = shapeBounds({ points: pts });
  return { x: b.x0, y: b.y0, w: fine(b.x1 - b.x0), h: fine(b.y1 - b.y0) };
}

// Cuts room r from a to b, both on its outline. Returns the new closet, or a message saying why not.
function splitRoom(r, a, b) {
  const pts = shapePoints(r).map((p) => ({ ...p }));
  const same = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6;
  const put = (p) => {
    if (pts.some((q) => same(p, q))) return;
    const i = pts.findIndex((u, n) => distToSegment(p, u, pts[(n + 1) % pts.length]) < 1e-6);
    pts.splice(i + 1, 0, p);
  };
  put(a);
  put(b);
  const [i, j] = [pts.findIndex((q) => same(a, q)), pts.findIndex((q) => same(b, q))].sort((m, n) => m - n);
  // Each piece runs from one end of the cut round to the other, so the cut joins its last corner to its first.
  const pieces = [pts.slice(i, j + 1), [...pts.slice(j), ...pts.slice(0, i + 1)]].sort((m, n) => shapeArea({ points: n }) - shapeArea({ points: m }));
  if (pieces.some((piece) => piece.length < 3 || shapeArea({ points: piece }) < 0.01)) return 'That line runs along the edge of the room. Click across the opening of the closet.';
  const [main, closet] = pieces.map((piece) => piece.map((p) => ({ ...p })));
  // The wall is taken out of the closet: its side of the cut moves back by one interior wall.
  const k = a.x === b.x ? 'x' : 'y';
  const t = std('interiorWall');
  const depths = closet.map((p) => p[k] - a[k]);
  const side = Math.max(...depths) > -Math.min(...depths) ? 1 : -1;
  if (Math.max(...depths.map(Math.abs)) < t + 0.25) return `That piece is too shallow to hold a ${fmtShort(t)} wall and a closet.`;
  for (const n of [0, closet.length - 1]) closet[n][k] = fine(closet[n][k] + side * t);
  for (const key of ['x', 'y', 'w', 'h', 'points']) delete r[key];
  Object.assign(r, tidyShape(main));
  const made = { id: uid(), name: 'Closet', ...tidyShape(closet), partOf: r.id };
  if (r.level) made.level = r.level;
  floor().rooms.push(made);
  return made;
}

function splitClick(p) {
  const r = selRoom();
  if (!measure.length) {
    const start = boundaryPoint(r, p);
    if (!start) return flash('Click on the edge of the selected room, at one end of the closet’s opening.');
    measure = [start];
    return renderCanvas();
  }
  const end = splitEnd(r, measure[0], p);
  const made = end ? splitRoom(r, measure[0], end) : 'A cut has to run level or upright through the inside of the room. Click one end of the closet’s opening again.';
  if (typeof made === 'string') {
    measure = [];
    renderCanvas();
    return flash(made);
  }
  sel = { type: 'room', id: made.id };
  setTool('select');
  save();
  renderAll();
}

// ---------- walls between rooms drawn edge to edge ----------

// Finds every place where two rooms on this floor meet edge to edge, or a room sits on the
// exterior outline, and works out how far each wall has to move back to leave a standard wall
// there. Rooms marked as open to each other, or divided by a half wall, are left touching.
function missingWalls() {
  const f = floor();
  const tiny = 1 / 96;
  const overlap = (a, b) => [Math.max(a.lo, b.lo), Math.min(a.hi, b.hi)];
  const held = (e) => f.openings.some((o) => (o.kind === 'open' || o.kind === 'half') && o.along === e.o
    && Math.abs(o[e.k] - e.v) < tiny + o.t / 2 && o[e.o] + o.w / 2 > e.lo + tiny && o[e.o] - o.w / 2 < e.hi - tiny);
  const rooms = f.rooms.map((r) => ({ r, edges: straightEdges(r) }));
  const seams = []; // { k, c, lo, hi, t, shift }: a wall of thickness t whose middle ends up at c + shift
  const want = (e, d) => {
    e.back = Math.max(e.back || 0, d);
  };
  const ext = std('exteriorWall');
  const int = std('interiorWall');
  rooms.forEach((A, n) => {
    for (const a of A.edges) {
      for (const s of exteriorFloor()?.rooms || []) {
        for (const b of straightEdges(s)) {
          const [lo, hi] = overlap(a, b);
          if (b.k !== a.k || b.out !== a.out || Math.abs(b.v - a.v) >= tiny || hi - lo <= tiny) continue;
          want(a, ext);
          seams.push({ k: a.k, c: a.v, lo, hi, t: ext, shift: (-a.out * ext) / 2 });
        }
      }
      for (const B of rooms.slice(n + 1)) {
        for (const b of B.edges) {
          const [lo, hi] = overlap(a, b);
          if (b.k !== a.k || b.out === a.out || Math.abs(b.v - a.v) >= tiny || hi - lo <= tiny) continue;
          const [ha, hb] = [held(a), held(b)];
          if (ha && hb) continue;
          // Each side gives up half the wall, unless one of them has to stay where it is.
          const [da, db] = ha ? [0, int] : hb ? [int, 0] : [int / 2, int / 2];
          want(a, da);
          want(b, db);
          seams.push({ k: a.k, c: a.v, lo, hi, t: int, shift: (a.out * (db - da)) / 2 });
        }
      }
    }
  });
  return { rooms, seams };
}

async function addWalls() {
  const { rooms, seams } = missingWalls();
  if (!seams.length) return tell('No rooms on this floor meet edge to edge without a wall. Rooms marked as open to each other are left as they are.');
  const sure = await ask(`Put walls in the ${seams.length} place${seams.length === 1 ? '' : 's'} where rooms on this floor meet edge to edge?`, {
    ok: 'Put walls in',
    detail: `The line where two rooms meet becomes the middle of a ${fmtShort(std('interiorWall'))} wall, so each room gets smaller by half of that on that side. A room drawn on the exterior outline moves in by ${fmtShort(std('exteriorWall'))}. Rooms marked as open to each other, or divided by a half wall, stay as they are, so mark those first. Check a few room sizes against your tape afterwards.`,
  });
  if (!sure) return;
  for (const { r, edges } of rooms) {
    const moved = edges.filter((e) => e.back);
    if (!moved.length) continue;
    const pts = shapePoints(r).map((p) => ({ ...p }));
    for (const e of moved) for (const n of [e.i, (e.i + 1) % pts.length]) pts[n][e.k] = fine(pts[n][e.k] - e.out * e.back);
    if (isPoly(r)) {
      r.points = pts;
    } else {
      const b = shapeBounds({ points: pts });
      Object.assign(r, { x: b.x0, y: b.y0, w: fine(b.x1 - b.x0), h: fine(b.y1 - b.y0) });
    }
  }
  // A door that was placed on one of those lines now has a wall to sit in.
  for (const o of floor().openings) {
    const k = o.along === 'x' ? 'y' : 'x';
    // An open side or half wall is trimmed to what its two rooms still share.
    const span = openingKind(o.kind).width ? null : sharedStretch(o);
    if (span) {
      const lo = Math.max(span.lo, o[o.along] - o.w / 2);
      const hi = Math.min(span.hi, o[o.along] + o.w / 2);
      if (hi > lo) Object.assign(o, { w: fine(hi - lo), [o.along]: fine((lo + hi) / 2) });
    }
    const seam = o.t < 1 / 96 && seams.find((s) => s.k === k && Math.abs(o[k] - s.c) < 1 / 96 && o[o.along] >= s.lo && o[o.along] <= s.hi);
    if (!seam) continue;
    o.t = fine(seam.t);
    o[k] = fine(o[k] + seam.shift);
  }
  sel = null;
  save();
  renderAll();
}
