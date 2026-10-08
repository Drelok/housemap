'use strict';

// Things that stand in the rooms of a floor: plumbing fixtures, appliances, counters and stairs.
//
// A fixture is a box { x, y, w, h }: `w` across it and `h` from its back, the side that goes
// against a wall, to its front. The box is then turned `rot` degrees clockwise about its middle;
// at 0 its back is at the top of the sheet. `kind` is '' until one has been chosen.
//
// Stairs are a path instead: `points` runs down the middle of the stairs from the end you step on
// to the far end, with a corner at each change of direction, and `w` is how wide they are. `dir`
// is 'up' or 'down' from this floor and `to` is the id of the floor they lead to.

// Usual sizes in inches: `w` across the item, `d` from its back to its front. `group` sorts them in
// the lists they are chosen from. `record` marks an appliance or a system, whose make, model and
// age are worth keeping: what a repair needs first, and how an assistant judges what is wearing out.
// Only what is built in belongs here; furniture and anything else that moves out with the owner do not.
const ITEM_KINDS = [
  { id: 'toilet', label: 'Toilet', w: 20, d: 28, group: 'Plumbing' },
  { id: 'sink', label: 'Bathroom sink', w: 24, d: 21, group: 'Plumbing' },
  { id: 'tub', label: 'Bathtub', w: 60, d: 30, group: 'Plumbing' },
  { id: 'shower', label: 'Shower', w: 36, d: 36, group: 'Plumbing' },
  { id: 'usink', label: 'Laundry or utility sink', w: 24, d: 22, group: 'Plumbing' },
  { id: 'drain', label: 'Floor drain', w: 6, d: 6, group: 'Plumbing' },
  { id: 'shutoff', label: 'Main water shutoff', w: 6, d: 6, text: 'WATER', group: 'Plumbing' },
  { id: 'ksink', label: 'Kitchen sink', w: 33, d: 22, group: 'Kitchen' },
  { id: 'counter', label: 'Counter or island', w: 48, d: 25, group: 'Kitchen' },
  { id: 'upper', label: 'Upper (wall) cabinets', w: 36, d: 12, text: 'UPPER', group: 'Kitchen' },
  { id: 'tall', label: 'Tall cabinet or pantry', w: 24, d: 24, text: 'PANTRY', group: 'Kitchen' },
  { id: 'stove', label: 'Stove or range', w: 30, d: 26, group: 'Kitchen', record: true },
  { id: 'oven', label: 'Wall oven', w: 30, d: 24, text: 'OVEN', group: 'Kitchen', record: true },
  { id: 'fridge', label: 'Refrigerator', w: 36, d: 30, text: 'REF', group: 'Kitchen', record: true },
  { id: 'dishwasher', label: 'Dishwasher', w: 24, d: 24, text: 'DW', group: 'Kitchen', record: true },
  { id: 'washer', label: 'Washer', w: 27, d: 30, text: 'W', group: 'Laundry', record: true },
  { id: 'dryer', label: 'Dryer', w: 27, d: 30, text: 'D', group: 'Laundry', record: true },
  { id: 'wh', label: 'Water heater', w: 22, d: 22, text: 'WH', group: 'Heating and utilities', record: true },
  { id: 'furnace', label: 'Furnace or air handler', w: 22, d: 30, text: 'FURN', group: 'Heating and utilities', record: true },
  { id: 'boiler', label: 'Boiler', w: 24, d: 30, text: 'BOILER', group: 'Heating and utilities', record: true },
  { id: 'radiator', label: 'Radiator', w: 36, d: 9, group: 'Heating and utilities' },
  { id: 'baseboard', label: 'Baseboard heater', w: 48, d: 4, group: 'Heating and utilities' },
  { id: 'panel', label: 'Electrical panel', w: 15, d: 4, text: 'PANEL', group: 'Heating and utilities', record: true },
  { id: 'sump', label: 'Sump pump and pit', w: 20, d: 20, text: 'SUMP', group: 'Heating and utilities', record: true },
  { id: 'softener', label: 'Water softener or filter', w: 14, d: 14, text: 'SOFT', group: 'Heating and utilities', record: true },
  { id: 'fireplace', label: 'Fireplace', w: 60, d: 24, text: 'FIREPLACE', group: 'Fireplaces and built-ins', record: true },
  { id: 'woodstove', label: 'Wood or pellet stove', w: 30, d: 30, text: 'STOVE', group: 'Fireplaces and built-ins', record: true },
  { id: 'shelves', label: 'Built-in shelves', w: 48, d: 12, group: 'Fireplaces and built-ins' },
  { id: 'bench', label: 'Built-in bench or window seat', w: 48, d: 18, text: 'SEAT', group: 'Fireplaces and built-ins' },
  { id: 'desk', label: 'Built-in desk', w: 48, d: 24, text: 'DESK', group: 'Fireplaces and built-ins' },
  { id: 'hatch', label: 'Attic hatch', w: 30, d: 22, text: 'ATTIC', group: 'Safety and access' },
  { id: 'alarm', label: 'Smoke or CO alarm', w: 6, d: 6, text: 'ALARM', group: 'Safety and access', record: true },
];
// The lists of kinds, grouped as above: [[group, [kind, ...]], ...].
const ITEM_GROUPS = [...new Set(ITEM_KINDS.map((k) => k.group))].map((g) => [g, ITEM_KINDS.filter((k) => k.group === g)]);
const TREAD = 10 / 12; // how deep a stair tread is drawn
const CATCH = 4; // degrees within which a turned item or a flight of stairs squares itself up

