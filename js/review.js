'use strict';

// Bringing an AI assistant's review back in. The export for AI ends with instructions for writing
// the review in a form the app can read: a Markdown file, free for the assistant's own words, that
// holds one block of data fenced as ```housemap-review. File -> Import AI review... reads that
// block and lists every suggestion in it, each with its reason and a tick box, and nothing is
// changed until the owner has ticked what to take and pressed Apply.

const REVIEW_FENCE = 'housemap-review';
// The house facts an assistant may suggest answers for: those answered from a list.
const listFacts = () => FACTS.filter(([, , kind]) => Array.isArray(kind));

// ---------- the instructions, at the end of the export ----------

function reviewFormatText() {
  const cats = CATS.map((c) => `\`${c.id}\` (${c.label})`).join(', ');
  const whens = WHEN_CHOICES.filter(([v]) => v).map(([v, l]) => `\`${v}\` (${l.split(':')[0]})`).join(', ');
  const facts = listFacts().map(([key, label, kind]) => `  - \`${key}\` (${label}): ${kind.map((k) => `"${k}"`).join(', ')}`).join('\n');
  return `## Sending your review back

The owner can bring your review into the app, where each suggestion is shown with its reason and taken only if they tick it. To make that possible, please write your answer as one Markdown file named \`house-map-review.md\`. Write whatever you want to say to the owner in plain words, and somewhere in the file include one block of data fenced exactly like this, holding JSON only (no comments, no trailing commas):

\`\`\`${REVIEW_FENCE}
{
  "version": 1,
  "summary": "Your overall view of the house and its issues, in plain words. Markdown is fine.",
  "order": "The order you suggest doing the work in, in plain words.",
  "issues": [
    {
      "issue": 12,
      "costLow": 400,
      "costHigh": 900,
      "costReason": "What the figure covers.",
      "category": "safety",
      "categoryReason": "Why it belongs in that category.",
      "after": [3, 7],
      "who": "pro",
      "trade": "Roofer",
      "when": "month",
      "related": [14],
      "relatedReason": "Why they may be connected.",
      "notes": "Your advice on this issue.",
      "questions": ["Anything you need the owner to find out."]
    }
  ],
  "newIssues": [
    {
      "title": "A short title",
      "category": "major",
      "floor": "Basement",
      "description": "What it is and why it matters.",
      "costLow": 100,
      "costHigh": 300,
      "reason": "What made you think of it."
    }
  ],
  "facts": { "roof": "Asphalt shingles" },
  "factReasons": { "roof": "Seen in the photos of the outside." }
}
\`\`\`

- **issues:** one entry for each issue you have something to say about, by its number. Leave out any field you have nothing for.
- **costLow, costHigh:** your rough cost range in US dollars, as plain numbers.
- **category:** one of ${cats}.
- **after:** the numbers of the issues that have to be done before this one.
- **who:** \`me\` for work the owner could do, or \`pro\` for a professional. **trade:** the kind of tradesperson, such as Roofer, Plumber or Electrician.
- **when:** how soon it should be dealt with: one of ${whens}.
- **related:** the numbers of issues that may share a cause with this one, or be one problem showing in two places.
- **newIssues:** things you think the owner has missed. \`floor\` is the name of a sheet listed above, or null for the whole house.
- **facts:** answers for house facts that are not answered above, or that you think are wrong, from these lists only:
${facts}`;
}

// ---------- reading a review ----------

// The data block in a review: the fenced block, or failing that the first { to the last }.
function reviewData(text) {
  const fenced = new RegExp('```\\s*' + REVIEW_FENCE + '\\s*\\n([\\s\\S]*?)```').exec(text);
  const body = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  if (!body.trim()) throw new Error(`there is no \`\`\`${REVIEW_FENCE} block in it`);
  try {
    return JSON.parse(body);
  } catch (e) {
    throw new Error(`its data block could not be read (${e.message}). Ask the assistant to write the block again as plain JSON, without comments`);
  }
}

const reviewNum = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() && !Number.isNaN(+v.replace(/[$,]/g, '')) ? +v.replace(/[$,]/g, '') : null);
const issueByNum = (n) => plan.issues.find((i) => issueNum(i) === Math.round(+n));
const issueTag = (i) => `#${issueNum(i)} ${i.title}`;

