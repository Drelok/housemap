'use strict';

// The Find box: type part of a name and go to the room, issue, photo marker, fixture or sheet it
// belongs to, on whichever sheet that is.

const SEARCH_MAX = 12; // results listed at once
let found = []; // what the list is showing
let foundAt = 0; // the one Enter would go to

function searchResults(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hit = (...texts) => {
    const t = texts.filter(Boolean).join(' ').toLowerCase();
    return words.every((w) => t.includes(w));
  };
  const out = [];
  for (const f of plan.floors) {
    if (hit(f.name)) out.push({ kind: 'Sheet', text: f.name, floorId: f.id });
    for (const r of f.rooms) {
      if (hit(r.name)) out.push({ kind: f.kind === 'exterior' ? 'Outline' : 'Room', text: r.name, more: sqft(shapeArea(r)), floorId: f.id, sel: { type: 'room', id: r.id }, points: shapePoints(r) });
    }
    for (const it of f.items) {
      const label = isStairs(it) ? 'Stairs' : itemKind(it.kind)?.label || 'Fixture';
      if (hit(label, it.note, it.brand, it.model, it.serial)) out.push({ kind: isStairs(it) ? 'Stairs' : 'Fixture', text: label, more: it.note, floorId: f.id, sel: { type: 'item', id: it.id }, points: itemCorners(it) });
    }
  }
  for (const i of plan.issues) {
    if (hit('#' + issueNum(i), i.title, i.description, cat(i.category).label, i.status, ...ISSUE_MORE.map(([key]) => (key === 'worse' || key === 'who' ? '' : i[key])))) {
      out.push({ kind: 'Issue', text: `#${issueNum(i)} ${i.title}`, more: i.status, floorId: i.floorId, place: issuePlace(i), sel: { type: 'issue', id: i.id }, points: [i] });
    }
  }
  for (const ph of plan.photos) {
    const names = shotsOf(ph).flatMap((s) => [s.file && baseOf(s.file), s.original]);
    if (hit(ph.note, ...names)) out.push({ kind: 'Photo', text: photoCaption(ph), more: ph.note, floorId: ph.floorId, sel: { type: 'photo', id: ph.id }, points: [ph] });
  }
  return out;
}

// Moves the view only as far as it has to: not at all if the thing is already in sight, to centre
// it if it is off to one side, and out to fit it if it is too big for the view as it stands.
function bringIntoView(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const h = view.w * canvasAspect();
  if (x1 - x0 > view.w * 0.8 || y1 - y0 > h * 0.8) return fitView([{ points }]);
  if (x0 >= view.x && x1 <= view.x + view.w && y0 >= view.y && y1 <= view.y + h) return;
  view.x = (x0 + x1) / 2 - view.w / 2;
  view.y = (y0 + y1) / 2 - h / 2;
}

function goTo(res) {
  const from = floor().kind;
  const moved = !!res.floorId && res.floorId !== floorId;
  onIssues = onHouse = false;
  applySheet(); // the plan has to be back on screen before the view is worked out
  floorId = res.floorId || floorId; // an issue about the whole house is on no sheet: the one open stays
  draft = null;
  setTool('select');
  keepView(from);
  sel = res.sel || null;
  const points = (res.points || []).filter((p) => p.x != null); // an issue without a pin has no place to go to
  if (points.length) bringIntoView(points);
  renderAll();
  if (moved) showTips(floor().kind);
}

function renderSearch() {
  const box = $('#searchBox');
  const list = $('#searchMenu .menuList');
  const all = plan && box.value.trim() ? searchResults(box.value) : [];
  found = all.slice(0, SEARCH_MAX);
  foundAt = Math.min(foundAt, Math.max(0, found.length - 1));
  if (!box.value.trim()) return void (list.hidden = true);
  const sheet = (id) => plan.floors.find((f) => f.id === id)?.name;
  list.innerHTML = found.map((r, n) => `<button data-i="${n}"${n === foundAt ? ' class="on"' : ''}>
      <span><b>${esc(r.text)}</b>${r.more ? ` <small>${esc(r.more)}</small>` : ''}</span>
      <i>${r.kind}${r.kind === 'Sheet' ? '' : ' · ' + esc(r.place || sheet(r.floorId))}</i></button>`).join('')
    + (all.length > found.length ? `<p class="muted small">${all.length - found.length} more. Keep typing to narrow it down.</p>` : '')
    + (all.length ? '' : '<p class="muted">Nothing by that name. Rooms, issues, photo file names and notes, fixtures and sheets are searched.</p>');
  openMenu(list);
}

function pickFound(n) {
  const res = found[n];
  if (!res) return;
  $('#searchBox').value = '';
  $('#searchBox').blur();
  closeMenus();
  goTo(res);
}

$('#searchBox').addEventListener('input', () => {
  foundAt = 0;
  renderSearch();
});
$('#searchBox').addEventListener('focus', renderSearch);

$('#searchBox').addEventListener('keydown', (e) => {
  const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
  if (step && found.length) {
    e.preventDefault();
    foundAt = (foundAt + step + found.length) % found.length;
    renderSearch();
  } else if (e.key === 'Enter') {
    pickFound(foundAt);
  } else if (e.key === 'Escape') {
    e.target.value = '';
    e.target.blur();
    closeMenus();
  }
});

$('#searchMenu .menuList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]');
  if (b) pickFound(+b.dataset.i);
});

function focusSearch() {
  $('#searchBox').focus();
  $('#searchBox').select();
}
