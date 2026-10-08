'use strict';

// The house in three dimensions, drawn from the plan as a picture seen from above at an angle
// (an isometric view, with no perspective, so that sizes compare across the picture). Two views:
//
// - the floors: each floor's rooms with their walls cut away low, so the rooms can be seen into,
//   and the floors spread apart, the lowest at the bottom, with the fixtures on them;
// - the outside: the house outline raised to the full height of its floors, with flat tops, as the
//   roof is not drawn, and the windows and outside doors of each floor on its walls.
//
// They are shown with View -> 3D view, and go into the export for AI with the plan pictures.

const ISO_X = Math.cos(Math.PI / 6);
const ISO_Y = Math.sin(Math.PI / 6);
const CUT = 3; // feet: the height the walls are cut down to in the view of the floors
const FLOOR_DEPTH = 1; // feet between one floor's ceiling and the floor above it
const DOOR_HEIGHT = 80 / 12;
const WINDOW_HEIGHT = { standard: 4, high: 1.5, egress: 3.5, block: 1.5 };

// Which way round the house is seen: 0 to 3 quarter turns. Set only while a picture is drawn.
let turn = 0;
// A point of the plan with the house turned `turn` quarter turns clockwise, as it is seen.
function turned(p) {
  if (turn === 1) return { x: -p.y, y: p.x };
  if (turn === 2) return { x: -p.x, y: -p.y };
  if (turn === 3) return { x: p.y, y: -p.x };
  return p;
}
const iso = (p, z) => {
  const q = turned(p);
  return { x: (q.x - q.y) * ISO_X, y: (q.x + q.y) * ISO_Y - z };
};
// How far toward the viewer a point is: larger is nearer, and is drawn later, over what is behind.
const nearness = (p) => {
  const q = turned(p);
  return q.x + q.y;
};
// How far across the picture a point is, left to right.
const sideways = (p) => {
  const q = turned(p);
  return q.x - q.y;
};
const storey = () => std('ceiling') + FLOOR_DEPTH;

// A face's shade from the way it faces: the two sides turned toward the viewer are lit, the others in shade.
function wallShade(a0, b0, base) {
  const a = turned(a0);
  const b = turned(b0);
  const nx = b.y - a.y;
  const ny = -(b.x - a.x);
  const toward = (nx + ny) / (Math.hypot(nx, ny) || 1);
  const light = 0.78 + 0.18 * toward;
  const [r, g, bl] = base;
  return `rgb(${Math.round(r * light)},${Math.round(g * light)},${Math.round(bl * light)})`;
}

// A wall's outward side for an outline drawn either way round: the edge a->b with the shape's
// inside on its left or right.
function outward(shape, a, b) {
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const n = { x: b.y - a.y, y: -(b.x - a.x) };
  const len = Math.hypot(n.x, n.y) || 1;
  const probe = { x: m.x + (n.x / len) * 0.05, y: m.y + (n.y / len) * 0.05 };
  return shapeContains(shape, probe) ? [b, a] : [a, b];
}

