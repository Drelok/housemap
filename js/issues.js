'use strict';

// The Issues sheet: every issue in the house as one list in the main area, in place of a plan.
// It is not one of the plan's sheets and holds nothing of its own; it is another way of looking
// at plan.issues. The floor that was open stays the current floor underneath it.

const ISSUE_GROUPS = {
  category: { label: 'Category', keys: () => CATS.map((c) => c.id), of: (i) => cat(i.category).id, name: (k) => cat(k).label, color: (k) => cat(k).color },
  floor: { label: 'Sheet', keys: () => ['', ...plan.floors.map((f) => f.id)], of: (i) => (issueFloor(i) ? i.floorId : ''), name: (k) => plan.floors.find((f) => f.id === k)?.name || 'Whole house' },
  status: { label: 'Status', keys: () => STATUSES, of: (i) => i.status, name: (k) => k },
  none: { label: 'Nothing: one list in number order', keys: () => [''], of: () => '', name: () => '' },
};

const issueFloor = (i) => plan.floors.find((f) => f.id === i.floorId);
// Rooms are drawn as the clear space inside their walls, so a wall is the gap between two rooms, or
// the strip along the outside of one. A pin that is in no room but within this far of one is taken
// to be in its wall.
const WALL_REACH = 1; // feet
const distToShape = (r, p) => Math.min(...outlinePoints(r).map((a, n, pts) => distToSegment(p, a, pts[(n + 1) % pts.length])));
// The rooms whose wall a spot is in, nearest first; none for a spot inside a room or out in the open.
function wallRooms(f, p) {
  if (!f || f.rooms.some((r) => shapeContains(r, p))) return [];
  return f.rooms.map((r) => ({ r, d: distToShape(r, p) })).filter((x) => x.d <= WALL_REACH).sort((a, b) => a.d - b.d).map((x) => x.r);
}
// The room an issue's pin is in, or the nearest room whose wall it is in.
const issueRoom = (i) => (pinned(i) ? [...(issueFloor(i)?.rooms || [])].reverse().find((r) => shapeContains(r, i)) || wallRooms(issueFloor(i), i)[0] : undefined);
// A cost as a range, or as one figure where there is no range to give, as with an accepted quote.
const costRange = (list) => (costLow(list) === costHigh(list) ? money(costLow(list)) : `${money(costLow(list))} to ${money(costHigh(list))}`);
// The same for a list in which some issues may have no figure yet: "$400 to $900 · 2 not priced".
const costWords = (list) => (list.length && list.every(unpriced) ? 'not priced' : costRange(list) + unpricedNote(list));

// Puts the plan or the list in the main area, whichever is wanted. A list cannot be drawn on, so
// the drawing tools are out of use while it shows.
function applySheet() {
  $('#stage').hidden = onList();
  $('#guide').hidden = onList();
  $('#issuesSheet').hidden = !onIssues;
  $('#houseSheet').hidden = !onHouse;
  for (const b of document.querySelectorAll('#tools button, #btnFit')) b.disabled = onList();
}

function issueCard(i) {
  const f = issueFloor(i);
  const shots = i.photoIds.flatMap((id) => shotsOf(plan.photos.find((p) => p.id === id) || {})).filter((s) => s.file);
  const where = [issuePlace(i), issueRoom(i)?.name || (f?.kind === 'exterior' && pinned(i) ? 'Exterior' : ''), cat(i.category).label].filter(Boolean);
  const on = sel?.type === 'issue' && sel.id === i.id;
  return `<article class="issueCard${on ? ' sel' : ''}${i.status === 'Done' ? ' done' : ''}" data-id="${i.id}">
      <span class="num" style="background:${cat(i.category).color}">${issueNum(i)}</span>
      <div class="body">
        <h3>${esc(i.title)}</h3>
        <p class="muted">${where.map(esc).join(' · ')}</p>
        ${i.description ? `<p class="desc">${esc(i.description)}</p>` : ''}
        ${i.photo ? `<p class="desc muted">Photo note: ${esc(i.photo)}</p>` : ''}
        ${i.when || i.trade ? `<p class="desc muted">${[i.when && `How soon: ${whenWords(i)}`, i.trade && `Trade: ${esc(i.trade)}`].filter(Boolean).join(' · ')}</p>` : ''}
        ${afterOf(i).length ? `<p class="desc muted">After ${afterOf(i).map((x) => `#${issueNum(x)}${x.status === 'Done' ? ' (done)' : ''}`).join(', ')}</p>` : ''}
        ${quotesOf(i).length ? `<p class="desc quotes"><b>Quotes:</b> ${quotesOf(i).map((q) => esc(quoteLine(q))).join(' · ')}</p>` : ''}
        ${shots.length ? `<div class="shots">${shots.map((s) => `<img data-thumb data-photo="${esc(s.file)}" data-open-shot="${esc(s.file)}" alt="" title="${esc(baseOf(s.file))}: open full size">`).join('')}</div>` : ''}
      </div>
      <div class="side">
        <span class="status s-${slug(i.status, 'open')}">${esc(i.status)}</span>
        <small class="muted">${issueCost(i).quoted ? 'Accepted quote' : 'My estimate'}</small>
        <b>${issueCost(i).quoted ? money(issueCost(i).low) : estimateText(i)}</b>
        ${pinned(i) ? `<button data-show="${i.id}" title="Goes to this issue's sheet with its pin selected">Show on plan</button>` : ''}
      </div>
    </article>`;
}

