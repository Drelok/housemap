'use strict';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const snap = (v) => Math.round(v * 2) / 2;
const PER_INCH = 4; // lengths are kept to a quarter of an inch
const fine = (v) => Math.round(v * 12 * PER_INCH) / (12 * PER_INCH); // feet, to that precision
const money = (n) => '$' + Math.round(n || 0).toLocaleString('en-US');
// A phone-sized window, upright or on its side, gets its own layout; a finger gets bigger handles.
const narrowScreen = matchMedia('(max-width: 700px), (max-height: 500px)');
const coarsePointer = matchMedia('(pointer: coarse)');
const slug = (s, fallback) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;

// ---------- feet and inches ----------
// Lengths are stored as decimal feet. People measure, type and read them as feet and inches.

function feetInches(v) {
  const parts = Math.round(v * 12 * PER_INCH);
  return { ft: Math.trunc(parts / (12 * PER_INCH)), in: (parts % (12 * PER_INCH)) / PER_INCH };
}

// Inches to the nearest quarter, the way a tape measure reads: 5.75 -> "5 3/4", 0.5 -> "1/2".
function fmtInches(inches) {
  const parts = Math.round(inches * PER_INCH);
  const whole = Math.trunc(parts / PER_INCH);
  let top = parts % PER_INCH;
  let bottom = PER_INCH;
  while (top && top % 2 === 0) {
    top /= 2;
    bottom /= 2;
  }
  return top ? (whole ? `${whole} ${top}/${bottom}` : `${top}/${bottom}`) : String(whole);
}

// Reads inches typed as "5", "5.75", "5 3/4", "5-3/4" or "3/4".
function parseInches(text) {
  const m = String(text).trim().match(/^(?:(\d+(?:\.\d+)?)(?:[\s-]+|$))?(?:(\d+)\s*\/\s*(\d+))?$/);
  if (!m) return parseFloat(text) || 0;
  return (parseFloat(m[1]) || 0) + (m[2] && +m[3] ? m[2] / m[3] : 0);
}

// 14.479 -> 14' 5 3/4"
function fmtLen(v) {
  const { ft, in: inches } = feetInches(v);
  return inches ? `${ft}' ${fmtInches(inches)}"` : `${ft}'`;
}

// Short lengths read better in inches alone: a 30" door, a 4 1/2" wall.
const fmtShort = (v) => (Math.abs(v) < 4 ? fmtInches(Math.abs(v) * 12) + '"' : fmtLen(v));

// ---------- questions ----------
// In-page replacements for the browser's confirm, prompt and alert boxes, which some browsers
// and embedded views block. ask() resolves to true/false; to the typed text when `input` is
// given; or, with `length`, to a length in feet entered as feet and inches. Cancelling a question
// that takes an answer resolves to null.

function ask(message, { ok = 'OK', cancel = 'Cancel', danger = false, input = null, length = false, detail = '', check = null, choices = null, choice = '' } = {}) {
  return new Promise((resolve) => {
    const d = $('#askDialog');
    const field = $('#askInput');
    $('#askText').textContent = message;
    $('#askDetail').textContent = detail;
    $('#askDetail').hidden = !detail;
    field.hidden = input === null;
    field.value = input ?? '';
    $('#askLength').hidden = !length;
    // An optional tick box or list of choices ([{ value, label }], with `choice` the one that starts
    // out picked); when either is given, a length question resolves to { feet, checked, choice }.
    // A plain question with choices resolves to the value picked, or false if it was cancelled.
    $('#askChoices').hidden = !choices;
    $('#askChoices').innerHTML = (choices || []).map((c) => `<label class="check"><input type="radio" name="askChoice" value="${esc(c.value)}"${c.value === choice ? ' checked' : ''}> ${esc(c.label)}</label>`).join('');
    $('#askCheckRow').hidden = !check;
    $('#askCheckText').textContent = check?.label || '';
    $('#askCheck').checked = !!check?.checked;
    $('#askFeet').value = 0;
    $('#askInches').value = '0';
    $('#askOk').textContent = ok;
    $('#askOk').className = danger ? 'danger solid' : 'primary';
    $('#askCancel').hidden = cancel === null;
    $('#askCancel').textContent = cancel ?? '';
    d.returnValue = '';
    d.onclose = () => {
      const yes = d.returnValue === 'ok';
      const feet = (parseFloat($('#askFeet').value) || 0) + parseInches($('#askInches').value) / 12;
      const picked = $('#askChoices input:checked')?.value;
      if (length) resolve(!yes ? null : check || choices ? { feet, checked: $('#askCheck').checked, choice: picked } : feet);
      else if (choices && input === null) resolve(yes && (picked ?? true));
      else resolve(input === null ? yes : yes ? field.value : null);
    };
    d.showModal();
    if (input !== null) field.select();
    if (length) $('#askFeet').select();
  });
}