// Lines are drawn a set number of pixels wide, whatever the size of the house.
const polygon = (pts, fill, stroke = '#5b5f66', width = 1.4) => `<polygon points="${pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;

const WALL_TINT = [236, 232, 224];

// Everything standing on a floor is a solid: an upright prism over a footprint in the plan (a box's
// corners, or just the two ends of a wall), from z0 up to z1, with its picture in svg.

// A box standing on a floor: its sides, the farthest first, and its top.
function boxSolid(pts, z0, z1, fill) {
  const sides = pts.map((a, k) => {
    const b = pts[(k + 1) % pts.length];
    const [p, q] = outward({ points: pts }, a, b);
    return { d: nearness({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }), svg: polygon([iso(p, z0), iso(q, z0), iso(q, z1), iso(p, z1)], wallShade(p, q, fill), '#6b7380', 0.8) };
  }).sort((m, n) => m.d - n.d);
  const top = polygon(pts.map((p) => iso(p, z1)), `rgb(${fill.join(',')})`, '#6b7380', 0.8);
  return { foot: pts, z0, z1, svg: sides.map((x) => x.svg).join('') + top };
}

// Across the picture, a footprint spans x − y from one side to the other.
function across(pts) {
  const u = pts.map(sideways);
  return [Math.min(...u), Math.max(...u)];
}

// How near the viewer a footprint reaches, nearest and farthest, along the line where x − y = u
// (a line running straight away from the viewer), or null where it does not cross it.
function chord(pts, u) {
  const out = [];
  pts.forEach((a, k) => {
    const b = pts[(k + 1) % pts.length];
    const ua = sideways(a);
    const ub = sideways(b);
    if ((ua - u) * (ub - u) > 0) return;
    const t = ua === ub ? 0 : (u - ua) / (ub - ua);
    out.push(nearness(a) + (nearness(b) - nearness(a)) * t);
    if (ua === ub) out.push(nearness(b));
  });
  return out.length ? [Math.min(...out), Math.max(...out)] : null;
}

// Which of two solids is drawn first: -1 for a, 1 for b, 0 where they cannot overlap in the
// picture. Along any line running away from the viewer the nearer footprint hides the farther one,
// whatever their heights; where the footprints overlap, the lower solid is drawn first, and where
// they share the same space (a sink set into a counter) the larger one is.
function solidOrder(a, b) {
  const [a0, a1] = across(a.foot);
  const [b0, b1] = across(b.foot);
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  if (hi - lo < 0.01) return 0;
  for (const t of [0.5, 0.15, 0.85]) {
    const ca = chord(a.foot, lo + (hi - lo) * t);
    const cb = chord(b.foot, lo + (hi - lo) * t);
    if (!ca || !cb) continue;
    if (ca[1] <= cb[0] + 0.02) return -1;
    if (cb[1] <= ca[0] + 0.02) return 1;
  }
  if (a.z1 <= b.z0 + 0.01) return -1;
  if (b.z1 <= a.z0 + 0.01) return 1;
  return shapeArea({ points: b.foot }) - shapeArea({ points: a.foot }) || nearness(shapeCenter({ points: a.foot })) - nearness(shapeCenter({ points: b.foot }));
}

// The solids in the order to draw them, each after everything it stands in front of. Should three
// ever hide each other in a ring, the farthest of those left goes next.
function drawOrder(solids) {
  const n = solids.length;
  const after = solids.map(() => []);
  const waits = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const o = solidOrder(solids[i], solids[j]);
      if (o < 0) { after[i].push(j); waits[j]++; }
      else if (o > 0) { after[j].push(i); waits[i]++; }
    }
  }
  const far = solids.map((s) => nearness(shapeCenter({ points: s.foot })));
  const done = new Array(n).fill(false);
  const out = [];
  while (out.length < n) {
    let pick = -1;
    for (let i = 0; i < n; i++) if (!done[i] && !waits[i] && (pick < 0 || far[i] < far[pick])) pick = i;
    if (pick < 0) for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || far[i] < far[pick])) pick = i;
    done[pick] = true;
    out.push(solids[pick]);
    for (const j of after[pick]) waits[j]--;
  }
  return out;
}

// The doors, open sides, half walls and windows along one wall of a room, as stretches of it:
// [{ from, to, kind, o }], `from` and `to` measured from a toward b.
function wallGaps(f, a, b) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 0.25) return [];
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const out = [];
  for (const o of f.openings) {
    if (Math.abs(o.along === 'x' ? d.y : d.x) > 0.05) continue;
    const t = (o.x - a.x) * d.x + (o.y - a.y) * d.y;
    const off = Math.abs((o.x - a.x) * d.y - (o.y - a.y) * d.x);
    if (off > o.t / 2 + 0.25 || t < -o.w / 2 || t > len + o.w / 2) continue;
    out.push({ from: Math.max(0, t - o.w / 2), to: Math.min(len, t + o.w / 2), kind: o.kind, o });
  }
  return out.sort((m, n) => m.from - n.from);
}

// One wall of a room, cut away at CUT, as solids: whole where nothing is in it, missing at a door
// or an open side, low at a half wall, and at a window cut to its sill, with the glass standing in
// the opening.
function wallSolids(f, r, a0, b0, z) {
  const [a, b] = outward(r, a0, b0);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const at = (u) => ({ x: a.x + ((b.x - a.x) * u) / (len || 1), y: a.y + ((b.y - a.y) * u) / (len || 1) });
  const shade = wallShade(a, b, WALL_TINT);
  const out = [];
  const piece = (u0, u1, h0, h1, fill = shade, stroke = '#5b5f66', extra = '') => {
    if (u1 - u0 < 0.01 || h1 <= h0) return;
    const ends = [at(u0), at(u1)];
    out.push({ foot: ends, z0: z + h0, z1: z + h1, svg: `<polygon points="${[iso(ends[0], z + h0), iso(ends[1], z + h0), iso(ends[1], z + h1), iso(ends[0], z + h1)].map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="0.9" vector-effect="non-scaling-stroke"${extra}/>` });
  };
  let u = 0;
  for (const g of wallGaps(f, a, b)) {
    if (g.from > u) piece(u, g.from, 0, CUT);
    if (g.kind === 'half') piece(g.from, g.to, 0, Math.min(CUT, 2.5), '#cfd5db');
    else if (g.kind === 'window') {
      const sill = g.o.sill ?? windowKind(g.o.style).sill;
      piece(g.from, g.to, 0, Math.min(sill, CUT));
      piece(g.from, g.to, sill, sill + (WINDOW_HEIGHT[g.o.style] || 4), '#8fb3cf', '#3d6a8f', ' fill-opacity="0.55"');
    }
    u = Math.max(u, g.to);
  }
  if (u < len) piece(u, len, 0, CUT);
  return out;
}