const itemKind = (id) => ITEM_KINDS.find((k) => k.id === id) || null;
const isStairs = (it) => it.kind === 'stairs';
const turnDeg = (deg) => ((deg % 360) + 360) % 360;
const stepTo = (p, d, t) => ({ x: p.x + d.x * t, y: p.y + d.y * t });
const between = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// A point given across (lx) and back-to-front (ly) from the middle of a fixture, on the sheet.
function itemAt(it, lx, ly) {
  const c = shapeCenter(it);
  const a = ((it.rot || 0) * Math.PI) / 180;
  return { x: c.x + lx * Math.cos(a) - ly * Math.sin(a), y: c.y + lx * Math.sin(a) + ly * Math.cos(a) };
}

// The corners of an item as it sits on the sheet.
function itemCorners(it) {
  if (isStairs(it)) return stairParts(it).flatMap((p) => p.quad);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => itemAt(it, (sx * it.w) / 2, (sy * it.h) / 2));
}

// Corners a moved or resized item lines up with: those of the rooms, which puts it against their
// walls, and those of the other items, which sets a stove beside a counter.
function itemTargets(skip) {
  const pts = [];
  for (const r of floor().rooms) pts.push(...shapePoints(r));
  for (const it of floor().items) if (it !== skip) pts.push(...itemCorners(it));
  return pts;
}

// The locked room an item stands in, if there is one: the room its middle is in, which for stairs
// is the point halfway along them, where their button sits. Such an item is held in place along
// with the room. Stairs that only reach into a locked room at one end are left free.
function itemLockedBy(it) {
  const mid = isStairs(it) ? stairMiddle(it) : shapeCenter(it);
  return floor().rooms.find((r) => r.locked && shapeContains(r, mid)) || null;
}

function placeItem(p, kind) {
  const k = itemKind(kind);
  const it = kind === 'stairs'
    ? { id: uid(), kind, points: [{ x: fine(p.x), y: fine(p.y + 5) }, { x: fine(p.x), y: fine(p.y - 5) }], w: 3, dir: 'up', to: '', note: '' }
    : { id: uid(), kind, x: 0, y: 0, w: 2, h: 2, rot: 0, note: '' };
  if (!isStairs(it)) Object.assign(it, { x: fine(p.x - 1), y: fine(p.y - 1) });
  if (k) setItemKind(it, kind);
  floor().items.push(it);
  sel = { type: 'item', id: it.id };
  setTool('select');
  save();
  renderAll();
}

// A new type starts at its usual size, about the middle of the box it had.
function setItemKind(it, id) {
  const k = itemKind(id);
  const c = shapeCenter(it);
  Object.assign(it, { kind: id, w: fine(k.w / 12), h: fine(k.d / 12) });
  Object.assign(it, { x: fine(c.x - it.w / 2), y: fine(c.y - it.h / 2) });
}

// A quarter turn clockwise. Stairs turn about the middle of the space they take up.
function turnItem(it) {
  if (!isStairs(it)) return void (it.rot = turnDeg((it.rot || 0) + 90));
  const c = shapeCenter({ points: it.points });
  it.points = it.points.map((p) => ({ x: fine(c.x - (p.y - c.y)), y: fine(c.y + (p.x - c.x)) }));
}

// The directions the walls of the rooms run in, in degrees.
const wallAngles = () => floor().rooms.flatMap((r) => shapePoints(r).map((a, i, pts) => {
  const b = pts[(i + 1) % pts.length];
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}));

// The nearest of `angles`, or of those a quarter turn or more round from them, if `deg` is
// within reach of one.
function catchAngle(deg, angles, reach = CATCH) {
  let best = null;
  for (const a of angles) {
    for (let q = 0; q < 4; q++) {
      const off = ((deg - a - q * 90 + 540) % 360) - 180;
      if (Math.abs(off) <= reach && (!best || Math.abs(off) < Math.abs(best.off))) best = { off };
    }
  }
  return best ? turnDeg(deg - best.off) : null;
}

// Turns a fixture to back onto the wall nearest its middle, and pushes it up against that wall.
function backToWall(it) {
  const c = shapeCenter(it);
  let best = null;
  for (const r of floor().rooms) {
    shapePoints(r).forEach((a, i, pts) => {
      const b = pts[(i + 1) % pts.length];
      const d = distToSegment(c, a, b);
      if (!best || d < best.d) best = { d, a, b };
    });
  }
  if (!best) return 'Draw the room first; there is no wall on this floor to set it against.';
  const { a, b } = best;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const off = (c.x - a.x) * n.x + (c.y - a.y) * n.y; // how far the middle is from the line of the wall
  if (off < 0) n = { x: -n.x, y: -n.y };
  const foot = stepTo(c, n, -Math.abs(off));
  const mid = stepTo(foot, n, it.h / 2);
  it.rot = turnDeg(Math.round((Math.atan2(-n.x, n.y) * 1800) / Math.PI) / 10);
  Object.assign(it, { x: fine(mid.x - it.w / 2), y: fine(mid.y - it.h / 2) });
  return null;
}

