'use strict';

// The File, Rooms, Placeables, View and ? buttons each open a short list. Only one is open at a
// time, and choosing from it, or pressing anywhere else, closes it.
function closeMenus(except) {
  for (const list of document.querySelectorAll('header .menuList')) if (list !== except) list.hidden = true;
}

// Opens a list under its button, moved left if it would otherwise run off the side of the window.
function openMenu(list) {
  closeMenus(list);
  list.hidden = false;
  list.style.left = '';
  list.style.top = '';
  const wide = document.documentElement.clientWidth;
  // On a phone the toolbar scrolls sideways, which would cut the list off, so it is placed on the
  // window instead, under its button.
  if (getComputedStyle(list).position === 'fixed') {
    const at = list.parentNode.getBoundingClientRect();
    list.style.top = at.bottom + 'px';
    list.style.left = Math.max(8, Math.min(at.left, wide - list.offsetWidth - 8)) + 'px';
    return;
  }
  const over = list.getBoundingClientRect().right - (wide - 8);
  if (wide && over > 0) list.style.left = -over + 'px';
}

document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest?.('header .menu')) closeMenus();
});

$('#viewMenu').addEventListener('click', (e) => {
  if (!e.target.closest('.menuBtn')) return; // ticking a box leaves the list open
  const list = $('#viewMenu .menuList');
  if (list.hidden) openMenu(list);
  else list.hidden = true;
});

$('#toolbar').addEventListener('scroll', () => closeMenus());

for (const menu of [$('#fileMenu'), $('#helpMenu')]) {
  menu.addEventListener('click', (e) => {
    const list = menu.querySelector('.menuList');
    if (e.target.closest('.menuBtn')) {
      if (list.hidden) openMenu(list);
      else list.hidden = true;
    } else if (e.target.closest('.menuList button')) {
      closeMenus();
    }
  });
}

$('#tools').addEventListener('click', (e) => {
  const menu = e.target.closest('.menuBtn');
  if (menu) {
    const list = menu.nextElementSibling;
    if (list.hidden) openMenu(list);
    else list.hidden = true;
    return;
  }
  const b = e.target.closest('[data-tool]');
  if (b) {
    setTool(b.dataset.tool);
    renderCanvas();
  }
});

$('#btnFit').addEventListener('click', () => {
  fitView();
  renderCanvas();
});

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000); // a large download needs it for a while
}

const fileBase = () => slug(plan.name, 'house');

$('#btnClose').addEventListener('click', closeProject);

$('#btnExport').addEventListener('click', () => {
  download(fileBase() + '.housemap.json', planFileText(), 'application/json');
});

// Runs a long export. The menu has closed by then, so progress is shown on the File button
// itself: `work` is handed a function that puts a few words there.
async function fileMenuBusy(work, failed) {
  const button = $('#fileMenu .menuBtn');
  const name = button.querySelector('span');
  const label = name.textContent;
  button.disabled = true;
  try {
    await work((text) => { name.textContent = text; });
  } catch (err) {
    tell(failed + err.message);
  }
  name.textContent = label;
  button.disabled = false;
}

$('#btnExportAll').addEventListener('click', () => fileMenuBusy(async (say) => {
  const zip = await exportProject((i, n) => say(`Packing ${i} of ${n}…`));
  download(fileBase() + '.housemap.zip', zip, 'application/zip');
}, 'Could not export the project: '));

$('#btnImport').addEventListener('click', () => $('#fileInput').click());

$('#fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const p = await readPlan(file);
  if (!p) return tell('That file is not a House Map plan.');
  const sure = await ask(`Replace the plan in this project with “${p.name}”? Export the current plan first if you want to keep it.`, { ok: 'Replace plan', danger: true });
  if (!sure) return;
  await startEditor(p);
  save();
  reportMissingPhotos();
});

$('#btnCsv').addEventListener('click', () => {
  download(fileBase() + '-issues.csv', issuesCsv(), 'text/csv');
});

