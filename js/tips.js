'use strict';

// Getting-started tips, shown once per project the first time a kind of sheet is opened, and again
// whenever they are chosen from the ? menu. Closing the floor tips leads on to the house standards.

const TIPS = {
  exterior: {
    title: 'Before you draw the exterior',
    html: `<p class="lead"><b>A good base measurement here is the key to everything else.</b> Every room, area and cost figure later on is worked out from the size of this outline, so it is worth a few extra minutes with a tape measure to get it right.</p>
    <ol>
      <li><b>Start from something you have measured.</b> Pick one simple part of the building, such as the garage, and tape its walls. Draw it as a rectangle and type its real width and length, then work outward from it, measuring and adding one piece at a time. New shapes snap to the corners of the ones already drawn. This is more reliable than tracing a picture and correcting it afterwards.</li>
      <li><b>Use an aerial picture to see where things sit, not to measure them.</b> Add it in the <i>Aerial view</i> window and set its scale from something flat on the ground, like a driveway slab, using <i>Set scale…</i>. Do not expect your shapes to line up with it exactly. A picture from above shows roofs, whose eaves stick out a foot or two past the walls; it is rarely taken from straight overhead; and the house may sit at a slight angle in it. When the picture and the tape disagree, trust the tape.</li>
      <li><b>Check as you go.</b> A selected shape shows the length of every wall, and <i>Measure</i> reads the distance between any two points. To correct a wall, use <i>Set one wall's length…</i>. Only use <i>Resize everything from a wall…</i> if every measurement is off in proportion.</li>
      <li><b>Keep covered porches, garages and carports as their own shapes.</b> Draw each one separately and tick <i>Separate structure</i> on it. The square footage of a house normally means its finished, heated living space. That is the figure listings, appraisals and insurers use, and they leave out garages, carports and porches. Counting them in overstates the size of the house and throws off any cost worked out per square foot. A separate structure still shows its own area; it is just left out of the total and never merged into the house by <i>Combine</i>.</li>
      <li><b>Confirm the size before moving indoors.</b> When the walls match your tape, tick <i>The outline is true to size</i>. Rooms drawn on the floors are not resized if the outline changes later.</li>
    </ol>
    <p class="caution"><b>Everything in this app is approximate.</b> Measurements are kept to the nearest quarter of an inch, so round what you read off the tape to the nearest 1/4" when you type it in; anything finer is rounded for you. These floor plans are for planning repairs and keeping track of a house. They are not professional architectural drawings or a survey, and should not be relied on for construction, permits, or anything legal or financial.</p>
    <p class="muted">These are also under <i>Measuring tips</i> in the side panel, and <i>Tips for this sheet</i> under the <b>?</b> button at the top brings this window back.</p>`,
  },
  floor: {
    title: 'Before you draw the rooms',
    html: `<p class="lead"><b>A room here is the clear space inside it, from wall face to wall face.</b> That is what a tape measure reads when you hold it across a room. The walls are the gaps left between the rooms, so their thickness has to be allowed for or the rooms will not fit inside the outline.</p>
    <ol>
      <li><b>Set the house standards first.</b> The next window asks how thick the outside and inside walls are and how wide the doors usually are, with typical values filled in. The easiest place to measure a wall's thickness is at a doorway or a window. <i>House standards…</i> in the side panel brings them back.</li>
      <li><b>Start in a corner of the house.</b> Draw the room as a rectangle near a corner of the dashed outline. Its edges catch one exterior wall's thickness inside the outline, and a pink bar shows the wall it has left. Then type the room's real width and length in the side panel.</li>
      <li><b>Work across from there.</b> Each new room catches one interior wall's thickness from its neighbours. Hold Alt to place an edge freely, for example beside a wall that carries plumbing and is thicker than the rest.</li>
      <li><b>Check that it adds up.</b> The rooms and walls across the house should come to the length of the outline. Use <i>Measure</i> to check; an inch or two over a whole house is normal, and several inches means a room or a wall is off.</li>
      <li><b>Add doors and openings last.</b> Open <i>Placeables</i>, choose <i>Door</i> and click on a wall. It starts at the standard width; the side panel sets whether it is a door, an open doorway or an exterior door, its exact width, and which way it swings. Drag it to slide it along the wall.</li>
      <li><b>Draw a closet as its own small room.</b> Give it its own rectangle, named <i>Closet</i>, beside the room it opens into, instead of making it a bump on that room's shape. That leaves a wall between them to put its door in. The door types include <i>Bifold door</i> and <i>Sliding doors</i>. For a closet already drawn as part of its room, select the room and use <i>Split off a closet…</i>. <i>Belongs to</i> ties a closet to its room.</li>
      <li><b>Drew the rooms edge to edge?</b> With nothing selected, <i>Put walls between touching rooms…</i> moves their walls back to leave standard walls between them. Mark any rooms that are open to each other first, so that they are left alone.</li>
      <li><b>Rooms that are open to each other.</b> Draw them as two rooms that meet edge to edge, with no wall gap, so each keeps its own name, size and photos. Then choose <i>Door</i>, click the line between them and set the type to <i>No wall</i>. It stretches over the whole line the two rooms share; shorten it if part of that line is walled. A <i>Half wall</i> is marked the same way.</li>
      <li><b>Stairs between floors.</b> Open <i>Placeables</i>, choose <i>Stairs</i> and click where they are. Set their width and length, and choose the floor they lead to; the arrow runs from the end you step on. For stairs that change direction, <i>Add a turn left</i> or <i>right</i> puts a landing at the far end with another flight leading off it, and the round handles drag each end and turn into place. Once the stairs lead somewhere, a round button appears on them: click it to go to that floor. When you choose the floor, the app offers to draw the same stairs there too. For a door at the top or bottom, choose <i>Door</i> and click the end of the stairs.</li>
      <li><b>Fixtures and appliances.</b> Open <i>Placeables</i>, choose <i>Fixture</i>, click where it stands, then pick what it is: toilet, sink, tub, shower, counter, stove, refrigerator, washer, dryer, water heater and so on. It starts at a usual size; type its real width and depth if they differ. <i>Back against the nearest wall</i> turns it to face out from that wall and pushes it up to it, at whatever angle the wall runs. The round yellow handle turns it by hand, and catches on the direction of the walls. Draw a run of counter as one long <i>Counter</i> and set the sink and stove on top of it.</li>
      <li><b>Curved walls.</b> Select the room, press <i>Bend a wall…</i>, then press on the wall and drag it out or in. The wall becomes an arc through the yellow point you leave behind; drag that point to adjust it, add more for a longer curve, or double-click it to take it out. While drawing with <i>Polygon</i>, Ctrl-click places such a point directly. The room's area follows the curve.</li>
      <li><b>Sunken or raised rooms stay on this sheet.</b> Select the room and set its <i>Floor level</i> to lower or higher, with the height of the step. Any door or opening into it is then marked as a step.</li>
    </ol>
    <p class="caution"><b>Everything in this app is approximate.</b> Measurements are kept to the nearest quarter of an inch, so round what you read off the tape to the nearest 1/4" when you type it in. Walls in a real house vary in thickness and are rarely perfectly square. These floor plans are for planning repairs and keeping track of a house. They are not professional architectural drawings or a survey, and should not be relied on for construction, permits, or anything legal or financial.</p>
    <p class="muted"><i>Tips for this sheet</i> under the <b>?</b> button at the top brings this window back. The same button lists every shortcut key.</p>`,
  },
};