function renderIssuesSheet() {
  if (!onIssues) return;
  // The list of sheets to choose from follows the plan; what was chosen is kept.
  const floorBox = $('#isFloor');
  const chosen = floorBox.value;
  floorBox.innerHTML = '<option value="">Every sheet</option>' + plan.floors.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
  floorBox.value = plan.floors.some((f) => f.id === chosen) ? chosen : '';
  // The rooms that have issues in them, on the sheet chosen or on every sheet, named with their
  // sheet where more than one is listed. "Not in a room" takes the rest: whole floors, the whole
  // house, and pins out in the open.
  const roomBox = $('#isRoom');
  const room = roomBox.value;
  const rooms = [];
  for (const i of plan.issues) {
    const r = issueRoom(i);
    if (r && !rooms.includes(r) && (!floorBox.value || i.floorId === floorBox.value)) rooms.push(r);
  }
  const sheetOf = (r) => plan.floors.find((f) => f.rooms.includes(r));
  const label = (r) => roomTitle(r) + (floorBox.value ? '' : ` (${sheetOf(r).name})`);
  rooms.sort((a, b) => plan.floors.indexOf(sheetOf(a)) - plan.floors.indexOf(sheetOf(b)) || roomTitle(a).localeCompare(roomTitle(b)));
  roomBox.innerHTML = '<option value="">Every room</option>' + rooms.map((r) => `<option value="${r.id}">${esc(label(r))}</option>`).join('') + '<option value="none">Not in a room</option>';
  roomBox.value = room === 'none' || rooms.some((r) => r.id === room) ? room : '';

  const status = $('#isStatus').value;
  const shown = plan.issues.filter((i) => (!status || (status === 'open' ? i.status !== 'Done' : i.status === status))
    && (!$('#isCat').value || i.category === $('#isCat').value)
    && (!floorBox.value || i.floorId === floorBox.value)
    && (!roomBox.value || (roomBox.value === 'none' ? !issueRoom(i) : issueRoom(i)?.id === roomBox.value)));
  const open = shown.filter((i) => i.status !== 'Done');
  $('#isSummary').innerHTML = plan.issues.length
    ? `<b>${open.length}</b> to do, <b>${costWords(open)}</b>${shown.length > open.length ? ` · ${shown.length - open.length} done` : ''}${shown.length < plan.issues.length ? ` · showing ${shown.length} of ${plan.issues.length}` : ''}`
    : '';

  const g = ISSUE_GROUPS[$('#isGroup').value];
  const groups = g.keys().map((k) => [k, shown.filter((i) => g.of(i) === k)]).filter(([, list]) => list.length);
  const body = $('#isList');
  body.innerHTML = groups.map(([k, list]) => {
    const todo = list.filter((i) => i.status !== 'Done');
    const head = g.name(k) ? `<h2>${g.color ? `<span class="dot" style="background:${g.color(k)}"></span>` : ''}${esc(g.name(k))}
        <span class="muted">${list.length} ${list.length === 1 ? 'issue' : 'issues'}${todo.length ? ` · ${costWords(todo)}${todo.every(unpriced) ? '' : ', to do'}` : ''}</span></h2>` : '';
    return `<section>${head}${list.map(issueCard).join('')}</section>`;
  }).join('') || `<p class="muted">${plan.issues.length
    ? 'No issue matches what is chosen above.'
    : 'No issues have been tagged yet. Open a floor, choose <i>Issue</i> in the toolbar and click the spot on the plan. For something with no one spot, such as the roof or the wiring, use <i>Add issue without a pin</i> above.'}</p>`;
  hydrateImages(body);
}