// ---------- stairs ----------

// The stretches of a staircase, in order: each straight flight, and a square landing wherever
// the path turns. Each has the four corners of its `quad` and how many `treads` to draw across
// it, none for a landing. Two turns close together, as at the top of a U-shaped stair, leave
// one wide landing between them rather than a flight a step or two long.
function stairParts(it) {
  const hw = it.w / 2;
  const legs = stairLegs(it);
  const quad = (a, b, d) => {
    const n = { x: -d.y * hw, y: d.x * hw };
    return [{ x: a.x + n.x, y: a.y + n.y }, { x: b.x + n.x, y: b.y + n.y }, { x: b.x - n.x, y: b.y - n.y }, { x: a.x - n.x, y: a.y - n.y }];
  };
  const parts = [];
  legs.forEach((l, i) => {
    const inner = i > 0 && i < legs.length - 1;
    const t0 = i > 0 ? hw : 0;
    const t1 = l.len - (i < legs.length - 1 ? hw : 0);
    if (i > 0) parts.push({ quad: quad(stepTo(l.a, legs[i - 1].d, -hw), stepTo(l.a, legs[i - 1].d, hw), legs[i - 1].d), treads: 0 });
    if (t1 - t0 < 0.02) return;
    parts.push({ quad: quad(stepTo(l.a, l.d, t0), stepTo(l.a, l.d, t1), l.d), treads: inner && t1 - t0 < 2 * TREAD ? 0 : Math.max(1, Math.round((t1 - t0) / TREAD)) });
  });
  return parts;
}

// Each straight stretch of the path: from `a` to `b`, `len` long, heading in direction `d`.
function stairLegs(it) {
  return it.points.slice(1).map((b, i) => {
    const a = it.points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
    return { a, b, len, d: { x: (b.x - a.x) / len, y: (b.y - a.y) / len } };
  });
}

// The point halfway along the path, where the button to the other floor sits.
function stairMiddle(it) {
  const legs = stairLegs(it);
  let left = legs.reduce((a, l) => a + l.len, 0) / 2;
  for (const l of legs) {
    if (left <= l.len) return stepTo(l.a, l.d, left);
    left -= l.len;
  }
  return it.points.at(-1);
}

// Sets how long one stretch of the path is; everything after it moves along with its end.
function setLegLength(it, i, feet) {
  const l = stairLegs(it)[i];
  const by = Math.max(0.5, fine(feet)) - l.len;
  it.points = it.points.map((p, n) => (n > i ? { x: fine(p.x + l.d.x * by), y: fine(p.y + l.d.y * by) } : p));
}

// Adds a square turn at the far end, to the right (1) or left (-1) of the way you are walking,
// with a short flight after it to be dragged or typed to length.
function addStairTurn(it, side) {
  const { b, d } = stairLegs(it).at(-1);
  const end = stepTo(b, { x: -d.y * side, y: d.x * side }, it.w / 2 + 4);
  it.points.push({ x: fine(end.x), y: fine(end.y) });
}

const stairsDest = (it) => (it.to && plan.floors.find((f) => f.id === it.to && f !== floor())) || null;

// The other end of a staircase: stairs on the floor it leads to that lead back here and sit over it.
function matchingStairs(it) {
  const here = floor().id;
  const a = shapeBounds({ points: it.points });
  return stairsDest(it)?.items.find((o) => {
    if (!isStairs(o) || o.to !== here) return false;
    const b = shapeBounds({ points: o.points });
    return b.x0 <= a.x1 && a.x0 <= b.x1 && b.y0 <= a.y1 && a.y0 <= b.y1;
  }) || null;
}

// Choosing where stairs lead also says which way they go, from the order of the floors.
function setStairsDest(it, id) {
  it.to = id;
  const dest = stairsDest(it);
  const height = (f) => (f.basement ? -1 : plan.floors.indexOf(f)); // a basement is below everything
  if (dest) it.dir = height(dest) > height(floor()) ? 'up' : 'down';
}

// Every sheet uses the same measurements, so the view stays where it is: you arrive looking at
// the same stairs from the other floor.
function goStairs(it) {
  const dest = stairsDest(it);
  if (!dest) return;
  const back = matchingStairs(it);
  floorId = dest.id;
  sel = back ? { type: 'item', id: back.id } : null;
  draft = null;
  setTool('select');
  renderAll();
  showTips(floor().kind);
}