// Stairs going up rise as a flight of steps to the floor above; stairs going down lie flat.
function stairsSolids(it, z) {
  const parts = stairParts(it);
  if (it.dir === 'down') return parts.map((p) => ({ foot: p.quad, z0: z, z1: z + 0.05, svg: polygon(p.quad.map((q) => iso(q, z + 0.05)), '#d9cbb3', '#7b8592', 0.75) }));
  const total = parts.reduce((n, p) => n + p.treads, 0) || 1;
  const rise = storey() / (total + 1);
  const out = [];
  let k = 0;
  for (const p of parts) {
    const [qa, qb, qc, qd] = p.quad;
    if (!p.treads) {
      out.push(boxSolid(p.quad, z, z + rise * (k + 0.5), [217, 203, 179]));
      continue;
    }
    for (let n = 0; n < p.treads; n++) {
      const s0 = n / p.treads;
      const s1 = (n + 1) / p.treads;
      k++;
      out.push(boxSolid([between(qa, qb, s0), between(qa, qb, s1), between(qd, qc, s1), between(qd, qc, s0)], z, z + rise * k, [217, 203, 179]));
    }
  }
  return out;
}

// What the pictures show, each of which can be hidden in the 3D view window. The export shows all.
const SHOW_ALL = { labels: true, issues: true, photos: true, fixtures: true };

