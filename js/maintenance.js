'use strict';

// The jobs that keep a house in order, done again every so often: a furnace filter, the gutters, a
// test of the alarms. Each is kept in `plan.maintenance` as { id, task, every, last, note }: `every`
// is how many months apart it is done, and `last` the day it was last done, or '' if never. They
// are listed at the end of the House sheet, where a job is marked done today with one button, and
// one that is due shows in the House tab's name.

const MAINT_EVERY = [[1, 'Every month'], [3, 'Every 3 months'], [6, 'Every 6 months'], [12, 'Every year'], [24, 'Every 2 years'], [60, 'Every 5 years'], [120, 'Every 10 years']];
const DUE_SOON = 14; // days before it is due that a job shows as coming up

// Jobs most houses have, offered to add; none is added unless ticked. [task, months]
const COMMON_JOBS = [
  ['Replace the furnace or air handler filter', 3],
  ['Test the smoke and carbon monoxide alarms', 6],
  ['Replace the batteries in the smoke and CO alarms', 12],
  ['Replace smoke alarms (they wear out after about 10 years)', 120],
  ['Clean the gutters and check the downspouts run away from the house', 6],
  ['Have the furnace or boiler serviced', 12],
  ['Have the air conditioning or heat pump serviced', 12],
  ['Drain and flush the water heater', 12],
  ['Test the water heater relief valve', 12],
  ['Test the sump pump by filling the pit', 6],
  ['Test the GFCI outlets (press Test, then Reset)', 6],
  ['Clean the dryer vent duct', 12],
  ['Clean the range hood filter', 3],
  ['Clean the refrigerator coils', 12],
  ['Check the caulking round tubs, showers and sinks', 12],
  ['Look over the roof and flashing from the ground', 12],
  ['Look in the attic for leaks, stains and blocked vents', 12],
  ['Have the chimney swept and inspected', 12],
  ['Test for radon', 24],
  ['Top up the water softener salt', 1],
  ['Shut off and drain outside taps before frost', 12],
];

const maintJobs = () => (plan.maintenance ||= []);

// The day a job is next due, as "YYYY-MM-DD": `every` months after it was last done, or today if
// it has never been done.
function nextDue(job) {
  if (!job.last) return dayStamp();
  const [y, m, d] = job.last.split('-').map(Number);
  const due = new Date(y, m - 1 + job.every, 1);
  due.setDate(Math.min(d, new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate()));
  return dayStamp(due);
}

// 'overdue', 'soon' or '' for a job.
function dueState(job) {
  const days = -daysSince(nextDue(job));
  return days <= 0 ? 'overdue' : days <= DUE_SOON ? 'soon' : '';
}

const dueCount = () => (plan?.maintenance || []).filter((j) => dueState(j) === 'overdue').length;

function dueWords(job) {
  if (!job.last) return 'Not done yet';
  const days = -daysSince(nextDue(job));
  if (days < 0) return `Overdue by ${-days === 1 ? 'a day' : `${-days} days`}`;
  if (days === 0) return 'Due today';
  return `Due ${dateWords(nextDue(job))}${days <= DUE_SOON ? ` (in ${days === 1 ? 'a day' : `${days} days`})` : ''}`;
}