// Asked when stairs are first linked to a floor that has no stairs leading back: whether to draw
// them there as well, in the same place and at the same size.
async function offerMatchingStairs(it) {
  const dest = stairsDest(it);
  if (!dest || matchingStairs(it)) return;
  const yes = await ask(`Also draw these stairs on ${dest.name}?`, {
    ok: 'Draw them there',
    cancel: 'Not now',
    detail: `They are drawn in the same place and at the same size, leading back to ${floor().name}. You can move or reshape them there afterwards; later changes to one are not copied to the other.`,
  });
  if (yes) addMatchingStairs(it);
}

// The same staircase seen from the floor it leads to: the same path, walked the other way.
function addMatchingStairs(it) {
  const dest = stairsDest(it);
  if (!dest || matchingStairs(it)) return;
  dest.items.push({ ...it, id: uid(), points: it.points.map((p) => ({ ...p })).reverse(), dir: it.dir === 'up' ? 'down' : 'up', to: floor().id });
  save();
  renderAll();
}

// ---------- drawing ----------

// A fixture's symbol, drawn about its own middle with its back at the top, and the lettering on it.
function fixtureSym(it) {
  const W = it.w;
  const D = it.h;
  const m = Math.min(W, D);
  const rect = (x, y, w, h, r = 0, cls = '') => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
  const oval = (x, y, rx, ry, cls = '') => `<ellipse class="${cls}" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`;
  const line = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  const body = (cls = '') => rect(-W / 2, -D / 2, W, D, 0, cls);
  const kind = itemKind(it.kind);
  let s = body();
  if (it.kind === 'toilet') {
    s = rect(-W * 0.45, -D / 2, W * 0.9, D * 0.27, m * 0.05) + oval(0, D * 0.13, W * 0.4, D * 0.37);
  } else if (it.kind === 'sink') {
    s += oval(0, D * 0.06, W * 0.3, D * 0.3) + oval(0, -D * 0.36, m * 0.05, m * 0.05, 'ink');
  } else if (it.kind === 'tub') {
    const i = m * 0.1;
    s += rect(-W / 2 + i, -D / 2 + i, W - 2 * i, D - 2 * i, (m - 2 * i) * 0.45) + oval(-W / 2 + i + m * 0.25, 0, m * 0.04, m * 0.04, 'ink');
  } else if (it.kind === 'shower') {
    s += line(-W / 2, -D / 2, W / 2, D / 2) + line(-W / 2, D / 2, W / 2, -D / 2) + oval(0, 0, m * 0.06, m * 0.06);
  } else if (it.kind === 'ksink') {
    const g = W * 0.06;
    const bowl = (x) => rect(x, -D * 0.26, (W - 3 * g) / 2, D * 0.64, m * 0.1);
    s += bowl(-W / 2 + g) + bowl(g / 2) + oval(0, -D * 0.38, m * 0.05, m * 0.05, 'ink');
  } else if (it.kind === 'counter') {
    s = body('counter');
  } else if (it.kind === 'stove') {
    s += line(-W / 2, -D * 0.38, W / 2, -D * 0.38);
    for (const x of [-1, 1]) for (const y of [-1, 1]) s += oval(x * W * 0.24, D * 0.06 + y * D * 0.2, m * 0.13, m * 0.13);
  } else if (it.kind === 'washer' || it.kind === 'dryer') {
    s += oval(0, 0, m * 0.36, m * 0.36);
  } else if (it.kind === 'wh' || it.kind === 'softener') {
    s = oval(0, 0, W / 2, D / 2);
  } else if (it.kind === 'usink') {
    s += rect(-W * 0.38, -D * 0.3, W * 0.76, D * 0.66, m * 0.08) + oval(0, -D * 0.38, m * 0.05, m * 0.05, 'ink');
  } else if (it.kind === 'drain' || it.kind === 'shutoff') {
    s = oval(0, 0, W / 2, D / 2) + line(-W * 0.35, 0, W * 0.35, 0) + (it.kind === 'drain' ? line(0, -D * 0.35, 0, D * 0.35) : '');
  } else if (it.kind === 'upper') {
    s = body('dashed') + line(-W / 2, -D / 2, W / 2, D / 2);
  } else if (it.kind === 'tall') {
    s += line(-W / 2, -D / 2, W / 2, D / 2) + line(-W / 2, D / 2, W / 2, -D / 2);
  } else if (it.kind === 'oven' || it.kind === 'fridge' || it.kind === 'dishwasher') {
    s += line(-W / 2, D * 0.4, W / 2, D * 0.4);
  } else if (it.kind === 'radiator') {
    for (let k = 1; k < 8; k++) s += line(-W / 2 + (W * k) / 8, -D / 2, -W / 2 + (W * k) / 8, D / 2);
  } else if (it.kind === 'baseboard') {
    s += line(-W / 2, 0, W / 2, 0);
  } else if (it.kind === 'sump') {
    s = oval(0, 0, W / 2, D / 2) + oval(0, 0, W * 0.2, D * 0.2, 'ink');
  } else if (it.kind === 'fireplace') {
    // The firebox opens to the front, with the hearth before it.
    s += `<polygon class="ink" points="${-W * 0.28},${D / 2} ${W * 0.28},${D / 2} ${W * 0.18},${-D * 0.1} ${-W * 0.18},${-D * 0.1}"/>`;
  } else if (it.kind === 'woodstove') {
    s += oval(0, -D * 0.28, m * 0.12, m * 0.12, 'ink');
  } else if (it.kind === 'shelves') {
    const n = Math.max(2, Math.round(W / 2.5));
    for (let k = 1; k < n; k++) s += line(-W / 2 + (W * k) / n, -D / 2, -W / 2 + (W * k) / n, D / 2);
  } else if (it.kind === 'bench' || it.kind === 'desk') {
    s += rect(-W / 2 + m * 0.12, -D / 2 + m * 0.12, W - m * 0.24, D - m * 0.24);
  } else if (it.kind === 'hatch') {
    s = body('dashed') + line(-W / 2, -D / 2, W / 2, D / 2) + line(-W / 2, D / 2, W / 2, -D / 2);
  } else if (it.kind === 'alarm') {
    s = oval(0, 0, W / 2, D / 2) + oval(0, 0, W * 0.18, D * 0.18, 'ink');
  } else if (!kind) {
    s = body('unset');
  }
  const c = shapeCenter(it);
  const label = kind ? kind.text || '' : '?';
  return {
    sym: `<g class="sym" transform="translate(${c.x} ${c.y}) rotate(${it.rot || 0})">${body('hit')}${s}</g>`,
    label, at: c, size: Math.min(m * 0.3, (W * 1.4) / (label.length || 1)),
  };
}

