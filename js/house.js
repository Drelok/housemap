'use strict';

// What is known about the house as a whole, beyond its plan: the facts a tradesperson or an AI
// assistant asks for first (`plan.facts`), what the owner wants from the house and is limited by
// (`plan.goals`), and a walkthrough checklist of the things every house has, each marked fine, an
// issue or not known (`plan.checklist`). This file holds what is asked and draws the three forms;
// where they are shown is decided elsewhere.

const UNKNOWN = 'Don’t know';

// [key, label, kind]. The kind is 'year', 'text', 'area' for a longer box, or a list of answers,
// to which "Don't know" is added. Answers are kept as the words chosen, so the plan file reads plainly.
const FACTS = [
  ['built', 'Year built', 'year'],
  ['foundation', 'Foundation', ['Full basement', 'Partial basement', 'Crawl space', 'Concrete slab', 'Piers or posts', 'More than one kind']],
  ['basementWalls', 'Basement walls', ['Poured concrete', 'Concrete block', 'Stone', 'Brick', 'Wood', 'No basement']],
  ['walls', 'Outside walls', ['Wood or fibre-cement siding', 'Vinyl or metal siding', 'Brick or stone veneer', 'Solid brick or stone', 'Stucco', 'More than one kind']],
  ['roof', 'Roof covering', ['Asphalt shingles', 'Metal', 'Tile or slate', 'Wood shakes', 'Flat or membrane', 'More than one kind']],
  ['roofYear', 'Roof last replaced (year)', 'year'],
  ['supply', 'Water supply pipes', ['Copper', 'PEX (plastic)', 'CPVC (plastic)', 'Galvanized steel', 'Polybutylene (grey plastic)', 'Lead', 'More than one kind']],
  ['drains', 'Drain pipes', ['PVC or ABS (plastic)', 'Cast iron', 'Clay', 'Galvanized steel', 'More than one kind']],
  ['service', 'Electrical service', ['60 amp', '100 amp', '150 amp', '200 amp or more']],
  ['panel', 'Electrical panel', ['Circuit breakers', 'Fuses', 'Both']],
  ['wiring', 'Wiring', ['Copper, with ground', 'Copper, no ground (two-prong outlets)', 'Aluminium', 'Knob and tube', 'More than one kind']],
  ['heating', 'Heating', ['Gas furnace', 'Electric furnace', 'Heat pump', 'Boiler with radiators', 'Electric baseboard', 'Wood or pellet stove', 'None', 'Something else']],
  ['heatingYear', 'Heating installed (year)', 'year'],
  ['cooling', 'Cooling', ['Central air', 'Heat pump', 'Mini-split', 'Window units', 'None']],
  ['coolingYear', 'Cooling installed (year)', 'year'],
  ['waterHeater', 'Water heater', ['Gas, with a tank', 'Electric, with a tank', 'Tankless', 'Heat pump']],
  ['waterHeaterYear', 'Water heater installed (year)', 'year'],
  ['sewer', 'Waste water goes to', ['City sewer', 'Septic tank']],
  ['water', 'Water comes from', ['City supply', 'Well']],
  ['events', 'What has happened to the house: storms, floods, fires, big repairs, insurance claims', 'area'],
  ['other', 'Anything else worth knowing', 'area'],
];

// An answer that leaves out which kinds, or what else, gets a box beside it to say so. What is
// typed there is kept under the fact's key with "Detail" on the end, such as `foundationDetail`.
const DETAIL_ANSWERS = ['More than one kind', 'Partial basement', 'Something else', 'Both'];
const DETAIL_HINTS = {
  foundation: 'Which part is which, such as: basement under the main house, crawl space under the addition, slab under the garage',
  'Partial basement': 'What is under the rest of the house: crawl space, slab',
};
const detailHint = (key, answer) => DETAIL_HINTS[answer] || DETAIL_HINTS[key] || 'Which kinds, and where';