$('#issuesSheet').addEventListener('change', (e) => {
  if (e.target.matches('.bar select')) renderIssuesSheet();
});

$('#isList').addEventListener('click', (e) => {
  const { openShot, show } = e.target.dataset;
  if (openShot) return openLightbox(openShot, baseOf(openShot));
  const card = e.target.closest('.issueCard');
  if (!card) return;
  const i = plan.issues.find((x) => x.id === card.dataset.id);
  if (show) return goTo({ floorId: i.floorId, sel: { type: 'issue', id: i.id }, points: [i] });
  // Choosing one shows it in the side panel to be read or changed; the list stays where it is.
  sel = { type: 'issue', id: i.id };
  renderAll();
  revealPanel();
});

// An issue that belongs to no one spot: the roof, the wiring, damp through a whole basement. It
// is asked what it is about, and can be given a pin later.
async function addUnpinnedIssue() {
  const picked = await ask('What is this issue about?', {
    ok: 'Add issue',
    choice: 'house',
    choices: [{ value: 'house', label: 'The whole house: the roof, wiring, plumbing, radon and the like' }, ...plan.floors.map((f) => ({ value: f.id, label: `The whole of ${f.name}` }))],
    detail: 'For something that has no one spot to pin. It is listed, counted and exported like any other issue, and a pin can be put on the plan later.',
  });
  if (!picked) return;
  const issue = newIssue({ floorId: picked === 'house' ? null : picked, x: null, y: null });
  plan.issues.push(issue);
  sel = { type: 'issue', id: issue.id };
  save();
  showSide('issues');
  renderAll();
  revealPanel();
}

// Lets an issue that has no pin be given one: the Issue tool, on the issue's own sheet, with the
// next click placing this issue instead of making a new one.
function placePin(i) {
  goTo({ floorId: i.floorId, sel: { type: 'issue', id: i.id } });
  setTool('pin');
  pinFor = i.id;
  renderCanvas();
  flash(`Click the spot on this sheet where issue #${issueNum(i)} is. Esc cancels.`);
}

for (const b of document.querySelectorAll('.addNoPin')) b.addEventListener('click', addUnpinnedIssue);

$('#isCat').innerHTML = '<option value="">Every category</option>' + CATS.map((c) => `<option value="${c.id}">${c.label}</option>`).join('');
$('#isGroup').innerHTML = Object.entries(ISSUE_GROUPS).map(([k, g]) => `<option value="${k}">${g.label}</option>`).join('');

// ---------- professional quotes ----------
// An issue carries the owner's own cost estimate, and beside it any number of quotes from
// tradespeople: `quotes` on the issue, each with who it is from, what it comes to and, if there
// is one, the quote itself as a file copied into the project's `quotes` folder (`doc`).

const DIR_QUOTES = 'quotes';
const QUOTE_STATUSES = ['Received', 'Accepted', 'Declined'];
// Rows of the form: [key, label, kind]. Two short boxes share a row.
const QUOTE_FIELDS = [
  [['company', 'Company'], ['contact', 'Contact person']],
  [['phone', 'Phone'], ['email', 'Email']],
  [['address', 'Address or website']],
  [['number', 'Quote or order #'], ['license', 'License or insurance #']],
  [['date', 'Date of quote', 'date'], ['validUntil', 'Valid until', 'date']],
  [['amount', 'Amount ($)', 'num'], ['deposit', 'Deposit required ($)', 'num']],
  [['timeline', 'Start and how long'], ['warranty', 'Warranty']],
  [['status', 'Decision', 'status']],
  [['scope', 'What is included', 'area']],
  [['notes', 'Notes: exclusions, terms, payment', 'area']],
];

let quoteOpen = ''; // the quote whose form is open in the side panel
let quoteFor = ''; // the quote a file is being chosen for