// Everything the review suggests, as a list of { group, text, reason, apply }, leaving out what the
// plan already says and what cannot be used, such as an issue number that is not in the plan.
function reviewSuggestions(data) {
  const out = [];
  const stamp = `From an AI review, ${dateWords(dayStamp())}`;
  const add = (group, text, reason, apply) => out.push({ group, text, reason: reason || '', apply });
  const missing = [];

  for (const e of Array.isArray(data.issues) ? data.issues : []) {
    const i = issueByNum(e.issue);
    if (!i) {
      if (e.issue != null) missing.push(e.issue);
      continue;
    }
    const group = `Issue ${issueTag(i)}`;
    const lo = reviewNum(e.costLow);
    const hi = reviewNum(e.costHigh);
    if (lo != null || hi != null) {
      const low = lo ?? hi;
      const high = hi ?? lo;
      const was = ownEstimate(i).priced ? ` (in place of your ${estimateText(i)})` : '';
      const quoted = issueCost(i).quoted ? '. An accepted quote still counts in the totals instead' : '';
      add(group, `My estimate: ${money(low)} to ${money(high)}, marked as from an AI assistant${was}${quoted}`, e.costReason, () => Object.assign(i, { costLow: low, costHigh: high, costSource: 'ai' }));
    }
    if (CATS.some((c) => c.id === e.category) && e.category !== i.category) {
      add(group, `Category: ${cat(i.category).label} → ${cat(e.category).label}`, e.categoryReason, () => { i.category = e.category; });
    }
    for (const n of Array.isArray(e.after) ? e.after : []) {
      const x = issueByNum(n);
      if (!x || x === i || afterOf(i).includes(x) || waitsFor(x, i)) continue;
      // Checked again when applied, as another suggestion ticked with it could close a circle.
      add(group, `Must be done after ${issueTag(x)}`, '', () => {
        if (!waitsFor(x, i) && !afterOf(i).includes(x)) i.after = [...(i.after || []), x.id];
      });
    }
    if (['me', 'pro'].includes(e.who) && e.who !== i.who) {
      add(group, `Who would do the work: ${e.who === 'me' ? 'I would' : 'a professional'}`, '', () => { i.who = e.who; });
    }
    if (typeof e.trade === 'string' && e.trade.trim() && e.trade.trim() !== i.trade) {
      add(group, `Trade: ${e.trade.trim()}`, '', () => { i.trade = e.trade.trim(); });
    }
    if (WHEN_CHOICES.some(([v]) => v && v === e.when) && e.when !== i.when) {
      add(group, `How soon: ${WHEN_CHOICES.find(([v]) => v === e.when)[1]}`, '', () => { i.when = e.when; });
    }
    for (const n of Array.isArray(e.related) ? e.related : []) {
      const x = issueByNum(n);
      if (!x || x === i || relatedOf(i).includes(x)) continue;
      add(group, `May be connected to ${issueTag(x)}`, e.relatedReason, () => {
        setRelated(i, x, true);
        if (e.relatedReason) for (const y of [i, x]) addAiNote(y, `${stamp}: may be connected to issue ${issueNum(y === i ? x : i)}. ${e.relatedReason}`);
      });
    }
    const questions = (Array.isArray(e.questions) ? e.questions : []).filter((q) => typeof q === 'string' && q.trim());
    const notes = typeof e.notes === 'string' ? e.notes.trim() : '';
    if (notes || questions.length) {
      const text = [notes, questions.length ? `Questions:\n${questions.map((q) => `- ${q.trim()}`).join('\n')}` : ''].filter(Boolean).join('\n');
      add(group, `Notes: ${text.length > 240 ? text.slice(0, 240) + '…' : text}`, '', () => addAiNote(i, `${stamp}:\n${text}`));
    }
  }

  for (const n of Array.isArray(data.newIssues) ? data.newIssues : []) {
    if (typeof n?.title !== 'string' || !n.title.trim()) continue;
    const f = typeof n.floor === 'string' ? plan.floors.find((x) => x.name.trim().toLowerCase() === n.floor.trim().toLowerCase()) : null;
    const category = CATS.some((c) => c.id === n.category) ? n.category : 'major';
    const lo = reviewNum(n.costLow);
    const hi = reviewNum(n.costHigh);
    const cost = lo != null || hi != null ? `, ${money(lo ?? hi)} to ${money(hi ?? lo)}` : '';
    add('New issues the review thinks are missing', `${n.title.trim()} (${cat(category).label}, ${f ? `the whole of ${f.name}` : 'the whole house'}${cost})${n.description ? `: ${n.description}` : ''}`, n.reason, () => {
      const issue = newIssue({ floorId: f?.id ?? null, x: null, y: null, title: n.title.trim(), category, description: typeof n.description === 'string' ? n.description : '' });
      if (lo != null || hi != null) Object.assign(issue, { costLow: lo ?? hi, costHigh: hi ?? lo, costSource: 'ai' });
      if (n.reason) issue.aiNotes = `${stamp}: ${n.reason}`;
      plan.issues.push(issue);
    });
  }

  const facts = data.facts && typeof data.facts === 'object' ? data.facts : {};
  for (const [key, label, kind] of listFacts()) {
    const v = facts[key];
    if (!kind.includes(v) || houseFacts()[key] === v) continue;
    const was = houseFacts()[key];
    add('House facts', `${label}: ${v}${was ? ` (you have ${was})` : ''}`, data.factReasons?.[key], () => { houseFacts()[key] = v; });
  }

  const summary = typeof data.summary === 'string' ? data.summary.trim() : '';
  const order = typeof data.order === 'string' ? data.order.trim() : '';
  if (summary || order) {
    add('The review as a whole', `Keep its summary${order ? ' and suggested order of work' : ''} with the project, to read again on the House sheet`, '', () => {
      (plan.reviews ||= []).push({ date: dayStamp(), summary, order });
    });
  }
  return { list: out, missing };
}