function maintenanceHtml() {
  const jobs = [...maintJobs()].sort((a, b) => nextDue(a).localeCompare(nextDue(b)));
  const every = (job) => `<select data-maint="${job.id}" data-key="every">${MAINT_EVERY.map(([v, l]) => `<option value="${v}"${v === job.every ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  const row = (job) => `<div class="maintRow ${dueState(job)}">
      <input data-maint="${job.id}" data-key="task" value="${esc(job.task)}" aria-label="Job">
      ${every(job)}
      <label class="lastDone">Last done<input type="date" data-maint="${job.id}" data-key="last" value="${esc(job.last || '')}"></label>
      <span class="due">${esc(dueWords(job))}</span>
      <span class="maintButtons"><button type="button" data-maint-done="${job.id}" title="Marks it done today">Done today</button><button type="button" class="danger" data-maint-drop="${job.id}" title="Takes this job off the list" aria-label="Delete">×</button></span>
      <input class="maintNote" data-maint="${job.id}" data-key="note" value="${esc(job.note || '')}" placeholder="Note: the filter size, who does it, what it cost">
    </div>`;
  const due = dueCount();
  return `<section class="maintenance">
      <h2>Maintenance <span class="muted">${jobs.length ? `${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}${due ? `, ${due} overdue` : ''}` : ''}</span></h2>
      <p class="muted">Jobs done again every so often to keep the house in order. Mark one done when it is, and it says when it is next due; one that is overdue shows in the House tab.</p>
      ${jobs.map(row).join('') || '<p class="muted">No jobs yet.</p>'}
      <div class="actions">
        <button type="button" id="btnMaintCommon">Add common jobs…</button>
        <button type="button" id="btnMaintAdd">Add a job of my own</button>
      </div>
    </section>`;
}

function addJob(task, every) {
  maintJobs().push({ id: uid(), task, every, last: '', note: '' });
}

async function addCommonJobs() {
  const have = new Set(maintJobs().map((j) => j.task.toLowerCase()));
  const offer = COMMON_JOBS.filter(([task]) => !have.has(task.toLowerCase()));
  if (!offer.length) return tell('Every one of the common jobs is on the list already.');
  $('#maintList').innerHTML = offer.map(([task, months], n) => `<label class="check"><input type="checkbox" data-n="${n}"> ${esc(task)} <span class="muted small">${esc(MAINT_EVERY.find(([v]) => v === months)[1].toLowerCase())}</span></label>`).join('');
  $('#maintDialog').returnValue = '';
  $('#maintDialog').showModal();
  $('#maintDialog').onclose = () => {
    if ($('#maintDialog').returnValue !== 'ok') return;
    const ticked = [...document.querySelectorAll('#maintList input:checked')].map((box) => offer[+box.dataset.n]);
    if (!ticked.length) return;
    for (const [task, months] of ticked) addJob(task, months);
    save();
    renderAll();
  };
}

$('#houseBody').addEventListener('click', async (e) => {
  const { maintDone, maintDrop } = e.target.dataset;
  if (e.target.id === 'btnMaintCommon') return addCommonJobs();
  if (e.target.id === 'btnMaintAdd') {
    const task = await ask('What is the job?', { input: '', ok: 'Add job', detail: 'Such as "Reseal the deck" or "Have the septic tank pumped". You choose how often it is done next.' });
    if (!task?.trim()) return;
    addJob(task.trim(), 12);
    save();
    return renderAll();
  }
  if (maintDone) {
    maintJobs().find((j) => j.id === maintDone).last = dayStamp();
    save();
    return renderAll();
  }
  if (maintDrop) {
    const job = maintJobs().find((j) => j.id === maintDrop);
    if (!(await ask(`Take “${job.task}” off the maintenance list?`, { ok: 'Delete', danger: true }))) return;
    plan.maintenance = maintJobs().filter((j) => j !== job);
    save();
    renderAll();
  }
});

$('#houseBody').addEventListener('change', (e) => {
  const { maint, key } = e.target.dataset;
  if (!maint) return;
  const job = maintJobs().find((j) => j.id === maint);
  job[key] = key === 'every' ? +e.target.value : e.target.value.trim();
  save();
  renderAll();
});

// ---------- in the export for AI ----------

function maintenanceBrief() {
  const jobs = [...(plan.maintenance || [])].sort((a, b) => nextDue(a).localeCompare(nextDue(b)));
  if (!jobs.length) return '';
  return `## Maintenance

Jobs the owner keeps track of, done again every so often, with when each was last done.

${jobs.map((j) => `- **${j.task}:** ${MAINT_EVERY.find(([v]) => v === j.every)?.[1].toLowerCase() || `every ${j.every} months`}; ${j.last ? `last done ${dateWords(j.last)}` : 'never recorded as done'}; ${dueWords(j).replace(/^./, (c) => c.toLowerCase())}${j.note ? `. Note: ${lines(j.note)}` : ''}`).join('\n')}`;
}