const tell = (message) => ask(message, { cancel: null });

// A button with data-close="cancel" closes the dialog it is in with that answer.
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-close]');
  if (b) b.closest('dialog').close(b.dataset.close);
});

// ---------- paths ----------

const dirOf = (p) => p.slice(0, Math.max(0, p.lastIndexOf('/')));
const baseOf = (p) => p.slice(p.lastIndexOf('/') + 1);
const extOf = (name) => (name.match(/\.[^./]+$/) || [''])[0].toLowerCase();
const stemOf = (name) => name.replace(/\.[^./]+$/, '');

// ---------- shapes ----------
// A shape is a rectangle { x, y, w, h } or a polygon { points: [{ x, y }, ...] }, in feet.

const isPoly = (r) => Array.isArray(r.points);

function shapePoints(r) {
  if (isPoly(r)) return r.points;
  return [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
}

// ---------- curved walls ----------
// A corner of a polygon marked `curve: true` is a point its wall bends through instead of a sharp
// corner. The wall on either side of such a point is a smooth curve: a spline through the points,
// drawn as Bezier curves. A wall between two sharp corners is straight.
//
// Through a curve point the wall runs parallel to the line joining the points on either side of
// it. Where a curved wall meets a sharp corner it leaves at the mirror image of that direction,
// so a wall bent through one point comes out as an even arc. Points spaced round a circle give
// very nearly that circle.

const CURVE_STEPS = 16; // straight pieces a curved wall is cut into for measuring
const CURVE_REACH = 0.35; // how far each Bezier handle sits along its wall, as a share of the wall's length
const hasCurves = (r) => isPoly(r) && r.points.some((p) => p.curve);
const isCurvedWall = (pts, i) => !!(pts[i].curve || pts[(i + 1) % pts.length].curve);

// The two Bezier handles of the wall from corner i to the next, or null if it is straight. An
// open run of points, as while a shape is still being drawn, has no wall from its last to its first.
function wallHandles(pts, i, closed = true) {
  const n = pts.length;
  const at = (j) => (closed ? pts[(j + n) % n] : pts[Math.max(0, Math.min(n - 1, j))]);
  const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
  if (!p1.curve && !p2.curve) return null;
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (!len) return null;
  const chord = { x: (p2.x - p1.x) / len, y: (p2.y - p1.y) / len };
  const heading = (a, b) => {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    return d ? { x: (b.x - a.x) / d, y: (b.y - a.y) / d } : chord;
  };
  const mirror = (t) => {
    const along = 2 * (t.x * chord.x + t.y * chord.y);
    return { x: along * chord.x - t.x, y: along * chord.y - t.y };
  };
  const t2 = p2.curve ? heading(p1, p3) : null;
  const t1 = p1.curve ? heading(p0, p2) : mirror(t2);
  const out = t2 || mirror(t1);
  const k = CURVE_REACH * len;
  return [{ x: p1.x + t1.x * k, y: p1.y + t1.y * k }, { x: p2.x - out.x * k, y: p2.y - out.y * k }];
}

// Points along the wall from corner i to the next, both ends included: just the two corners
// for a straight wall.
function wallPoints(pts, i, closed = true) {
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  const h = wallHandles(pts, i, closed);
  if (!h) return [a, b];
  const out = [];
  for (let s = 0; s <= CURVE_STEPS; s++) {
    const t = s / CURVE_STEPS;
    const u = 1 - t;
    const mix = (k) => u * u * u * a[k] + 3 * u * u * t * h[0][k] + 3 * u * t * t * h[1][k] + t * t * t * b[k];
    out.push({ x: mix('x'), y: mix('y') });
  }
  return out;
}

// The outline as the path of an SVG shape.
function outlinePath(pts, closed = true) {
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) {
    const b = pts[(i + 1) % pts.length];
    const h = wallHandles(pts, i, closed);
    d += h ? ` C${h[0].x},${h[0].y} ${h[1].x},${h[1].y} ${b.x},${b.y}` : ` L${b.x},${b.y}`;
  }
  return d + (closed ? ' Z' : '');
}

// The outline of a shape as corners joined by straight lines, with each curved wall cut into
// short pieces. Areas, bounds and what lies inside a shape are all worked out from this, so they
// follow the curves. Remembered until the shape changes.
const outlines = new WeakMap();
function outlinePoints(r) {
  if (!hasCurves(r)) return shapePoints(r);
  const key = r.points.map((p) => `${p.x},${p.y}${p.curve ? 'c' : ''}`).join(' ');
  const known = outlines.get(r);
  if (known?.key === key) return known.pts;
  const pts = r.points.flatMap((_, i) => wallPoints(r.points, i).slice(0, -1));
  outlines.set(r, { key, pts });
  return pts;
}

