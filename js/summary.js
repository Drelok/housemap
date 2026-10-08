'use strict';

// A one-page summary of the house, printed for an insurer or a buyer: its size, how it is built,
// its systems and appliances with their ages, the work done on it and the maintenance kept up. It
// is chosen in the Print window, and is built from what is already in the plan; nothing is kept
// for it. Open issues and what work cost are left off unless asked for there.

const SUMMARY_LIST = 10; // the most lines of work done, appliances or open issues that fit on the page

// The facts, in groups as a reader looks for them. Each is [key, label]; one not answered, or
// answered "Don't know", is left out.
const SUMMARY_FACTS = [
  ['Built', [['built', 'Year built'], ['foundation', 'Foundation'], ['basementWalls', 'Basement walls'], ['walls', 'Outside walls'], ['roof', 'Roof'], ['roofYear', 'Roof replaced']]],
  ['Systems', [['service', 'Electrical service'], ['panel', 'Panel'], ['wiring', 'Wiring'], ['supply', 'Water pipes'], ['drains', 'Drain pipes'], ['heating', 'Heating'], ['heatingYear', 'Heating installed'], ['cooling', 'Cooling'], ['coolingYear', 'Cooling installed'], ['waterHeater', 'Water heater'], ['waterHeaterYear', 'Water heater installed'], ['water', 'Water from'], ['sewer', 'Waste water to']]],
];

const ageWords = (y) => {
  const n = Math.max(0, new Date().getFullYear() - y);
  return `${y} (${n < 1 ? 'this year' : n === 1 ? 'about a year ago' : `about ${n} years ago`})`;
};

function factRows(list) {
  const facts = houseFacts();
  return list.map(([key, label]) => {
    const v = facts[key];
    if (v === undefined || v === '' || v === UNKNOWN) return '';
    const kind = FACTS.find(([k]) => k === key)?.[2];
    const text = kind === 'year' ? ageWords(+v) : String(v) + factDetail(key);
    return `<tr><th>${esc(label)}</th><td>${esc(text)}</td></tr>`;
  }).join('');
}

// Bedrooms and bathrooms, counted from the names of the rooms. A bathroom with a toilet or sink
// drawn in it but no tub or shower, or one named a half bath or powder room, is a half bath.
function roomCounts() {
  let bed = 0;
  let full = 0;
  let half = 0;
  for (const f of plan.floors.filter((x) => x.kind === 'floor')) {
    for (const r of f.rooms.filter((x) => !x.separate)) {
      if (/\bbed/i.test(r.name)) bed++;
      if (!/bath|powder|ensuite|en suite|wash ?room|\bwc\b/i.test(r.name)) continue;
      const kinds = f.items.filter((it) => roomAt(f, itemMiddle(it)) === r).map((it) => it.kind);
      const bathing = kinds.includes('tub') || kinds.includes('shower');
      if (/half|powder|\bwc\b/i.test(r.name) || (kinds.length && !bathing)) half++;
      else full++;
    }
  }
  const baths = [full && `${full} full`, half && `${half} half`].filter(Boolean).join(', ');
  return [bed && `${bed} bedroom${bed === 1 ? '' : 's'}`, baths && `bathrooms: ${baths}`].filter(Boolean).join(' · ');
}

function sizeRows() {
  const above = plan.floors.filter((f) => f.kind === 'floor' && !f.basement && f.rooms.length);
  const basement = plan.floors.some((f) => f.basement && f.rooms.length);
  const rows = [
    ['House area', houseArea() ? sqft(houseArea()) : ''],
    ['Floors above ground', above.length ? `${above.length} · ${sqft(aboveArea())}` : ''],
    ['Finished basement', basement ? sqft(finishedBasementArea()) : ''],
    ['Unfinished basement', basement && unfinishedBasementArea() ? sqft(unfinishedBasementArea()) : ''],
    ['Rooms', roomCounts()],
  ];
  return rows.filter(([, v]) => v).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
}

// A list that stops at what fits, saying how many more there are.
function capped(items, line, more) {
  const shown = items.slice(0, SUMMARY_LIST).map(line).join('');
  return shown + (items.length > SUMMARY_LIST ? `<li class="more">${items.length - SUMMARY_LIST} more ${more}</li>` : '');
}

function applianceRows() {
  const out = [];
  for (const f of plan.floors) {
    for (const it of f.items) {
      const k = itemKind(it.kind);
      if (!k?.record || !(it.brand || it.model || it.installed)) continue;
      out.push({ it, k, year: +it.installed || 0 });
    }
  }
  out.sort((a, b) => (a.year || 9999) - (b.year || 9999));
  return capped(out, ({ it, k }) => `<li><b>${esc(k.label)}</b>${it.brand || it.model ? `: ${esc([it.brand, it.model].filter(Boolean).join(' '))}` : ''}${it.installed ? ` · installed ${esc(ageWords(+it.installed))}` : ''}</li>`, 'in the plan');
}