// The floors, spread apart, as [{ depth, svg }] parts and the labels to go over them.
function floorsScene(show = SHOW_ALL) {
  const levels = plan.floors.filter((f) => f.kind === 'floor' && f.rooms.length);
  // Far enough apart that no floor hides any part of the one below it, with room for the tallest
  // things on it to stand clear of the next.
  const sums = levels.flatMap((f) => f.rooms.flatMap(outlinePoints)).map(nearness);
  const spread = (Math.max(...sums) - Math.min(...sums)) * ISO_Y + 8;
  const parts = [];
  const labels = [];
  const pins = []; // drawn last of all, over the names of the rooms
  levels.forEach((f, n) => {
    const z = n * spread;
    const lift = n * 1e7;
    // What is not counted as part of the house, such as a crawlspace, lies flat as a dashed
    // outline with no walls, as on the outside view.
    for (const r of f.rooms) {
      const pts = outlinePoints(r).map((p) => iso(p, z));
      parts.push({ depth: lift, svg: r.separate
        ? `<polygon points="${pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}" fill="#eeebe4" stroke="#8d877b" stroke-width="1.2" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>`
        : polygon(pts, '#f4efe4', '#8d877b') });
    }
    const solids = [];
    for (const it of show.fixtures ? f.items : []) {
      if (isStairs(it)) {
        solids.push(...stairsSolids(it, z));
        continue;
      }
      const h = itemHeights(it);
      if (!h) continue; // on the ceiling, or of no chosen type
      solids.push(boxSolid(itemCorners(it), z + h[0], z + h[1], it.kind === 'upper' || it.kind === 'tall' || it.kind === 'shelves' || it.kind === 'counter' ? [222, 214, 200] : [213, 219, 226]));
    }
    for (const r of f.rooms) {
      const pts = outlinePoints(r);
      if (!r.separate) pts.forEach((a, k) => solids.push(...wallSolids(f, r, a, pts[(k + 1) % pts.length], z)));
      const c = iso(shapeCenter(r), z + (r.separate ? 0.2 : CUT + 0.5));
      if (show.labels) labels.push(`<text x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" font-size="1.8" text-anchor="middle" fill="#222" stroke="#fff" stroke-width="0.45" paint-order="stroke" font-family="system-ui, sans-serif">${esc(roomTitle(r))}</text>`);
    }
    drawOrder(solids).forEach((s, k) => parts.push({ depth: lift + 1 + k, svg: s.svg }));
    // The numbered issue pins on this floor, standing just above it.
    // The photo markers, as on the plan, each with a short arrow the way its first photo looks.
    for (const ph of show.photos ? plan.photos : []) {
      if (ph.floorId !== f.id) continue;
      const p = iso(ph, z + 0.2);
      const a = (((ph.dir || 0) - 90) * Math.PI) / 180;
      const q = iso({ x: ph.x + Math.cos(a) * 1.6, y: ph.y + Math.sin(a) * 1.6 }, z + 0.2);
      const aim = typeof ph.dir === 'number' ? `<line x1="${p.x.toFixed(2)}" y1="${p.y.toFixed(2)}" x2="${q.x.toFixed(2)}" y2="${q.y.toFixed(2)}" stroke="#00897b" stroke-width="2.5" vector-effect="non-scaling-stroke"/>` : '';
      pins.push(`${aim}<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="0.75" fill="#00897b" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`);
    }
    for (const i of show.issues ? plan.issues : []) {
      if (i.floorId !== f.id || !pinned(i) || i.status === 'Done') continue;
      const p = iso(i, z + 0.2);
      pins.push(`<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="1.15" fill="${cat(i.category).color}" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke"/><text x="${p.x.toFixed(2)}" y="${(p.y + 0.46).toFixed(2)}" font-size="1.3" font-weight="700" text-anchor="middle" fill="#fff" font-family="system-ui, sans-serif">${issueNum(i)}</text>`);
    }
    const left = levels[n].rooms.flatMap(outlinePoints).reduce((m, p) => (iso(p, z).x < m.x ? iso(p, z) : m), { x: Infinity, y: 0 });
    labels.push(`<text x="${(left.x - 1).toFixed(2)}" y="${left.y.toFixed(2)}" font-size="2.4" font-weight="700" text-anchor="end" fill="#24476b" font-family="system-ui, sans-serif">${esc(f.name)}</text>`);
  });
  return { parts, labels: [...labels, ...pins] };
}