function shapeArea(r) {
  if (!isPoly(r)) return r.w * r.h;
  const p = outlinePoints(r);
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i].x * q.y - q.x * p[i].y;
  }
  return Math.abs(a) / 2;
}

function shapeBounds(r) {
  const p = outlinePoints(r);
  return {
    x0: Math.min(...p.map((q) => q.x)), y0: Math.min(...p.map((q) => q.y)),
    x1: Math.max(...p.map((q) => q.x)), y1: Math.max(...p.map((q) => q.y)),
  };
}

// Distance from point p to the segment a–b.
function distToSegment(p, a, b) {
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2)) : 0;
  return Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.y - (a.y + (b.y - a.y) * t));
}

function shapeCenter(r) {
  const b = shapeBounds(r);
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
}

// The biggest upright rectangle that fits inside a shape, which is where its name is written. For
// an L-shaped room that is its main part, where the middle of its bounds can fall in a corner or
// outside the room altogether. Worked out on the grid made by the shape's own corners, and
// remembered until the shape changes.
const labelBoxes = new WeakMap();
function labelBox(r) {
  if (!isPoly(r)) return shapeBounds(r);
  const key = pointList(r.points) + r.points.map((p) => (p.curve ? 'c' : '-')).join('');
  const known = labelBoxes.get(r);
  if (known?.key === key) return known.box;
  const xs = [...new Set(r.points.map((p) => p.x))].sort((a, b) => a - b);
  const ys = [...new Set(r.points.map((p) => p.y))].sort((a, b) => a - b);
  // How many cells in a row, counting leftward from each cell, lie inside the shape.
  const run = ys.slice(1).map((y, j) => {
    let n = 0;
    return xs.slice(1).map((x, i) => (n = shapeContains(r, { x: (xs[i] + x) / 2, y: (ys[j] + y) / 2 }) ? n + 1 : 0));
  });
  let box = shapeBounds(r);
  let best = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      // Rectangles whose right edge is this column, growing downward from row j.
      let wide = Infinity;
      for (let k = j; k < ys.length - 1 && run[k][i]; k++) {
        wide = Math.min(wide, run[k][i]);
        const area = (xs[i + 1] - xs[i + 1 - wide]) * (ys[k + 1] - ys[j]);
        if (area > best) {
          best = area;
          box = { x0: xs[i + 1 - wide], y0: ys[j], x1: xs[i + 1], y1: ys[k + 1] };
        }
      }
    }
  }
  labelBoxes.set(r, { key, box });
  return box;
}

const isSquareCornered = (r) => !hasCurves(r) && shapePoints(r).every((a, i, p) => {
  const b = p[(i + 1) % p.length];
  return a.x === b.x || a.y === b.y;
});

// ---------- combining shapes ----------

