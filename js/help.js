'use strict';

// The rest of what sits behind the ? and File menus: the list of shortcut keys, the About window
// and the settings. All three are shown in the same window as the getting-started tips.

const APP_VERSION = '1.0';

// ---------- settings ----------
// How the app behaves, as opposed to anything about one house. They are kept in this browser, not
// in a project, so they apply to every project opened here.

const SETTINGS = [
  { key: 'tips', on: true, label: 'Show the getting-started tips the first time each kind of sheet is opened in a project' },
  { key: 'preview', on: true, label: 'Show a preview beside the selected photo marker' },
  { key: 'edgeScroll', on: true, label: 'Scroll the view when something is dragged to the edge of the plan' },
  { key: 'wheelReversed', on: false, label: 'Reverse the mouse wheel, so that rolling it away from you zooms out' },
  // One with `choices` is a list to pick from instead of a box to tick: [value, label].
  {
    key: 'photoEdge', on: 2400, label: 'Shrink photos as they are added, to', choices: [
      [0, 'Original size: do not shrink'],
      [3200, '3200 pixels on the long edge (about 1.5 MB each)'],
      [2400, '2400 pixels on the long edge (under 1 MB each)'],
      [1600, '1600 pixels on the long edge (under 0.5 MB each)'],
    ],
    note: 'Photos are shrunk as they are copied into the project. The originals, where they came from, are never touched. Photos already in a project stay as they are.',
  },
];
const SETTINGS_KEY = PREVIEW ? 'housemap.preview.settings' : 'housemap.settings';

// A browser can refuse storage, as some do for pages opened from disk; the settings then last
// only until the page is closed.
const settings = (() => {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
})();
const setting = (key) => settings[key] ?? SETTINGS.find((s) => s.key === key).on;

function showSettings() {
  const boxes = SETTINGS.map((s) => (s.choices
    ? `<label>${s.label}<select data-setting="${s.key}">${s.choices.map(([v, label]) => `<option value="${v}"${v === setting(s.key) ? ' selected' : ''}>${label}</option>`).join('')}</select></label><p class="muted small">${s.note}</p>`
    : `<label class="check"><input type="checkbox" data-setting="${s.key}"${setting(s.key) ? ' checked' : ''}> ${s.label}</label>`)).join('');
  showInfo('Settings', `<p class="muted">These are kept in this browser and apply to every project opened in it. A change takes effect straight away.</p>
    ${boxes}
    <h3>This project</h3>
    <p class="muted">The house name and address are under <i>Details</i> in the side panel when nothing is selected. What is shown on the plan is in the <i>View</i> menu.</p>
    <div class="actions"><button type="button" id="btnSettingsStandards" title="Wall thicknesses, door widths and ceiling height for this house">House standards…</button></div>`);
}

$('#tipsBody').addEventListener('change', (e) => {
  const key = e.target.dataset.setting;
  if (!key) return;
  settings[key] = e.target.matches('select') ? +e.target.value : e.target.checked;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* kept for this visit only */ }
  renderCanvas(); // the photo preview may have just been turned on or off
});

$('#tipsBody').addEventListener('click', (e) => {
  if (e.target.id !== 'btnSettingsStandards') return;
  $('#tipsDialog').close();
  if (!document.querySelector('dialog[open]')) openStandards(); // closing may already have opened it
});

// ---------- shortcut keys ----------

const KEYS = [
  ['Tools', [
    ['V', 'Esc', 'Select, move and pan'],
    ['R', 'Rectangle room'],
    ['P', 'Polygon room'],
    ['D', 'Door or opening'],
    ['W', 'Window'],
    ['S', 'Stairs'],
    ['F', 'Fixture or appliance'],
    ['I', 'Issue pin'],
    ['C', 'Photo marker'],
    ['M', 'Measure'],
  ]],
  ['Editing', [
    ['Ctrl+Z', 'Undo'],
    ['Ctrl+Y', 'Ctrl+Shift+Z', 'Redo'],
    ['Ctrl+D', 'Duplicate the selected room, fixture, stairs or issue'],
    ['Delete', 'Backspace', 'Delete what is selected'],
    ['L', 'Lock or unlock the selected room'],
    ['Enter', 'Close the polygon being drawn; finish typing in a box'],
    ['Backspace', 'While drawing a polygon: take back the last corner'],
  ]],
  ['The view', [
    ['Mouse wheel', 'Zoom in and out at the pointer'],
    ['+', '−', 'Zoom in and out'],
    ['0', 'Fit the sheet to the view'],
    ['Arrow keys', 'Move the view, also part way through a drag'],
    ['Middle button', 'Drag to move the view with any tool'],
    ['Ctrl+F', 'Find a room, issue, photo or fixture and go to it'],
  ]],
  ['While drawing or dragging', [
    ['Shift', 'A square, a level or upright side, a squared-up corner'],
    ['Alt', 'Place freely: snap to the grid only, not to corners or wall gaps'],
    ['Ctrl+click', 'With Polygon: a point the wall curves through'],
    ['Double-click', 'A polygon corner: curve the wall through it, or take a curve point out'],
  ]],
  ['Other', [
    ['Ctrl+P', 'Print or save as PDF'],
    ['?', 'This list'],
  ]],
];

function showKeys() {
  if (document.querySelector('dialog[open]')) return;
  const row = (r) => `<tr><td>${r.slice(0, -1).map((k) => `<kbd>${k}</kbd>`).join(' or ')}</td><td>${r.at(-1)}</td></tr>`;
  showInfo('Keyboard shortcuts', KEYS.map(([title, rows]) => `<h3>${title}</h3><table class="keys">${rows.map(row).join('')}</table>`).join('')
    + '<p class="muted">The letter keys work when the pointer is not typing in a box. Press Enter or Esc to leave a box.</p>');
}

// ---------- about ----------

function showAbout() {
  showInfo('About', `<div class="about">
      <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5.5h4V20"/></svg>
      <div><b>House Map &amp; Issue Tracker</b><br><span class="muted">Version ${APP_VERSION} · plan file format 4</span></div>
    </div>
    <p>Sketch a house floor by floor, name the rooms, pin photos where they were taken, and tag issues at the exact spot they occur, with a running repair list and cost ranges.</p>
    <p><b>Your files stay with you.</b> A project is an ordinary folder on this computer holding the plan and the photos. The app runs entirely in this page: nothing is uploaded or sent anywhere.</p>
    <p class="caution"><b>Everything in this app is approximate.</b> The plans are for planning repairs and keeping track of a house. They are not professional architectural drawings or a survey, and should not be relied on for construction, permits, or anything legal or financial.</p>
    <p class="muted">Source and instructions: <a href="https://github.com/Drelok/housemap" target="_blank" rel="noopener">github.com/Drelok/housemap</a></p>`);
}

$('#btnSettings').addEventListener('click', showSettings);
$('#btnKeys').addEventListener('click', showKeys);
$('#btnAbout').addEventListener('click', showAbout);
$('#btnAboutStart').addEventListener('click', showAbout);