// The outside: the outline raised to the height of the floors above ground, with the windows and
// outside doors of every floor placed on its walls where they sit on that floor's plan.
function outsideScene(show = SHOW_ALL) {
  const shapes = (exteriorFloor()?.rooms || []);
  const floors = plan.floors.filter((f) => f.kind === 'floor');
  const above = floors.filter((f) => !f.basement);
  const height = Math.max(1, above.filter((f) => f.rooms.length).length || 1) * storey();
  const parts = [];
  const labels = [];
  const label = (s, z) => {
    const c = iso(shapeCenter(s), z);
    return `<text x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" font-size="2" text-anchor="middle" fill="#222" stroke="#fff" stroke-width="0.5" paint-order="stroke" font-family="system-ui, sans-serif">${esc(s.name)}</text>`;
  };
  // What is not counted as part of the house (a garage, carport, shed or deck) lies flat on the
  // ground as an outline with its name, under everything else, as how tall it is is not known and
  // a block for it would only hide the house.
  for (const s of shapes.filter((x) => x.separate)) {
    parts.push({ depth: -2e9, svg: `<polygon points="${outlinePoints(s).map((p) => iso(p, 0)).map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}" fill="#eeebe4" stroke="#8d877b" stroke-width="1.2" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>` });
    if (show.labels) parts.push({ depth: -2e9 + 1, svg: label(s, 0) });
  }
  // The parts of the house are drawn one whole block at a time, the farthest first, each with its
  // walls from the back and its top last, so that no block's top lies over the walls of one nearer.
  const blocks = shapes.filter((x) => !x.separate).sort((a, b) => nearness(shapeCenter(a)) - nearness(shapeCenter(b)));
  blocks.forEach((s, n) => {
    const base = n * 1e6;
    const pts = outlinePoints(s);
    pts.forEach((a0, k) => {
      const b0 = pts[(k + 1) % pts.length];
      const [a, b] = outward(s, a0, b0);
      const svgs = polygon([iso(a, 0), iso(b, 0), iso(b, height), iso(a, height)], wallShade(a, b, [228, 222, 210])) + wallOpenings(a, b, floors, height);
      parts.push({ depth: base + nearness({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), svg: svgs });
    });
    parts.push({ depth: base + 5e5, svg: polygon(pts.map((p) => iso(p, height)), '#b9b2a6') });
    if (show.labels) labels.push(label(s, height + 0.3));
  });
  return { parts, labels };
}

// The windows and outside doors on one face of the outline, from a to b: those on any floor whose
// wall runs along this face, within 1.5 ft of it. A floor stands at its height in the house, the
// basement below the ground, so a basement window shows only as much of it as is above ground.
function wallOpenings(a, b, floors, top) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 0.5) return '';
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  let s = '';
  let up = 0;
  for (const f of floors) {
    const base = f.basement ? -storey() : storey() * up++;
    for (const o of f.openings) {
      if (o.kind !== 'window' && o.kind !== 'exterior') continue;
      // It has to run the same way as the face, and lie along it.
      if (Math.abs(o.along === 'x' ? d.y : d.x) > 0.05) continue;
      const t = (o.x - a.x) * d.x + (o.y - a.y) * d.y;
      const off = Math.abs((o.x - a.x) * d.y - (o.y - a.y) * d.x);
      if (off > 1.5 || t < 0 || t > len) continue;
      const isWindow = o.kind === 'window';
      const sill = isWindow ? o.sill ?? windowKind(o.style).sill : 0;
      const lo = Math.max(0, base + sill);
      const hi = Math.min(top - 0.3, base + sill + (isWindow ? WINDOW_HEIGHT[o.style] || 4 : DOOR_HEIGHT));
      if (hi <= lo) continue;
      const p = (u) => ({ x: a.x + d.x * u, y: a.y + d.y * u });
      const q1 = p(Math.max(0, t - o.w / 2));
      const q2 = p(Math.min(len, t + o.w / 2));
      s += polygon([iso(q1, lo), iso(q2, lo), iso(q2, hi), iso(q1, hi)], isWindow ? '#8fb3cf' : '#7a5a3a', '#3d4650', 0.8);
    }
  }
  return s;
}

