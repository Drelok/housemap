'use strict';

// The guided tour of the tutorial house. Each step takes the app to the place it is about, by
// itself, and rings the control it talks about; a small card says what is there, with Back and
// Next. The card is not a window: everything stays usable around it, so a "Try it" can be tried
// before going on. A step that opens a window moves the card into it, as nothing outside an open
// window can be used.

let tourAt = -1; // the step showing, or -1 with no tour running
let tourDialog = null; // the window the current step opened, closed again on leaving the step

const tourRoom = (floorId, id) => plan.floors.find((f) => f.id === floorId)?.rooms.find((r) => r.id === id);
const tourItem = (floorId, test) => plan.floors.find((f) => f.id === floorId)?.items.find(test);
const tourIssue = (num) => plan.issues.find((i) => i.num === num);

// Goes to a floor, selecting something on it if it is still there.
function tourGo(floorId, thing, type) {
  if (!plan.floors.some((f) => f.id === floorId)) floorId = plan.floors[0].id;
  const points = !thing ? [] : type === 'room' ? shapePoints(thing) : type === 'item' ? itemCorners(thing) : [thing];
  goTo({ floorId, sel: thing ? { type, id: thing.id } : null, points });
}

// Fits the floor on screen into the part of the plan the card leaves clear: beside it or above
// it, whichever is bigger, so nothing a step talks about is hidden under it.
function tourFit() {
  const f = floor();
  const shapes = [...f.rooms, ...(f.kind === 'exterior' ? [] : outlineShapes().filter((r) => !r.separate))];
  const pts = [
    ...shapes.flatMap(shapePoints),
    ...plan.photos.filter((ph) => ph.floorId === f.id),
    ...plan.issues.filter((i) => i.floorId === f.id && pinned(i)),
  ];
  const s = svg.getBoundingClientRect();
  const c = $('#tourCard').getBoundingClientRect();
  if (!pts.length || !s.width || !s.height) return;
  const beside = { left: Math.max(s.left, c.right), top: s.top, right: s.right, bottom: s.bottom };
  const above = { left: s.left, top: s.top, right: s.right, bottom: Math.min(s.bottom, c.top) };
  const size = (r) => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
  const box = size(beside) >= size(above) ? beside : above;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const feetPerPx = Math.max((x1 - x0) / (box.right - box.left), (y1 - y0) / (box.bottom - box.top)) * 1.15;
  view = {
    x: (x0 + x1) / 2 - ((box.left + box.right) / 2 - s.left) * feetPerPx,
    y: (y0 + y1) / 2 - ((box.top + box.bottom) / 2 - s.top) * feetPerPx,
    w: s.width * feetPerPx,
  };
  renderCanvas();
}
// On a phone the plan and the side panel take turns at the whole screen.
const tourSide = (name) => (viewsOn() ? showView(name) : showSide(name));
const tourPlan = () => viewsOn() && showView('plan');
const tourIssueGo = (num) => {
  const i = tourIssue(num);
  if (!i) return;
  // One with no floor is about the whole house, and is shown over whichever floor is open.
  goTo({ floorId: i.floorId, sel: { type: 'issue', id: i.id }, points: pinned(i) ? [i] : [] });
  tourSide('issues');
};
const tourMenu = (sel) => {
  const list = $(sel)?.closest('.menu')?.querySelector('.menuList');
  if (list) openMenu(list);
};
const tourOpen = (dialog) => {
  tourDialog = $(dialog);
  return tourDialog;
};

