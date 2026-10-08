'use strict';

// The tutorial house: a made-up house, drawn and filled in, that shows what a finished project
// looks like and that the guided tour walks through. It is loaded only when asked for, from the
// start page, and unpacked into a project of its own in the browser's storage. Nothing in it is a
// real house.
//
// Lengths are in feet, as the app works in them. Dates are counted back from the day it is
// unpacked, so that what is due, overdue or recently done reads the same whenever it is opened.
// Its photos are drawn here too, as simple pictures, so the app ships no photo files.

const TUTORIAL_NAME = 'Tutorial house';

function tutorialPlan() {
  const ago = (days) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return dayStamp(d);
  };
  const year = new Date().getFullYear();
  const doneOn = ago(45); // the day the water heater was replaced

  // A room from its corners, with anything else it has.
  const room = (id, name, x0, y0, x1, y1, more = {}) => ({ id, name, x: x0, y: y0, w: x1 - x0, h: y1 - y0, ...more });
  // Doors and openings sit in the middle of the wall's thickness: `along` is the way the wall runs.
  const IN = 0.375; // interior wall
  const OUT = 0.5; // exterior wall
  const door = (kind, along, x, y, w, more = {}) => ({ id: uid(), kind, along, x, y, w, t: OUT, hinge: 0, swing: 0, ...more });
  const inner = (kind, along, x, y, w, more = {}) => door(kind, along, x, y, w, { t: IN, ...more });
  const win = (along, x, y, w = 3, more = {}) => ({ id: uid(), kind: 'window', style: 'standard', along, x, y, w, t: OUT, sill: 3, ...more });
  // A fixture by its middle, its usual size and which way its back faces: 0 the top of the sheet,
  // 90 the right, 180 the bottom, 270 the left.
  const item = (kind, cx, cy, rot = 0, more = {}) => {
    const k = itemKind(kind);
    const w = more.w ?? fine(k.w / 12);
    const h = more.h ?? fine(k.d / 12);
    return { id: uid(), kind, note: '', rot, ...more, w, h, x: fine(cx - w / 2), y: fine(cy - h / 2) };
  };
  const stairs = (x, y0, y1, dir, to) => ({ id: uid(), kind: 'stairs', points: [{ x, y: y0 }, { x, y: y1 }], w: 3, dir, to, note: '' });

  const ids = { ext: 'tut-ext', base: 'tut-base', main: 'tut-main', up: 'tut-up' };

  const exterior = {
    id: ids.ext, name: 'Exterior / Site', kind: 'exterior',
    rooms: [
      room('tut-house', 'House', 0, 0, 40, 30),
      room('tut-garage', 'Garage', 46, 6, 68, 28, { separate: true }),
      room('tut-deck', 'Deck', 22, -12, 36, 0, { separate: true }),
      room('tut-porch', 'Porch', 14, 30, 26, 35, { separate: true }),
    ],
    openings: [],
    items: [],
  };

  const basement = {
    id: ids.base, name: 'Basement', kind: 'floor', basement: true,
    rooms: [
      room('tut-family', 'Family room', 0.5, 0.5, 16, 29.5, { finished: true, cover: 'carpet', walls: 'drywall', ceilingFinish: 'drop' }),
      room('tut-bhall', 'Hall', 16.375, 0.5, 24, 13, { finished: true, cover: 'vinyl' }),
      room('tut-storage', 'Storage', 24.375, 0.5, 27.5, 13, { cover: 'concrete', walls: 'bare', ceilingFinish: 'open' }),
      room('tut-utility', 'Utility room', 16.375, 13.375, 27.5, 29.5, { cover: 'concrete', walls: 'bare', ceilingFinish: 'open' }),
      room('tut-crawl', 'Crawl space', 27.875, 0.5, 39.5, 29.5, { separate: true }),
    ],
    openings: [
      inner('door', 'y', 16.1875, 6, 2.5),
      inner('door', 'x', 20.1875, 13.1875, 2.5, { swing: 1 }),
      inner('door', 'y', 24.1875, 6, 2.5, { swing: 1 }),
      inner('opening', 'y', 27.6875, 22, 2.5),
      win('y', 0.25, 10, 3, { style: 'egress', sill: 44 / 12, well: true }),
      win('x', 8, 29.75, 32 / 12, { style: 'high', sill: 5 }),
      win('x', 22, 29.75, 32 / 12, { style: 'high', sill: 5 }),
    ],
    items: [
      item('furnace', 19, 28.25, 180, { brand: 'Carrier', model: 'TUT-59SC', installed: 2012 }),
      item('wh', 21.6, 28.5, 180, { brand: 'Rheem', model: 'TUT-40G', installed: year, note: 'Replaced after the old one leaked.' }),
      item('washer', 26.25, 16, 90, { brand: 'LG', installed: 2018 }),
      item('dryer', 26.25, 18.5, 90, { brand: 'LG', installed: 2018 }),
      item('usink', 26.5, 21, 90),
      item('panel', 25, 29.33, 180, { brand: 'Square D', installed: 1998, note: '200 amp main breaker.' }),
      item('sump', 17.5, 23),
      item('shutoff', 23.5, 29.25, 180),
      item('drain', 21, 22),
      stairs(18.1, 12, 1.2, 'up', ids.main),
    ],
  };

  const main = {
    id: ids.main, name: 'Main floor', kind: 'floor',
    rooms: [
      room('tut-dining', 'Dining room', 0.5, 0.5, 16, 13, { cover: 'hardwood', walls: 'drywall' }),
      room('tut-hall', 'Hall', 16.375, 0.5, 24, 13, { cover: 'hardwood' }),
      room('tut-kitchen', 'Kitchen', 24.375, 0.5, 39.5, 13, { cover: 'tile', walls: 'drywall', paint: 'Warm white', sheen: 'eggshell', ceilingFinish: 'smooth' }),
      room('tut-living', 'Living room', 0.5, 13.375, 16, 29.5, { cover: 'hardwood', walls: 'plaster', sheen: 'flat' }),
      room('tut-halfbath', 'Half bath', 16.375, 13.375, 24, 19, { cover: 'tile' }),
      room('tut-coats', 'Closet', 16.375, 19.375, 24, 22, { partOf: 'tut-entry' }),
      room('tut-entry', 'Entry', 16.375, 22.375, 24, 29.5, { cover: 'tile' }),
      room('tut-den', 'Den', 24.375, 13.375, 39.5, 29.5, { cover: 'carpet' }),
    ],
    openings: [
      inner('opening', 'x', 8, 13.1875, 6),
      inner('opening', 'y', 16.1875, 6, 3),
      inner('opening', 'y', 24.1875, 4, 3),
      inner('opening', 'y', 16.1875, 26, 3),
      inner('door', 'x', 20.1875, 13.1875, 2.5, { swing: 1 }),
      inner('bifold', 'x', 20.1875, 22.1875, 2.5, { swing: 1 }),
      inner('door', 'y', 24.1875, 26, 2.5, { swing: 1 }),
      door('exterior', 'x', 20.1875, 29.75, 3),
      door('exterior', 'x', 26.25, 0.25, 3, { swing: 1 }),
      win('x', 8, 29.75, 5),
      win('y', 0.25, 21),
      win('y', 0.25, 6),
      win('x', 8, 0.25, 4),
      win('x', 35, 0.25, 3, { sill: 3.5 }),
      win('y', 39.75, 6),
      win('x', 32, 29.75, 4),
      win('y', 39.75, 25),
    ],
    items: [
      item('counter', 31, 1.54, 0, { w: 5 }),
      item('ksink', 34.875, 1.42),
      item('dishwasher', 37.25, 1.5, 0, { brand: 'Bosch', installed: 2021 }),
      item('counter', 38.875, 1.54, 0, { w: 1.25 }),
      item('upper', 31, 1, 0, { w: 5, h: 1, bottom: 4.5, top: 7.5 }),
      item('stove', 38.42, 6, 90, { brand: 'GE', installed: 2015 }),
      item('fridge', 25.625, 10.5, 270, { brand: 'Whirlpool', model: 'TUT-WRF', installed: 2019 }),
      item('counter', 32, 8, 0, { w: 6, h: 3, note: 'Island' }),
      item('toilet', 18, 17.83, 180),
      item('sink', 22.3, 18.125, 180),
      item('fireplace', 38.5, 19, 90),
      item('alarm', 20.2, 3, 0),
      stairs(22.4, 12, 1.2, 'up', ids.up),
      stairs(18.1, 1.2, 12, 'down', ids.base),
    ],
  };

  const upstairs = {
    id: ids.up, name: '2nd floor', kind: 'floor',
    rooms: [
      room('tut-primary', 'Primary bedroom', 0.5, 0.5, 16, 12.5, { cover: 'carpet' }),
      room('tut-pcloset', 'Closet', 0.5, 12.875, 16, 15, { partOf: 'tut-primary' }),
      room('tut-bed2', 'Bedroom 2', 0.5, 15.375, 16, 29.5, { cover: 'carpet' }),
      room('tut-uhall', 'Hall', 16.375, 0.5, 24, 20, { cover: 'hardwood' }),
      room('tut-bath', 'Bathroom', 16.375, 20.375, 24, 29.5, { cover: 'tile', walls: 'tile' }),
      room('tut-bed3', 'Bedroom 3', 24.375, 0.5, 39.5, 14, { cover: 'carpet' }),
      room('tut-bonus', 'Bonus room', 24.375, 14.375, 39.5, 29.5, { cover: 'laminate', level: 7 / 12 }),
    ],
    openings: [
      inner('door', 'y', 16.1875, 6, 2.5),
      inner('sliding', 'x', 8, 12.6875, 5),
      inner('door', 'y', 16.1875, 18, 2.5),
      inner('door', 'y', 24.1875, 10, 2.5, { swing: 1 }),
      inner('door', 'y', 24.1875, 17, 2.5, { swing: 1 }),
      inner('door', 'x', 20.1875, 20.1875, 2.5, { swing: 1 }),
      win('y', 0.25, 6),
      win('x', 8, 0.25),
      win('y', 0.25, 22),
      win('x', 8, 29.75),
      win('x', 32, 0.25),
      win('y', 39.75, 7),
      win('y', 39.75, 22),
      win('x', 32, 29.75),
      win('x', 21.5, 29.75, 2, { sill: 4.5 }),
    ],
    items: [
      item('tub', 18.875, 28.25, 180),
      item('toilet', 17.54, 23, 270),
      item('sink', 23.125, 23, 90),
      item('hatch', 20.2, 8),
      stairs(22.4, 1.2, 12, 'down', ids.main),
    ],
  };

  // ---------- photos ----------
  // Each is { id, floorId, roomId, x, y, dir, name, taken, art }: `name` and `art` say what file is
  // drawn for it, and `dir` is the way the camera faced, in degrees clockwise from the top.
  const photos = [
    { id: 'tut-ph-front', floorId: ids.ext, roomId: null, x: 20, y: 44, dir: 0, name: 'front-of-house.jpg', taken: ago(200), art: 'front', note: 'From across the street.' },
    { id: 'tut-ph-roof', floorId: ids.ext, roomId: null, x: 29, y: -16, dir: 180, name: 'back-roof.jpg', taken: ago(20), art: 'roof' },
    { id: 'tut-ph-kitchen', floorId: ids.main, roomId: 'tut-kitchen', x: 26, y: 11.5, dir: 45, name: 'kitchen.jpg', taken: ago(90), art: 'kitchen',
      more: [{ id: 'tut-ph-island', dir: 100, name: 'kitchen-island.jpg', taken: ago(90), art: 'island' }] },
    { id: 'tut-ph-stain', floorId: ids.up, roomId: 'tut-bonus', x: 29, y: 27, dir: 30, name: 'ceiling-stain.jpg', taken: ago(18), art: 'stain' },
    { id: 'tut-ph-wh', floorId: ids.base, roomId: 'tut-utility', x: 21.6, y: 23.5, dir: 180, name: 'water-heater-before.jpg', taken: ago(60), art: 'whOld',
      more: [{ id: 'tut-ph-wh-after', dir: 180, name: 'water-heater-after.jpg', taken: ago(44), art: 'whNew' }] },
    { id: 'tut-ph-damp', floorId: ids.base, roomId: 'tut-family', x: 6, y: 20, dir: 270, name: 'damp-wall.jpg', taken: ago(25), art: 'damp' },
  ];

  // ---------- issues ----------
  let num = 0;
  const issue = (props) => ({ id: uid(), num: ++num, description: '', category: 'major', status: 'Open', costLow: null, costHigh: null, photo: '', photoIds: [], added: ago(30), ...props });
  const alarm = issue({ title: 'No smoke alarm in the upstairs hall', category: 'safety', floorId: ids.up, x: 20.2, y: 15, costLow: 30, costHigh: 60, when: 'now', who: 'me',
    description: 'There is one downstairs but none outside the bedrooms. Every sleeping area should have one.', added: ago(10) });
  const roof = issue({ title: 'Shingles curling on the back of the roof', category: 'major', costLow: 8000, costHigh: 12000, when: 'season', trade: 'Roofer', who: 'pro', worse: 'yes',
    description: 'Seen from the deck: shingles lifting and curling along the back slope, and grit collecting in the gutters. The roof is about 18 years old.',
    photoIds: ['tut-ph-roof'], added: ago(20),
    quotes: [
      { id: uid(), company: 'Summit Roofing', contact: 'Dana', amount: 9800, date: ago(12), status: 'Received', timeline: 'Can start in 3 weeks; 2 days', warranty: '10 years labour',
        scope: 'Tear off, new underlayment, architectural shingles, new flashing at the chimney and vents.', rating: 4, review: 'On time, explained everything, answered emails the same day.' },
      { id: uid(), company: 'Ridgeline Roofing', amount: 11200, date: ago(9), status: 'Received', timeline: 'Next month', warranty: 'Lifetime on shingles, 15 years labour',
        scope: 'As Summit, plus ice and water shield along the eaves and a ridge vent.', rating: 5, review: 'Went up on the roof and sent photos of the worst spots. Most thorough of the three.' },
      { id: uid(), company: 'Quick Cover Roofing', amount: 6500, date: ago(14), status: 'Declined', rating: 2,
        notes: 'Shingle over the old layer, no tear off.', review: 'Would not put the price in writing or say whether they pull a permit.' },
    ] });
  const stain = issue({ title: 'Water stain on the bonus room ceiling', category: 'major', floorId: ids.up, x: 31, y: 24, costLow: 300, costHigh: 600, trade: 'Drywall and painting',
    description: 'A brown ring about a foot across. It grows after heavy rain, so it is probably the roof.', photoIds: ['tut-ph-stain'], started: 'Last spring', frequency: 'After heavy rain', worse: 'yes',
    after: [roof.id], related: [roof.id], added: ago(18) });
  roof.related = [stain.id];
  const drain = issue({ title: 'Bathroom sink drains slowly', category: 'minor', status: 'In progress', floorId: ids.up, x: 22.6, y: 24.5, costLow: 0, costHigh: 150, who: 'me',
    tried: 'Plunger, then a plastic drain snake. Better for a week each time.', added: ago(8) });
  const heater = issue({ title: 'Water heater leaking at the base', category: 'major', status: 'Done', doneOn, floorId: ids.base, x: 21.6, y: 26.4, costLow: 1200, costHigh: 2000, trade: 'Plumber', who: 'pro',
    description: 'A puddle under the tank and rust round the bottom. It was 16 years old.', photoIds: ['tut-ph-wh'], added: ago(62),
    quotes: [
      { id: uid(), company: 'Valley Plumbing', contact: 'Sam', amount: 1650, date: ago(55), status: 'Accepted', warranty: '6 years tank, 1 year labour', timeline: 'Next day',
        scope: 'Remove the old tank, fit a new 40 gallon gas heater with an expansion tank, haul the old one away.', rating: 5,
        review: 'Came the next morning, kept the work area clean, and showed me how to drain it once a year.' },
    ] });
  const scuffs = issue({ title: 'Scuffed paint in the entry', category: 'cosmetic', floorId: ids.main, x: 18, y: 27.5, costLow: 40, costHigh: 80, who: 'me', when: 'wait' });
  const island = issue({ title: 'Replace the island counter top', category: 'preference', floorId: ids.main, x: 32, y: 8.2, costLow: 2500, costHigh: 4000,
    description: 'The laminate is chipped along the front edge. Would like stone or butcher block.', when: 'wait' });
  const gutter = issue({ title: 'Downspout empties against the foundation', category: 'minor', floorId: ids.ext, x: 40.6, y: 1, costLow: 20, costHigh: 80, who: 'me', when: 'season',
    description: 'The back corner downspout lets water out right at the wall. Needs an extension to carry it a few feet away.' });
  const damp = issue({ title: 'Damp patch low on the family room wall', category: 'major', floorId: ids.base, x: 1.4, y: 20, costLow: 200, costHigh: 1500, trade: 'Foundation or waterproofing',
    description: 'The bottom of the drywall feels damp after rain, under the corner where the downspout is.', photoIds: ['tut-ph-damp'], worse: 'unknown', after: [gutter.id], related: [gutter.id] });
  gutter.related = [damp.id];
  const gfci = issue({ title: 'No GFCI outlet beside the kitchen sink', category: 'safety', floorId: ids.main, x: 34.9, y: 3, costLow: 150, costHigh: 250, trade: 'Electrician', when: 'month' });
  const drafts = issue({ title: 'Draughty windows on the main floor', category: 'minor', floorId: ids.main, costLow: 400, costHigh: 1200, trade: 'Windows and doors',
    description: 'Cold air round most of the main floor windows in winter. No one spot, so it has no pin.' });
  const issues = [alarm, roof, stain, drain, heater, scuffs, island, gutter, damp, gfci, drafts];

  return {
    version: 5,
    tutorial: true,
    name: TUTORIAL_NAME,
    address: '12 Sample Lane (a made-up house)',
    floors: [exterior, basement, main, upstairs],
    issues,
    nextIssueNum: num + 1,
    photos,
    aerial: null,
    exteriorSized: true,
    tipsSeen: { exterior: true, floor: true },
    standards: { exteriorWall: OUT, interiorWall: IN, door: 2.5, opening: 32 / 12, exteriorDoor: 3, ceiling: 8 },
    facts: {
      built: 1978, foundation: 'Partial basement', foundationDetail: 'Basement under most of the house, a crawl space under the kitchen and den',
      basementWalls: 'Poured concrete', walls: 'Vinyl or metal siding', roof: 'Asphalt shingles', roofYear: year - 18,
      supply: 'Copper', drains: 'More than one kind', drainsDetail: 'Cast iron main stack, plastic everywhere else',
      service: '200 amp or more', panel: 'Circuit breakers', wiring: 'Copper, with ground',
      heating: 'Gas furnace', heatingYear: 2012, cooling: 'Central air', coolingYear: 2012,
      waterHeater: 'Gas, with a tank', waterHeaterYear: year, sewer: 'City sewer', water: 'City supply',
      events: 'Hail storm a few years ago: insurance paid for new gutters. The water heater leaked and was replaced this year.',
    },
    goals: {
      plan: 'Staying for many years',
      diy: 'Painting, caulking, small plumbing jobs. Nothing electrical or on the roof.',
      order: 'Roof before the bonus room ceiling. Downspout before deciding about the basement wall.',
      money: { budget: '$15,000 this year' },
    },
    household: { people: 'Two adults and a six year old.', pets: 'A dog' },
    checklist: {
      roof: { state: 'issue', issueId: roof.id },
      gutters: { state: 'issue', issueId: gutter.id },
      foundation: { state: 'issue', issueId: damp.id },
      waterHeater: { state: 'fine', note: 'New this year.' },
      electrical: { state: 'issue', issueId: gfci.id },
      hvac: { state: 'fine' },
      alarms: { state: 'issue', issueId: alarm.id },
      radon: { state: 'unknown' },
      plumbing: { state: 'fine' },
    },
    maintenance: [
      { id: uid(), task: 'Replace the furnace or air handler filter', every: 3, last: ago(110), note: '16×25×1 filter, on the shelf by the furnace.' },
      { id: uid(), task: 'Test the smoke and carbon monoxide alarms', every: 6, last: ago(40), note: '' },
      { id: uid(), task: 'Clean the gutters and check the downspouts run away from the house', every: 6, last: ago(175), note: '' },
      { id: uid(), task: 'Drain and flush the water heater', every: 12, last: doneOn, note: 'Shown how by the plumber.' },
      { id: uid(), task: 'Test for radon', every: 24, last: '', note: '' },
    ],
    photoTaken: { 'bathroom-sink.jpg': `${ago(8)} 18:20` },
  };
}