// Stairs: treads across each flight, plain landings at the turns, and an arrow down the middle
// from the end you step on to the far end.
function stairsSym(it) {
  const legs = stairLegs(it);
  let s = '';
  for (const p of stairParts(it)) {
    const [a, b, c, d] = p.quad;
    s += `<polygon points="${pointList(p.quad)}"/>`;
    for (let k = 1; k < p.treads; k++) {
      const [m, n] = [between(a, b, k / p.treads), between(d, c, k / p.treads)];
      s += `<line x1="${m.x}" y1="${m.y}" x2="${n.x}" y2="${n.y}"/>`;
    }
  }
  const first = legs[0];
  const last = legs.at(-1);
  const a = Math.min(it.w * 0.14, 0.4);
  const tip = stepTo(last.b, last.d, -Math.min(last.len * 0.1, 0.5));
  const base = stepTo(tip, last.d, -1.7 * a);
  const side = { x: -last.d.y * a, y: last.d.x * a };
  const path = [stepTo(first.a, first.d, Math.min(first.len * 0.1, 0.5)), ...it.points.slice(1, -1), base];
  s += `<polyline class="nofill" points="${pointList(path)}"/>
    <polygon class="ink" points="${pointList([tip, { x: base.x + side.x, y: base.y + side.y }, { x: base.x - side.x, y: base.y - side.y }])}"/>`;
  return {
    sym: `<g class="sym">${s}</g>`,
    label: it.dir === 'down' ? 'DN' : 'UP',
    at: stepTo(first.a, first.d, Math.min(first.len * 0.3, 1.2)),
    size: it.w * 0.3,
  };
}

// The button in the middle of stairs that lead somewhere: the triangle says up or down, and a
// click goes to that floor. It is drawn apart from the stairs, over the rooms, so that it can
// always be seen and pressed.
function stairsButton(it, u) {
  const dest = isStairs(it) && stairsDest(it);
  if (!dest) return '';
  const c = stairMiddle(it);
  const g = it.dir === 'down' ? -1 : 1;
  return `<g class="goto" data-kind="goto" data-id="${it.id}"><title>Go ${it.dir === 'down' ? 'down' : 'up'} to ${esc(dest.name)}</title>
    <circle cx="${c.x}" cy="${c.y}" r="${11 * u}"/>
    <polygon points="${c.x},${c.y - g * 6 * u} ${c.x - 5.5 * u},${c.y + g * 4 * u} ${c.x + 5.5 * u},${c.y + g * 4 * u}"/></g>`;
}

function itemSvg(it, u, on) {
  const { sym, label, at, size } = isStairs(it) ? stairsSym(it) : fixtureSym(it);
  // Lettering stays upright however the item is turned.
  const text = label ? `<text class="itemLabel" x="${at.x}" y="${at.y + size * 0.35}" font-size="${size}" stroke-width="${size * 0.3}">${label}</text>` : '';
  return `<g class="item${on ? ' sel' : ''}" data-kind="item" data-id="${it.id}">${sym}${text}</g>`;
}

// Stairs are drawn underneath the rooms, so a press on stairs that have a room over them lands
// on the room. The smaller of the two is taken to be what was meant: stairs standing in a
// hallway are picked through the hallway, while a closet drawn over the foot of a staircase is
// picked itself.
function stairsUnder(room, p) {
  const size = (it) => stairParts(it).reduce((a, part) => a + shapeArea({ points: part.quad }), 0);
  return floor().items.find((it) => isStairs(it) && stairParts(it).some((part) => shapeContains({ points: part.quad }, p)) && size(it) < shapeArea(room)) || null;
}