// { title, text, tryIt, at, go }. `at` is the control rung, as a selector; where it lists more than
// one, the first on screen is rung, as a phone shows some controls in other places. `go` sets the app up.
const TOUR = [
  {
    title: 'Welcome to the tutorial house',
    text: 'This is a made-up house, already drawn and filled in, to show what the app does. Change anything you like: it is a project of its own, and <i>Start the tutorial over</i> in the <b>?</b> menu puts it back as it was.<br><br>The menus and tools are along the top, the sheets of the house are the tabs under them, and the side panel shows whatever is selected. On a phone, the bar along the bottom switches between the plan and the panel.',
    go() {
      tourGo('tut-ext');
      tourPlan();
    },
  },
  {
    title: 'The outside of the house',
    text: 'The first sheet is the outline of the house, drawn true to size, with the garage, deck and porch beside it. Those three are marked <b>separate</b>, so their area is not added to the house. An aerial picture can be laid under the outline to trace it.',
    tryIt: 'Select the deck and drag one of its corners.',
    at: '#tabs [data-floor="tut-ext"]',
    go() {
      tourGo('tut-ext', tourRoom('tut-ext', 'tut-house'), 'room');
      tourPlan();
    },
  },
  {
    title: 'A sheet for each floor',
    text: 'Each floor has a tab. A basement comes at the end, after <b>+ Floor</b>, which adds the next floor up. The <b>House</b> and <b>Issues</b> tabs hold lists rather than a plan; the numbers on the tabs count what is still to do.',
    tryIt: 'Click 2nd floor, then come back to Main floor.',
    at: '#tabs',
    go() {
      tourGo('tut-main');
      tourPlan();
    },
  },
  {
    title: 'Rooms',
    text: 'Rooms are drawn with the <b>Rooms</b> menu: a rectangle (<kbd>R</kbd>) or any shape (<kbd>P</kbd>). They snap a wall’s thickness apart, so the walls draw themselves. Selected, a room shows its size and area, and has places for its floor covering, walls, paint and ceiling.',
    tryIt: 'Drag the bar in the middle of one of the kitchen’s walls to move just that wall, then Undo.',
    at: '#inspector',
    go() {
      tourGo('tut-main', tourRoom('tut-main', 'tut-kitchen'), 'room');
      tourSide('details');
    },
  },
  {
    title: 'Doors and windows',
    text: 'Doors (<kbd>D</kbd>) and windows (<kbd>W</kbd>) are in the <b>Placeables</b> menu. Click a wall to place one; its kind is worked out from what is on either side, such as an exterior door in an outside wall or a bifold door on a closet. This is the front door.',
    tryIt: 'Change which way the door swings in the side panel.',
    at: '#menuPlace .menuBtn',
    go() {
      const door = plan.floors.find((f) => f.id === 'tut-main')?.openings.find((o) => o.kind === 'exterior');
      tourGo('tut-main', door, 'opening');
      tourSide('details');
    },
  },
  {
    title: 'Fixtures and appliances',
    text: 'Sinks, counters, appliances, the furnace and more are placed with <b>Fixture</b> (<kbd>F</kbd>). Each has its usual size and height: these upper cabinets hang 4′ 6″ above the floor. An appliance also keeps its brand, model and the year it went in, which is what a repair needs first.',
    tryIt: 'Select the refrigerator and look at its make and age.',
    at: '#inspector',
    go() {
      tourGo('tut-main', tourItem('tut-main', (it) => it.kind === 'upper'), 'item');
      tourSide('details');
    },
  },
  {
    title: 'Stairs between floors',
    text: 'Stairs (<kbd>S</kbd>) say which floor they lead to. Drawn on one floor, the app offers to draw them on the other as well. <b>Go to</b> in the side panel takes you up or down them.',
    tryIt: 'Use the Go to button to go upstairs.',
    at: '#inspector',
    go() {
      tourGo('tut-main', tourItem('tut-main', (it) => isStairs(it) && it.dir === 'up'), 'item');
      tourSide('details');
    },
  },
  {
    title: 'Upstairs',
    text: 'The bonus room is one step up from the hall, which is set in its <b>Floor level</b>. The closet beside the primary bedroom <b>belongs to</b> it, so their areas are shown together, and it has sliding doors. The bathroom has its tub, toilet and sink placed.',
    at: '#inspector',
    go() {
      tourGo('tut-up', tourRoom('tut-up', 'tut-bonus'), 'room');
      tourSide('details');
    },
  },
  {
    title: 'The basement',
    text: 'Only basement rooms ticked <b>Finished</b> count toward the size of the house. The crawl space is marked separate, so it is drawn as a plain outline. The family room has an egress window with a well dug outside it, and the utility room holds the furnace, water heater, panel and main water shutoff.',
    tryIt: 'Select the utility room and look at its Finished box.',
    at: '#tabs [data-floor="tut-base"], #inspector',
    go() {
      tourGo('tut-base', tourItem('tut-base', (it) => it.kind === 'wh'), 'item');
      tourSide('details');
    },
  },
  {
    title: 'Photos',
    text: 'A photo marker (<kbd>C</kbd>) shows where a photo was taken and which way it faces. One spot can hold several photos, each with its own arrow; this one has two. New photos wait on the <b>Photos</b> tab until they are put on a marker, and there is one waiting there now.',
    tryIt: 'Put a marker in the upstairs bathroom and give it the waiting photo.',
    at: '#sideTabs [data-side="photos"], #viewBar [data-view="photos"]',
    go() {
      tourGo('tut-main', plan.photos.find((p) => p.id === 'tut-ph-kitchen'), 'photo');
      tourSide('photos');
    },
  },
  {
    title: 'Issues',
    text: 'An issue (<kbd>I</kbd>) is pinned where it is, coloured by how serious it is. Each has a status, your own estimate of the cost, how soon it should be dealt with and who would do it.',
    tryIt: 'Change this issue’s status to In progress.',
    at: '#inspector',
    go() {
      tourIssueGo(1);
    },
  },
  {
    title: 'Every issue in one list',
    text: 'The <b>Issues</b> tab lists them all, with filters and grouping, what each is estimated or quoted to cost, and the totals. It is also where to find an issue with no pin, such as one about the whole house or a whole floor, as it has no spot on a plan. <b>Show on plan</b> goes to an issue’s pin, and <b>Add professional quote</b> starts a quote for it.',
    at: '#tabIssues',
    go() {
      $('#tabIssues').click();
      tourPlan();
    },
  },
  {
    title: 'Quotes from professionals',
    text: 'The roof is about the whole house, so it has no pin and is found here on the Issues tab. Selected, it opens in the side panel. It has three quotes, each with your rating of the company and notes on how it went; the declined one is left out of the quoted range. Accepting a quote makes its figure the cost used in every total. The bonus room stain waits for this one: it is in its <b>Order of work</b>.',
    tryIt: 'Open one of the quotes in the side panel and look at its rating.',
    at: '.issueCard.sel, #btnAddQuote',
    go() {
      const i = tourIssue(2);
      $('#tabIssues').click();
      if (i) sel = { type: 'issue', id: i.id };
      renderAll();
      if (viewsOn()) showView('issues');
    },
  },
  {
    title: 'Before and after',
    text: 'This issue is done. Its photos are split into before and after by the day each was taken, and the accepted quote shows who did the work and what it cost.',
    at: '#inspector',
    go() {
      tourIssueGo(5);
    },
  },
  {
    title: 'The house as a whole',
    text: 'The <b>House</b> tab keeps the facts about the house (when it was built, its roof, wiring, heating), your goals, and a walkthrough checklist whose problems link to issues. <b>Print summary…</b> makes a one-page summary for an insurer or a buyer.',
    at: '#tabHouse',
    go() {
      $('#tabHouse').click();
      tourPlan();
    },
  },
  {
    title: 'Maintenance',
    text: 'At the end of the House tab are the jobs done every so often, such as the furnace filter. One that is overdue shows on the House tab. <b>Done today</b> marks a job done, and <b>Add common jobs…</b> offers the usual ones.',
    tryIt: 'Mark the furnace filter done today.',
    at: '.maintenance',
    go() {
      $('#tabHouse').click();
      tourPlan();
      $('.maintenance')?.scrollIntoView({ block: 'start' });
    },
  },
  {
    title: 'The 3D view',
    text: 'The <b>View</b> menu draws the house in 3D from the plan: the outside, and each floor with its walls cut away. The switches up top show or hide labels, issues, photos and fixtures, and each picture turns and zooms.',
    tryIt: 'Turn a picture with its arrows.',
    at: '#view3dShow',
    go() {
      tourGo('tut-main');
      renderView3d();
      tourOpen('#view3dDialog').showModal();
      sizeView3d();
    },
  },
  {
    title: 'Printing',
    text: '<b>Print or save as PDF</b>, in the File menu, prints the floor plans, a report of the issues with their photos, and the house summary, or saves them as a PDF.',
    at: '#printSummary',
    go() {
      openPrint();
      tourDialog = $('#printDialog');
    },
  },
  {
    title: 'Keeping a copy and sharing',
    text: '<b>Export project (.zip)</b> saves everything, photos included, as one file: keep it as a backup, or start a new project from it on another device. <b>Export for AI</b> makes a zip an AI assistant can read, and <b>Import AI review</b> brings its advice back in.',
    at: '#btnExportAll',
    go() {
      tourMenu('#btnExportAll');
    },
  },
  {
    title: 'Your own house',
    text: 'That is the tour. To start on your own house, use <b>File → Close project</b>, then <b>New project</b>. The <b>?</b> menu has tips for each sheet, every shortcut key, and this tour again.',
    at: '#btnHelp',
    go() {
      tourGo('tut-main');
      tourPlan();
      tourMenu('#btnHelp');
    },
  },
];