// Work done: the issues marked Done, the latest first, each with who did it where a quote for it
// was accepted, and what it cost if that was asked for.
function workRows(withCosts) {
  const done = plan.issues.filter((i) => i.status === 'Done').sort((a, b) => (b.doneOn || '').localeCompare(a.doneOn || ''));
  return capped(done, (i) => {
    const hired = quotesOf(i).filter((q) => q.status === 'Accepted');
    const cost = issueCost(i);
    const bits = [
      i.doneOn && dateWords(i.doneOn),
      hired.length && `by ${hired.map(quoteName).join(' and ')}`,
      withCosts && cost.quoted && money(cost.low),
    ].filter(Boolean);
    return `<li><b>${esc(i.title || 'Untitled')}</b>${bits.length ? ` · ${esc(bits.join(' · '))}` : ''}</li>`;
  }, 'done, in the issue list');
}

function maintenanceRows() {
  const jobs = [...(plan.maintenance || [])].filter((j) => j.last).sort((a, b) => b.last.localeCompare(a.last));
  return capped(jobs, (j) => `<li><b>${esc(j.task)}</b> · ${esc(MAINT_EVERY.find(([v]) => v === j.every)?.[1].toLowerCase() || `every ${j.every} months`)}, last done ${esc(dateWords(j.last))}</li>`, 'kept up');
}

// The open issues asked for: 'safety' for those marked Safety / Immediate, 'all' for every one.
function openRows(which, withCosts) {
  const open = plan.issues.filter((i) => i.status !== 'Done' && (which === 'all' || i.category === 'safety'))
    .sort((a, b) => CATS.findIndex((c) => c.id === a.category) - CATS.findIndex((c) => c.id === b.category) || issueNum(a) - issueNum(b));
  return capped(open, (i) => {
    const cost = issueCost(i);
    const room = issueRoom(i);
    const bits = [cat(i.category).label, room && roomTitle(room), i.status === 'In progress' && 'in progress', withCosts && cost.priced && (cost.quoted ? `quoted ${money(cost.low)}` : `estimate ${estimateText(i)}`)].filter(Boolean);
    return `<li><span class="dot" style="background:${cat(i.category).color}"></span><b>${esc(i.title || 'Untitled')}</b> · ${esc(bits.join(' · '))}</li>`;
  }, 'open, in the issue list');
}

// The page itself. `o` is { open: '' | 'safety' | 'all', costs }.
function summaryHtml(o) {
  const block = (title, body, list = true) => (body ? `<section><h2>${title}</h2>${list ? `<ul>${body}</ul>` : `<table>${body}</table>`}</section>` : '');
  const picture = outsideSvg(700);
  const history = houseFacts().events;
  const open = o.open ? openRows(o.open, o.costs) : '';
  return `<section class="printPage summary">
    <h1>${esc(plan.name)} <span>House summary</span></h1>
    <p class="sub">${[plan.address, `Printed ${printDate()}`].filter(Boolean).map(esc).join(' · ')}</p>
    <div class="sumTop">
      <div>${block('Size', sizeRows(), false)}${block('Built', factRows(SUMMARY_FACTS[0][1]), false)}</div>
      ${picture ? `<div class="sumPicture">${picture}</div>` : ''}
    </div>
    <div class="sumCols">
      <div>
        ${block('Systems', factRows(SUMMARY_FACTS[1][1]), false)}
        ${block('Appliances and equipment', applianceRows())}
      </div>
      <div>
        ${block('Work done', workRows(o.costs))}
        ${block('Maintenance kept up', maintenanceRows())}
        ${o.open ? block(o.open === 'safety' ? 'Open safety issues' : 'Open issues', open || '<li>None.</li>') : ''}
        ${history ? `<section><h2>History</h2><p>${esc(history)}</p></section>` : ''}
      </div>
    </div>
    <p class="fine">Put together by the owner from their own records and measurements. It is not a home inspection, an appraisal or a survey. Areas are measured inside the walls, so they come out smaller than a listing, which measures the outside.</p>
  </section>`;
}

// The choices for it in the Print window show only while it is ticked.
const showSummaryChoices = () => {
  $('#printSummaryChoices').hidden = !$('#printSummary').checked;
};
$('#printSummary').addEventListener('change', showSummaryChoices);

// From the House sheet: the Print window with just the summary ticked, as that is what was asked for.
$('#btnHouseSummary').addEventListener('click', () => {
  $('#printSummary').checked = true;
  $('#printIssues').checked = false;
  openPrint();
  $('#printSheets').value = 'none';
});