const quotesOf = (i) => i.quotes || [];

// ---------- before and after ----------

// On an issue marked Done, each of its photos is from before the work or after it: taken on or
// after the day it was marked done counts as after, and taken earlier, or on no known day, as
// before. Where that is wrong, the owner sets it, and it is kept in `i.shotPhase` by photo id.
function shotPhase(i, shot) {
  const set = i.shotPhase?.[shot.id];
  if (set) return set;
  return i.doneOn && shot.taken && shot.taken.slice(0, 10) >= i.doneOn ? 'after' : 'before';
}

// The photos of an issue, the befores first, as [{ ph, shot, phase }]. Phase is '' unless it is Done.
function phasedShots(i) {
  const shots = i.photoIds.map((id) => plan.photos.find((p) => p.id === id)).filter(Boolean)
    .flatMap((ph) => shotsOf(ph).filter((s) => s.file).map((shot) => ({ ph, shot, phase: i.status === 'Done' ? shotPhase(i, shot) : '' })));
  return shots.sort((a, b) => (a.phase === 'after') - (b.phase === 'after'));
}
const quoteName = (q) => q.company || q.contact || 'Unnamed company';
const quoteLine = (q) => `${quoteName(q)}: ${money(q.amount)}${q.status && q.status !== 'Received' ? ` (${q.status.toLowerCase()})` : ''}`;

function quoteField(q, [key, label, kind]) {
  const at = `data-q="${q.id}" data-qf="${key}"`;
  const v = q[key] ?? '';
  if (kind === 'area') return `<label>${label}<textarea ${at}>${esc(v)}</textarea></label>`;
  if (kind === 'status') return `<label>${label}<select ${at}>${QUOTE_STATUSES.map((s) => `<option${s === (v || 'Received') ? ' selected' : ''}>${s}</option>`).join('')}</select></label>`;
  const type = kind === 'num' ? 'type="number" step="50" data-num' : kind === 'date' ? 'type="date"' : '';
  return `<label>${label}<input ${at} ${type} value="${esc(v)}"></label>`;
}

// The quotes on an issue, as shown under its estimate in the side panel. Each folds down to one
// line, so that several of them do not push everything else out of sight.
function quotesHtml(i) {
  const list = quotesOf(i).map((q) => `<details class="quote" data-quote="${q.id}"${q.id === quoteOpen ? ' open' : ''}>
      <summary><span>${esc(quoteName(q))}</span><b>${money(q.amount)}</b></summary>
      ${QUOTE_FIELDS.map((row) => (row.length > 1 ? `<div class="row">${row.map((f) => quoteField(q, f)).join('')}</div>` : quoteField(q, row[0]))).join('')}
      <label>The quote as a file</label>
      ${q.doc ? `<p class="muted path">${esc(q.doc)}</p>` : '<p class="muted small">A PDF, a scan or a photo of the quote. It is copied into the project’s <i>quotes</i> folder.</p>'}
      <div class="actions">
        ${q.doc ? `<button data-q-open="${q.id}" title="Opens the file in a new tab">Open file</button>` : ''}
        <button data-q-attach="${q.id}">${q.doc ? 'Replace file…' : 'Attach file…'}</button>
        <button class="danger" data-q-remove="${q.id}">Remove quote</button>
      </div>
    </details>`).join('');
  return `<p class="note step" id="quoteNote"${issueCost(i).quoted ? '' : ' hidden'}>${quoteNote(i)}</p>
    <label>Professional quotes${quotesOf(i).length ? ` (${quotesOf(i).length})` : ''}</label>
    ${list}
    <div class="actions"><button id="btnAddQuote" title="A quote from a contractor or tradesperson for this issue: who it is from, what it comes to, and the quote itself as a file">Add professional quote</button></div>`;
}

// Said under the estimate once a quote has been accepted, so that it is plain which figure counts.
const quoteNote = (i) => `An accepted quote of <b>${money(issueCost(i).low)}</b> is used for this issue in every total, in place of the estimate above.`;

function addQuote(i) {
  const q = { id: uid(), company: '', amount: 0, date: new Date().toLocaleDateString('en-CA'), status: 'Received' };
  i.quotes = [...quotesOf(i), q];
  quoteOpen = q.id;
  save();
  renderAll();
  $(`#inspector [data-q="${q.id}"]`)?.focus();
}