// The photo left waiting in photos/unprocessed, for the tour to show filing one.
const TUTORIAL_UNFILED = { name: 'bathroom-sink.jpg', art: 'sink' };

// Where a photo of the plan is kept, as photoDir() works it out.
function tutorialPhotoDir(p, ph) {
  const f = p.floors.find((x) => x.id === ph.floorId);
  const r = f.rooms.find((x) => x.id === ph.roomId);
  return `${DIR_PROCESSED}/${slug(f.name, 'floor')}/${r ? slug(r.name, 'room') : f.kind === 'exterior' ? 'exterior' : 'unassigned'}`;
}

// ---------- drawing the photos ----------
// Each is a plain picture of what the photo is of, with a caption saying it is a tutorial photo.

const PHOTO_W = 960;
const PHOTO_H = 720;

const TUTORIAL_ART = {
  front(g) {
    sky(g, '#bcd9ee');
    ground(g, '#7cab5a', 520);
    g.fillStyle = '#e8e2d4';
    g.fillRect(230, 300, 500, 230);
    roofShape(g, 200, 300, 760, 300, 480, 170, '#5d4b45');
    g.fillStyle = '#6d8db0';
    for (const x of [270, 600]) g.fillRect(x, 360, 90, 80);
    g.fillRect(300, 230, 70, 50);
    g.fillRect(590, 230, 70, 50);
    g.fillStyle = '#8a3b2e';
    g.fillRect(445, 390, 70, 140);
    g.fillStyle = '#9a9a9a';
    g.fillRect(400, 530, 160, 30);
  },
  roof(g) {
    sky(g, '#c6dcef');
    roofShape(g, 40, 560, 920, 560, 480, 160, '#6a5a52');
    g.strokeStyle = '#4b3e38';
    g.lineWidth = 3;
    for (let y = 220; y < 560; y += 36) line(g, 80, y, 880, y);
    g.fillStyle = '#8b7a70';
    for (const [x, y] of [[360, 330], [420, 380], [520, 300], [600, 410], [480, 450]]) {
      g.save();
      g.translate(x, y);
      g.rotate(-0.3);
      g.fillRect(0, 0, 70, 22);
      g.restore();
    }
    g.fillStyle = '#d9d2c4';
    g.fillRect(0, 560, PHOTO_W, 160);
  },
  kitchen(g) {
    wall(g, '#f1ebe0');
    g.fillStyle = '#c9a77c';
    g.fillRect(80, 160, 800, 150); // upper cabinets
    g.fillStyle = '#a7b8c8';
    g.fillRect(380, 330, 200, 120); // window
    g.fillStyle = '#7a6a5a';
    g.fillRect(60, 470, 840, 30); // counter top
    g.fillStyle = '#c9a77c';
    g.fillRect(60, 500, 840, 170);
    g.fillStyle = '#9aa3aa';
    g.fillRect(410, 470, 140, 14); // sink
  },
  island(g) {
    wall(g, '#f1ebe0');
    floorBand(g, '#b9a68f', 540);
    g.fillStyle = '#d8d0c2';
    g.fillRect(220, 400, 520, 34);
    g.fillStyle = '#7a8f9c';
    g.fillRect(240, 434, 480, 150);
    g.strokeStyle = '#6b5f52';
    g.lineWidth = 4;
    for (let x = 300; x < 720; x += 70) line(g, x, 400, x + 10, 434); // chips along the edge
  },
  stain(g) {
    wall(g, '#f4f1ea');
    const r = g.createRadialGradient(500, 330, 20, 500, 330, 170);
    r.addColorStop(0, 'rgba(160,120,60,0.15)');
    r.addColorStop(0.75, 'rgba(160,120,60,0.35)');
    r.addColorStop(1, 'rgba(160,120,60,0)');
    g.fillStyle = r;
    g.beginPath();
    g.ellipse(500, 330, 200, 140, 0.2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(130,90,40,0.6)';
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(500, 330, 160, 110, 0.2, 0, Math.PI * 2);
    g.stroke();
  },
  whOld(g) {
    wall(g, '#bdb7ad');
    floorBand(g, '#8f8a83', 560);
    heaterTank(g, '#c9c3b5');
    g.fillStyle = 'rgba(130,70,30,0.7)';
    g.fillRect(380, 470, 200, 70); // rust at the bottom
    g.fillStyle = 'rgba(70,100,140,0.55)';
    g.beginPath();
    g.ellipse(470, 610, 240, 50, 0, 0, Math.PI * 2);
    g.fill(); // the puddle
  },
  whNew(g) {
    wall(g, '#bdb7ad');
    floorBand(g, '#8f8a83', 560);
    heaterTank(g, '#eef1f3');
    g.fillStyle = '#9aa7b3';
    g.fillRect(600, 230, 60, 90); // expansion tank
    g.fillStyle = '#4d7ea8';
    g.fillRect(380, 360, 200, 40); // label band
  },
  damp(g) {
    wall(g, '#ece6da');
    floorBand(g, '#8c7d6c', 600);
    const r = g.createLinearGradient(0, 380, 0, 600);
    r.addColorStop(0, 'rgba(120,100,70,0)');
    r.addColorStop(1, 'rgba(120,100,70,0.55)');
    g.fillStyle = r;
    g.fillRect(260, 380, 420, 220);
  },
  sink(g) {
    wall(g, '#dfe7ea');
    g.fillStyle = '#f7f7f7';
    g.beginPath();
    g.ellipse(480, 430, 260, 110, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c7d2d8';
    g.beginPath();
    g.ellipse(480, 440, 190, 70, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#9aa7ae';
    g.fillRect(455, 250, 50, 110);
    g.fillStyle = 'rgba(120,150,170,0.6)';
    g.beginPath();
    g.ellipse(480, 450, 120, 40, 0, 0, Math.PI * 2);
    g.fill(); // standing water
  },
};

const TUTORIAL_CAPTIONS = {
  front: 'Front of the house', roof: 'Back slope of the roof', kitchen: 'Kitchen, looking at the sink', island: 'Kitchen island',
  stain: 'Stain on the bonus room ceiling', whOld: 'Water heater, before', whNew: 'Water heater, after', damp: 'Damp patch, family room wall', sink: 'Bathroom sink',
};

function sky(g, c) {
  g.fillStyle = c;
  g.fillRect(0, 0, PHOTO_W, PHOTO_H);
}
function ground(g, c, y) {
  g.fillStyle = c;
  g.fillRect(0, y, PHOTO_W, PHOTO_H - y);
}
function wall(g, c) {
  sky(g, c);
}
function floorBand(g, c, y) {
  ground(g, c, y);
}
function line(g, x0, y0, x1, y1) {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}
function roofShape(g, x0, y0, x1, y1, px, py, c) {
  g.fillStyle = c;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(px, py);
  g.lineTo(x1, y1);
  g.closePath();
  g.fill();
}
function heaterTank(g, c) {
  g.fillStyle = c;
  g.fillRect(360, 160, 240, 400);
  g.beginPath();
  g.ellipse(480, 160, 120, 30, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#777';
  g.fillRect(430, 80, 20, 60);
  g.fillRect(510, 80, 20, 60);
}

// One photo as a JPEG.
async function tutorialPhoto(art) {
  const c = new OffscreenCanvas(PHOTO_W, PHOTO_H);
  const g = c.getContext('2d');
  TUTORIAL_ART[art](g);
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(0, PHOTO_H - 64, PHOTO_W, 64);
  g.fillStyle = '#fff';
  g.font = '28px system-ui, sans-serif';
  g.fillText(`Tutorial photo: ${TUTORIAL_CAPTIONS[art]}`, 24, PHOTO_H - 22);
  return c.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
}

// Writes the tutorial house into the project folder open in `store.root` and returns its plan,
// ready to be saved. Each photo is drawn, put where a filed photo of its marker is kept, and the
// marker given its path.
async function unpackTutorial(onStep = () => {}) {
  const p = tutorialPlan();
  const jobs = [...p.photos.flatMap((ph) => [ph, ...(ph.more || [])].map((shot) => ({ ph, shot }))), { shot: TUTORIAL_UNFILED }];
  let n = 0;
  for (const { ph, shot } of jobs) {
    onStep(++n, jobs.length);
    const dir = ph ? tutorialPhotoDir(p, ph) : DIR_UNPROCESSED;
    const file = `${dir}/${shot.name}`;
    await store.dir(dir, true);
    await store.write(file, await tutorialPhoto(shot.art));
    if (!ph) continue;
    Object.assign(shot, { file, original: shot.name, taken: `${shot.taken} 10:00` });
    delete shot.name;
    delete shot.art;
  }
  for (const ph of p.photos) ph.note ||= '';
  return p;
}
