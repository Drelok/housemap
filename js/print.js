'use strict';

// Printing, and saving as a PDF, which is the same thing with "Save as PDF" chosen as the
// printer. What is to be printed is built into #printArea, which only shows on paper: one
// landscape page for each floor plan, then the issue report.

const PRINT_WIDTH = 960; // a landscape page between its margins, in CSS pixels
const PRINT_ASPECT = 0.64; // the share of that page's height left for the plan under its heading

const printDate = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

// Fits the view to a sheet about to be printed or pictured, which has to be the current one. The
// exterior sheet shows everything on it, the whole lot. A floor is fitted to its own rooms, so the
// house fills the page however far away a shed or the edge of the lot may be; a floor with no
// rooms yet is fitted to the outline of the house. Either way every issue pinned on the sheet is
// taken in too, so that none is cut off at the edge.
function fitSheet(f) {
  const house = (exteriorFloor()?.rooms || []).filter((r) => !r.separate);
  const pins = layers.issues ? plan.issues.filter((i) => i.floorId === f.id && pinned(i)).map((i) => ({ x: i.x - 1, y: i.y - 1, w: 2, h: 2 })) : [];
  const shapes = f.kind === 'exterior' ? [...f.rooms, ...outlineShapes()] : f.rooms.length ? f.rooms : house;
  fitView([...shapes, ...pins]);
}

// One sheet, drawn to fill a page.
function sheetHtml(f) {
  floorId = f.id;
  fitSheet(f);
  renderCanvas();
  const size = f.kind === 'exterior' ? `Footprint ${sqft(floorArea(f))}` : `Floor area ${sqft(floorArea(f))}`;
  const facts = [plan.address, size, `Grid squares are ${gridStep()} ft`, printDate()].filter(Boolean);
  return `<section class="printPage sheet">
    <h1>${esc(plan.name)} <span>${esc(f.name)}</span></h1>
    <p class="sub">${facts.map(esc).join(' · ')}</p>
    <svg class="plan" viewBox="${svg.getAttribute('viewBox')}" xmlns="http://www.w3.org/2000/svg">${svg.innerHTML}</svg>
    <p class="fine">Approximate, to the nearest quarter inch at best. For planning repairs and keeping track of a house; not an architectural drawing or a survey.</p>
  </section>`;
}

// The sheets are drawn by the same code that draws the screen, pointed at each in turn at the
// size of a page, with nothing selected. The screen is then put back as it was.
function planSheetsHtml(floors, withMarkers = false) {
  const keep = { floorId, sel, view: { ...view }, photos: layers.photos };
  sel = null;
  // Photo markers crowd a printed plan and mean little on paper, so they are left off unless asked for.
  layers.photos = layers.photos && withMarkers;
  printWidth = PRINT_WIDTH;
  printAspect = PRINT_ASPECT;
  try {
    return floors.map(sheetHtml).join('');
  } finally {
    printWidth = 0;
    printAspect = 0;
    ({ floorId, sel } = keep);
    view = keep.view;
    layers.photos = keep.photos;
    renderAll();
  }
}