async function attachQuote(q, file) {
  try {
    await io(async () => {
      const name = await store.freeName(DIR_QUOTES, stemOf(file.name), extOf(file.name));
      await store.write(`${DIR_QUOTES}/${name}`, file);
      if (q.doc) await store.remove(q.doc).catch(() => {});
      q.doc = `${DIR_QUOTES}/${name}`;
      q.original = file.name;
    });
  } catch (e) {
    return tell('Could not copy the file into the project: ' + e.message);
  }
  save();
  resetHistory(); // undo does not move files, so it starts again from here
  renderAll();
}

async function openQuoteFile(q) {
  try {
    const url = URL.createObjectURL(await store.file(q.doc));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    tell(`${q.doc} is not in the project folder any more. Use “Replace file…” to attach it again.`);
  }
}

async function deleteQuoteFiles(quotes) {
  for (const q of quotes) if (q.doc) await io(() => store.remove(q.doc)).catch(() => {});
}

async function removeQuote(i, q) {
  const sure = await ask(`Remove the quote from ${quoteName(q)}?`, {
    ok: 'Remove quote', danger: true,
    detail: q.doc ? `Its file, ${baseOf(q.doc)}, is deleted from the project’s quotes folder and cannot be brought back.` : '',
  });
  if (!sure) return;
  await deleteQuoteFiles([q]);
  i.quotes = quotesOf(i).filter((x) => x !== q);
  save();
  if (q.doc) resetHistory();
  renderAll();
}

// Deleting an issue that has quote files deletes those files with it, so it is asked about first.
async function deleteIssueWithQuotes(i) {
  const docs = quotesOf(i).filter((q) => q.doc);
  const sure = await ask(`Delete issue #${issueNum(i)}, “${i.title}”, and its quotes?`, {
    ok: 'Delete issue', danger: true,
    detail: `${docs.length === 1 ? 'The quote file' : `The ${docs.length} quote files`} attached to it (${docs.map((q) => baseOf(q.doc)).join(', ')}) ${docs.length === 1 ? 'is' : 'are'} deleted from the project’s quotes folder and cannot be brought back.`,
  });
  if (!sure) {
    sel = { type: 'issue', id: i.id };
    return renderAll();
  }
  await deleteQuoteFiles(docs);
  plan.issues = plan.issues.filter((x) => x !== i);
  save();
  resetHistory();
  renderAll();
}

const quoteById = (id) => quotesOf(selIssue() || {}).find((q) => q.id === id);

$('#inspector').addEventListener('input', (e) => {
  const q = quoteById(e.target.dataset.q);
  if (!q) return;
  const key = e.target.dataset.qf;
  q[key] = 'num' in e.target.dataset ? parseFloat(e.target.value) || 0 : e.target.value;
  if (key === 'company' || key === 'contact') e.target.closest('.quote').querySelector('summary span').textContent = quoteName(q);
  if (key === 'amount') e.target.closest('.quote').querySelector('summary b').textContent = money(q.amount);
  // Accepting a quote, or changing what an accepted one comes to, changes what the issue costs.
  $('#quoteNote').hidden = !issueCost(selIssue()).quoted;
  $('#quoteNote').innerHTML = quoteNote(selIssue());
  save(true);
  renderIssues();
});

// Which quote is folded open is remembered, so that it stays open when the panel is redrawn.
$('#inspector').addEventListener('toggle', (e) => {
  const id = e.target.dataset?.quote;
  if (!id) return;
  if (e.target.open) quoteOpen = id;
  else if (quoteOpen === id) quoteOpen = '';
}, true);

$('#inspector').addEventListener('click', (e) => {
  const i = selIssue();
  if (!i) return;
  if (e.target.id === 'btnAddQuote') return addQuote(i);
  const { qOpen, qAttach, qRemove } = e.target.dataset;
  if (qOpen) openQuoteFile(quoteById(qOpen));
  if (qRemove) removeQuote(i, quoteById(qRemove));
  if (qAttach) {
    quoteFor = qAttach;
    $('#quoteInput').click();
  }
});

$('#quoteInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  const q = quoteById(quoteFor);
  if (file && q) attachQuote(q, file);
});