// The handles on a selected item. Stairs get one at each end and each turn of their path. A
// fixture gets a round one out in front of it for turning, and one on each corner for resizing
// once it is big enough on screen to hold them.
function itemHandles(it, u) {
  if (itemLockedBy(it)) return ''; // nothing to drag while its room is locked
  if (isStairs(it)) {
    return it.points.map((p, i) => `<circle class="handle" data-kind="spt" data-i="${i}" cx="${p.x}" cy="${p.y}" r="${6 * u * grip()}"><title>Drag to move this ${i && i < it.points.length - 1 ? 'turn' : 'end'} of the stairs</title></circle>`).join('');
  }
  const from = itemAt(it, 0, it.h / 2);
  const to = itemAt(it, 0, it.h / 2 + 24 * u);
  let s = `<line class="spinStem" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"/>
    <circle class="handle" data-kind="spin" cx="${to.x}" cy="${to.y}" r="${7 * u * grip()}"><title>Drag to turn it. It catches on the direction of the walls; hold Alt to turn it freely.</title></circle>`;
  if (Math.min(it.w, it.h) > 30 * u) {
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = itemAt(it, (sx * it.w) / 2, (sy * it.h) / 2);
      s += `<rect class="handle resize" data-kind="isize" data-sx="${sx}" data-sy="${sy}" x="${p.x - 5 * u * grip()}" y="${p.y - 5 * u * grip()}" width="${10 * u * grip()}" height="${10 * u * grip()}" transform="rotate(${it.rot || 0} ${p.x} ${p.y})"/>`;
    }
  }
  return s;
}

// ---------- dragging ----------
// Each drag below carries a `step` that the drawing surface calls with the pointer's position.

// Starts whatever a press on an item, its button or one of its handles means. Returns false if
// the press was on something else.
function itemDown(hit, p, e) {
  const kind = hit?.dataset.kind;
  if (kind === 'goto') {
    goStairs(floor().items.find((it) => it.id === hit.dataset.id));
    return true;
  }
  const under = kind === 'room' ? stairsUnder(floor().rooms.find((r) => r.id === hit.dataset.id), p) : null;
  if (kind === 'item' || under) {
    sel = { type: 'item', id: under?.id || hit.dataset.id };
    // In a locked room it is selected but stays put, and the drag moves the view.
    drag = itemLockedBy(selItem()) ? panFrom(e) : moveItemDrag(selItem(), p);
    renderAll();
    return true;
  }
  const it = selItem();
  if (!it || !['spin', 'isize', 'spt'].includes(kind)) return false;
  if (kind === 'spin') drag = spinDrag(it);
  else if (kind === 'isize') drag = sizeDrag(it, +hit.dataset.sx, +hit.dataset.sy);
  else drag = stairPointDrag(it, +hit.dataset.i);
  return true;
}

function moveItemDrag(it, p) {
  const targets = itemTargets(it);
  const orig = isStairs(it) ? it.points : { x: it.x, y: it.y };
  return {
    type: 'item',
    step(q) {
      const by = { x: fine(q.x - p.x), y: fine(q.y - p.y) };
      const put = (d) => {
        if (isStairs(it)) it.points = orig.map((v) => ({ x: v.x + d.x, y: v.y + d.y }));
        else Object.assign(it, { x: orig.x + d.x, y: orig.y + d.y });
      };
      put(by);
      const adj = snapMove(itemCorners(it), targets);
      put({ x: by.x + adj.x, y: by.y + adj.y });
    },
  };
}

// Turning: the front of the fixture follows the pointer. It catches on the directions the walls
// run in, so that it sits square to a wall drawn at any angle, and on every 15 degrees.
function spinDrag(it) {
  const c = shapeCenter(it);
  const angles = [...wallAngles(), 0, 15, 30, 45, 60, 75];
  return {
    type: 'item',
    step(q) {
      const deg = turnDeg((Math.atan2(-(q.x - c.x), q.y - c.y) * 180) / Math.PI);
      const caught = snapOff ? null : catchAngle(deg, angles);
      it.rot = caught === null ? Math.round(deg) % 360 : Math.round(caught * 10) / 10;
      renderInspector();
    },
    size: () => `Turned ${Math.round(it.rot * 10) / 10}°`,
  };
}

// Resizing by a corner: the opposite corner stays where it is, whichever way the fixture is turned.
function sizeDrag(it, sx, sy) {
  const far = itemAt(it, (-sx * it.w) / 2, (-sy * it.h) / 2);
  const targets = itemTargets(it);
  const a = ((it.rot || 0) * Math.PI) / 180;
  return {
    type: 'item',
    step(q) {
      const c = snapPoint(q, targets, fine);
      const v = { x: c.x - far.x, y: c.y - far.y };
      it.w = Math.max(0.5, fine(sx * (v.x * Math.cos(a) + v.y * Math.sin(a))));
      it.h = Math.max(0.5, fine(sy * (-v.x * Math.sin(a) + v.y * Math.cos(a))));
      const half = { x: (sx * it.w) / 2, y: (sy * it.h) / 2 };
      const mid = { x: far.x + half.x * Math.cos(a) - half.y * Math.sin(a), y: far.y + half.x * Math.sin(a) + half.y * Math.cos(a) };
      Object.assign(it, { x: mid.x - it.w / 2, y: mid.y - it.h / 2 });
      renderInspector();
    },
    size: () => `${fmtLen(it.w)} × ${fmtLen(it.h)}`,
  };
}