function addAiNote(i, text) {
  i.aiNotes = i.aiNotes ? `${i.aiNotes}\n\n${text}` : text;
}

// ---------- the window that lists them ----------

let pending = [];

function showReview(found, fileName) {
  pending = found.list;
  const groups = [];
  for (const [n, s] of pending.entries()) {
    let g = groups.find((x) => x.name === s.group);
    if (!g) groups.push((g = { name: s.group, rows: [] }));
    g.rows.push(`<label class="check reviewRow"><input type="checkbox" data-s="${n}"><span>${esc(s.text)}${s.reason ? `<small>${esc(s.reason)}</small>` : ''}</span></label>`);
  }
  $('#reviewIntro').textContent = pending.length
    ? `${fileName} suggests ${pending.length === 1 ? 'one change' : `${pending.length} changes`}. Tick the ones to take; nothing is changed until you apply them, and Undo takes them back.`
    : `${fileName} suggests nothing that is not in the plan already.`;
  $('#reviewMissing').hidden = !found.missing.length;
  $('#reviewMissing').textContent = found.missing.length ? `Left out, as the plan has no issue with ${found.missing.length === 1 ? 'this number' : 'these numbers'}: ${found.missing.join(', ')}.` : '';
  $('#reviewList').innerHTML = groups.map((g) => `<section><h3>${esc(g.name)}</h3>${g.rows.join('')}</section>`).join('');
  $('#btnReviewApply').disabled = true;
  $('#reviewDialog').returnValue = '';
  $('#reviewDialog').showModal();
}

$('#reviewList').addEventListener('change', () => {
  $('#btnReviewApply').disabled = !$('#reviewList input:checked');
});

for (const [id, on] of [['#btnReviewAll', true], ['#btnReviewNone', false]]) {
  $(id).addEventListener('click', () => {
    for (const box of document.querySelectorAll('#reviewList input')) box.checked = on;
    $('#btnReviewApply').disabled = !on || !pending.length;
  });
}

$('#reviewDialog').addEventListener('close', () => {
  if ($('#reviewDialog').returnValue !== 'ok') return;
  const ticked = [...document.querySelectorAll('#reviewList input:checked')].map((box) => pending[+box.dataset.s]);
  for (const s of ticked) s.apply();
  pending = [];
  if (!ticked.length) return;
  save();
  renderAll();
  flash(`Took ${ticked.length === 1 ? 'one suggestion' : `${ticked.length} suggestions`} from the AI review.`);
});

$('#btnReview').addEventListener('click', () => $('#reviewInput').click());

$('#reviewInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let found;
  try {
    found = reviewSuggestions(reviewData(await file.text()));
  } catch (err) {
    return tell(`${file.name} could not be read as an AI review: ${err.message}.`);
  }
  showReview(found, file.name);
});

// ---------- kept reviews, on the House sheet ----------

function reviewsHtml() {
  const list = [...(plan.reviews || [])].reverse();
  if (!list.length) return '';
  return `<section class="reviews">
      <h2>AI reviews <span class="muted">${list.length}</span></h2>
      <p class="muted">Summaries kept from AI reviews brought in with <i>File</i> → <i>Import AI review…</i>, newest first.</p>
      ${list.map((r, n) => `<details class="review"${n ? '' : ' open'}>
          <summary>${esc(dateWords(r.date))}</summary>
          ${r.summary ? `<div class="reviewText">${esc(r.summary)}</div>` : ''}
          ${r.order ? `<h3>Suggested order of work</h3><div class="reviewText">${esc(r.order)}</div>` : ''}
          <p class="aboutLine"><button type="button" data-review-drop="${plan.reviews.indexOf(r)}">Delete this review</button></p>
        </details>`).join('')}
    </section>`;
}

$('#houseBody').addEventListener('click', async (e) => {
  const n = e.target.dataset.reviewDrop;
  if (n == null) return;
  if (!(await ask('Delete this review summary? What it changed in the plan stays as it is.', { ok: 'Delete', danger: true }))) return;
  plan.reviews.splice(+n, 1);
  if (!plan.reviews.length) delete plan.reviews;
  save();
  renderAll();
});