const GOALS = [
  ['plan', 'Plans for the house', ['Staying for many years', 'Staying a few years', 'Selling soon', 'Renting it out', 'Not decided']],
  ['timeline', 'Timeline: anything that has to be done by a certain date', 'text'],
  ['diy', 'What I can do myself', 'area'],
  ['order', 'Work that has to happen in a set order, or at a set time of year', 'area'],
  ['notes', 'Other goals or limits', 'area'],
];
// Kept in a box of their own, `plan.goals.money`, and left out of exports unless asked for.
const GOALS_MONEY = [
  ['budget', 'Budget for repairs', 'text'],
  ['notes', 'Other money matters: financing, insurance, what is already set aside', 'area'],
];

// Who lives in the house, which decides what matters most: a walk-in shower for someone who finds
// a bath hard to step into, mould for someone with asthma. Kept in `plan.household`, and left out
// of exports unless asked for, as it says private things about the people.
const HOUSEHOLD = [
  ['people', 'Who lives here: how many adults and children, and roughly how old', 'area'],
  ['mobility', 'Anyone who finds stairs, steps or a bathtub hard, or uses a cane, walker or wheelchair', 'area'],
  ['health', 'Health the house can affect: asthma, allergies, or anyone more at risk from mould, radon, lead or carbon monoxide', 'area'],
  ['pets', 'Pets', 'text'],
  ['changes', 'Changes coming: someone moving in or out, a baby, staying on into old age', 'area'],
];

// [key, what to look at, what to look for]
const CHECKS = [
  ['roof', 'Roof', 'missing or curled shingles, sagging, flashing round chimneys and vents'],
  ['gutters', 'Gutters and downspouts', 'loose or blocked runs, water let out right at the foundation'],
  ['grading', 'Grading and drainage', 'ground that slopes toward the house, standing water after rain'],
  ['foundation', 'Foundation', 'cracks, bowing, damp or white powder on basement walls'],
  ['siding', 'Outside walls, trim and paint', 'rot, gaps, peeling paint, cracked brick or mortar'],
  ['windows', 'Windows and outside doors', 'rot, broken seals, draughts, ones that stick'],
  ['attic', 'Attic, insulation and ventilation', 'stains under the roof, thin insulation, blocked vents'],
  ['plumbing', 'Plumbing', 'leaks, slow drains, low pressure, old supply or drain pipes'],
  ['waterHeater', 'Water heater', 'age, rust, leaks, no relief valve pipe'],
  ['electrical', 'Electrical', 'old panel, two-prong outlets, flickering, warm switches, no GFCI near water'],
  ['hvac', 'Heating and cooling', 'age, odd noises, rooms that do not heat or cool, dirty filters'],
  ['alarms', 'Smoke and carbon monoxide alarms', 'missing, old or not working'],
  ['pests', 'Pests', 'termites, carpenter ants, mice, droppings, chewed wood'],
  ['radon', 'Radon', 'whether it has ever been tested'],
  ['hazards', 'Hazardous materials', 'asbestos (old tile, pipe wrap, siding), lead paint or pipes, mould'],
  ['outside', 'Fences, sheds, decks, steps and drives', 'rot, loose railings, heaving, trip hazards'],
];
const CHECK_STATES = [['fine', 'Fine'], ['issue', 'Issue'], ['unknown', UNKNOWN]];

const houseFacts = () => (plan.facts ||= {});
const houseGoals = () => (plan.goals ||= {});
const houseMoney = () => (houseGoals().money ||= {});
const houseChecks = () => (plan.checklist ||= {});
const houseHousehold = () => (plan.household ||= {});
const HOUSE_GROUPS = { facts: houseFacts, goals: houseGoals, money: houseMoney, household: houseHousehold };
// The issue a checklist line led to, if it is still there.
const checkIssue = (key) => plan.issues.find((i) => i.id === houseChecks()[key]?.issueId);
const filled = (list, obj) => list.filter(([key]) => obj[key] !== undefined && obj[key] !== '').length;
// How far along each form is, for showing beside its name.
const houseProgress = () => ({
  facts: `${filled(FACTS, houseFacts())} of ${FACTS.length}`,
  goals: `${filled(GOALS, houseGoals())} of ${GOALS.length}`,
  household: `${filled(HOUSEHOLD, houseHousehold())} of ${HOUSEHOLD.length}`,
  checklist: `${CHECKS.filter(([key]) => houseChecks()[key]?.state).length} of ${CHECKS.length}`,
});

