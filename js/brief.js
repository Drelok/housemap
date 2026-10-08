'use strict';

// "Export for AI": the project as something an AI assistant can read without decoding the plan
// file. One zip holding a plain-text brief, which says in words where each issue is and what is
// above and below it, a small copy of each issue's photos named after the issue, a picture of
// each sheet, and the issue list as a table.
//
// Everything here is read through the same helpers the Issues sheet and the printed report use
// (issueCost, quotesOf, shotsOf, issueRoom), so the brief cannot say something different.

const AI_PHOTO_EDGE = 1600; // pixels along the long edge of an exported photo
const AI_PLAN_WIDTH = 1600; // pixels across an exported picture of a sheet
// The sheet is drawn as for a page this many pixels across and then enlarged, so that room names
// and the numbers on the pins come out large enough to read in the picture.
const AI_PLAN_DRAWN = 900;
const AI_PLAN_ASPECT = 0.7;
const AI_SPOT_WIDTH = 24; // feet across a close-up of the plan around an issue's pin
const AI_SPOT_PIXELS = 900; // pixels across that picture
const NEAR_FIXTURE = 4; // feet within which a fixture is worth naming beside an issue

// ---------- directions in words ----------
// `plan.north` is the way north points on the sheets, in degrees clockwise from the top. Until
// it has been set, directions are given by the sheet itself: top, right, bottom, left.

const WINDS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const SHEET_WAYS = ['top', 'top right', 'right', 'bottom right', 'bottom', 'bottom left', 'left', 'top left'];
const NORTH_CHOICES = [['', 'Not set'], ...SHEET_WAYS.map((w, n) => [String(n * 45), `The ${w} of the plan`])];

const northSet = () => plan.north != null && plan.north !== '';
const bearingOf = (dx, dy) => (Math.atan2(dx, -dy) * 180) / Math.PI; // of a line on the sheet, clockwise from the top
function wayWord(bearing) {
  const turned = bearing - (northSet() ? +plan.north : 0);
  return (northSet() ? WINDS : SHEET_WAYS)[Math.round((((turned % 360) + 360) % 360) / 45) % 8];
}
const wallWord = (bearing) => (northSet() ? `the ${wayWord(bearing)} wall` : `the wall toward the ${wayWord(bearing)} of the plan`);
const facingWord = (bearing) => (northSet() ? wayWord(bearing) : `toward the ${wayWord(bearing)} of the plan`);
const about = (feet) => fmtLen(Math.max(0.25, Math.round(feet * 4) / 4)); // to the nearest 3 inches

// ---------- where something is ----------

const roomAt = (f, p) => [...(f?.rooms || [])].reverse().find((r) => shapeContains(r, p));
const floorLevels = () => plan.floors.filter((f) => f.kind === 'floor'); // from the lowest up

function nearestOnSegment(p, a, b) {
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2)) : 0;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// The wall of a room nearest a point, as "2' 3" from the north wall".
function nearestWall(r, p) {
  const pts = outlinePoints(r);
  let best = null;
  for (let n = 0; n < pts.length; n++) {
    const q = nearestOnSegment(p, pts[n], pts[(n + 1) % pts.length]);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (!best || d < best.d) best = { d, q };
  }
  // The wall lies the way you would walk to reach it. Right on the wall, that is away from the middle.
  const from = best.d > 0.05 ? p : shapeCenter(r);
  const wall = wallWord(bearingOf(best.q.x - from.x, best.q.y - from.y));
  return best.d < 0.25 ? `on ${wall}` : `${about(best.d)} from ${wall}`;
}

// A spot in a wall, said by the room or rooms the wall belongs to: "in the wall between Kitchen and
// Living room", or "in the north wall of Kitchen" for a wall with one room beside it. Empty for a
// spot that is not in a wall.
function wallWords(f, p) {
  const [a, b] = wallRooms(f, p);
  if (!a) return '';
  if (b) return `in the wall between ${roomTitle(a)} and ${roomTitle(b)}`;
  // Which wall: the way from the wall out to the spot, which is outside the room.
  const pts = outlinePoints(a);
  const q = pts.map((v, n) => nearestOnSegment(p, v, pts[(n + 1) % pts.length])).sort((m, n) => Math.hypot(m.x - p.x, m.y - p.y) - Math.hypot(n.x - p.x, n.y - p.y))[0];
  const way = wayWord(bearingOf(p.x - q.x, p.y - q.y));
  return northSet() ? `in the ${way} wall of ${roomTitle(a)}` : `in the wall of ${roomTitle(a)} toward the ${way} of the plan`;
}

// Which part of its floor a room is in, going by where its middle sits among all the rooms.
function roomPart(f, r) {
  const rooms = f.rooms.filter((x) => !x.separate);
  if (rooms.length < 3 || r.separate) return '';
  const b = rooms.map(shapeBounds).reduce((a, c) => ({ x0: Math.min(a.x0, c.x0), y0: Math.min(a.y0, c.y0), x1: Math.max(a.x1, c.x1), y1: Math.max(a.y1, c.y1) }));
  const c = shapeCenter(r);
  const dx = (c.x - (b.x0 + b.x1) / 2) / ((b.x1 - b.x0) / 2 || 1);
  const dy = (c.y - (b.y0 + b.y1) / 2) / ((b.y1 - b.y0) / 2 || 1);
  if (Math.hypot(dx, dy) < 0.3) return 'middle of the floor';
  return northSet() ? `${wayWord(bearingOf(dx, dy))} side of the floor` : `${wayWord(bearingOf(dx, dy))} of the plan`;
}