// The window the tips are shown in, which also serves for the shortcut list, About and the settings.
function showInfo(title, html) {
  $('#tipsTitle').textContent = title;
  $('#tipsBody').innerHTML = html;
  $('#tipsBody').scrollTop = 0;
  $('#tipsDialog').showModal();
}

// Shows the tips for a kind of sheet if this project has not seen them yet, or always with `again`.
function showTips(kind, again = false) {
  const tips = TIPS[kind] || (again ? TIPS.exterior : null);
  // With the tips turned off in the settings they are left unseen, to show if they are turned on again.
  if (!tips || (!again && (plan.tipsSeen[kind] || !setting('tips')))) return checkStandards();
  showInfo(tips.title, tips.html);
  if (!plan.tipsSeen[kind]) {
    plan.tipsSeen[kind] = true;
    save();
  }
}

$('#btnTips').addEventListener('click', () => showTips(floor().kind, true));

// ---------- asking an AI about the house ----------
// A guide to the export for AI, in the ? menu of every project: why it is worth doing, how to give
// it to an assistant, what to ask, and how its advice comes back into the plan.

const AI_GUIDE = {
  title: 'Asking an AI about your house',
  html: `<p class="lead"><b>An AI assistant can give you a second opinion on the whole house in a few minutes.</b> With the plan, the photos and every issue in front of it, it can say what matters most, what each repair is likely to cost, what has to be done before what, and what you may have missed. It is worth doing before you call anyone, and again whenever the list changes.</p>
    <ol>
      <li><b>Fill in what you can first.</b> The more the plan holds, the better the answer: issues pinned where they are, with photos, a description and when they started; the house facts and the walkthrough checklist on the House tab; and your goals, such as how long you are staying and what you can do yourself.</li>
      <li><b>Export it.</b> <i>File</i> → <i>Export for AI (.zip)…</i> saves one zip to this device. It holds <i>README-FIRST.md</i>, a brief in plain words that says where each issue is and what is above and below it; a picture of each floor with the numbered pins, and the house in 3D; small copies of the issue photos; and the issues as a spreadsheet. Your budget, who lives in the house and contractors' contact details are left out unless you tick them.</li>
      <li><b>Give it to an assistant you already use</b>, such as Claude or ChatGPT. Unzip it and upload the files, or the whole folder. The app sends nothing anywhere itself.</li>
      <li><b>Paste the request at the top of the brief.</b> It asks for a full review: each issue's likely cause, cost and urgency, the order to do the work in, and anything missing. Then keep asking, as you would a knowledgeable friend.</li>
      <li><b>Bring its advice back.</b> Ask it to send its answer as <i>house-map-review.md</i>, as the end of the brief explains. <i>File</i> → <i>Import AI review…</i> lists each suggestion (a cost estimate, a category, the order of work, new issues, house facts) with a tick box. Nothing changes until you apply what you ticked, and one Undo takes it all back.</li>
    </ol>
    <p><b>Things to ask</b></p>
    <ul>
      <li><b>Costs:</b> Do an issue and cost analysis: rank the issues by safety and urgency, with a likely cost range for each where I live. Which could I do myself, and what would that save?</li>
      <li><b>Order:</b> Which should be done first, and which have to wait for others? What could be done in one visit by the same trade?</li>
      <li><b>Causes:</b> What could be causing this stain, crack or damp patch, and what can I check myself before calling someone? Are any of these issues connected?</li>
      <li><b>Quotes:</b> How do these quotes compare? What is missing from them, and what should I ask each company?</li>
      <li><b>Gaps:</b> What have I missed? Which house facts or checklist lines should I look into, and what should I photograph next?</li>
      <li><b>Planning:</b> With my budget, what should I do this year, and what can wait? What should I set aside for things that are wearing out?</li>
    </ul>
    <p class="caution"><b>Treat its answers as a starting point.</b> Its costs are estimates, not quotes, and it can be wrong about what it cannot see. Have a professional look at anything about safety, the structure, gas or electrics before acting on it.</p>
    <p><button type="button" id="btnAiGuideExport">Export for AI…</button></p>`,
};

$('#btnAiGuide').addEventListener('click', () => {
  closeMenus();
  showInfo(AI_GUIDE.title, AI_GUIDE.html);
});

$('#tipsBody').addEventListener('click', (e) => {
  if (e.target.id !== 'btnAiGuideExport') return;
  $('#tipsDialog').close('cancel');
  $('#btnAi').click();
});