function tourLeave() {
  $('.tourRing')?.classList.remove('tourRing');
  closeMenus();
  const card = $('#tourCard');
  if (card.parentNode !== document.body) document.body.append(card);
  if (tourDialog?.open) tourDialog.close('cancel');
  tourDialog = null;
}

function tourShow(n) {
  tourLeave();
  tourAt = n;
  const step = TOUR[n];
  step.go();
  const card = $('#tourCard');
  const open = document.querySelector('dialog[open]');
  if (open) open.append(card); // the only place anything can be used while a window is open
  card.hidden = false;
  $('#tourStep').textContent = `Step ${n + 1} of ${TOUR.length}`;
  $('#tourTitle').textContent = step.title;
  $('#tourText').innerHTML = step.text;
  $('#tourTry').innerHTML = step.tryIt ? `<b>Try it:</b> ${step.tryIt}` : '';
  $('#tourTry').hidden = !step.tryIt;
  $('#tourBack').disabled = n === 0;
  $('#tourNext').textContent = n === TOUR.length - 1 ? 'Finish' : 'Next';
  // The plan is fitted round the card once the card has its words, and so its size.
  if (!onList() && !open && !$('main').classList.contains('panel')) tourFit();
  const ring = step.at && [...document.querySelectorAll(step.at)].find((el) => el.offsetParent || el.getClientRects().length);
  if (ring) {
    ring.classList.add('tourRing');
    ring.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    tourClear(ring);
  }
}

