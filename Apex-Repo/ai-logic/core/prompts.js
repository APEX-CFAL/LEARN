/* Prompt text shared by more than one feature file: syllabus scope-lock paragraphs, the
   note-block JSON schema, tone rules, question-shape snippets, and small string helpers. */

export const subjectNames = (c) => ((c.student && c.student.subjects) || []).map(s => s.name).join(', ');
export const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

/* Shared tool schema for the "get past mistakes" pilot tool (2026-09-26) — the app implements the
   actual lookup as deps.executeTool; this is just the OpenAI-style function schema any feature
   that wants to offer it drops into its own `tools: [...]`. One sentence in the feature's own
   system prompt (not here — depends on what the feature is doing) should tell the model the tool
   exists and when calling it would actually help, so it doesn't call it reflexively every time. */
export const GET_PAST_MISTAKES_TOOL = {
  type: 'function',
  function: {
    name: 'get_past_mistakes',
    description: "Fetch this student's logged mistakes for one exact subject+chapter, so you can target new content at their actual known weak spots instead of guessing. Only call this if the chapter plausibly has mistake history worth targeting — skip it otherwise; don't call it more than once.",
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Exact subject name, matching what you were given.' },
        chapter: { type: 'string', description: 'Exact chapter name, matching what you were given.' }
      },
      required: ['subject', 'chapter']
    }
  }
};

/* Real reference sources, pre-formatted by the app (apexFormatResourcesForPrompt). */
export function refBlock(c, kind) {
  if (!c.resources) return '';
  return kind === 'notes'
    ? `\n\nREFERENCE MATERIAL FOR THIS SUBJECT (base your notes on the style/content of these real, syllabus-specific sources, not generic knowledge):\n${c.resources}`
    : `\n\nREFERENCE MATERIAL FOR THIS SUBJECT:\n${c.resources}`;
}

/* Scope-lock for CHAPTER notes. Needs c.subject, c.level, c.bookCode, c.tierLabel, c.priority,
   c.syllabusBlock (subtopic list text, IGCSE), c.resources. */
export function chapterGround(c, p) {
  if (p.jee) {
    return `This is JEE/NEET ${c.subject} (NCERT-based syllabus, ${c.tierLabel || ''}). This is entrance-exam prep for India's JEE (engineering) and/or NEET (medical) exams, NOT a school-leaving exam — assume the student's goal is exam-cracking depth, not just passing a school test. Stay strictly within the NCERT ${c.subject} syllabus for this chapter. NEVER introduce topics beyond the NCERT/JEE-NEET syllabus scope.${c.priority ? `\nPriority: ${c.priority}/5${c.priority >= 4 ? ' (HIGH — appears frequently in JEE/NEET)' : ''}` : ''}${refBlock(c, 'notes')}`;
  }
  return `This is Cambridge IGCSE ${c.subject} (code ${c.bookCode || 'n/a'}, ${c.level || 'Core'} tier). IGCSE combines Grade 9 and Grade 10 into ONE syllabus — do not split or reference grade levels separately. Stay strictly within the IGCSE ${c.bookCode || ''} syllabus scope. NEVER introduce A-Level, IB, or first-year-university formulas, terminology, or depth. If unsure whether something is in the IGCSE syllabus, leave it out.${c.syllabusBlock || ''}${refBlock(c, 'notes')}`;
}

/* Scope-lock for single-TOPIC notes (slightly shorter than the chapter one). */
export function topicGround(c, p) {
  return p.jee
    ? `This is JEE/NEET ${c.subject} (NCERT-based syllabus, ${c.tierLabel || ''}). This is entrance-exam prep for India's JEE (engineering) and/or NEET (medical) exams, NOT a school-leaving exam — assume the student's goal is exam-cracking depth. Stay strictly within the NCERT ${c.subject} syllabus for this chapter.${refBlock(c, 'notes')}`
    : `This is Cambridge IGCSE ${c.subject} (${c.level || 'Core'} tier). IGCSE combines Grade 9 and Grade 10 into ONE syllabus. Stay strictly within the IGCSE syllabus scope for this chapter. NEVER introduce A-Level, IB, or first-year-university formulas, terminology, or depth.${refBlock(c, 'notes')}`;
}