const TINY = 1e-9;
const pointKey = (p) => Math.round(p.x * 1e6) + ',' + Math.round(p.y * 1e6);
const midpoint = ([a, b]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function onOutline(points, p) {
  return points.some((a, i) => {
    const b = points[(i + 1) % points.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const along = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    return Math.abs(cross) < 1e-7 && along > -1e-7 && along < len2 + 1e-7;
  });
}

// Where along a→b (0 to 1, ends excluded) the segment c→d crosses it, or starts or stops lying on it.
function cutsOn(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const q = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * q.y - r.y * q.x;
  const cuts = [];
  if (Math.abs(den) < TINY) {
    if (Math.abs((c.x - a.x) * r.y - (c.y - a.y) * r.x) > 1e-7) return cuts; // parallel, apart
    const len2 = r.x * r.x + r.y * r.y;
    for (const e of [c, d]) cuts.push(((e.x - a.x) * r.x + (e.y - a.y) * r.y) / len2);
  } else {
    const w = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
    if (w > -TINY && w < 1 + TINY) cuts.push(((c.x - a.x) * q.y - (c.y - a.y) * q.x) / den);
  }
  return cuts.filter((t) => t > TINY && t < 1 - TINY);
}

// Joins `seed` with every shape in `others` that overlaps it or shares part of an edge with it,
// directly or through another shape. Returns the outline of the joined area and the shapes that
// went into it, or null if no clean outline could be found.
//
// Every edge is cut wherever another shape's edge meets it. A piece is part of the new outline
// when the joined area lies on exactly one side of it; pieces buried inside are dropped.
function mergeShapes(seed, others, tol = 0) {
  // Which shapes join is decided from the shapes exactly as drawn. The tidy-up below only applies
  // among those, so it can never close a gap that was left on purpose.
  if (tol) {
    const touching = mergeShapes(seed, others);
    if (!touching) return null;
    others = touching.used;
  }
  const sources = [seed, ...others];

  // Square-cornered shapes with edges within `tol` of each other are first pulled onto one line,
  // the seed's own where it has one, so corners that nearly meet do not leave a tiny step.
  const square = sources.filter(isSquareCornered);
  const lines = (k) => {
    const own = new Set(square.includes(seed) ? shapePoints(seed).map((p) => p[k]) : []);
    const vals = [...new Set(square.flatMap((r) => shapePoints(r).map((p) => p[k])))].sort((a, b) => a - b);
    const to = new Map();
    for (let i = 0; i < vals.length;) {
      let j = i;
      while (j < vals.length && vals[j] - vals[i] <= tol) j++;
      const group = vals.slice(i, j);
      const keep = group.find((v) => own.has(v)) ?? group[0];
      for (const v of group) to.set(v, keep);
      i = j;
    }
    return to;
  };
  const mx = lines('x');
  const my = lines('y');
  // A curved wall goes in as the short straight pieces it is measured by.
  const polys = sources.map((r) => outlinePoints(r).map((p) => (square.includes(r) ? { x: mx.get(p.x), y: my.get(p.y) } : { x: p.x, y: p.y })));

  const edges = polys.map((pts) => pts.map((a, i) => [a, pts[(i + 1) % pts.length]])
    .filter(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y) > TINY));
  const pieces = edges.map((own, i) => own.flatMap(([a, b]) => {
    const ts = [0, 1];
    edges.forEach((other, j) => {
      if (j !== i) for (const [c, d] of other) ts.push(...cutsOn(a, b, c, d));
    });
    ts.sort((m, n) => m - n);
    const at = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    const out = [];
    for (let n = 1; n < ts.length; n++) if (ts[n] - ts[n - 1] > TINY) out.push([at(ts[n - 1]), at(ts[n])]);
    return out;
  }));

  // Two shapes join if a piece of one runs inside the other or along its outline. Meeting at a
  // single point is not enough.
  const meets = (i, j) => pieces[i].some((e) => onOutline(polys[j], midpoint(e)) || shapeContains({ points: polys[j] }, midpoint(e)));
  const joined = new Set([0]);
  const todo = [0];
  while (todo.length) {
    const i = todo.pop();
    polys.forEach((_, j) => {
      if (joined.has(j) || !(meets(i, j) || meets(j, i))) return;
      joined.add(j);
      todo.push(j);
    });
  }

  const inUnion = (p) => [...joined].some((i) => shapeContains({ points: polys[i] }, p));
  const from = new Map(); // corner -> outline pieces leaving it, each walked with the area on its left
  const seen = new Set();
  for (const i of joined) {
    for (const [a, b] of pieces[i]) {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const n = { x: (-(b.y - a.y) / len) * 1e-4, y: ((b.x - a.x) / len) * 1e-4 };
      const m = midpoint([a, b]);
      const left = inUnion({ x: m.x + n.x, y: m.y + n.y });
      if (left === inUnion({ x: m.x - n.x, y: m.y - n.y })) continue;
      const [p, q] = left ? [a, b] : [b, a];
      const id = pointKey(p) + '>' + pointKey(q);
      if (seen.has(id)) continue; // two shapes sharing this stretch of outline
      seen.add(id);
      from.set(pointKey(p), [...(from.get(pointKey(p)) || []), { p, q }]);
    }
  }

  let best = [];
  for (const [start, list] of from) {
    while (list.length) {
      const loop = [];
      for (let e = list.pop(); ; e = from.get(pointKey(e.q))?.pop()) {
        if (!e || loop.length > 10000) return null;
        loop.push(e.p);
        if (pointKey(e.q) === start) break;
      }
      // An enclosed gap gives a second, smaller loop; the outer one is the outline.
      if (shapeArea({ points: loop }) > shapeArea({ points: best })) best = loop;
    }
  }
  if (best.length < 3) return null;

  const points = best.filter((p, i) => {
    const a = best[(i + best.length - 1) % best.length];
    const b = best[(i + 1) % best.length];
    return Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > 1e-7;
  }).map((p) => ({ x: fine(p.x), y: fine(p.y) }));
  return { points, used: sources.filter((_, n) => n > 0 && joined.has(n)) };
}

function shapeContains(r, pt) {
  const p = outlinePoints(r);
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i];
    const b = p[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