// Every issue with what is known about it, in the order they are numbered on the plans.
function reportHtml(issues, withPhotos) {
  const open = issues.filter((i) => i.status !== 'Done');
  const sum = (list, key) => sumCell(list, key === 'costLow' ? costLow : costHigh);
  const rows = CATS.map((c) => [c, open.filter((i) => i.category === c.id)]).filter(([, g]) => g.length)
    .map(([c, g]) => `<tr><td><span class="dot" style="background:${c.color}"></span>${c.label}</td><td class="num">${g.length}</td><td class="num">${sum(g, 'costLow')}</td><td class="num">${sum(g, 'costHigh')}</td></tr>`).join('');
  const entry = (i) => {
    const room = issueRoom(i);
    const shots = withPhotos ? i.photoIds.flatMap((id) => shotsOf(plan.photos.find((p) => p.id === id) || {})).filter((s) => s.file) : [];
    const where = [issuePlace(i), room?.name, cat(i.category).label, i.status, issueCost(i).quoted ? `Accepted quote ${money(issueCost(i).low)}` : unpriced(i) ? 'Not priced' : `My estimate ${estimateText(i)}`].filter(Boolean);
    const more = ISSUE_MORE.filter(([key]) => i[key]).map(([key, label, kind]) => `${label} ${Array.isArray(kind) ? kind.find(([v]) => v === i[key])?.[1] || i[key] : i[key]}`);
    const quote = (q) => [quoteLine(q), q.number && '#' + q.number, q.date, q.phone, q.email].filter(Boolean).map(esc).join(' · ');
    return `<article class="issue${i.status === 'Done' ? ' done' : ''}">
      <h2><span class="dot" style="background:${cat(i.category).color}"></span>#${issueNum(i)} ${esc(i.title)}</h2>
      <p class="sub">${where.map(esc).join(' · ')}</p>
      ${afterOf(i).length ? `<p class="desc">Must be done after ${afterOf(i).map((x) => `#${issueNum(x)} ${esc(x.title)}${x.status === 'Done' ? ' (done)' : ''}`).join(', ')}</p>` : ''}
      ${i.description ? `<p class="desc">${esc(i.description)}</p>` : ''}
      ${more.map((m) => `<p class="desc">${esc(m)}</p>`).join('')}
      ${i.photo ? `<p class="desc">Photo note: ${esc(i.photo)}</p>` : ''}
      ${quotesOf(i).map((q) => `<p class="desc">Quote from ${quote(q)}</p>`).join('')}
      ${shots.length ? `<div class="shots">${shots.map((s) => `<figure><img data-print-photo="${esc(s.file)}" alt=""><figcaption>${esc(baseOf(s.file))}</figcaption></figure>`).join('')}</div>` : ''}
    </article>`;
  };
  return `<section class="printPage report">
    <h1>${esc(plan.name)} <span>Issues</span></h1>
    <p class="sub">${[plan.address, printDate()].filter(Boolean).map(esc).join(' · ')}</p>
    <table><tr><th>Open issues</th><th class="num">#</th><th class="num">Low</th><th class="num">High</th></tr>${rows}
      <tr class="total"><td>Total</td><td class="num">${open.length}</td><td class="num">${sum(open, 'costLow')}</td><td class="num">${sum(open, 'costHigh')}</td></tr></table>
    ${open.some(unpriced) ? `<p class="sub">${open.filter(unpriced).length} of these ${open.filter(unpriced).length === 1 ? 'has' : 'have'} not been priced, and so ${open.filter(unpriced).length === 1 ? 'adds' : 'add'} nothing to the totals.</p>` : ''}
    ${issues.map(entry).join('') || '<p>No issues have been tagged.</p>'}
    <p class="fine">Costs are the owner’s own rough estimates, except where a quote has been accepted, which is then used instead. Quotes from tradespeople are listed under each issue. Numbers match the pins on the floor plans; an issue about a whole floor or the whole house has no pin.</p>
  </section>`;
}

// Fills in the report's photos and waits until they are ready to be put on paper. A picture the
// browser cannot draw, such as a RAW or HEIC file, is named instead.
async function loadPrintPhotos(area) {
  await Promise.all([...area.querySelectorAll('img[data-print-photo]')].map(async (img) => {
    try {
      img.src = await photoUrl(img.dataset.printPhoto);
      await img.decode();
    } catch {
      img.replaceWith(Object.assign(document.createElement('div'), { className: 'noPreview', textContent: 'No preview' }));
    }
  }));
}

function openPrint() {
  if (document.querySelector('dialog[open]')) return;
  $('#printSheets').value = onList() ? 'none' : floor().rooms.length ? 'this' : 'all';
  $('#printDialog').returnValue = '';
  $('#printDialog').showModal();
}

$('#btnPrint').addEventListener('click', openPrint);

$('#printDialog').addEventListener('close', async (e) => {
  if (e.target.returnValue !== 'ok') return;
  const which = $('#printSheets').value;
  const floors = which === 'this' ? [floor()] : which === 'all' ? plan.floors.filter((f) => f.rooms.length || f.items.length) : [];
  const issues = $('#printIssues').checked ? plan.issues.filter((i) => !$('#printOpenOnly').checked || i.status !== 'Done') : null;
  if (!floors.length && !issues) return tell(which === 'all' ? 'Nothing has been drawn on any sheet yet, and the issue report is not ticked, so there is nothing to print.' : 'Nothing was chosen to print.');
  const area = $('#printArea');
  area.innerHTML = planSheetsHtml(floors, $('#printMarkers').checked) + (issues ? reportHtml(issues, $('#printPhotos').checked) : '');
  await loadPrintPhotos(area);
  window.print();
});

// Printing from the browser's own menu, without going through the dialog, gives the sheet on screen.
window.addEventListener('beforeprint', () => {
  if (plan && !$('#printArea').children.length) $('#printArea').innerHTML = planSheetsHtml([floor()]);
});
window.addEventListener('afterprint', () => {
  $('#printArea').innerHTML = '';
});