/* Makes AI notes come out as the block JSON apexRenderNoteBlocks renders. Verbatim from the app. */
export const BLOCK_SCHEMA_INSTRUCTIONS = ` Respond ONLY with valid JSON (no markdown fences, no text before or after) in this exact shape: {"blocks":[...]}. Each block has a "type" plus type-specific fields — use whichever of these best fit the content: {"type":"subhead","html":"short section title"} (exactly one, first, naming this section), {"type":"section-lead","html":"one short line setting up what this section covers, ending in a colon"}, {"type":"text","html":"a paragraph, <b>bold</b> for key terms"}, {"type":"statement","html":"an italic boxed definition or key claim"}, {"type":"keypoints","points":["one idea per item, start with <strong>The term:</strong> then the explanation"]}, {"type":"example","label":"Example — short descriptive title","problem":"the question","solution":"one working step per line, separated by newlines","answer":"final answer with units","insight":"optional one-line takeaway"}, {"type":"callout","variant":"info|warn|check|mem","label":"For JEE","html":"a short aside worth boxing off"}, {"type":"mistake","wrong":"...","right":"...","why":"..."}, {"type":"memory","mnemonic":"the phrase","points":["what each letter stands for"]}, {"type":"table","caption":"","headers":["..."],"rows":[["..."]]} (only if a real comparison genuinely helps). Prefer this shape: a subhead, a short section-lead line, then a keypoints block — that's how the reference notes read. Use 2-6 blocks total. No intro/outro filler, no "in this chapter we will learn" — get straight to the content, exam-focused.`;

/* Tone rule reused wherever feedback is written for the student. */
export const AND_NOT_BUT = "Use encouraging language — never say 'but', use 'and' instead.";

/* Question-shape lines shared by every generator. */
export const QUESTION_SHAPE = {
  jeeMcq: `{"q":"Question text (JEE/NEET style)","type":"mcq","options":["A text","B text","C text","D text"],"correctIndex":0,"answer":"Step 1: ... Final answer: ...","marks":4,"negativeMarks":1,"chapter":"<exact chapter name from the list>","topic":"<the specific concept this question tests within that chapter, e.g. \"Newton's Third Law\" — not just the chapter name again>"}`,
  jeeNumericalNote: `(For a "numerical" question, omit "options"/"correctIndex" and instead include "correctValue": <number>, "tolerance": <number>, "negativeMarks": 0.)`,
  jeeShortNote: `\n(For a "short" question — timed mode only — omit "options"/"correctIndex"/"correctValue"/"tolerance"; the student types a brief written answer, graded against "answer" like a free-response question.)`
};

/* ═══ Shared plan-activity vocabulary (2026-09-23) ═══════════════════════════════════════
   Every activity a planner (plan.week, plan.wizard, and the still-inline plan.daily) can
   assign a study session. Added this pass: Flashcards and the Quiz Me sub-modes (Normal /
   Mixed / Timed / Mistake Quiz) and Feynman-teach — before this, planners only knew about
   Making Notes / Revising Notes / Solving Questions / Brush Recap (+ Full Recall Test, and
   Numerical Practice / Mock Test for JEE/NEET), so the AI could never point a student at
   Subject Mastery's Flashcards or Quiz Me sections at all. Chaos Test is deliberately left
   OUT — it's cross-subject and doesn't fit a single session's {subject, topic} shape.
   One shared list so the wording/duration bounds can never drift between planners. */
export const ACTIVITY_CATALOG = [
  { name: 'Making Notes', min: 15, max: 30, jeeOnly: false,
    desc: 'first time studying a chapter — writing or AI-generating notes from scratch. Only for a chapter with NO notes yet.' },
  { name: 'Revising Notes', min: 10, max: 20, jeeOnly: false,
    desc: "re-reading and consolidating a chapter's existing notes. Needs notes already done for that chapter." },
  { name: 'Flashcards', min: 8, max: 15, jeeOnly: false,
    desc: "quick flashcard review of a chapter's key facts (Subject Mastery → Flashcards). Needs notes done. Good for spaced repetition on a chapter not touched in a while, or as a lighter alternative to Brush Recap." },
  { name: 'Solving Questions', min: 20, max: 30, jeeOnly: false,
    desc: 'written/short-answer practice questions on a chapter (Subject Mastery → Practice). Needs notes done for that chapter.' },
  { name: 'Brush Recap', min: 5, max: 15, jeeOnly: false,
    desc: "quick flashcard-style recall of a chapter's key facts, for a chapter the student is already strong in. Needs notes done." },
  { name: 'Quiz Me: Normal', min: 20, max: 35, jeeOnly: false,
    desc: 'a graded quiz on ONE chapter (Subject Mastery → Quiz Me → Normal practice). Needs notes AND practice already done for that chapter — this checks retention, it is not a first pass.' },
  { name: 'Quiz Me: Mixed', min: 25, max: 40, jeeOnly: false,
    desc: 'a graded quiz spanning SEVERAL chapters of one subject (Subject Mastery → Quiz Me → Mixed quiz). List every chapter it should cover in "topic". Needs notes+practice done for most of them — use once a student has a few chapters behind them, to check earlier ones have not been forgotten.' },
  { name: 'Quiz Me: Timed', min: 20, max: 30, jeeOnly: false,
    desc: 'a timed quiz with no multiple choice, simulating real exam pressure (Subject Mastery → Quiz Me → Timed quiz). Needs notes+practice done. Best once the exam is close (Peak / Exam Mode / Test Cram), not in Foundation.' },
  { name: 'Mistake Quiz', min: 20, max: 30, jeeOnly: false,
    desc: 'a fresh quiz built from the student\'s own past wrong answers for a subject (Subject Mastery → Quiz Me → Mistake Quiz). ONLY assign this when the LOGGED MISTAKES data below shows 5 or more unresolved mistakes for that subject — otherwise there is nothing for it to draw from.' },
  { name: 'Feynman-teach', min: 15, max: 25, jeeOnly: false,
    desc: 'the student explains a concept out loud, the AI plays a curious learner and asks questions back (Subject Mastery → Quiz Me → Feynman-teach). Needs notes done. Good after Revising Notes, as a real understanding check before a Full Recall Test.' },
  { name: 'Full Recall Test', min: 20, max: 40, jeeOnly: false,
    desc: 'a longer, harder test across a chapter (and earlier ones if useful) to confirm the material genuinely stuck, not a quick recap.' },
  { name: 'Numerical Practice', min: 25, max: 40, jeeOnly: true,
    desc: 'focused numerical problem-solving (not MCQ recall) for Physics/Chemistry/Maths — the core JEE/NEET exam skill. Needs notes done.' },
  { name: 'Mock Test', min: 45, max: 180, jeeOnly: true,
    desc: 'a timed test, sectional (one subject) or full-length (all subjects).' }
];