// Moving an end or a turn of a staircase. A flight that comes out nearly level, upright, or
// square to the flight before or after it is made exactly so; Alt leaves it wherever it is put.
function stairPointDrag(it, i) {
  const targets = itemTargets(it);
  const legAngle = (m, n) => (it.points[m] && it.points[n] ? [(Math.atan2(it.points[n].y - it.points[m].y, it.points[n].x - it.points[m].x) * 180) / Math.PI] : []);
  return {
    type: 'item',
    step(q) {
      let c = snapPoint(q, targets, fine);
      // The flights on either side of this point each turn about the point at their other end.
      for (const [pivot, beyond] of [[i - 1, i - 2], [i + 1, i + 2]]) {
        const o = it.points[pivot];
        if (!o || snapOff) continue;
        const deg = (Math.atan2(c.y - o.y, c.x - o.x) * 180) / Math.PI;
        const to = catchAngle(deg, [0, ...legAngle(pivot, beyond)]);
        if (to === null) continue;
        const d = { x: Math.cos((to * Math.PI) / 180), y: Math.sin((to * Math.PI) / 180) };
        const p = stepTo(o, d, (c.x - o.x) * d.x + (c.y - o.y) * d.y);
        c = { x: fine(p.x), y: fine(p.y) };
      }
      it.points[i] = c;
      renderInspector();
    },
    size: () => stairLegs(it).map((l) => fmtLen(l.len)).join(' + '),
  };
}

// ---------- side panel ----------

function itemInspector(it) {
  const del = (it.kind ? DUP_BUTTON : '') + '<button class="danger" id="btnDelete">Delete</button>';
  const held = itemLockedBy(it);
  const lockNote = held ? `<p class="note step">Held in place because ${esc(roomTitle(held))} is locked. Unlock that room to drag or turn it on the plan.</p>` : '';
  if (!it.kind) {
    return `<h2>Fixture</h2>
      <p class="note pick">Choose what this is:</p>
      ${ITEM_GROUPS.map(([g, kinds]) => `<h3 class="kindGroup">${g}</h3><div class="kinds">${kinds.map((k) => `<button data-item-kind="${k.id}">${k.label}</button>`).join('')}</div>`).join('')}
      <div class="actions">${del}</div>`;
  }
  const quarter = '<p class="muted small">Round to the nearest 1/4 inch. Fractions are fine: 5 3/4.</p>';
  const turn = '<button id="btnTurn" title="Turns it a quarter turn clockwise, about its middle">Quarter turn</button>';
  const note = field('Note', 'item', 'note', it.note || '');
  if (!isStairs(it)) {
    return `<h2>Fixture</h2>
      ${lockNote}
      <label>Type<select data-obj="item" data-field="kind">${ITEM_GROUPS.map(([g, kinds]) => `<optgroup label="${g}">${kinds.map((k) => `<option value="${k.id}"${k.id === it.kind ? ' selected' : ''}>${k.label}</option>`).join('')}</optgroup>`).join('')}</select></label>
      ${lengthField('Width', 'item', 'w', it.w)}
      ${lengthField('Depth, back to front', 'item', 'h', it.h)}
      ${quarter}
      ${field('Turned (°, clockwise; 0 = back to the top)', 'item', 'rot', Math.round((it.rot || 0) * 10) / 10, { num: true, step: 5 })}
      ${note}
      ${itemKind(it.kind)?.record ? recordHtml(it) : ''}
      <p class="muted">Drag it into place; its corners catch on walls and on other fixtures. Drag the round yellow handle in front of it to turn it: it catches on the direction of the walls, so it sits square to a wall drawn at any angle. Alt turns or places it freely. Choosing a type sets its usual size.</p>
      <div class="actions">
        ${turn}
        <button id="btnBackToWall" title="Turns it to back onto the wall nearest to it, at whatever angle that wall runs, and pushes it up against that wall">Back against the nearest wall</button>
        ${del}
      </div>`;
  }
  const dest = stairsDest(it);
  const others = plan.floors.filter((f) => f !== floor() && f.kind === 'floor');
  const back = dest && matchingStairs(it);
  const legs = stairLegs(it);
  const leg = (l, i) => {
    const v = feetInches(l.len);
    const box = (part, val, extra) => `<input data-leg="${i}" data-part="${part}" ${extra} value="${val}">`;
    const label = legs.length === 1 ? 'Length, on the floor' : `Stretch ${i + 1} of ${legs.length}`;
    return `<label>${label}<span class="ftin">${box('ft', v.ft, 'type="number" min="0" step="1"')}<i>ft</i>${box('in', fmtInches(v.in), 'inputmode="decimal" title="Fractions are fine: 5 3/4"')}<i>in</i></span></label>`;
  };
  return `<h2>Stairs</h2>
    ${lockNote}
    <div class="row">
      ${field('Going', 'item', 'dir', it.dir, { options: [['up', 'Up from this floor'], ['down', 'Down from this floor']] })}
      ${field('Leads to', 'item', 'to', dest ? it.to : '', { options: [['', 'Not set'], ...others.map((f) => [f.id, f.name])] })}
    </div>
    ${dest ? `<div class="actions">
      <button id="btnGoStairs">Go to ${esc(dest.name)}</button>
      ${back ? '' : `<button id="btnMatchStairs" title="Draws these same stairs on ${esc(dest.name)}, in the same place, leading back to this floor">Add these stairs to ${esc(dest.name)}</button>`}
    </div>` : ''}
    ${lengthField('Width', 'item', 'w', it.w)}
    ${legs.map(leg).join('')}
    ${quarter}
    ${legs.length > 1 ? '<p class="muted small">Each stretch is measured down the middle of the stairs, from an end or the middle of a landing to the next.</p>' : ''}
    ${note}
    <p class="muted">The arrow runs from the end you step on to the far end. Drag the round handles to move an end or a turn; a flight catches when it is level, upright or square to the next one (Alt: freely).${dest ? ` The round button on the stairs goes to ${esc(dest.name)}.` : ' Set where they lead to get a button on the stairs that takes you to that floor.'}</p>
    ${back ? `<p class="muted">These stairs are also drawn on ${esc(dest.name)}. A change made here is not copied there.</p>` : ''}
    <div class="actions">
      <button data-stair-turn="-1" title="Adds a landing at the far end and a flight leading off to the left of the way you are walking">Add a turn left</button>
      <button data-stair-turn="1" title="Adds a landing at the far end and a flight leading off to the right of the way you are walking">Add a turn right</button>
      ${legs.length > 1 ? '<button id="btnUnturn" title="Takes away the last turn and the flight after it">Remove the last turn</button>' : ''}
      <button id="btnReverse" title="Makes the far end the end you step on, so the arrow points the other way">Swap the ends</button>
      ${turn}
    </div>
    <div class="actions">${del}</div>`;
}