const itemName = (it) => (isStairs(it) ? 'the stairs' : `the ${(itemKind(it.kind)?.label || 'fixture of no chosen type').toLowerCase()}`) + (it.note ? ` (${it.note})` : '');
const itemMiddle = (it) => (isStairs(it) ? stairMiddle(it) : { x: it.x + it.w / 2, y: it.y + it.h / 2 });

// How far a point is from the edge of a fixture or a staircase, roughly: nothing when it is on it.
function itemGap(it, p) {
  if (isStairs(it)) {
    const legs = it.points.slice(1).map((b, n) => distToSegment(p, it.points[n], b));
    return Math.max(0, Math.min(...legs) - it.w / 2);
  }
  const c = itemMiddle(it);
  return Math.max(0, Math.hypot(p.x - c.x, p.y - c.y) - Math.min(it.w, it.h) / 2);
}

// Fixtures of one kind are counted together where they are listed, as a run of counter pieces is:
// "3 counters or islands, the kitchen sink". One with a note of its own is listed by itself.
const pluralWord = (w) => w + (/(s|sh|ch|x)$/.test(w) ? 'es' : 's');
function pluralName(it) {
  if (isStairs(it)) return 'staircases';
  const label = itemKind(it.kind)?.label;
  if (!label) return 'fixtures of no chosen type';
  return label.toLowerCase().split(' or ').map((part) => part.replace(/\w+$/, pluralWord)).join(' or ');
}
function itemsWords(items) {
  const groups = new Map();
  for (const it of items) {
    const key = it.note ? it.id : isStairs(it) ? 'stairs' : it.kind || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  return [...groups.values()].map((g) => (g.length === 1 ? itemName(g[0]) : `${g.length} ${pluralName(g[0])}`)).join(', ');
}

// The fixtures and stairs close to a point on a floor, nearest first: "at the bathtub", "about 2' from the toilet".
// Only the nearest of each kind is given, so a pin beside a run of counter pieces is not "at the
// counter; at the counter; about 1' from the counter".
function itemsNear(f, p) {
  const seen = new Set();
  return (f?.items || []).map((it) => ({ it, d: itemGap(it, p) })).filter((v) => v.d <= NEAR_FIXTURE).sort((a, b) => a.d - b.d)
    .filter(({ it }) => {
      const key = it.note ? it.id : isStairs(it) ? 'stairs' : it.kind || '';
      return !seen.has(key) && seen.add(key);
    }).slice(0, 3)
    .map(({ it, d }) => (d < 0.25 ? `${isStairs(it) ? 'on' : 'at'} ${itemName(it)}` : `about ${about(d)} from ${itemName(it)}`));
}

// A spot on a sheet in words: its room, the nearest wall of that room and anything standing close by.
function spotWords(f, p) {
  const r = roomAt(f, p);
  const parts = [];
  if (r) {
    const part = f.kind === 'floor' ? roomPart(f, r) : '';
    parts.push(`${roomTitle(r)}${part ? ` (${part})` : ''}`, nearestWall(r, p));
  } else if (wallRooms(f, p).length) {
    parts.push(wallWords(f, p));
  } else if (f.rooms.length) {
    // Not in anything drawn: said by the nearest thing that is.
    const near = f.rooms.map((x) => ({ x, d: Math.min(...outlinePoints(x).map((a, n, pts) => distToSegment(p, a, pts[(n + 1) % pts.length]))) })).sort((a, b) => a.d - b.d)[0];
    const c = shapeCenter(near.x);
    parts.push(`${f.kind === 'exterior' ? 'outside' : 'not inside a room that has been drawn'}, ${about(near.d)} from ${near.x.name}, on its ${wayWord(bearingOf(p.x - c.x, p.y - c.y))} side`);
  } else {
    parts.push('nothing is drawn on this sheet yet');
  }
  return [...parts, ...itemsNear(f, p)].join('; ');
}

// What is at the same spot on the other floors. Every sheet uses the same measurements, so the
// same x and y on another floor is the place straight above or below.
function stackWords(i) {
  if (!pinned(i)) return [];
  const f = issueFloor(i);
  // A floor with nothing drawn on it says nothing about what is above or below, and may be a sheet
  // made for a floor the house does not have, so it is left out.
  const levels = floorLevels().filter((g) => g === f || g.rooms.length);
  const at = levels.indexOf(f);
  const line = (g) => {
    const r = roomAt(g, i);
    const where = r ? roomTitle(r) : wallWords(g, i);
    return where ? [where, ...itemsNear(g, i)].join('; ') : 'no room is drawn at this spot';
  };
  // On the exterior sheet an issue has no floor of its own; if it is over the house, every floor is listed.
  if (at < 0) return levels.filter((g) => roomAt(g, i)).map((g) => [`At this spot inside the house, on ${g.name}`, line(g)]);
  return [
    ...levels.slice(at + 1).map((g) => [`Above, on ${g.name}`, line(g)]),
    ...levels.slice(0, at).reverse().map((g) => [`Below, on ${g.name}`, line(g)]),
  ];
}

function issueWhere(i) {
  const f = issueFloor(i);
  if (!pinned(i)) return f ? `the whole of ${f.name}; it is not tied to one spot` : 'the whole house; it is not tied to one spot';
  return `${f.name}: ${spotWords(f, i)}`;
}

// ---------- the issue list as a table ----------

const issueShots = (i) => i.photoIds.map((id) => plan.photos.find((p) => p.id === id)).filter(Boolean)
  .flatMap((ph) => shotsOf(ph).filter((s) => s.file).map((shot) => ({ ph, shot })));

// The same table whether it is downloaded on its own or packed with the brief. `photoNames` gives
// the names the photos have in the export; without it they are listed by where they are filed.
function issuesCsv(issues = plan.issues, photoNames = null) {
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = [['#', 'Floor', 'Room', 'Where', 'Title', 'Category', 'Status', 'My estimate low', 'My estimate high', 'Estimate from', 'Accepted quote', 'Added', 'Done on', 'Must be done after', 'How soon', 'Trade', 'May be connected to', 'Description', ...ISSUE_MORE.map(([, label]) => label), 'Photo', 'Quotes', 'AI notes']];
  for (const i of issues) {
    const f = issueFloor(i);
    const photos = issueShots(i).map(({ shot }) => photoNames?.get(i.id + shot.id) || shot.file);
    rows.push([issueNum(i), issuePlace(i), issueRoom(i)?.name || '', pinned(i) ? spotWords(f, i) : '', i.title, cat(i.category).label, i.status, i.costLow, i.costHigh, ownEstimate(i).priced ? sourceWords(i) : '', issueCost(i).quoted ? issueCost(i).low : '',
      i.added || '', i.status === 'Done' ? i.doneOn || '' : '', afterOf(i).map(issueNum).join('; '), whenWords(i), i.trade || '', relatedOf(i).map(issueNum).join('; '), i.description, ...ISSUE_MORE.map((m) => moreAnswer(i, m)), [...photos, i.photo].filter(Boolean).join('; '), quotesOf(i).map(quoteLine).join('; '), i.aiNotes || '']);
  }
  return rows.map((r) => r.map(q).join(',')).join('\r\n');
}

// ---------- the brief ----------

const CAT_MEANS = {
  safety: 'a hazard to people, or something doing damage right now',
  major: 'a significant repair that should not wait long',
  minor: 'a small repair that can be planned for',
  cosmetic: 'looks only; nothing gets worse if it waits',
  preference: 'not a fault: something the owner would like changed or improved',
};
const sourceWords = (i) => (i.costSource === 'ai' ? 'a figure from an AI assistant' : 'the owner’s own guess');
// The answer to one of the fixed questions, in words.
const moreAnswer = (i, [key, , kind]) => (Array.isArray(kind) ? kind.find(([v]) => v === i[key])?.[1] : i[key]) || '';
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
const lines = (text) => String(text).trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' / '); // typed text kept to one line of a list

