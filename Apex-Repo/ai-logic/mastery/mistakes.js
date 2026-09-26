/* =====================================================================
   MISTAKE TRACKING + STRENGTHS/WEAKNESSES — NEW (2026-09-23)
   ---------------------------------------------------------------------
   Not ported from the app — this logic didn't exist anywhere before. It's pure data logic
   (no AI call, no DOM, no localStorage) so it's easy to test on its own; the app owns reading
   and writing the actual `mistakeLog` array in localStorage/Firebase, same as every other
   feature in this project — these functions just take a log array in and hand a new one back.

   THE RULES (as the user described them):
     - A wrong answer gets logged as a mistake (logMistake) — never a correct one.
     - When the student is later tested again on the SAME subject+chapter and gets it right,
       the OLDEST matching logged mistake is REMOVED (resolveByRetest) — one correct retest
       clears one mistake, oldest first, so five old mistakes still need real evidence of
       improvement, not one lucky answer.
     - Once enough unresolved mistakes pile up for a subject, the app should offer a Mistake
       Quiz (shouldTriggerMistakeQuiz) instead of waiting for the student to notice and go
       find the button themselves.

   WHAT'S SAVED (see makeMistakeEntry): subject, chapter, the question, the student's answer,
   the correct answer, marks, date, source (quiz/practice), question type, and the AI's short
   feedback — everything needed to later generate a targeted Mistake Quiz (features/quiz/quiz.js
   quiz.mistake already expects exactly this shape) or show a weak-chapters list.
   WHAT'S NEVER SAVED HERE: journal/log text, chat transcripts, anything not tied to a graded
   answer — same privacy line the rest of this project already draws (see AI-Logic-Map.md §5).
   ===================================================================== */

function uid() {
  return 'mk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/** Normalizes whatever the app hands in into the one mistake-entry shape everything else here
 *  (and features/quiz/quiz.js's quiz.mistake) expects. */
export function makeMistakeEntry(raw) {
  const r = raw || {};
  return {
    id: r.id || uid(),
    date: r.date || new Date().toISOString(),
    program: r.program || 'igcse',
    subject: r.subject || '',
    chapter: r.chapter || 'General',
    source: r.source === 'practice' ? 'practice' : 'quiz',
    questionText: r.questionText || '',
    questionType: r.questionType || '',
    studentAnswer: r.studentAnswer || '',
    correctAnswer: r.correctAnswer || '',
    marksEarned: Number.isFinite(Number(r.marksEarned)) ? Number(r.marksEarned) : 0,
    maxMarks: Number.isFinite(Number(r.maxMarks)) && Number(r.maxMarks) > 0 ? Number(r.maxMarks) : 1,
    aiFeedback: r.aiFeedback || ''
  };
}

/** Appends a mistake. Refuses (added:false) if it isn't actually a miss (marksEarned >= maxMarks)
 *  or if it's missing the two fields that make it useful (subject, questionText) — mirrors the
 *  app's existing `if (earned < q.points) apexLogMistake(...)` guard, just enforced in one place
 *  instead of at every call site. `cap` (default 50, same number the app already used elsewhere
 *  for quizHistory/paperHistory) trims oldest entries once exceeded so the log can't grow
 *  unbounded; it's a flat cap, not per-subject. */
export function logMistake(log, raw, opts = {}) {
  const cap = opts.cap == null ? 50 : opts.cap;
  const entry = makeMistakeEntry(raw);
  if (entry.marksEarned >= entry.maxMarks) return { log: (log || []).slice(), added: false, entry: null };
  if (!entry.subject || !entry.questionText) return { log: (log || []).slice(), added: false, entry: null };
  let next = (log || []).concat([entry]);
  if (next.length > cap) next = next.slice(next.length - cap);
  return { log: next, added: true, entry };
}

/** Called after a correct retest. Removes the OLDEST matching unresolved mistake(s) for that
 *  subject (+ chapter, if given) — oldest first because that's the mistake that's had the most
 *  chances to still be wrong, so clearing it first is the most meaningful signal.
 *  opts.removeAll: clear every matching entry in one go (e.g. "mark this whole chapter mastered")
 *  instead of the default one-correct-answer-clears-one-mistake behavior. */
export function resolveByRetest(log, { subject, chapter } = {}, opts = {}) {
  const removeAll = !!opts.removeAll;
  const removed = [];
  const next = [];
  for (const m of (log || [])) {
    const matches = m.subject === subject && (!chapter || m.chapter === chapter);
    if (matches && (removeAll || removed.length < 1)) { removed.push(m); continue; }
    next.push(m);
  }
  return { log: next, removed, removedCount: removed.length };
}

/** How many unresolved mistakes are on record for a subject (optionally narrowed to one chapter).
 *  "Unresolved" just means "still in the log" — resolveByRetest deletes on fix, nothing here
 *  needs a separate resolved flag to check. */
export function unresolvedCount(log, subject, chapter) {
  return (log || []).filter(m => m.subject === subject && (!chapter || m.chapter === chapter)).length;
}

/** Should the app offer a Mistake Quiz for this subject right now? Default threshold of 8 is a
 *  starting point, not a measured number — tune it once you see how fast real students
 *  accumulate mistakes; pass a different `threshold` per subject or program if 8 turns out wrong. */
export function shouldTriggerMistakeQuiz(log, subject, threshold = 8) {
  return unresolvedCount(log, subject) >= threshold;
}

/** Chapters with `minCount`+ unresolved mistakes for a subject, worst first — this IS the
 *  "strengths and weaknesses" weak-side view: whatever chapter has the most logged mistakes is
 *  the weakest, no separate AI call needed to compute it. */
export function weakChapters(log, subject, minCount = 2) {
  const counts = {};
  (log || []).filter(m => m.subject === subject).forEach(m => {
    const ch = m.chapter || 'General';
    counts[ch] = (counts[ch] || 0) + 1;
  });
  return Object.entries(counts)
    .filter(([, n]) => n >= minCount)
    .map(([chapter, count]) => ({ chapter, count }))
    .sort((a, b) => b.count - a.count);
}

/** The exact slice features/quiz/quiz.js's `quiz.mistake` feature wants as ctx.mistakes:
 *  this subject's most recent entries, oldest-first within the slice (matches the app's
 *  existing `.slice(-30)` pattern for mistakeLog/quizHistory). */
export function recentForSubject(log, subject, limit = 30) {
  return (log || []).filter(m => m.subject === subject).slice(-limit);
}

/** Optional housekeeping: entries older than `days` are dropped even if under `cap` — keeps a
 *  student's log from carrying a mistake from eight months ago that's almost certainly stale.
 *  Not called automatically by anything here; the app calls it on its own schedule if it wants it. */
export function pruneOld(log, days = 90, now = Date.now()) {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return (log || []).filter(m => {
    const t = Date.parse(m.date);
    return !Number.isFinite(t) || t >= cutoff;
  });
}