// A choice from one of an item's lists.
// The make, model and age of an appliance or a system, folded away until wanted. What a repair or a
// replacement part needs first, and what tells an assistant how near it may be to the end of its life.
const RECORD_FIELDS = [['brand', 'Brand'], ['model', 'Model number'], ['serial', 'Serial number'], ['warranty', 'Warranty, such as "parts until 2029"']];
const hasRecord = (it) => RECORD_FIELDS.some(([key]) => it[key]) || it.installed;

function recordHtml(it) {
  const age = it.installed ? ` · about ${Math.max(0, new Date().getFullYear() - it.installed)} years old` : '';
  return `<details class="record"${hasRecord(it) ? ' open' : ''}>
      <summary>Make, model and age${age}</summary>
      <div class="row">${field('Brand', 'item', 'brand', it.brand || '')}${field('Installed (year)', 'item', 'installed', it.installed || '', { num: true })}</div>
      ${field('Model number', 'item', 'model', it.model || '')}
      ${field('Serial number', 'item', 'serial', it.serial || '')}
      ${field('Warranty', 'item', 'warranty', it.warranty || '')}
      <p class="muted small">Usually on a label inside a door, on the back or side, or near the controls. A photo of the label on a photo marker beside it keeps it too.</p>
    </details>`;
}

function setItemField(it, name, value) {
  if (name === 'kind') setItemKind(it, value);
  else if (name === 'to') {
    setStairsDest(it, value);
    offerMatchingStairs(it);
  }
  else it[name] = value;
}

// The length of one stretch of a staircase, typed as feet and inches.
$('#inspector').addEventListener('input', (e) => {
  const i = e.target.dataset.leg;
  const it = selItem();
  if (i === undefined || !it) return;
  const typed = (part) => $(`#inspector [data-leg="${i}"][data-part="${part}"]`).value;
  setLegLength(it, +i, (parseFloat(typed('ft')) || 0) + parseInches(typed('in')) / 12);
  save(true);
  renderCanvas();
});

$('#inspector').addEventListener('click', async (e) => {
  const it = selItem();
  if (!it) return;
  const { itemKind: kind, stairTurn } = e.target.dataset;
  if (e.target.id === 'btnGoStairs') return goStairs(it);
  if (e.target.id === 'btnMatchStairs') return addMatchingStairs(it);
  if (e.target.id === 'btnBackToWall') {
    const problem = backToWall(it);
    if (problem) return tell(problem);
  } else if (kind) setItemKind(it, kind);
  else if (stairTurn) addStairTurn(it, +stairTurn);
  else if (e.target.id === 'btnUnturn') it.points.pop();
  else if (e.target.id === 'btnReverse') it.points.reverse();
  else if (e.target.id === 'btnTurn') turnItem(it);
  else return;
  save();
  renderAll();
});