function quoteWords(q, withContacts) {
  const expired = q.validUntil && q.validUntil < today() && q.status !== 'Accepted';
  const facts = [
    `**${quoteName(q)}**: ${money(q.amount)}, ${(q.status || 'Received').toLowerCase()}`,
    q.date && `dated ${q.date}`,
    q.validUntil && `valid until ${q.validUntil}${expired ? ' (expired)' : ''}`,
    q.number && `quote number ${q.number}`,
    q.deposit && `deposit ${money(q.deposit)}`,
    q.timeline && `start and duration: ${lines(q.timeline)}`,
    q.warranty && `warranty: ${lines(q.warranty)}`,
    q.scope && `includes: ${lines(q.scope)}`,
    q.notes && `notes: ${lines(q.notes)}`,
    q.rating && `the owner's rating of the company: ${q.rating} of 5`,
    q.review && `how it went, in the owner's words: ${lines(q.review)}`,
    q.doc && `file: ${baseOf(q.doc)}`,
    ...(withContacts ? [q.contact && `contact: ${q.contact}`, q.phone && `phone ${q.phone}`, q.email && `email ${q.email}`, q.address && `address or website: ${q.address}`, q.license && `license or insurance ${q.license}`] : []),
  ];
  return facts.filter(Boolean).join('; ');
}

function photoWords(ph, shot) {
  const f = plan.floors.find((x) => x.id === ph.floorId);
  const r = f?.rooms.find((x) => x.id === ph.roomId);
  const where = [f?.name, r ? roomTitle(r) : f?.kind === 'exterior' ? 'outside' : 'not in a room'].filter(Boolean).join(', ');
  return `taken on ${where}, facing ${facingWord(shot.dir)}${shot.taken ? `, on ${dateWords(shot.taken)}` : ''}${ph.note ? `. Note: ${lines(ph.note)}` : ''}`;
}

