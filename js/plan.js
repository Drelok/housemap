'use strict';

const CATS = [
  { id: 'safety', label: 'Safety / Immediate', color: '#c62828' },
  { id: 'major', label: 'Major', color: '#e65100' },
  { id: 'minor', label: 'Minor', color: '#b58900' },
  { id: 'cosmetic', label: 'Cosmetic', color: '#1565c0' },
  { id: 'preference', label: 'Preference / Upgrade', color: '#6a1b9a' },
];
const STATUSES = ['Open', 'In progress', 'Done'];
const ROOM_NAMES = [
  'Living room', 'Family room', 'Kitchen', 'Dining room', 'Master bedroom', 'Bedroom', 'Bathroom', 'Hallway',
  'Closet', 'Entry', 'Laundry', 'Pantry', 'Office', 'Utility room', 'Garage', 'Porch', 'Deck', 'Stairs',
];
const HINTS = {
  select: 'Drag to move. Drag a corner to resize or reshape, or the bar on a wall to move just that wall. Shift-drag a polygon corner to square it up. Drag empty space or a locked room to pan, scroll to zoom. Dragging to the edge scrolls the view.',
  rect: 'Drag to draw a rectangle. Hold Shift for a square. Its size shows at the bottom right.',
  poly: 'Click each corner; hold Shift to keep the side straight. Ctrl-click a point for the wall to curve through it. Click the first corner or press Enter to close. Backspace removes the last corner.',
  pin: 'Click where the issue is. For the roof, the wiring or anything else with no one spot, use Add issue without a pin… on the Issues tab instead.',
  ruler: 'Click two points to read the distance between them. Nothing is changed. Shift keeps the line level or upright.',
  wall: 'Click a wall of the selected outline whose real length you know. A long wall gives the best result.',
  bend: 'Press on a wall of the selected shape and drag to bend it into a curve. The wall then passes through the point you let go at.',
  wallLen: 'Click the wall of the selected shape that you want to set the length of, near the end that should move.',
  scale: 'Click the two ends of a straight line you know the length of, such as one wall of the house. Shift keeps the line level or upright.',
  photo: 'Click where a photo was taken and drag toward what it is looking at. You choose the photo next.',
  split: 'Click one end of the closet’s opening, on the edge of the selected room, then click across the opening. The smaller piece becomes the closet.',
  window: 'Click on a wall where a window is. You choose what kind of window it is next, then its width and sill height.',
  door: 'Click on a wall where a door or opening is, on the line between two rooms that are open to each other, or on the end of a staircase. You choose its type and width next.',
  stairs: 'Click where the stairs are. You set their size, their turns, which way they go and the floor they lead to next.',
  item: 'Click where a fixture or appliance stands. You choose what it is next.',
};