// Scrolls what a step rings up from under the card, where what holds it can scroll that far.
function tourClear(el) {
  const card = $('#tourCard').getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.bottom <= card.top || r.top >= card.bottom || r.right <= card.left || r.left >= card.right) return;
  for (let box = el.parentElement; box; box = box.parentElement) {
    if (box.scrollHeight <= box.clientHeight || !/auto|scroll/.test(getComputedStyle(box).overflowY)) continue;
    // Its top is brought to the top of what scrolls, or as near as keeps it above the card.
    box.scrollTop += Math.min(r.top - box.getBoundingClientRect().top - 8, r.bottom - card.top + 12);
    return;
  }
}

function startTour() {
  if (document.querySelector('dialog[open]')) return;
  tourShow(0);
}

function endTour() {
  if (tourAt < 0) return;
  tourLeave();
  tourAt = -1;
  $('#tourCard').hidden = true;
}

// Clicks on the card are kept from the page, which would otherwise take them as a click elsewhere
// and close the menu a step has just opened.
$('#tourCard').addEventListener('click', (e) => {
  e.stopPropagation();
  if (e.target.closest('#tourClose')) return endTour();
  if (e.target.closest('#tourBack') && tourAt > 0) return tourShow(tourAt - 1);
  if (e.target.closest('#tourNext')) return tourAt < TOUR.length - 1 ? tourShow(tourAt + 1) : endTour();
});

// A window a step opened can be closed from inside it; the card then comes back out with it.
document.addEventListener('close', (e) => {
  if (e.target === $('#tourCard').parentNode) document.body.append($('#tourCard'));
}, true);

document.addEventListener('keydown', (e) => {
  if (tourAt >= 0 && e.key === 'Escape' && !document.querySelector('dialog[open]')) endTour();
});

// ---------- the tutorial project in the ? menu ----------

function renderTutorialMenu() {
  const on = !!plan?.tutorial;
  for (const id of ['#btnTour', '#btnTutorialReset', '#tutorialRule']) $(id).hidden = !on;
}

$('#btnTour').addEventListener('click', () => {
  closeMenus();
  startTour();
});

$('#btnTutorialReset').addEventListener('click', async () => {
  closeMenus();
  if (!await ask('Start the tutorial house over?', { ok: 'Start over', danger: true, detail: 'Every change made to it is lost, and it goes back to how it came, photos and all.' })) return;
  endTour();
  try {
    await resetTutorial();
  } catch (e) {
    tell('Could not start the tutorial over: ' + e.message);
  }
});