// What is asked for when the owner wants style ideas. With no photos of the outside, the assistant
// has only the plan and the 3D view to go on, and is told so.
function styleRequest() {
  const outside = plan.photos.some((ph) => plan.floors.find((f) => f.id === ph.floorId)?.kind === 'exterior' && shotsOf(ph).some((s) => s.file));
  return `## Style ideas

The owner would like ideas for how the house could look. Going by the plans and the 3D views (the footprint, how many floors there are, and where the windows and doors are), suggest:

- **three exterior styles** that would suit a house of this shape, each in a few sentences: roof shape, siding and trim, colours, windows and doors, porch or entry, and roughly what it would take to get there from what is there now;
- **two or three interior styles** for the main rooms, such as the kitchen, living room and bathrooms: floors, walls, cabinets and fixtures, lighting and colours, keeping to the rooms as they are laid out.

${outside ? 'There are photos of the outside among the photos; build on what is there.' : 'There are no photos of the outside, so work from the plan, the 3D view of the outside and the aerial picture, if there is one, and say what you have assumed.'} If you can make pictures, make one for each style, drawn to match this house's footprint and layout. Put a short version of the styles in \`styles\` in the review data block (see *Sending your review back*).`;
}

// How soon an issue should be dealt with, in words.
const whenWords = (i) => (i.when ? WHEN_CHOICES.find(([v]) => v === i.when)?.[1] || i.when : '');

// Another issue, named in passing: "issue 27 (Roof inspection)", with "done" where it is.
const issueRef = (x) => `issue ${issueNum(x)} (${x.title || 'Untitled'}${x.status === 'Done' ? ', done' : ''})`;

// The follow-up questions on an issue, in a few words each, for saying which were left unanswered.
const MORE_SHORT = { started: 'when it started', frequency: 'how often it happens', worse: 'whether it is getting worse', tried: 'what has been tried', who: 'who would do the work' };