$('#btnAi').addEventListener('click', () => {
  $('#aiDialog').returnValue = '';
  $('#aiDialog').showModal();
});

$('#aiDialog').addEventListener('close', async (e) => {
  if (e.target.returnValue !== 'ok') return;
  const ticked = (id) => $(id).checked;
  await fileMenuBusy(async (say) => {
    const zip = await exportForAi({ plans: ticked('#aiPlans'), done: ticked('#aiDone'), other: ticked('#aiOther'), quoteFiles: ticked('#aiQuoteFiles'), contacts: ticked('#aiContacts'), money: ticked('#aiMoney') }, say);
    download(fileBase() + '-for-ai.zip', zip, 'application/zip');
  }, 'Could not make the export: ');
});

$('#btnUndo').addEventListener('click', undo);
$('#btnRedo').addEventListener('click', redo);

document.addEventListener('keydown', (e) => {
  // Ctrl+Z, and Ctrl+Y or Ctrl+Shift+Z. Inside a text box the browser's own undo applies instead.
  const key = e.key.toLowerCase();
  if (plan && (e.ctrlKey || e.metaKey) && !e.altKey && (key === 'z' || key === 'y')
    && !e.target.matches('input, textarea, select') && !document.querySelector('dialog[open]')) {
    e.preventDefault();
    return key === 'y' || e.shiftKey ? redo() : undo();
  }
  // Ctrl+P asks what to print first.
  if (plan && (e.ctrlKey || e.metaKey) && !e.altKey && key === 'p') {
    e.preventDefault();
    return openPrint();
  }
  const busy = !plan || e.altKey || document.querySelector('dialog[open]');
  if (!busy && (e.ctrlKey || e.metaKey) && key === 'f') {
    e.preventDefault();
    return focusSearch();
  }
  if (!busy && (e.ctrlKey || e.metaKey) && key === 'd' && !e.target.matches('input, textarea, select')) {
    e.preventDefault(); // otherwise the browser offers to bookmark the page
    return duplicateSelection();
  }
  if (busy || e.ctrlKey || e.metaKey) return;
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === '?') return showKeys();
  if (e.key === '+' || e.key === '=') return zoomBy(0.8);
  if (e.key === '-' || e.key === '_') return zoomBy(1.25);
  if (e.key === '0') {
    fitView();
    renderCanvas();
    return refreshPointer();
  }
  if (e.key === 'Escape' && !$('#lightbox').hidden) return closeLightbox();
  if (draft && e.key === 'Enter') return finishPolygon();
  if (draft && e.key === 'Backspace') {
    draft.points.pop();
    if (!draft.points.length) draft = null;
    return renderCanvas();
  }
  // The arrow keys move the view, also part way through drawing or dragging something.
  const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (arrow) {
    e.preventDefault();
    view.x += arrow[0] * view.w * 0.1;
    view.y += arrow[1] * view.w * 0.1;
    renderCanvas();
    return refreshPointer();
  }
  // L locks or unlocks the selected room.
  if (key === 'l' && selRoom()) return toggleLock(selRoom());
  const toolKey = { v: 'select', escape: 'select', r: 'rect', p: 'poly', i: 'pin', c: 'photo', m: 'ruler', d: 'door', s: 'stairs', f: 'item' }[key];
  if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection();
  else if (toolKey && !(INTERIOR_TOOLS.includes(toolKey) && floor().kind === 'exterior')) {
    setTool(toolKey);
    renderCanvas();
  }
});

// The drawing area can change size without the window doing so, and the view has to follow it.
new ResizeObserver(renderCanvas).observe($('#stage'));
window.addEventListener('pagehide', flushSave);

// Clicking into a feet or inches box selects what is there, so typing replaces it.
document.addEventListener('focusin', (e) => {
  if (e.target.matches('.ftin input')) e.target.select();
});

$('#roomNames').innerHTML = ROOM_NAMES.map((n) => `<option value="${esc(n)}">`).join('');
showLanding();