// A scene as an SVG picture `width` pixels across, on white, or '' when there is nothing to draw.
function sceneSvg({ parts, labels }, width, title) {
  if (!parts.length) return '';
  // The extent of the picture, from the corners of every shape in it.
  const xs = [];
  const ys = [];
  for (const [, list] of parts.map((v) => v.svg).join('').matchAll(/points="([^"]*)"/g)) {
    for (const pair of list.split(' ')) {
      const [x, y] = pair.split(',').map(Number);
      xs.push(x);
      ys.push(y);
    }
  }
  const pad = 4;
  const x0 = Math.min(...xs) - pad - 18;
  const y0 = Math.min(...ys) - pad - 4;
  const w = Math.max(...xs) - x0 + pad;
  const h = Math.max(...ys) - y0 + pad;
  const height = Math.round((width * h) / w);
  const body = parts.sort((p, q) => p.depth - q.depth).map((v) => v.svg).join('') + labels.join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${width}" height="${height}"><title>${esc(title)}</title><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#fff"/>${body}</svg>`;
}

// A picture seen from `quarter` quarter turns round from the usual corner, showing what `show` says.
function turnedSvg(scene, quarter, show, width, title) {
  turn = ((quarter % 4) + 4) % 4;
  try {
    return sceneSvg(scene(show), width, title);
  } finally {
    turn = 0;
  }
}
const floorsSvg = (width, quarter = 0, show = SHOW_ALL) => turnedSvg(floorsScene, quarter, show, width, `${plan.name}: the floors in 3D, walls cut away`);
const outsideSvg = (width, quarter = 0, show = SHOW_ALL) => turnedSvg(outsideScene, quarter, show, width, `${plan.name}: the outside in 3D, from the plan`);

// An SVG picture as a PNG.
async function svgPng(text) {
  const width = +/width="(\d+)"/.exec(text)[1];
  const height = +/height="(\d+)"/.exec(text)[1];
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = new OffscreenCanvas(width, height);
    c.getContext('2d').drawImage(img, 0, 0, width, height);
    return await c.convertToBlob({ type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// The two views for the export: [{ name, data }], leaving out one with nothing to show.
async function view3dPictures() {
  const out = [];
  const floors = floorsSvg(1600);
  if (floors) out.push({ name: 'plans/3d-floors.png', data: await svgPng(floors) });
  const outside = outsideSvg(1600);
  if (outside) out.push({ name: 'plans/3d-outside.png', data: await svgPng(outside) });
  return out;
}

// ---------- View -> 3D view ----------

// What the window shows, kept while the project is open: the same for both pictures, and each
// picture's own turn and zoom.
const view3d = { show: { ...SHOW_ALL }, outside: { turn: 0, zoom: 1 }, floors: { turn: 0, zoom: 1 } };
const ZOOMS = [1, 1.5, 2, 3, 4, 6];
const SHOW_CHOICES = [['labels', 'Labels'], ['issues', 'Issues'], ['photos', 'Photo markers'], ['fixtures', 'Fixtures and stairs']];

function view3dSection(key, title) {
  const svg = (key === 'outside' ? outsideSvg : floorsSvg)(1200, view3d[key].turn, view3d.show);
  if (!svg) return '';
  const { zoom } = view3d[key];
  return `<section class="v3dSec" data-v3d="${key}">
      <div class="v3dBar">
        <h3>${title}</h3>
        <span class="v3dTools">
          <button type="button" data-v3d-turn="-1" title="Turns the view a quarter turn to the left" aria-label="Turn left">&#8634;</button>
          <button type="button" data-v3d-turn="1" title="Turns the view a quarter turn to the right" aria-label="Turn right">&#8635;</button>
          <button type="button" data-v3d-zoom="-1" title="Zooms out"${zoom === ZOOMS[0] ? ' disabled' : ''} aria-label="Zoom out">&minus;</button>
          <span class="v3dZoom">${Math.round(zoom * 100)}%</span>
          <button type="button" data-v3d-zoom="1" title="Zooms in"${zoom === ZOOMS.at(-1) ? ' disabled' : ''} aria-label="Zoom in">+</button>
        </span>
      </div>
      <div class="v3dPane">${svg}</div>
    </section>`;
}

// At 100% the whole picture fits in its box, however tall; zooming in enlarges it from there.
function sizeView3d() {
  for (const pane of document.querySelectorAll('#view3dBody .v3dPane')) {
    const svg = pane.querySelector('svg');
    const aspect = svg.width.baseVal.value / svg.height.baseVal.value;
    const fit = Math.min(pane.clientWidth - 2, (window.innerHeight * 0.6 - 2) * aspect);
    svg.style.width = `${Math.round(fit * view3d[pane.parentNode.dataset.v3d].zoom)}px`;
  }
}

function renderView3d() {
  const body = view3dSection('outside', 'Outside') + view3dSection('floors', 'Floors, walls cut away');
  $('#view3dShow').innerHTML = SHOW_CHOICES.map(([key, label]) => `<label class="check"><input type="checkbox" data-v3d-show="${key}"${view3d.show[key] ? ' checked' : ''}> ${label}</label>`).join('');
  $('#view3dBody').innerHTML = body || '<p class="muted">Draw the outline of the house on the exterior sheet, or some rooms, to see them here.</p>';
}

// One picture drawn again, keeping the middle of what was in sight in the middle.
function redrawView3d(key) {
  const old = $(`#view3dBody [data-v3d="${key}"] .v3dPane`);
  const mid = old && { x: (old.scrollLeft + old.clientWidth / 2) / old.scrollWidth, y: (old.scrollTop + old.clientHeight / 2) / old.scrollHeight };
  const sec = document.createElement('div');
  sec.innerHTML = view3dSection(key, key === 'outside' ? 'Outside' : 'Floors, walls cut away');
  old.parentNode.replaceWith(sec.firstElementChild);
  sizeView3d();
  const pane = $(`#view3dBody [data-v3d="${key}"] .v3dPane`);
  pane.scrollLeft = mid.x * pane.scrollWidth - pane.clientWidth / 2;
  pane.scrollTop = mid.y * pane.scrollHeight - pane.clientHeight / 2;
}