/* Bullet-list text for a prompt's "ACTIVITY TYPES" section, program-filtered. */
export function activityMenuText(p) {
  return ACTIVITY_CATALOG.filter(a => !a.jeeOnly || p.jee)
    .map(a => `- "${a.name}" (${a.min}-${a.max} min) — ${a.desc}`).join('\n');
}

/* Valid activity names for this program, e.g. for a JSON schema's enum or validate(). */
export function activityNames(p) {
  return ACTIVITY_CATALOG.filter(a => !a.jeeOnly || p.jee).map(a => a.name);
}

/* Duration bounds for one activity name, with a generic fallback for anything unrecognised
   (an unknown activity name is itself a validation problem handled separately). */
export function activityBounds(name) {
  const a = ACTIVITY_CATALOG.find(x => x.name === name);
  return a ? { min: a.min, max: a.max } : { min: 10, max: 45 };
}

/* "LOGGED MISTAKES" context block: which subjects have crossed the Mistake Quiz threshold.
   Matches the app's own real threshold (see startMistakeQuizForSubject in Apex_v100.html:
   it refuses below 5 logged mistakes for that subject) rather than mastery/mistakes.js's
   more conservative general-purpose default of 8. c.mistakeCounts: {subjectName: count}. */
export function mistakeEligibilityText(c) {
  const counts = c.mistakeCounts || {};
  const eligible = Object.entries(counts).filter(([, n]) => n >= 5).map(([s, n]) => `${s} (${n})`);
  const short = Object.entries(counts).filter(([, n]) => n > 0 && n < 5).map(([s, n]) => `${s} (${n}/5)`);
  if (!eligible.length && !short.length) return 'No logged mistakes yet for any subject — never assign "Mistake Quiz".';
  return (eligible.length ? `Eligible for "Mistake Quiz" (5+ logged mistakes): ${eligible.join(', ')}.` : 'No subject has reached 5 logged mistakes yet — never assign "Mistake Quiz".')
    + (short.length ? ` Not yet eligible: ${short.join(', ')}.` : '');
}

/* Syllabus "concepts for these chapters" block, built from apexGetSyllabusTopicDetails(subject). */
export function conceptBlock(c, p, withHint) {
  const pool = c.conceptPool || [];
  if (!pool.length || !(c.chapters || []).length) return '';
  const norm = x => String(x || '').replace(/^\d+\.\s*/, '').trim().toLowerCase();
  const lines = c.chapters.map(ch => {
    const m = pool.find(t => t.chapter === ch || norm(t.chapter) === norm(ch));
    if (!m) return null;
    return m.subtopics ? `- ${ch} [priority ${m.priority}/5]: ${m.subtopics}` : `- ${ch} [priority ${m.priority}/5]`;
  }).filter(Boolean).join('\n');
  if (!lines) return '';
  const label = p.jee ? 'NCERT SYLLABUS CONCEPTS' : 'CAMBRIDGE SYLLABUS CONCEPTS';
  // The normal quiz adds a steering hint; the Chaos test never did — kept as-is.
  const hint = withHint ? ' (base questions on these exact concepts; give more questions to higher-priority chapters)' : '';
  return `\n\n${label} FOR THESE CHAPTERS${hint}:\n${lines}`;
}