// The sizes a house is built to, in feet, with the values suggested when a project first sets
// its own. Rooms snap a wall's thickness apart, and new doors and openings start at these widths.
const STANDARDS = [
  { key: 'exteriorWall', label: 'Exterior wall thickness', typical: 6 / 12, note: 'Wood framing with siding is about 6". Brick veneer is nearer 9" or 10". Measure at an outside door or a window.' },
  { key: 'interiorWall', label: 'Interior wall thickness', typical: 4.5 / 12, note: '2×4 studs with drywall on both sides. Plaster walls are often 5" or more. Measure at a doorway.' },
  { key: 'door', label: 'Interior door width', typical: 30 / 12, note: 'Common sizes are 24", 28", 30", 32" and 36".' },
  { key: 'opening', label: 'Open doorway width (no door)', typical: 32 / 12, note: 'A cased opening between two rooms.' },
  { key: 'exteriorDoor', label: 'Exterior door width', typical: 36 / 12, note: 'A front door is usually 36"; back and side doors are sometimes 32".' },
  { key: 'ceiling', label: 'Ceiling height', typical: 8, note: 'Not used for laying out rooms. Kept for working out wall areas later.' },
];
const OPENING_KINDS = [
  { id: 'door', label: 'Interior door', width: 'door', leaf: true },
  { id: 'opening', label: 'Open doorway (no door)', width: 'opening' },
  { id: 'exterior', label: 'Exterior door', width: 'exteriorDoor', leaf: true },
  // Closet doors. Sliding doors come as a pair, so they start at twice the width of one door.
  { id: 'bifold', label: 'Bifold door (folds, as on a closet)', width: 'door', fold: true },
  { id: 'sliding', label: 'Sliding doors (two panels, as on a closet)', width: 'door', times: 2 },
  // These two have no standard width: they start out spanning the whole wall the two rooms share.
  { id: 'open', label: 'No wall: the rooms are open to each other' },
  { id: 'half', label: 'Half wall (low wall you can see over)' },
  // Placed with the Window tool and kept apart from the doors: it has kinds of its own.
  { id: 'window', label: 'Window', window: true },
];
// Kinds of window: its usual width and sill height above the floor, in feet. A basement window
// below ground level sits high in the wall, or has a well dug outside it to let light in, or both;
// an egress window is one big enough to climb out of, which codes want in a basement bedroom.
const WINDOW_KINDS = [
  { id: 'standard', label: 'Standard window', short: 'window', w: 3, sill: 3 },
  { id: 'high', label: 'High basement window: short, near the ceiling, about at ground level', short: 'high basement window', w: 32 / 12, sill: 5, basement: true },
  { id: 'egress', label: 'Egress window: big enough to climb out of, with the sill no higher than 44"', short: 'egress window', w: 3, sill: 44 / 12, basement: true },
  { id: 'block', label: 'Glass block window', short: 'glass block window', w: 32 / 12, sill: 5, basement: true },
];
const windowKind = (id) => WINDOW_KINDS.find((k) => k.id === id) || WINDOW_KINDS[0];
const EGRESS_SILL = 44 / 12; // the highest an egress window's sill may be, under the residential code
// Where a basement door to the outside opens onto.
const DOOR_ONTO = [['', 'Not said'], ['grade', 'Ground level: a walk-out'], ['stairwell', 'Steps up to the yard: an outside stairwell or bulkhead']];
const INTERIOR_TOOLS = ['door', 'window', 'stairs', 'item'];
// A project kept in the browser, rather than in a folder, is lost if the browser's site data is
// cleared. Past this many days since it was last exported as a zip, the app says so.
const BACKUP_DAYS = 14;
const daysSince = (stamp) => Math.round((new Date(dayStamp()) - new Date(stamp)) / 86400000);
// "Last exported today", "Last exported 23 days ago", or "Never exported".
function exportAgeWords(stamp) {
  if (!stamp) return 'Never exported';
  const d = daysSince(stamp);
  return `Last exported ${d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`}`;
}
const backupDue = (stamp) => !stamp || daysSince(stamp) > BACKUP_DAYS;
// What a room's floor is covered with, kept in `cover`. The first of a room's details a contractor
// or an AI asks for when pricing work in it.
const FLOOR_COVERS = [['', 'Not said'], ['carpet', 'Carpet'], ['hardwood', 'Hardwood'], ['engineered', 'Engineered wood'], ['laminate', 'Laminate'], ['vinyl', 'Vinyl, plank or sheet'], ['tile', 'Ceramic or stone tile'], ['concrete', 'Bare concrete'], ['other', 'Something else']]; // offered on the floors, not on the exterior sheet
const MAX_RISER = 7.75 / 12; // the tallest single step the current residential code (IRC) allows

// The fixed questions asked about every issue, beyond its description: [key, question, kind].
// The kind is a list of answers to choose from, or 'area' for a longer box to type in.
const ISSUE_MORE = [
  ['started', 'When did it start, or when was it first noticed?'],
  ['frequency', 'How often does it happen?'],
  ['worse', 'Is it getting worse?', [['', ''], ['yes', 'Yes'], ['no', 'No'], ['unknown', 'Don’t know']]],
  ['tried', 'What has been tried so far?', 'area'],
  ['who', 'Who would do the work?', [['', ''], ['me', 'I would'], ['pro', 'A professional'], ['unsure', 'Not sure yet']]],
];
// Where the owner's own estimate came from. A contractor's figure is a quote, kept with the quotes.
const COST_SOURCES = [['', 'My own guess'], ['ai', 'A figure from an AI assistant']];

const cat = (id) => CATS.find((c) => c.id === id) || CATS[1];
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][n % 10 < 4 && (n % 100) - (n % 10) !== 10 ? n % 10 : 0]);

function newPlan({ name = 'Untitled house', address = '', floors = 1, basement = false } = {}) {
  const sheets = [{ name: 'Exterior / Site', kind: 'exterior' }];
  if (basement) sheets.push({ name: 'Basement', kind: 'floor', basement: true });
  for (let n = 1; n <= floors; n++) sheets.push({ name: n === 1 ? 'Main floor' : ordinal(n) + ' floor', kind: 'floor' });
  return {
    version: 5,
    name,
    address,
    floors: sheets.map((s) => ({ id: uid(), ...s, rooms: [], openings: [], items: [] })),
    issues: [],
    nextIssueNum: 1,
    photos: [],
    aerial: null,
    exteriorSized: false,
    tipsSeen: {},
    facts: {},
    goals: {},
    checklist: {},
  };
}

function isPlan(p) {
  return p && Array.isArray(p.floors) && p.floors.length > 0 && Array.isArray(p.issues);
}

// Multiplies every length and position in a plan by k, in place.
function scalePlan(p, k, tidy = (v) => v) {
  const at = (o, keys) => {
    for (const key of keys) if (typeof o[key] === 'number') o[key] = tidy(o[key] * k);
  };
  for (const f of p.floors) {
    for (const r of f.rooms || []) {
      at(r, ['x', 'y', 'w', 'h', 'level']);
      for (const pt of r.points || []) at(pt, ['x', 'y']);
    }
    for (const o of f.openings || []) at(o, ['x', 'y', 'w', 't', 'sill']);
    for (const it of f.items || []) {
      at(it, ['x', 'y', 'w', 'h']);
      for (const pt of it.points || []) at(pt, ['x', 'y']);
    }
  }
  if (p.standards) at(p.standards, Object.keys(p.standards));
  for (const item of [...p.issues, ...(p.photos || [])]) at(item, ['x', 'y']);
  if (p.aerial) at(p.aerial, ['x', 'y', 'w']);
  return p;
}

// The plan as it is written to disk: every length in inches, to the nearest quarter.
function planFileText(p = plan) {
  const copy = scalePlan(structuredClone(p), 12, (v) => Math.round(v * PER_INCH) / PER_INCH);
  // An issue that has been deleted, however it went, no longer holds up any other.
  const ids = new Set(copy.issues.map((i) => i.id));
  for (const i of copy.issues) {
    if (i.after) i.after = i.after.filter((id) => ids.has(id));
    if (!i.after?.length) delete i.after;
  }
  return JSON.stringify({ version: 5, units: 'inches', ...copy }, null, 2);
}

// Brings an older or hand-written plan file up to the current shape.
function normalizePlan(p) {
  // From version 3 the file holds inches. Earlier files hold decimal feet, which is what the app
  // works in, so only version 3 files need converting.
  if (p.version >= 3) scalePlan(p, 1 / 12);
  const boxed = !(p.version >= 4);
  const zeroed = !(p.version >= 5);
  p.version = 5;
  p.name ||= 'Untitled house';
  p.address ||= '';
  p.photos ||= [];
  p.issues.forEach((i, n) => {
    i.photoIds ||= [];
    for (const q of i.quotes || []) q.id ||= uid();
    // Earlier versions could save 0 and 0 for an issue nobody had priced, which then read as an
    // estimate of $0 to $0 and counted as priced. In a file from before version 5 that is taken
    // to be no estimate; from version 5 on, 0 and 0 is an estimate of nothing that was typed in.
    if (zeroed && i.costLow === 0 && i.costHigh === 0) i.costLow = i.costHigh = null;
    // An issue's number used to be its place in the list, and an issue nobody had priced held 0
    // and 0. Both are put right once, for an issue that has no number of its own yet.
    if (i.num) return;
    i.num = n + 1;
    if (!i.costLow && !i.costHigh) i.costLow = i.costHigh = null;
  });
  p.nextIssueNum = Math.max(p.nextIssueNum || 1, ...p.issues.map((i) => i.num + 1));
  for (const ph of p.photos) for (const shot of ph.more || []) shot.id ||= uid();
  p.aerial ||= null;
  p.tipsSeen ||= {};
  p.facts ||= {};
  p.goals ||= {};
  p.checklist ||= {};
  p.household ||= {};
  const exterior = p.floors.find((f) => f.kind === 'exterior') || p.floors.find((f) => /exterior|site/i.test(f.name));
  for (const f of p.floors) {
    f.id ||= uid();
    f.rooms ||= [];
    f.openings ||= [];
    f.items ||= [];
    for (const it of f.items) {
      if (boxed) unboxItem(it);
      if (it.kind !== 'stairs') it.rot = (((+it.rot || 0) % 360) + 360) % 360;
    }
    f.kind = f === exterior ? 'exterior' : 'floor';
  }
  // Plans made before basements were marked: a floor called Basement is taken to be one.
  if (!p.floors.some((f) => f.basement)) for (const f of p.floors) if (f.kind === 'floor' && /^\s*basement\s*$/i.test(f.name)) f.basement = true;
  // A plan that arrives with rooms but no outline was measured some other way; do not nag about it.
  p.exteriorSized ??= !exterior?.rooms.length && p.floors.some((f) => f.rooms.length > 0);
  return p;
}

// Before version 4 an item's box was the space it took up on the sheet, and it could only be
// turned by quarter turns. Now a fixture's box is its own width and depth, turned about its
// middle, and stairs are a path down their middle.
function unboxItem(it) {
  const c = { x: it.x + it.w / 2, y: it.y + it.h / 2 };
  const turned = it.rot % 180 !== 0;
  if (it.kind === 'stairs' && !it.points) {
    const half = (turned ? it.w : it.h) / 2;
    const a = (it.rot * Math.PI) / 180;
    const d = { x: Math.round(Math.sin(a)) * half, y: -Math.round(Math.cos(a)) * half }; // from the middle to the far end
    it.points = [{ x: c.x - d.x, y: c.y - d.y }, { x: c.x + d.x, y: c.y + d.y }];
    it.w = turned ? it.h : it.w;
    for (const key of ['x', 'y', 'h', 'rot']) delete it[key];
  } else if (turned && it.kind !== 'stairs') {
    Object.assign(it, { x: c.x - it.h / 2, y: c.y - it.w / 2, w: it.h, h: it.w });
  }
}

let plan = null;
let floorId = null;
let tool = 'select';
let sel = null; // { type: 'room' | 'issue' | 'photo' | 'opening' | 'item', id }
let drag = null;
let draft = null; // polygon being drawn: { points, cursor }
let showOutline = true;
let onIssues = false; // the Issues sheet is showing in place of a plan
let onHouse = false; // the House sheet is: the facts, goals and walkthrough checklist
const onList = () => onIssues || onHouse; // either way there is no plan to draw on
let pinFor = ''; // the issue without a pin that the Issue tool is about to place, if any
// What is drawn on the plan, as chosen in the View menu. Nothing hidden is changed or lost; it
// is only left off the screen and off printed sheets, until the project is next opened.
const layers = { names: true, items: true, photos: true, issues: true };
const LAYER_OF = { item: 'items', photo: 'photos', issue: 'issues' }; // the layer each kind of selection is on
let view = { x: -5, y: -5, w: 90 }; // feet
let sheetViews = {}; // the view last used on each kind of sheet: { exterior, floor }

// The floors above ground, in order from the lowest. A basement is a sheet like any other floor
// but is not counted as one: the floor above it is the main floor, then the 2nd, and so on.
const upperFloors = () => plan.floors.filter((f) => f.kind === 'floor' && !f.basement);
const floorName = (n) => (n === 1 ? 'Main floor' : ordinal(n) + ' floor');

const floor = () => plan.floors.find((f) => f.id === floorId) || plan.floors[0];
const exteriorFloor = () => plan.floors.find((f) => f.kind === 'exterior');
const selRoom = () => (sel?.type === 'room' ? floor().rooms.find((r) => r.id === sel.id) : null);
const selIssue = () => (sel?.type === 'issue' ? plan.issues.find((i) => i.id === sel.id) : null);
const selPhoto = () => (sel?.type === 'photo' ? plan.photos.find((p) => p.id === sel.id) : null);
const selOpening = () => (sel?.type === 'opening' ? floor().openings.find((o) => o.id === sel.id) : null);
const selItem = () => (sel?.type === 'item' ? floor().items.find((it) => it.id === sel.id) : null);
// A house standard: the project's own once it has been set, otherwise the suggested value.
const std = (key) => plan.standards?.[key] ?? STANDARDS.find((s) => s.key === key).typical;
// A shape marked `separate` (a carport, a shed) is drawn but kept out of the area total and out of Combine.
const floorArea = (f) => f.rooms.reduce((a, r) => a + (r.separate ? 0 : shapeArea(r)), 0);
// The part of a floor that counts toward the size of the house: all of it above ground, and in a
// basement only the rooms marked as finished.
const countedArea = (f) => (f.basement ? f.rooms.reduce((a, r) => a + (r.finished && !r.separate ? shapeArea(r) : 0), 0) : floorArea(f));
// The whole house: what counts on every floor sheet. The exterior sheet holds the outline of the
// house, not rooms, so its footprint is not added in.
const houseArea = () => plan.floors.reduce((a, f) => a + (f.kind === 'floor' ? countedArea(f) : 0), 0);
// Its parts, which listings and appraisals give separately: the floors above ground, the finished
// basement, and the rest of the basement, which is not counted at all.
const aboveArea = () => plan.floors.reduce((a, f) => a + (f.kind === 'floor' && !f.basement ? floorArea(f) : 0), 0);
const finishedBasementArea = () => plan.floors.reduce((a, f) => a + (f.basement ? countedArea(f) : 0), 0);
const unfinishedBasementArea = () => plan.floors.reduce((a, f) => a + (f.basement ? floorArea(f) - countedArea(f) : 0), 0);
const separateArea = (f) => f.rooms.reduce((a, r) => a + (r.separate ? shapeArea(r) : 0), 0);
// What an issue is expected to cost. The owner's own estimate is a guess, as a range; once a
// quote has been accepted, that is the cost instead, with no range. More than one accepted quote,
// as where two trades are needed for one repair, are added together.
// `priced` is false for an issue nobody has put a figure on: it adds nothing to a total, which is
// not the same as costing nothing.
function issueCost(i) {
  const accepted = (i.quotes || []).filter((q) => q.status === 'Accepted');
  if (!accepted.length) return { ...ownEstimate(i), quoted: false };
  const total = accepted.reduce((a, q) => a + (q.amount || 0), 0);
  return { low: total, high: total, quoted: true, priced: true };
}
// The owner's own estimate. Either box may be left empty: with one filled in, it stands for both;
// with neither, the issue has no estimate, which is kept apart from an estimate of $0.
function ownEstimate(i) {
  return { priced: i.costLow != null || i.costHigh != null, low: i.costLow ?? i.costHigh ?? 0, high: i.costHigh ?? i.costLow ?? 0 };
}
const estimateText = (i, to = ' to ') => (ownEstimate(i).priced ? `${money(ownEstimate(i).low)}${to}${money(ownEstimate(i).high)}` : 'not priced');
const unpriced = (i) => !issueCost(i).priced;
// One figure of a total, as shown in a table: a dash where nothing it covers has been priced.
const sumCell = (list, sum) => (list.length && list.every(unpriced) ? '—' : money(sum(list)));
// Said beside a total when some of what it covers has no figure: " · 2 not priced".
const unpricedNote = (list) => (list.some(unpriced) ? ` · ${list.filter(unpriced).length} not priced` : '');

// An issue's number is given to it when it is made and never changes or passes to another issue,
// so that "issue 7" means the same thing on the plan, in a printed report and to anyone it was
// sent to, whatever has been deleted since.
const issueNum = (i) => i.num;
function newIssue(props) {
  plan.nextIssueNum ||= 1;
  return { id: uid(), num: plan.nextIssueNum++, title: 'New issue', description: '', category: 'major', status: 'Open', costLow: null, costHigh: null, photo: '', photoIds: [], added: dayStamp(), ...props };
}
// An issue need not have a pin. One about a whole floor has that floor and no place on it; one
// about the whole house, such as the roof or the wiring, has no floor either.
const pinned = (i) => !!i.floorId && i.x != null && i.y != null;
function issuePlace(i) {
  const f = plan.floors.find((x) => x.id === i.floorId);
  return !f ? 'Whole house' : pinned(i) ? f.name : `All of ${f.name}`;
}
// The order work has to be done in. An issue's `after` lists the issues that must be done before it,
// such as the roof before the ceiling under it. Issues since deleted are passed over.
const byIssueNum = (a, b) => issueNum(a) - issueNum(b);
const afterOf = (i) => (i.after || []).map((id) => plan.issues.find((x) => x.id === id)).filter(Boolean).sort(byIssueNum);
const waitingFor = (i) => plan.issues.filter((x) => (x.after || []).includes(i.id)).sort(byIssueNum);
// Whether `a` already has to wait for `b`, directly or through others. If it does, `b` cannot be
// made to wait for `a`, as neither could then ever be started.
function waitsFor(a, b, seen = new Set()) {
  if (seen.has(a.id)) return false;
  seen.add(a.id);
  return afterOf(a).some((x) => x === b || waitsFor(x, b, seen));
}

const costLow = (list) => list.reduce((a, i) => a + issueCost(i).low, 0);
const costHigh = (list) => list.reduce((a, i) => a + issueCost(i).high, 0);
const sqft = (n) => Math.round(n).toLocaleString('en-US') + ' sq ft';

// The exterior outline shown faintly under each floor.
function outlineShapes() {
  const f = floor();
  return showOutline && f.kind !== 'exterior' ? exteriorFloor()?.rooms || [] : [];
}

// ---------- undo and redo ----------
// Every change ends in save(), which also notes what the plan looked like before it. Where photo
// files sit on disk is left out of those notes: undo never moves a photo off or onto a marker, so
// history simply starts again whenever a file is attached, removed, added or deleted.

let undoStack = [];
let redoStack = [];
let current = ''; // the plan as last noted
let lastTyped = 0;

const historyKey = () => JSON.stringify(plan, (k, v) => (k === 'file' ? undefined : v));

function renderHistory() {
  $('#btnUndo').disabled = !undoStack.length;
  $('#btnRedo').disabled = !redoStack.length;
}

function resetHistory() {
  undoStack = [];
  redoStack = [];
  current = plan ? historyKey() : '';
  renderHistory();
}

function recordHistory(typing) {
  const now = historyKey();
  if (now === current) return;
  // Typing arrives one key at a time; a quick run of keys counts as one step.
  const sameRun = typing && undoStack.length && Date.now() - lastTyped < 1000;
  if (!sameRun) undoStack.push(current);
  if (undoStack.length > 100) undoStack.shift();
  lastTyped = typing ? Date.now() : 0;
  current = now;
  redoStack = [];
  renderHistory();
}

function stepHistory(from, to) {
  if (!from.length) return;
  to.push(current);
  current = from.pop();
  const files = new Map(plan.photos.flatMap(shotsOf).map((p) => [p.id, p.file]));
  const aerialFile = plan.aerial?.file;
  plan = JSON.parse(current);
  for (const p of plan.photos.flatMap(shotsOf)) p.file = files.get(p.id) ?? '';
  if (plan.aerial) plan.aerial.file = aerialFile;
  floorId = floor().id;
  sel = null;
  setTool('select');
  renderHistory();
  syncPhotos(); // photo folders follow room and floor names, which may just have changed back
}

const undo = () => stepHistory(undoStack, redoStack);
const redo = () => stepHistory(redoStack, undoStack);

let saveTimer = null;
let unsaved = false; // whether the plan has changed since it was last written
// The note beside the project's name saying whether the latest changes are on disk yet.
function showSaveState(state) {
  const el = $('#saveState');
  el.textContent = { saved: 'Saved', busy: 'Saving…', failed: 'Not saved' }[state];
  el.className = state;
}

function save(typing = false) {
  recordHistory(typing);
  unsaved = true;
  showSaveState('busy');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 400);
}

// Writes the plan if it has changed. A write that is cut short, as when the page closes part way
// through one, can leave the file empty or missing, so nothing is written unless there is
// something to save, and each good write is followed by a second copy beside it. Only one of
// the two is ever being written, so one of them is always whole; opening a project falls back
// on the copy when the plan itself cannot be read.
function flushSave() {
  clearTimeout(saveTimer);
  if (!store.root || !plan || !unsaved) return Promise.resolve();
  unsaved = false;
  const text = planFileText();
  const file = store.planFile;
  return io(async () => {
    await store.write(file, text);
    await store.write(file + BACKUP_EXT, text);
  }).then(() => {
    if (!unsaved) showSaveState('saved'); // unless something changed while this was being written
  }, (e) => {
    unsaved = true;
    showSaveState('failed');
    flash('Could not save the plan: ' + e.message);
  });
}