function issueBlock(i, o) {
  const cost = issueCost(i);
  const accepted = quotesOf(i).filter((q) => q.status === 'Accepted').map(quoteName).join(' and ');
  const out = [
    `### Issue ${issueNum(i)}: ${i.title || 'Untitled'}`,
    '',
    `- **Category:** ${cat(i.category).label}`,
    `- **Status:** ${i.status}${i.status === 'Done' && i.doneOn ? `, marked done on ${dateWords(i.doneOn)}` : ''}`,
    ...(i.added ? [`- **Added to the list:** ${dateWords(i.added)}`] : []),
    ...(afterOf(i).length ? [`- **Must be done after:** ${afterOf(i).map(issueRef).join(', ')}`] : []),
    ...(waitingFor(i).length ? [`- **Waiting for this one:** ${waitingFor(i).map(issueRef).join(', ')}`] : []),
    ...(i.when ? [`- **How soon:** ${whenWords(i)}`] : []),
    ...(i.trade ? [`- **Trade:** ${i.trade}`] : []),
    ...(relatedOf(i).length ? [`- **May be connected to:** ${relatedOf(i).map(issueRef).join(', ')}`] : []),
    `- **Where:** ${issueWhere(i)}`,
    ...stackWords(i).map(([label, text]) => `- **${label}:** ${text}`),
  ];
  if (i.description) out.push(`- **Description:** ${lines(i.description)}`);
  // The answered follow-up questions each get a line; the rest are named together on one, so that
  // a brief of many issues is not mostly "not answered".
  const unasked = ISSUE_MORE.filter((m) => !moreAnswer(i, m));
  for (const m of ISSUE_MORE) if (moreAnswer(i, m)) out.push(`- **${m[1]}** ${lines(moreAnswer(i, m))}`);
  if (unasked.length === ISSUE_MORE.length) out.push('- **Follow-up questions:** none answered');
  else if (unasked.length) out.push(`- **Not answered:** ${unasked.map((m) => MORE_SHORT[m[0]]).join(', ')}`);
  if (i.photo) out.push(`- **Photo note:** ${lines(i.photo)}`);
  if (i.aiNotes) out.push(`- **Notes from an earlier AI review:** ${lines(i.aiNotes)}`);
  out.push(`- **Cost that counts:** ${cost.quoted ? `accepted quote ${money(cost.low)} (${accepted})` : unpriced(i) ? 'not priced' : `my estimate ${estimateText(i)} (${sourceWords(i)})`}`);
  if (cost.quoted) out.push(`- **My own estimate, before the quote:** ${ownEstimate(i).priced ? `${estimateText(i)} (${sourceWords(i)})` : 'none entered'}`);
  if (quotesOf(i).length) out.push('- **Professional quotes:**', ...quotesOf(i).map((q) => `  - ${quoteWords(q, o.contacts)}`));
  const shots = issueShots(i);
  const waiting = i.photoIds.map((id) => plan.photos.find((p) => p.id === id)).filter((ph) => ph && !ph.file).length;
  if (shots.length || waiting) {
    out.push('- **Photos:**', ...shots.map(({ ph, shot }) => {
      const name = o.photoNames.get(i.id + shot.id);
      const phase = i.status === 'Done' ? `${shotPhase(i, shot) === 'after' ? 'after' : 'before'} the work, ` : '';
      return `  - ${name ? `\`${name}\`` : `(${baseOf(shot.file)}, left out: not a kind of picture that could be made smaller)`}: ${phase}${photoWords(ph, shot)}`;
    }));
    if (waiting) out.push(`  - ${waiting === 1 ? 'One more photo is' : `${waiting} more photos are`} planned for this issue but not taken yet.`);
  } else {
    out.push('- **Photos:** none');
    const spot = o.spotNames?.get(i.id);
    if (spot) out.push(`- **Close-up of the plan:** \`${spot}\`, the plan for ${AI_SPOT_WIDTH / 2} ft around its pin, which is shown selected, with a dark ring`);
  }
  return out.join('\n');
}

// A room's windows and doors to the outside, wall by wall, those alike counted together:
// "in the north wall, 2 windows; in the east wall, an egress window with a well (sill 3' 8")".
function openingsWords(f, r) {
  const walls = new Map(); // wall -> Map(what -> count)
  for (const o of f.openings) {
    if (o.kind !== 'window' && o.kind !== 'exterior') continue;
    const side = openingSides(o, f).indexOf(r);
    if (side < 0) continue;
    // The wall lies away from the room, across the line of the wall.
    const g = side === 0 ? 1 : -1;
    const wall = wallWord(o.along === 'x' ? bearingOf(0, g) : bearingOf(g, 0));
    let what;
    if (o.kind === 'window') {
      const k = windowKind(o.style);
      const extra = [o.style === 'egress' && `sill ${fmtShort(o.sill ?? k.sill)}`, o.note].filter(Boolean).join('; ');
      what = `${k.short}${o.well ? ' with a well' : ''}${extra ? ` (${extra})` : ''}`;
    } else {
      what = `door to the outside${o.onto === 'stairwell' ? ' onto steps up to the yard' : o.onto === 'grade' ? ' onto level ground (a walk-out)' : ''}`;
    }
    if (!walls.has(wall)) walls.set(wall, new Map());
    walls.get(wall).set(what, (walls.get(wall).get(what) || 0) + 1);
  }
  const counted = (what, n) => (n === 1 ? `${/^[aeiou]/.test(what) ? 'an' : 'a'} ${what}` : `${n} ${what.replace(/(window|door)/, '$1s')}`);
  return [...walls].map(([wall, kinds]) => `in ${wall}, ${[...kinds].map(([what, n]) => counted(what, n)).join(' and ')}`).join('; ');
}

function houseWords() {
  const out = [`- **Name:** ${plan.name}`];
  if (plan.address) out.push(`- **Address:** ${plan.address}`);
  // Listings and appraisals give the floors above ground and a finished basement separately, so
  // the brief does too.
  if (plan.floors.some((f) => f.basement)) {
    out.push(`- **Above ground:** ${sqft(aboveArea())} (the floors above ground, as drawn)`);
    out.push(`- **Finished basement:** ${sqft(finishedBasementArea())}${unfinishedBasementArea() ? `; the rest of the basement, ${sqft(unfinishedBasementArea())}, is unfinished` : ''}`);
    out.push(`- **Total of the two:** ${sqft(houseArea())}. Listings and appraisals usually give the two figures separately rather than this total.`);
  } else {
    out.push(`- **Total house area:** ${sqft(houseArea())} (the floors above ground, as drawn)`);
  }
  const size = (r) => (isPoly(r) ? sqft(shapeArea(r)) : `${fmtLen(r.w)} by ${fmtLen(r.h)}, ${sqft(shapeArea(r))}`);
  for (const f of plan.floors) {
    if (!f.rooms.length && !f.items.length) continue;
    out.push('', `### ${f.name}${f.basement ? ' (basement)' : f.kind === 'exterior' ? ' (the lot and the outline of the house)' : ''}`, '');
    if (f.kind === 'floor') out.push(`Floor area ${sqft(floorArea(f))}.`, '');
    const names = f.rooms.map((r) => roomTitle(r));
    for (const r of f.rooms) {
      const inside = f.items.filter((it) => roomAt(f, itemMiddle(it)) === r);
      const notes = [
        size(r),
        f.kind === 'floor' && roomPart(f, r),
        r.level && `floor is ${levelText(r)}`,
        f.kind === 'floor' && r.cover && `floor covering: ${FLOOR_COVERS.find(([v]) => v === r.cover)?.[1].toLowerCase() || r.cover}`,
        f.kind === 'floor' && r.walls && `walls: ${choiceWords(WALL_FINISHES, r.walls).toLowerCase()}`,
        f.kind === 'floor' && (r.paint || r.sheen) && `paint: ${[r.paint, r.sheen && choiceWords(SHEENS, r.sheen).toLowerCase()].filter(Boolean).join(', ')}`,
        f.kind === 'floor' && r.trim && `trim: ${r.trim}`,
        f.kind === 'floor' && r.ceilingFinish && `ceiling: ${choiceWords(CEILING_FINISHES, r.ceilingFinish).toLowerCase()}`,
        f.kind === 'floor' && `ceiling ${fmtLen(roomCeiling(r))} high, walls about ${Math.round(wallArea(r))} sq ft`,
        f.basement && (r.finished ? 'finished' : 'unfinished'),
        r.separate && 'separate structure, not part of the house',
        inside.length && `holds ${itemsWords(inside)}`,
        openingsWords(f, r),
      ].filter(Boolean);
      // Two rooms of one name are told apart by their place in the list.
      const twin = names.filter((n) => n === roomTitle(r)).length > 1 ? ` (${names.slice(0, f.rooms.indexOf(r) + 1).filter((n) => n === roomTitle(r)).length} of ${names.filter((n) => n === roomTitle(r)).length} with this name)` : '';
      out.push(`- **${roomTitle(r)}**${twin}: ${notes.join('; ')}`);
    }
    for (const it of f.items.filter(isStairs)) {
      const to = plan.floors.find((x) => x.id === it.to);
      out.push(`- Stairs ${it.dir === 'down' ? 'down' : 'up'}${to ? ` to ${to.name}` : ''}${roomAt(f, stairMiddle(it)) ? `, in ${roomTitle(roomAt(f, stairMiddle(it)))}` : ''}`);
    }
  }
  const systems = applianceWords();
  if (systems) out.push('', '### Appliances and systems', '', systems);
  return out.join('\n');
}

// Every appliance and system drawn, with its make, model and age where they are known, and said
// to be unknown where not, as that is worth asking about.
function applianceWords() {
  const lines = [];
  for (const f of plan.floors) {
    for (const it of f.items) {
      const k = itemKind(it.kind);
      if (!k?.record) continue;
      const r = roomAt(f, itemMiddle(it));
      const make = [it.brand, it.model && `model ${it.model}`, it.serial && `serial ${it.serial}`].filter(Boolean).join(', ');
      const facts = [
        make || 'make and model not recorded',
        it.installed ? `installed ${yearWords(it.installed)}` : 'age not recorded',
        it.warranty && `warranty: ${it.warranty}`,
        it.note,
      ].filter(Boolean).join('; ');
      lines.push(`- **${k.label}** (${f.name}${r ? `, ${roomTitle(r)}` : ''}): ${facts}`);
    }
  }
  return lines.join('\n');
}

// The whole brief as Markdown. `o` is what was ticked in the export window, with `issues`, the
// issues being sent, and `photoNames`, the name each photo has in the export.
function briefText(o) {
  const open = o.issues.filter((i) => i.status !== 'Done');
  const blank = open.filter(unpriced).length;
  const priced = open.filter((i) => !unpriced(i));
  const totals = CATS.map((c) => [c, open.filter((i) => i.category === c.id)]).filter(([, g]) => g.length)
    .map(([c, g]) => (g.every(unpriced) ? `| ${c.label} | ${g.length} | not priced | not priced |` : `| ${c.label} | ${g.length} | ${money(costLow(g))} | ${money(costHigh(g))} |`));
  const other = o.otherPhotos.map(({ ph, shot, name }) => `- \`${name}\`: ${photoWords(ph, shot)}`);
  return `# ${plan.name}: a brief of the house and its issues

Written by House Map & Issue Tracker on ${today()} from the owner's own plan of the house. Read this file first.

## How to read this

- **Lengths** are in feet and inches. Everything is approximate: the plan was drawn by the owner with a tape measure, and is not an architectural drawing or a survey.
- **Directions:** ${northSet() ? `north, south, east and west are true to the house. On the plan pictures, north points to the ${SHEET_WAYS[Math.round(+plan.north / 45) % 8]}.` : 'the owner has not said which way north is, so places are given by the plan itself: top, bottom, left and right, as the plan pictures are drawn. Ask which way the house faces if it matters, as it does for weather and drainage.'}
- **Floors** are listed from the lowest up. Every floor is drawn to the same measurements, one above the other, so "above" and "below" an issue mean the same spot on another floor. That matters most for leaks.
- **Issue numbers** are the numbers on the pins in the plan pictures${o.plans ? ', in the `plans` folder' : ''}. A number stays with its issue for good, so gaps in the numbering are issues that were deleted. An issue about a whole floor or the whole house, such as the roof or the wiring, has no pin.
- **Categories:** ${CATS.map((c) => `*${c.label}*: ${CAT_MEANS[c.id]}`).join('. ')}.
- **Follow-up questions:** each issue can answer ${ISSUE_MORE.map((m) => `"${m[1]}"`).join(', ')}. The answers given are listed under each issue, and the rest are named as not answered.
- **Status** is Open, In progress or Done.${o.done ? '' : ' Issues marked Done are left out of this brief.'}
- **Order:** *Must be done after* names the issues the owner says have to be done before an issue can be, such as the roof before the ceiling under it, and *Waiting for this one* names those that wait for it in turn. Follow them to put the work in order; where there are none, the order is open.
- **Costs** are in US dollars. *My estimate* is a low and a high figure, marked as the owner's own rough guess or as a figure an AI assistant gave earlier. A professional quote that has been accepted replaces it. "Not priced" means nobody has put a figure on it yet; it does not mean it is free.
${o.views3d?.length ? `- **3D views:** ${o.views3d.map((n) => `\`${n}\``).join(' and ')} are drawn from the plan as seen from above at an angle, with no perspective: ${o.views3d.includes('plans/3d-outside.png') ? 'the outside is the house outline raised to the height of its floors, with flat tops as the roof is not drawn, and the windows (blue) and outside doors (brown) of each floor where they are; ' : ''}${o.views3d.includes('plans/3d-floors.png') ? 'the floors are spread apart, lowest at the bottom, with their walls cut away at 3 ft to show the rooms and fixtures.' : ''}\n` : ''}${o.aerialName ? `- **Aerial picture:** \`${o.aerialName}\` is a satellite or aerial picture of the lot, which the owner traced the outline of the house from. It shows what the plans leave out: the yard, patio, driveway, trees, streets and neighbours, and so which way water runs. Its top is the top of the plan pictures.\n` : ''}- **Photos** are in the \`photos\` folder, named after the issue they belong to (\`issue-05-photo-1.jpg\` is the first photo of issue 5), and are small copies of the originals.
- \`issues.csv\` holds the same issues as a table.

## Suggested request

> Here is a brief of my house and the issues I have found in it, with photos and floor plans. Please review the issues: say if any look to be in the wrong category, what should be done first and in what order, which ones may be connected (look at what is above and below each), and what I may have missed, going by the house facts and the walkthrough checklist as well. Take my goals${o.household ? ' and the people who live here' : ''} into account.${o.styles ? ' I would also like style ideas for the house, as set out under *Style ideas* below.' : ''} Give a rough cost range for each issue that is not priced${plan.address ? `, for the area of ${plan.address}` : ' (ask me where the house is)'}. Tell me what else you would need to know to be more sure. When you are done, also write your answer as described under *Sending your review back* at the end of this file, so that I can bring it into the app.

## The house

${houseWords()}

${houseBrief(o.money, o.household)}${maintenanceBrief() ? '\n\n' + maintenanceBrief() : ''}

${o.styles ? styleRequest() + '\n\n' : ''}## Totals

${open.length} ${open.length === 1 ? 'issue is' : 'issues are'} still to do${blank ? `, of which ${blank} ${blank === 1 ? 'is' : 'are'} not priced` : ''}. The priced ones come to ${costRange(priced)}.

| Category | Issues | Low | High |
|---|---|---|---|
${totals.join('\n') || '| (none) | 0 | $0 | $0 |'}

## Issues

${o.issues.map((i) => issueBlock(i, o)).join('\n\n') || 'No issues have been recorded.'}
${other.length ? `\n## Other photos\n\nPhotos placed on the plan that are not linked to an issue.\n\n${other.join('\n')}\n` : ''}
${reviewFormatText()}`;
}

// ---------- pictures of the sheets ----------

const PICTURE_STYLES = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity',
  'font-family', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'paint-order', 'vector-effect', 'visibility'];

// The plan as it is drawn now, as a PNG. A picture made from an SVG does not get the page's style
// sheet, so what the style sheet gives each part is written onto the copy first.
async function sheetPicture(width, height) {
  const copy = svg.cloneNode(true);
  const live = svg.querySelectorAll('*');
  for (const [n, el] of [...copy.querySelectorAll('*')].entries()) {
    const cs = getComputedStyle(live[n]);
    if (cs.display === 'none') {
      el.setAttribute('display', 'none');
      continue;
    }
    el.setAttribute('style', PICTURE_STYLES.map((k) => `${k}:${cs.getPropertyValue(k)}`).join(';'));
    el.removeAttribute('class');
  }
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', width);
  copy.setAttribute('height', height);
  copy.removeAttribute('class');
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = new OffscreenCanvas(width, height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return await c.convertToBlob({ type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// A picture of each sheet that has something on it: [{ name, data }]. Drawn the way the printed
// sheets are, by pointing the screen's own drawing at each sheet in turn and then putting it back.
async function sheetPictures(onStep) {
  const floors = plan.floors.filter((f) => f.rooms.length || f.items.length || plan.issues.some((i) => i.floorId === f.id && pinned(i)));
  const keep = { floorId, sel, view: { ...view }, layers: { ...layers } };
  const out = [];
  sel = null;
  Object.assign(layers, { names: true, items: true, issues: true, photos: false });
  printWidth = AI_PLAN_DRAWN;
  printAspect = AI_PLAN_ASPECT;
  try {
    for (const [n, f] of floors.entries()) {
      onStep(`Drawing sheet ${n + 1} of ${floors.length}…`);
      floorId = f.id;
      fitSheet(f);
      renderCanvas();
      out.push({ name: `plans/${slug(f.name, 'sheet')}.png`, data: await sheetPicture(AI_PLAN_WIDTH, Math.round(AI_PLAN_WIDTH * AI_PLAN_ASPECT)) });
    }
  } finally {
    printWidth = 0;
    printAspect = 0;
    ({ floorId, sel } = keep);
    view = keep.view;
    Object.assign(layers, keep.layers);
    renderAll();
  }
  return out;
}

// A close-up of the plan around the pin of each issue given, for issues with no photo to show where
// they are: [{ issue, name, data }]. The pin is drawn selected, so it stands out.
async function spotPictures(issues, onStep) {
  const keep = { floorId, sel, view: { ...view }, layers: { ...layers } };
  const out = [];
  Object.assign(layers, { names: true, items: true, issues: true, photos: false });
  printWidth = AI_SPOT_PIXELS;
  printAspect = AI_PLAN_ASPECT;
  try {
    for (const [n, i] of issues.entries()) {
      onStep(`Close-up ${n + 1} of ${issues.length}…`);
      floorId = i.floorId;
      sel = { type: 'issue', id: i.id };
      const w = AI_SPOT_WIDTH;
      view = { x: i.x - w / 2, y: i.y - (w * AI_PLAN_ASPECT) / 2, w };
      renderCanvas();
      const name = `plans/issue-${String(issueNum(i)).padStart(2, '0')}-close-up.png`;
      out.push({ issue: i, name, data: await sheetPicture(AI_SPOT_PIXELS, Math.round(AI_SPOT_PIXELS * AI_PLAN_ASPECT)) });
    }
  } finally {
    printWidth = 0;
    printAspect = 0;
    ({ floorId, sel } = keep);
    view = keep.view;
    Object.assign(layers, keep.layers);
    renderAll();
  }
  return out;
}

// ---------- the export ----------

// One photo as it goes into the export: a small JPEG, or null for a kind of picture the browser
// cannot draw, which would otherwise go in at full size.
async function smallPhoto(path) {
  const file = await store.file(path).catch(() => null);
  if (!file) return null;
  const copy = await shrinkPhoto(new File([file], baseOf(path), { type: file.type }), AI_PHOTO_EDGE);
  return copy.unread ? null : copy;
}

// The open project as a zip for an AI assistant. `o`: { done, other, contacts, quoteFiles, plans, money }.
async function exportForAi(o, onStep = () => {}) {
  await flushSave();
  const issues = plan.issues.filter((i) => o.done || i.status !== 'Done');
  const entries = [];
  const photoNames = new Map(); // issue id + shot id -> the photo's path in the zip
  const jobs = issues.flatMap((i) => issueShots(i).map((v, n) => ({ ...v, i, stem: `photos/issue-${String(issueNum(i)).padStart(2, '0')}-photo-${n + 1}` })));
  const linked = new Set(issues.flatMap((i) => i.photoIds));
  const others = o.other ? plan.photos.filter((ph) => !linked.has(ph.id)).flatMap((ph) => shotsOf(ph).filter((s) => s.file).map((shot) => ({ ph, shot }))) : [];
  const otherPhotos = [];
  for (const [n, job] of [...jobs, ...others].entries()) {
    onStep(`Photo ${n + 1} of ${jobs.length + others.length}…`);
    const copy = await smallPhoto(job.shot.file);
    if (!copy) continue;
    if (job.i) {
      const name = job.stem + extOf(copy.name);
      photoNames.set(job.i.id + job.shot.id, name);
      entries.push({ name, data: copy.data });
    } else {
      // Photos are already filed and named by room; the floor is added to keep the names apart.
      const name = `photos/other/${slug(plan.floors.find((f) => f.id === job.ph.floorId)?.name, 'sheet')}-${stemOf(baseOf(job.shot.file))}${extOf(copy.name)}`;
      otherPhotos.push({ ...job, name });
      entries.push({ name, data: copy.data });
    }
  }
  if (o.quoteFiles) {
    for (const q of issues.flatMap(quotesOf).filter((x) => x.doc)) {
      const file = await store.file(q.doc).catch(() => null);
      if (file) entries.push({ name: q.doc, data: file });
    }
  }
  if (o.plans) entries.push(...await sheetPictures(onStep));
  if (o.plans) {
    onStep('3D views…');
    const views = await view3dPictures();
    o = { ...o, views3d: views.map((v) => v.name) };
    entries.push(...views);
  }
  // Issues with nothing to show them get a close-up of the plan around their pin instead.
  if (o.spots) {
    const bare = issues.filter((i) => pinned(i) && !issueShots(i).length);
    const spots = await spotPictures(bare, onStep);
    o = { ...o, spotNames: new Map(spots.map((v) => [v.issue.id, v.name])) };
    entries.push(...spots.map(({ name, data }) => ({ name, data })));
  }
  // The aerial picture, as a small copy like the photos. It is not turned, so its top is the top
  // of the plan pictures.
  if (o.aerial && plan.aerial?.file) {
    onStep('Aerial picture…');
    const copy = await smallPhoto(plan.aerial.file);
    if (copy) {
      o = { ...o, aerialName: 'plans/aerial' + extOf(copy.name) };
      entries.push({ name: o.aerialName, data: copy.data });
    }
  }
  const text = (s) => new Blob([s]);
  entries.unshift(
    { name: 'README-FIRST.md', data: text(briefText({ ...o, issues, photoNames, otherPhotos })) },
    { name: 'issues.csv', data: text(issuesCsv(issues, photoNames)) },
  );
  return zipBlob(entries, (n, of) => onStep(`Packing ${n} of ${of}…`));
}