$('#btn3d').addEventListener('click', () => {
  closeMenus();
  renderView3d();
  $('#view3dDialog').showModal();
  sizeView3d();
});

$('#view3dDialog').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v3d-turn], button[data-v3d-zoom]');
  if (!b) return;
  const key = b.closest('[data-v3d]').dataset.v3d;
  const v = view3d[key];
  if (b.dataset.v3dTurn) v.turn = (v.turn + +b.dataset.v3dTurn + 4) % 4;
  else v.zoom = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(v.zoom) + +b.dataset.v3dZoom))];
  redrawView3d(key);
});

$('#view3dShow').addEventListener('change', (e) => {
  const key = e.target.dataset.v3dShow;
  if (!key) return;
  view3d.show[key] = e.target.checked;
  for (const sec of ['outside', 'floors']) if ($(`#view3dBody [data-v3d="${sec}"]`)) redrawView3d(sec);
});

// A mouse drags the picture about once it is zoomed in; a finger scrolls it as any page does.
$('#view3dBody').addEventListener('pointerdown', (e) => {
  const pane = e.target.closest('.v3dPane');
  if (!pane || e.pointerType !== 'mouse' || e.button !== 0) return;
  const start = { x: e.clientX, y: e.clientY, left: pane.scrollLeft, top: pane.scrollTop };
  const move = (m) => {
    pane.scrollLeft = start.left - (m.clientX - start.x);
    pane.scrollTop = start.top - (m.clientY - start.y);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  e.preventDefault();
});