// One box of a form. `group` says which part of the plan it belongs to: facts, goals or money.
function houseField(group, [key, label, kind], obj) {
  const at = `data-house="${group}" data-key="${key}"`;
  const v = obj[key] ?? '';
  if (Array.isArray(kind)) {
    const select = `<label>${label}<select ${at}>${['', ...kind, UNKNOWN].map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
    if (!DETAIL_ANSWERS.includes(v)) return select;
    const detail = obj[key + 'Detail'] ?? '';
    return `${select}<label class="wide">${label}: which, and where<input data-house="${group}" data-key="${key}Detail" placeholder="${esc(detailHint(key, v))}" value="${esc(detail)}"></label>`;
  }
  if (kind === 'area') return `<label class="wide">${label}<textarea ${at}>${esc(v)}</textarea></label>`;
  if (kind === 'year') return `<label>${label}<input ${at} type="number" min="1700" max="2100" step="1" placeholder="Leave empty if not known" value="${esc(v)}"></label>`;
  return `<label class="wide">${label}<input ${at} value="${esc(v)}"></label>`;
}

function factsHtml() {
  return `<p class="muted">What the house is made of and how old its main parts are. An AI assistant, or a tradesperson on the phone, cannot judge a house without these. Answer what you know and choose <i>${UNKNOWN}</i> for what you do not: that is useful to know as well.</p>
    <div class="houseForm">
      <label>North is toward<select data-house="north">${NORTH_CHOICES.map(([v, l]) => `<option value="${v}"${v === (northSet() ? String(plan.north) : '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      ${FACTS.map((f) => houseField('facts', f, houseFacts())).join('')}
    </div>`;
}

function goalsHtml() {
  return `<p class="muted">What you want from the house and what limits you. The same list of issues calls for different advice from someone selling next year than from someone staying twenty.</p>
    <div class="houseForm">${GOALS.map((g) => houseField('goals', g, houseGoals())).join('')}</div>
    <div class="moneyBox">
      <h3>Money</h3>
      <p class="muted small">Kept apart from the rest. These two boxes are left out of the export for AI unless you tick the box for them when exporting.</p>
      <div class="houseForm">${GOALS_MONEY.map((g) => houseField('money', g, houseMoney())).join('')}</div>
    </div>`;
}

function householdHtml() {
  return `<div class="moneyBox">
      <p class="muted small">Private, so kept apart like the money box: left out of the export for AI unless you tick the box for it when exporting. Who lives in a house decides what matters most in it, such as a walk-in shower for someone who finds a bath hard to step into, or damp and mould for someone with asthma.</p>
      <div class="houseForm">${HOUSEHOLD.map((h) => houseField('household', h, houseHousehold())).join('')}</div>
    </div>`;
}

// On an issue's own form: the walkthrough line it is the issue for, which can be set from there as
// well as from the House sheet. A line already linked to another issue says which.
function issueCheckHtml(i) {
  const mine = CHECKS.find(([key]) => houseChecks()[key]?.issueId === i.id)?.[0] || '';
  const option = ([key, label]) => {
    const other = checkIssue(key);
    return `<option value="${key}"${key === mine ? ' selected' : ''}>${esc(label)}${other && other !== i ? ` (now issue #${issueNum(other)})` : ''}</option>`;
  };
  return `<label title="The line of the walkthrough checklist, on the House sheet, that this issue was found under. Choosing one marks that line Issue and links this issue to it; a line can have one issue linked.">Walkthrough checklist line<select id="issueCheck"><option value="">None</option>${CHECKS.map(option).join('')}</select></label>`;
}

function setIssueCheck(i, key) {
  for (const [k] of CHECKS) if (houseChecks()[k]?.issueId === i.id) delete houseChecks()[k].issueId;
  if (key) Object.assign((houseChecks()[key] ||= {}), { state: 'issue', issueId: i.id });
  save();
  renderAll();
}

// A list of the issues already made, to link one to a checklist line instead of adding another.
function linkChoice(key) {
  if (!plan.issues.length) return '';
  const issues = [...plan.issues].sort((a, b) => issueNum(a) - issueNum(b));
  return `<select data-check-link="${key}" title="Links an issue already made, such as one pinned on the plan, to this line">
      <option value="">or link one already made…</option>${issues.map((i) => `<option value="${i.id}">#${issueNum(i)} ${esc(i.title)}</option>`).join('')}</select>`;
}

function checklistHtml() {
  const row = ([key, label, hint]) => {
    const c = houseChecks()[key] || {};
    const issue = checkIssue(key);
    return `<div class="checkRow${c.state ? ' ' + c.state : ''}">
        <div class="what"><b>${label}</b><span class="muted small">${hint}</span></div>
        <div class="states">${CHECK_STATES.map(([v, l]) => `<label class="check"><input type="radio" name="check-${key}" data-check="${key}" value="${v}"${c.state === v ? ' checked' : ''}> ${l}</label>`).join('')}</div>
        <input data-house="check" data-key="${key}" placeholder="Note" value="${esc(c.note || '')}">
        ${issue ? `<p class="note issueLink"><span class="dot" style="background:${cat(issue.category).color}"></span>Issue #${issueNum(issue)}: <b>${esc(issue.title)}</b> · ${esc(issue.status)}
            <button type="button" data-check-goto="${key}" title="Shows that issue under the Issues tab">Go to issue</button>
            <button type="button" data-check-unlink="${key}" title="Leaves the issue as it is, and this line marked Issue with no issue linked">Unlink</button></p>`
          : c.state === 'issue' ? `<p class="note issueLink">No issue is linked to this yet. <button type="button" data-check-add="${key}">Add an issue</button>${linkChoice(key)}</p>` : ''}
      </div>`;
  };
  return `<p class="muted">Walk round the house with this list and mark each line. It is here to catch what a list of pinned issues misses: the things that belong to the whole house and so never get a pin. Marking a line <i>Issue</i> offers to add one for it, or to link one you have already made.</p>
    <div class="checkList">${CHECKS.map(row).join('')}</div>`;
}

const HOUSE_PARTS = { facts: ['House facts', factsHtml], goals: ['Goals and limits', goalsHtml], household: ['Household', householdHtml], checklist: ['Walkthrough checklist', checklistHtml] };

// Adds an issue for a line of the checklist: one about the whole house, with no pin, named after
// the line and carrying its note. It can be described, and pinned, under the Issues tab.
function addCheckIssue(key) {
  const c = (houseChecks()[key] ||= {});
  const issue = newIssue({ floorId: null, x: null, y: null, title: CHECKS.find(([k]) => k === key)[1], description: c.note || '' });
  plan.issues.push(issue);
  Object.assign(c, { state: 'issue', issueId: issue.id });
  save();
  renderAll();
}

async function setCheck(key, state, redraw) {
  (houseChecks()[key] ||= {}).state = state;
  save();
  redraw();
  if (state !== 'issue' || checkIssue(key)) return;
  const label = CHECKS.find(([k]) => k === key)[1];
  const yes = await ask(`Add an issue for “${label}”?`, {
    ok: 'Add issue', cancel: 'Not now',
    detail: 'It is added as an issue about the whole house, with no pin, and listed with the others. Open it under the Issues tab to describe it, give it a cost, or pin it to a spot.',
  });
  if (!yes) return;
  addCheckIssue(key);
  redraw();
}

// Makes the forms inside `el` work. `redraw` draws them again after a change that alters what is shown.
function wireHouse(el, redraw) {
  el.addEventListener('input', (e) => {
    const { house, key } = e.target.dataset;
    if (!house || e.target.matches('select')) return;
    const typed = e.target.type === 'number' ? (e.target.value === '' ? '' : +e.target.value) : e.target.value;
    if (house === 'check') (houseChecks()[key] ||= {}).note = typed;
    else HOUSE_GROUPS[house]()[key] = typed;
    save(true);
  });
  el.addEventListener('change', (e) => {
    const { house, key, check, checkLink } = e.target.dataset;
    if (check) return setCheck(check, e.target.value, redraw);
    if (checkLink && e.target.value) {
      Object.assign((houseChecks()[checkLink] ||= {}), { state: 'issue', issueId: e.target.value });
      save();
      return redraw();
    }
    if (!house || !e.target.matches('select')) return;
    if (house === 'north') plan.north = e.target.value === '' ? null : +e.target.value;
    else HOUSE_GROUPS[house]()[key] = e.target.value;
    save();
    // An answer such as "More than one kind" brings a box to say which; another takes it away.
    if (house === 'facts') redraw();
  });
  el.addEventListener('click', (e) => {
    const { checkGoto, checkAdd, checkUnlink } = e.target.dataset;
    if (checkAdd) {
      addCheckIssue(checkAdd);
      redraw();
    }
    if (checkUnlink) {
      delete houseChecks()[checkUnlink].issueId;
      save();
      redraw();
    }
    if (checkGoto) showCheckIssue(checkIssue(checkGoto));
  });
}

// Leaves the form for the issue a checklist line led to, shown under the Issues tab.
function showCheckIssue(i) {
  if ($('#tipsDialog').open) $('#tipsDialog').close();
  goTo({ floorId: i.floorId, sel: { type: 'issue', id: i.id }, points: [i] });
  showSide('issues');
  revealPanel();
}

// ---------- the House sheet ----------
// The three forms one under another in the main area, in place of a plan, under the House tab at
// the end of the row of sheets. Like the Issues sheet it is not one of the plan's sheets.

function renderHouseSheet() {
  if (!onHouse) return;
  const done = houseProgress();
  $('#houseBody').innerHTML = Object.entries(HOUSE_PARTS).map(([key, [title, html]]) => `<section>
      <h2>${title} <span class="muted">${done[key]} answered</span></h2>
      ${html()}
    </section>`).join('');
}

wireHouse($('#houseSheet'), renderHouseSheet);

// ---------- in the export for AI ----------

const yearWords = (y) => `${y} (about ${Math.max(0, new Date().getFullYear() - y)} years ago)`;

// What was typed beside an answer such as "More than one kind", while that answer still stands.
function factDetail(key) {
  const detail = houseFacts()[key + 'Detail'];
  return detail && DETAIL_ANSWERS.includes(houseFacts()[key]) ? `: ${lines(detail)}` : '';
}

function houseBrief(withMoney, withHousehold) {
  const say = (obj) => ([key, label, kind]) => `- **${label}:** ${obj[key] === undefined || obj[key] === '' ? 'not answered' : kind === 'year' ? yearWords(obj[key]) : lines(obj[key])}`;
  const checks = CHECKS.map(([key, label]) => {
    const c = houseChecks()[key] || {};
    const issue = checkIssue(key);
    const state = { fine: 'looked at, fine', issue: issue ? `has an issue: issue ${issueNum(issue)}` : 'has an issue, not yet written up', unknown: 'looked at, but the owner cannot tell' }[c.state] || 'not looked at yet';
    return `- **${label}:** ${state}${c.note ? `. Note: ${lines(c.note)}` : ''}`;
  });
  return `## House facts

"Not answered" and "${UNKNOWN}" both mean the owner could not say; these are worth asking about, or working out from the photos.

${FACTS.map((f) => say(houseFacts())(f) + factDetail(f[0])).join('\n')}

## Goals and limits

${GOALS.map(say(houseGoals())).join('\n')}${withMoney ? '\n' + GOALS_MONEY.map(say(houseMoney())).join('\n') : '\n- Budget and other money matters were left out of this brief by the owner.'}

## Household

${withHousehold ? `Who lives in the house, which bears on what matters most: access for someone who finds stairs or a bathtub hard, and how urgent damp, mould, radon or lead are for those most at risk.\n\n${HOUSEHOLD.map(say(houseHousehold())).join('\n')}` : 'Who lives in the house was left out of this brief by the owner. Ask if it bears on your advice, as it does for access, and for how urgent damp, mould, radon or lead are.'}

## Walkthrough checklist

The owner's own look round the house, line by line. A line marked as not looked at, or as one the owner cannot tell, is a gap rather than a clean bill of health.

${checks.join('\n')}`;
}
