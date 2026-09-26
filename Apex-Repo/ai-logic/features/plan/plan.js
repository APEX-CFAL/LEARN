/* Section A — the study-plan engine. Today's plan (plan.daily) is still ~460 lines built inline
   in Apex_v100.html — its own battle-tested rule set (phases, spaced repetition, mock-test
   cadence, carry-forward...) is too large/risky to fully rewrite in one pass, so it's registered
   here as an `external:true` stub just so this registry stays the COMPLETE map; it was however
   given the new activity vocabulary (see core/prompts.js's ACTIVITY_CATALOG) directly in the app.
   plan.week and plan.wizard (2026-09-23) are real features now — see each one's comment for what
   was fixed. The smaller plan-adjustment helpers below were already fully ported. */
import { def } from '../../core/registry.js';
import { fail } from '../../core/errors.js';
import { num, clamp } from '../../core/validators.js';
import { subjectNames, activityMenuText, activityNames, activityBounds, mistakeEligibilityText } from '../../core/prompts.js';

/* plan.daily — 2026-09-24, lifted for real (was `external:true`). This is the single biggest,
   most load-bearing prompt in the whole app (~460 lines in Apex_v100.html before this), so the
   port strategy here is deliberately different from every other feature in this file: NOTHING
   about the actual wording/rules changed. Every big text block below (chapter progress, carried-
   over sessions, the full syllabus context, phase rules, school timetable, chapter log, AI memory
   notes, Firebase perf...) still gets computed in the app exactly as before — most of it needs
   app-only globals (jeeNeetSyllabusData/igcseSyllabusData, apexGetChaptersForSubject,
   apexGetSyllabusTopicDetails, Firebase reads) this module has no access to and shouldn't try to
   replicate. This feature's ctx is unusually large (~25 fields) because of that: it's the exact
   set of already-fully-formatted text blocks _generateAIPlanCore always built, now handed in
   instead of closed over. build() only assembles them into the same two template strings.
   The one genuine addition: validate() actually checks the output now (AI-Logic-Map.md §9 item 6
   — "no semantic validation of the plan" — was true until this pass), reusing the same
   cleanSessions() plan.week/plan.wizard already use. */
def('plan.daily', {
  title: "Today's study plan", tokens: 3000, auto: true,
  needs: [
    'subjectsText', 'subjectCount', 'examDateText', 'daysUntilExam', 'targetHours', 'buildupNote',
    'commitmentsText', 'syllabusContextBlock', 'marksInfo', 'confInfo', 'firebasePerfContext',
    'chapterProgress', 'carriedOverText', 'fullRecallTestsText', 'phaseCompletionText',
    'recentMoods', 'sessionHistory', 'schoolTimetableBlock', 'chapterLogText', 'practiceInfo',
    'aiNotesContext', 'phase', 'phaseRules', 'today'
  ],
  build(c, p) {
    const targetHours = c.targetHours;
    const system = `You are an expert ${p.jee ? 'JEE/NEET study coach grounded in the NCERT syllabus' : 'IGCSE study coach powered by Cambridge methodology'}. You create precise, personalised daily study timetables.

YOUR #1 JOB: Create a study plan that is DIFFERENT from yesterday. Never repeat the same topic+activity combination two days in a row.

HARD RULES — NEVER BREAK THESE:
1. ONLY use these subjects: ${c.subjectsText}. NEVER add subjects the student didn't choose.
2. NEVER assign "Solving Questions", any "Quiz Me: ..." mode, "Flashcards", or "Feynman-teach" on a chapter the student hasn't made notes for. CHECK the chapter progress below CAREFULLY.
3. NEVER put the same subject in consecutive sessions. Always interleave different subjects.
4. Total study time must be EXACTLY ${targetHours} hours (${targetHours * 60} minutes) — not more, not less.
5. Put the student's WEAKEST subject during their peak energy time (${c.productiveTime}).
6. End the day with a subject the student is CONFIDENT in — close on a high note.
7. Include 10-min breaks between sessions (do NOT list breaks as sessions).
8. Every "Solving Questions" session must specify: what type of question, how to structure the answer${p.jee ? ' for maximum marks, and whether it is objective (MCQ) or numerical' : ' for Cambridge marks'}.
9. For spaced repetition: if a topic was studied 1, 3, 7, or 21 days ago, schedule a quick review.
10. NEVER assign an activity+chapter combo where that phase is already DONE in the Phase Completion data. If notes DONE → assign revision or practice, never notes again.
11. TIME RANGES: Making Notes=15-30min, Brush Recap=max 15min, Revising Notes=10-20min, Solving Questions=20-30min, Flashcards=8-15min, Quiz Me: Normal=20-35min, Quiz Me: Mixed=25-40min, Quiz Me: Timed=20-30min, Mistake Quiz=20-30min, Feynman-teach=15-25min${p.jee ? ', Numerical Practice=25-40min, Mock Test=45-180min (sectional to full-length)' : ''}. Adjust based on chapter difficulty. NEVER suggest same phase twice for same chapter in one day.
12. NEVER assign BOTH "Brush Recap" AND "Revising Notes" on the SAME chapter in the same day — they overlap. Pick ONE. Brush Recap = quick 5-10min flashcard recall. Revising Notes = deeper 15-20min review with gap-filling. Use Brush Recap for chapters the student is strong in. Use Revising Notes for chapters they scored poorly on.
13. NEVER repeat the same chapter+phase two days in a row — check the completion data.
14. Carried-over chapters (see "CARRIED OVER FROM YESTERDAY" below) take PRIORITY over new content — schedule them before anything the student hasn't started yet.
15. Whenever you schedule "Revising Notes" or "Brush Recap" for a chapter, ALSO schedule a "Solving Questions"${p.jee ? ', "Numerical Practice",' : ''} or "Full Recall Test" session on that SAME chapter, SAME day, immediately after or later that day — a passive review session must never be the last thing the student does on that chapter today. This closes the loop: passive review alone doesn't confirm anything stuck.
16. If "FULL RECALL TESTS DUE" lists any chapters below, schedule a "Full Recall Test" session for each — ideally as one of the first sessions of the day, since it's testing retention from material studied earlier. Set its "topic" to name all the chapters it covers.
17. NEVER schedule any session inside a window listed under "FIXED COMMITMENTS" below (tuition, sports, outings, etc.) — treat these exactly like school hours. If today is one of the listed days, schedule study before or after that window, not during it.
21. NEVER assign "Mistake Quiz" for a subject unless "LOGGED MISTAKES" below says that subject is eligible (5+ logged mistakes) — otherwise there's nothing for it to draw from. Once eligible, a Mistake Quiz on that subject is a strong pick for closing the loop on real, demonstrated weak spots instead of just guessing.
22. Once a chapter has notes AND at least one "Solving Questions" session done, its next passive-review slot doesn't have to be "Brush Recap"/"Revising Notes" every time — vary it with "Flashcards" (lighter, good for a quick spaced-repetition touch) or "Feynman-teach" (deeper, has the student explain it back) so revision doesn't feel repetitive. "Quiz Me: Normal" is a good retrieval-practice checkpoint once a chapter's Solving Questions is done; "Quiz Me: Mixed" once 2+ chapters in a subject are at that stage, to confirm earlier ones haven't faded.${p.jee ? `
18. NUMERICAL PRACTICE is not optional decoration — for Physics, Chemistry, and Maths especially, concept revision alone never confirms exam-readiness. Once a chapter reaches "notes done" or "revision done" status, its next session on that chapter should default to "Numerical Practice" over plain "Solving Questions" unless the chapter is fact-recall-heavy (most of Biology).
19. MOCK TEST cadence: schedule a "Mock Test" roughly once a week when the next exam is 60+ days away, twice a week inside 60 days, and every 2-3 days inside the final 14 days. Sectional (single-subject) mock tests are fine early on; prefer full-length, multi-subject mock tests as the exam gets closer. Check "MOCK TEST STATUS" below — it tells you exactly whether one is due today.
20. This student's PUC year is ${c.pucYear === '2nd' ? '2nd — they must keep revising 1st PUC chapters alongside 2nd PUC content, never treat 1st PUC as "finished." Deliberately schedule some 1st PUC revision most weeks, not just 2nd PUC first-pass learning.' : '1st — focus on solid first-pass learning; 1st PUC content will need revision again once 2nd PUC begins, so prioritize genuine understanding over speed right now.'}` : ''}

ACTIVITY TYPES (use exact names — you are NOT limited to just the first few, use the full menu):
- "Making Notes" — first time studying a chapter, creating notes from scratch
- "Revising Notes" — re-reading and consolidating existing notes
- "Flashcards" — quick flashcard review of a chapter's key facts (Subject Mastery → Flashcards). ONLY for chapters with completed notes. Good for spaced repetition or as a lighter alternative to Brush Recap.
- "Solving Questions" — ONLY for chapters with completed notes. ${p.jee ? 'Objective/MCQ-style question practice.' : 'Use past paper questions.'}
- "Brush Recap" — quick 5-10 min flashcard-style review of key facts
- "Quiz Me: Normal" — a graded quiz on ONE chapter (Subject Mastery → Quiz Me). ONLY for chapters with notes AND Solving Questions already done — this is a retention checkpoint, not a first pass.
- "Quiz Me: Mixed" — a graded quiz spanning SEVERAL chapters of one subject. List every chapter it covers in "topic". Use once a student has a few chapters behind them.
- "Quiz Me: Timed" — a timed quiz with no multiple choice, simulating real exam pressure. Best once the exam is close (Peak/Exam Mode/Final Week), not Foundation. Same "notes+practice done" requirement as Quiz Me: Normal.
- "Mistake Quiz" — a fresh quiz built from the student's own logged wrong answers. ONLY when "LOGGED MISTAKES" below says the subject is eligible — see HARD RULE 21.
- "Feynman-teach" — the student explains a concept out loud, the AI plays a curious learner (Subject Mastery → Quiz Me → Feynman-teach). ONLY for chapters with notes done. Good after Revising Notes, as a real understanding check before a Full Recall Test.
- "Full Recall Test" — ONLY when listed under "FULL RECALL TESTS DUE". A longer, harder test across the chapter(s) just studied (and earlier chapters too, if it helps test real retention, not just what was covered yesterday) — this is a genuine test of whether the material stuck, not a quick recap.${p.jee ? `
- "Numerical Practice" — ONLY for chapters with completed notes. Focused numerical problem-solving (not MCQ recall) — the core JEE/NEET exam skill for Physics/Chemistry/Maths.
- "Mock Test" — a timed test, sectional (one subject) or full-length (all subjects). See HARD RULE 19 for cadence.` : ''}

CHAPTER IMPORTANCE (allocate MORE time to these):
${p.jee ? `- Physics: Mechanics (Laws of Motion, Rotational Motion), Electrodynamics (Current Electricity, Magnetism), Modern Physics = HIGH
- Chemistry: Physical Chemistry (Equilibrium, Chemical Bonding), Organic Reaction Mechanisms, Coordination Compounds = HIGH
- Maths: Calculus (Integrals, Differential Equations), Coordinate Geometry, Algebra = HIGH
- Biology: Genetics & Molecular Biology, Human Physiology, Cell Biology = HIGH` : `- Physics: Electricity & Magnetism, Forces & Motion, Energy = HIGH
- Chemistry: Chemical Calculations, Organic Chemistry, Acids & Bases = HIGH
- Biology: Human Nutrition, Respiration, Genetics = HIGH
- Maths: Algebra, Trigonometry, Statistics = HIGH`}

CROSS-CHECK MARKS vs CONFIDENCE:
- High confidence + low marks = BLIND SPOT → schedule more practice
- Low confidence + decent marks = ANXIETY → schedule easy wins first`;

    const user = `Create TODAY's study timetable. Read ALL data below before generating.

═══ STUDENT PROFILE ═══
Subjects (ONLY these): ${c.subjectsText}
Total subjects: ${c.subjectCount}
Exam date (earliest, drives the phase below): ${c.examDateText} (${c.daysUntilExam} days away)
${c.examDatesBlock || ''}
Phase: ${c.phase}
Daily study target: EXACTLY ${targetHours} hours (${targetHours * 60} minutes)
Focus preference: ${c.concentrationTime} min blocks (but cap each session at 25-30 min)
Peak energy: ${c.productiveTime}
${c.buildupNote}
${c.studyPreferences ? `Student's own notes on how they study best / constraints: ${c.studyPreferences}` : ''}

═══ FIXED COMMITMENTS TODAY (tuition, sports, outings — treat like school hours) ═══
${c.commitmentsText}

═══ ${p.jee ? 'NCERT / JEE-NEET SYLLABUS CONTEXT' : 'CAMBRIDGE IGCSE SYLLABUS CONTEXT (v49)'} ═══
${c.syllabusContextBlock}

USE THIS SYLLABUS CONTEXT:
- When you pick a "topic" for a session, use the EXACT chapter name from above (e.g. "1. Number" not just "Number basics").
- Higher priority number (4-5) = chapter appears more in past papers → allocate more sessions to these over time.
- When phase = "Peak" or "Exam Mode", prioritise high-priority chapters first.
- For Solving Questions sessions: mention which paper number (e.g. "Paper 4 Extended style") and what marks are typical.

═══ PERFORMANCE DATA ═══
Last year grades: ${c.marksInfo}
Self-rated confidence (1-10): ${c.confInfo}
Quiz & session history from Firebase:
${c.firebasePerfContext}

═══ CHAPTER PROGRESS — READ THIS CAREFULLY ═══
${c.chapterProgress || 'No chapter data yet — assign "Making Notes" for the first chapter of each subject.'}

═══ CARRIED OVER FROM YESTERDAY (untouched) ═══
${c.carriedOverText}
RULE: These take priority — schedule them before any new chapter the student hasn't started.

═══ FULL RECALL TESTS DUE ═══
${c.fullRecallTestsText}
RULE: Schedule a "Full Recall Test" session for each of these — see HARD RULE 16.

═══ LOGGED MISTAKES ═══
${mistakeEligibilityText(c)}
${c.mockTestStatusText ? `
═══ MOCK TEST STATUS ═══
${c.mockTestStatusText}` : ''}
${c.perSubjectExamText ? `
═══ PER-SUBJECT EXAM DATES (override the overall exam date for that subject specifically) ═══
${c.perSubjectExamText}
RULE: A subject with its own nearer exam date should shift toward that subject's exam-mode pacing sooner than the overall ${c.daysUntilExam}-day countdown implies — don't wait for every subject to hit the same phase together.` : ''}

═══ UPCOMING TEST (separate from final exam) ═══
${c.upcomingTestBlock || 'None due within 7 days.'}

═══ PHASE COMPLETION CHECKLIST — DO NOT REPEAT COMPLETED PHASES ═══
${c.phaseCompletionText}
RULE: Only assign the NEXT PENDING phase for each chapter. If notes DONE, assign revision or practice — NEVER notes again.

═══ RECENT HISTORY ═══
Recent mood: ${c.recentMoods}. Sessions: ${c.sessionHistory}.

═══ SCHOOL TIMETABLE ═══
${c.schoolTimetableBlock}

═══ CHAPTER LOG (student-reported class progress) ═══
${c.chapterLogText}

═══ PRACTICE SCORES ═══
${c.practiceInfo}

═══ AI'S OWN NOTES ABOUT THIS STUDENT (from past sessions) ═══
${c.aiNotesContext}

═══ PHASE RULES FOR "${c.phase}" ═══
${c.phaseRules}

═══ LEARNING FLOW — STRICT ORDER PER CHAPTER ═══
For each chapter, the AI MUST follow this exact sequence:
1. **Making Notes** (Day 1) — Student writes/inputs notes. Cannot skip unless exam is < 14 days.
2. **Revising Notes** (a few days later) — Student reviews their own notes. Only assign AFTER notes done.
3. **Brush Recap + Solving Questions** (same day, a few days after revision) — Recap the chapter, then solve 10-15 questions on it. Only assign AFTER revision done.
4. **Past Papers** — Only unlock after 80%+ of chapters in the subject have completed all three phases above.
5. **Brush Older Chapters** — Chapters last touched 2-3+ months ago should be re-brushed periodically.

EXAM-CLOSE OVERRIDE (when daysUntilExam ≤ 14):
- Do NOT assign new "Making Notes" sessions.
- For chapters without notes: tell student to use AI-generated notes feature, then go straight to Revising + Questions.
- Prioritise weak chapters and recent past papers.

CRITICAL RULES:
- NEVER assign "Solving Questions" or "Revising Notes" for a chapter if "notes" is NOT in its DONE list (check the PHASE COMPLETION CHECKLIST above).
- NEVER repeat a phase already in DONE list for a chapter.
- A struggling subject (low marks) gets SLIGHTLY more time (60-40 split max), not heavy priority — keep all subjects active.
- A high-confidence + low-mark subject signals a hidden gap — diagnose via questions on high-priority chapters.

RESPOND WITH ONLY VALID JSON. No markdown. No backticks. No explanation text.
{
  "generatedDate": "${c.today}",
  "phase": "${c.phase}",
  "advice": "One motivating sentence (max 20 words)",
  "totalMinutes": <number — must equal ${targetHours * 60}>,
  "sessions": [
    {
      "subject": "Exact subject name from the list above",
      "topic": "${p.jee ? 'Specific NCERT chapter name' : 'Specific IGCSE chapter name'}",
      "activity": "Making Notes|Revising Notes|Flashcards|Solving Questions|Brush Recap|Quiz Me: Normal|Quiz Me: Mixed|Quiz Me: Timed|Mistake Quiz|Feynman-teach|Full Recall Test${p.jee ? '|Numerical Practice|Mock Test' : ''}",
      "durationMinutes": <20-30>,
      "timeSlot": "morning|afternoon|evening",
      "startTime": "HH:MM AM/PM",
      "why": "Why this topic today (max 15 words)",
      "priority": "high|medium|low",
      "examTip": "${p.jee ? 'JEE/NEET exam tip (max 20 words)' : 'Cambridge marking tip (max 20 words)'}"
    }
  ]
}

FINAL CHECK before responding:
- Did you use ONLY the ${c.subjectCount} subjects listed? No extras?
- Is every session 20-30 minutes?
- Does total = ${targetHours * 60} minutes?
- Did you check chapter progress before assigning Solving Questions?
- Are subjects interleaved (no two consecutive same subject)?`;

    return { system, user };
  },
  validate(data, c, warnings) {
    const validSubjects = ((c.student && c.student.subjects) || []).map(s => s.name);
    const validActs = activityNames({ jee: c.student && c.student.program === 'jee_neet' });
    const sessions = cleanSessions(data.sessions, validSubjects, validActs, warnings, 'today');
    if (!sessions.length) throw fail('INVALID', 'The AI returned no sessions.');
    return {
      generatedDate: data.generatedDate || c.today,
      phase: data.phase || c.phase,
      advice: data.advice || '',
      totalMinutes: num(data.totalMinutes, c.targetHours * 60),
      sessions
    };
  }
});

/* Drops a session whose subject/activity the AI invented, clamps duration to that activity's
   real range (warning when it had to), and defaults a missing timeSlot — shared by plan.week
   (per day) and plan.wizard. */
function cleanSessions(sessions, validSubjects, validActs, warnings, label) {
  const out = [];
  (Array.isArray(sessions) ? sessions : []).forEach((s, i) => {
    if (!s || !s.subject || !validSubjects.includes(s.subject)) { warnings.push(`${label} session ${i + 1}: unknown subject "${s && s.subject}" — dropped`); return; }
    if (!s.activity || !validActs.includes(s.activity)) { warnings.push(`${label} session ${i + 1} (${s.subject}): unknown activity "${s.activity}" — dropped`); return; }
    const b = activityBounds(s.activity);
    const given = num(s.durationMinutes, b.min);
    const dur = clamp(given, b.min, b.max);
    if (dur !== given) warnings.push(`${label} session ${i + 1} (${s.subject}, "${s.activity}"): ${given} min is outside its ${b.min}-${b.max} min range — clamped to ${dur}`);
    out.push(Object.assign({}, s, { durationMinutes: dur, timeSlot: s.timeSlot || 'morning' }));
  });
  return out;
}

def('plan.week', {
  title: 'Adaptive 7-day study plan', tokens: 6000,
  needs: ['chapterProgress', 'chapterNameList'],
  // ctx.tracking: the REAL trackingData object (getTrackingData() in the app) — the app used to
  // read a nonexistent 'studyTracking' localStorage key here, so this adaptation input was always
  // empty (AI-Logic-Map.md §9 item 5). ctx.skippedCount: sessions skipped this week (from
  // sessionProgress). ctx.mistakeCounts: {subject: unresolved mistake count} for Mistake Quiz
  // eligibility. ctx.chapterProgress / ctx.chapterNameList: pre-formatted by the app (needs
  // apexGetChaptersForSubject, an app-only function with the full curriculum data).
  build(c, p) {
    const st = c.student || {};
    const subjectsText = (st.subjects || []).map(s => `${s.name} (${s.level || 'Core'})`).join(', ');
    const validSubjects = (st.subjects || []).map(s => s.name);
    const examDate = st.examDate ? new Date(st.examDate) : null;
    const daysUntilExam = c.daysUntilExam != null ? c.daysUntilExam : (examDate ? Math.ceil((examDate - new Date()) / 86400000) : 180);
    let targetHours = c.targetHours != null ? c.targetHours : (st.dailyStudyTime || 3);
    if (daysUntilExam <= 7) targetHours = Math.min(targetHours, 3);

    const confInfo = Object.entries(st.subjectConfidence || {}).map(([k, v]) => `${k}: ${v}/10`).join(', ') || 'not set';
    const marksInfo = Object.entries(st.lastYearMarks || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || 'not provided';

    const tracking = c.tracking || {};
    const recentLogs = (tracking.dailyLogs || []).slice(-7);
    const avgMood = recentLogs.length ? recentLogs.map(l => l.mood || '?').slice(-3).join(', ') : 'unknown';
    const practiceScores = (tracking.practiceResults || []).slice(-10);
    const weakTopics = practiceScores.filter(r => (r.pct || 0) < 70).map(r => r.subject);
    const weakInfo = weakTopics.length ? 'Weak: ' + [...new Set(weakTopics)].join(', ') : 'No weak areas';
    const adaptSummary = `Recent mood: ${avgMood}. ${weakInfo}. ${c.skippedCount || 0} sessions skipped this week.`;

    // Real per-day-of-week windows to avoid, over all 7 days — the old prompt only ever mentioned
    // school hours in general, never which day is which, so a Saturday-only commitment could land
    // on a Tuesday session. Both fields already exist on studentData (see plan.daily's own
    // FIXED COMMITMENTS/SCHOOL TIMETABLE blocks); this just reuses them for the week.
    const commitments = st.fixedCommitments || [];
    const commitmentsText = commitments.length
      ? commitments.map(cm => `- ${cm.day}: ${cm.label} ${cm.start}–${cm.end}`).join('\n')
      : 'None.';
    const schoolText = (st.schoolTimetable && st.schoolTimetable.start && st.schoolTimetable.end)
      ? `School: ${st.schoolTimetable.start}–${st.schoolTimetable.end} on weekdays. Saturday: ${st.schoolTimetable.saturday || 'off'}. Sunday: ${st.schoolTimetable.sunday || 'off'}. Schedule study outside these windows.`
      : 'No school timetable provided — student is fully available.';

    const activityMenu = activityMenuText(p);
    const validActNames = activityNames(p);
    const mistakeText = mistakeEligibilityText(c);

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      weekDates.push({ dayName: dayNames[d.getDay()], date: String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') });
    }
    const weekDatesStr = weekDates.map(w => w.dayName + ' ' + w.date).join(', ');
    const exampleSubject = (st.subjects && st.subjects[0] && st.subjects[0].name) || 'Physics';

    const system = `You are an expert ${p.jee ? 'JEE/NEET week planner grounded in the NCERT syllabus' : 'IGCSE week planner'}. Create an ADAPTIVE 7-day plan.
ADAPTATION RULES:
1. Below 70% on a topic? Schedule MORE practice on it earlier in the week.
2. Sessions skipped? Reduce load slightly, front-load important subjects.
3. Low mood/energy? Start days with easier subjects to build momentum.
4. Everything completed + good mood? KEEP the pace — don't fix what works.
5. Never assign "Solving Questions", "Quiz Me: Normal/Mixed/Timed", "Flashcards", or "Feynman-teach" on a chapter without notes done. Hardest subjects in peak energy (${st.productiveTime || 'unspecified'}).
6. End each day with a strong subject. Interleave subjects — never the same subject twice in a row.
7. NEVER assign both "Brush Recap" AND "Revising Notes" on the same chapter the same day — pick one. Brush Recap = quick recall for chapters the student is strong in. Revising Notes = deeper review for chapters they scored poorly on.
8. ONLY plan for: ${subjectsText}. Use EXACT chapter names from the list below — never "Chapter 3".
9. Spread each session's length to fit what the activity actually needs (see ACTIVITY TYPES below) — do NOT force every session to the same length.
10. ${mistakeText}${p.jee ? `
11. "Numerical Practice" is not optional decoration for Physics/Chemistry/Maths — once a chapter's notes/revision are done, prefer it over plain "Solving Questions" unless the chapter is fact-recall-heavy (most of Biology).
12. Include at least one "Mock Test" across the week, more if the exam is close.
13. ${st.pucYear === '2nd' ? 'This is a 2nd PUC student — include some 1st PUC revision across the week, not just 2nd PUC content.' : 'This is a 1st PUC student — prioritize first-pass understanding over speed.'}` : ''}

ACTIVITY TYPES (use exact names, choose whichever fits — you are not limited to the first few):
${activityMenu}`;

    const chapterNameList = c.chapterNameList;
    const chapterProgress = c.chapterProgress;

    const user = `Create a FULL 7-DAY study plan starting from today.

Today is ${weekDates[0].dayName} ${weekDates[0].date}. The 7 days are: ${weekDatesStr}.

Subjects: ${subjectsText}
Exam: ${daysUntilExam} days away
Daily study: ${targetHours}h per day (${targetHours * 60} min total per day)
Peak time: ${st.productiveTime || 'unspecified'}
Marks: ${marksInfo} | Confidence: ${confInfo}
Chapter progress:
${chapterProgress}

FIXED COMMITMENTS THIS WEEK (tuition, sports, outings — treat like school hours):
${commitmentsText}

SCHOOL TIMETABLE:
${schoolText}

LOGGED MISTAKES:
${mistakeText}

HARD RULES — FOLLOW EXACTLY:
1. For the "topic" field, copy the EXACT chapter name from the list below. NEVER write "Chapter 8" or "Algebra (Chapter 5)".
2. SPREAD sessions across all three time slots: morning (8am-12pm), afternoon (12pm-5pm), evening (5pm-9pm). Do NOT put everything in morning.
3. Never assign "Solving Questions", any "Quiz Me: ..." mode, "Flashcards", or "Feynman-teach" on a chapter unless notes are DONE for it.
4. Interleave subjects — never two sessions of the same subject back to back.
5. Each session's durationMinutes must fit the activity's own range from ACTIVITY TYPES above.

ADAPTATION: ${adaptSummary}

FULL CHAPTER LIST — copy these EXACT names into the "topic" field:
${chapterNameList}

Return ONLY valid JSON:
{
  "weekSummary": { "totalHours": ${targetHours * 7}, "subjectHours": {"SubjectName": <hours>} },
  "days": [
    {
      "dayName": "${weekDates[0].dayName}",
      "date": "${weekDates[0].date}",
      "totalMinutes": ${targetHours * 60},
      "sessions": [
        {
          "subject": "${exampleSubject}",
          "topic": "exact chapter name from the list above",
          "activity": "${validActNames.join('|')}",
          "durationMinutes": 25,
          "timeSlot": "morning",
          "startTime": "8:00 AM"
        }
      ]
    }
  ]
}
Generate ALL 7 days. Spread across morning, afternoon, evening. Use EXACT chapter names.`;

    return { system, user };
  },
  validate(data, c, warnings) {
    const validSubjects = ((c.student && c.student.subjects) || []).map(s => s.name);
    const p = { jee: c.student && c.student.program === 'jee_neet' };
    const validActs = activityNames(p);
    const days = (Array.isArray(data.days) ? data.days : []).map(d => Object.assign({}, d, {
      sessions: cleanSessions(d.sessions, validSubjects, validActs, warnings, d.dayName || 'day')
    }));
    if (!days.length) throw fail('INVALID', 'The AI returned no days.');
    return { weekSummary: data.weekSummary || {}, days };
  }
});

def('plan.wizard', {
  title: '"Make Your Own Plan" wizard — AI fills in the student\'s own picks', tokens: 3000,
  needs: ['subjectMinutes', 'daypartConstraintsText', 'chosenChaptersText', 'syllabusContext'],
  // The wizard is student-driven: they've already picked subjects, roughly how many minutes each
  // gets, optional time-of-day windows, and (optionally) specific chapters, before this ever runs
  // — the AI's job is to honor those choices and place real chapter-grounded sessions inside them,
  // not redesign the day. ctx.subjectMinutes: {subjectName: minutes}. ctx.daypartConstraintsText /
  // ctx.chosenChaptersText / ctx.syllabusContext: pre-formatted by the app's own PMD module
  // (daypartConstraintsText(), chosenChaptersText(), syllabusContextFor()) — same data, just
  // handed in as ctx instead of closed over.
  build(c, p) {
    const subjects = Object.keys(c.subjectMinutes || {});
    const totalMin = Object.values(c.subjectMinutes || {}).reduce((a, n) => a + (n || 0), 0);
    const activityMenu = activityMenuText(p);
    const validActNames = activityNames(p);
    const mistakeText = mistakeEligibilityText(c);

    const system = `You are an expert study coach building a structured daily study timetable for a student. `
      + `The student picked their own subjects, approximate minutes per subject, optional time-of-day windows per subject, and (optionally) specific chapters — honor all of these faithfully rather than redesigning their choices. `
      + `Every session needs a real clock "startTime" (e.g. "4:30 PM") placed so the whole day flows in chronological order with no overlaps; leave the exact minute-by-minute spacing to the caller's own logic — just give sensible sequential times. `
      + `Pick "activity" for each session from EXACTLY these values: ${validActNames.join(', ')}. Never assign "Solving Questions", any "Quiz Me: ..." mode, "Flashcards", or "Feynman-teach" on a chapter the student hasn't made notes for yet, and never "Mistake Quiz" unless LOGGED MISTAKES below says that subject is eligible. `
      + `Ground each "topic" in a real chapter name from the syllabus context provided. Return ONLY JSON, no other text.`;

    const user = `STUDENT'S SUBJECTS TODAY: ${subjects.join(', ')} (about ${totalMin} minutes total)

MINUTES PER SUBJECT:
${subjects.map(n => `${n}: ${c.subjectMinutes[n] || 60} min`).join('\n')}

TIME-OF-DAY CONSTRAINTS:
${c.daypartConstraintsText}

CHAPTERS TO COVER:
${c.chosenChaptersText}

SYLLABUS CONTEXT (for grounding topic names to real chapters):
${c.syllabusContext}

ACTIVITY TYPES (use exact names):
${activityMenu}

LOGGED MISTAKES:
${mistakeText}

EXTRA NOTES FROM THE STUDENT:
"""${c.notes || '(none)'}"""

Return ONLY JSON in this exact shape:
{
  "sessions": [
    { "subject": "exact subject name from the list above", "topic": "specific chapter name", "activity": "${validActNames.join('|')}", "durationMinutes": <number, fit to the activity's own range>, "timeSlot": "morning|afternoon|evening", "startTime": "H:MM AM/PM", "why": "short reason (max 15 words)", "priority": "high|medium|low" }
  ],
  "advice": "one short encouraging line",
  "uncovered": ["Subject: whatever did not fit in the time given — empty array if everything fit"]
}`;

    return { system, user };
  },
  validate(data, c, warnings) {
    const validSubjects = Object.keys(c.subjectMinutes || {});
    const validActs = activityNames(c.student ? { jee: c.student.program === 'jee_neet' } : { jee: false });
    const sessions = cleanSessions(data.sessions, validSubjects, validActs, warnings, 'wizard');
    if (!sessions.length) throw fail('INVALID', 'The AI returned no sessions.');
    return { sessions, advice: data.advice || '', uncovered: Array.isArray(data.uncovered) ? data.uncovered : [] };
  }
});

def('plan.homeworkBreak', {
  title: 'Replan the rest of today around a homework break', tokens: 1500,
  needs: ['completed', 'remaining', 'startTime', 'duration', 'originalRemainingMinutes', 'newBudgetMinutes'],
  build(c) {
    const system = `You are replanning ONLY the remainder of a student's study day — they just added an unplanned homework break. Do NOT mention, repeat, or re-plan any already-completed session listed below, those are untouched and done. Fit the new sessions into the reduced time budget given — some of the originally-planned remaining sessions may need to be dropped, shortened, or merged to fit; prioritize the highest-value/highest-priority ones. Return ONLY JSON: {"sessions":[{"subject":"","topic":"","activity":"","durationMinutes":0,"timeSlot":"","startTime":"","why":"","priority":"","examTip":""}]}. Total durationMinutes across all returned sessions must not exceed the budget.`;
    const user = `Already completed today (leave these alone, for context only):
${c.completed.length ? c.completed.map(s => `- ${s.subject}: ${s.topic} (${s.activity})`).join('\n') : 'None yet.'}

Originally planned for the rest of today (before the homework break):
${c.remaining.length ? c.remaining.map(s => `- ${s.subject}: ${s.topic} (${s.activity}, ${s.durationMinutes || 0} min)`).join('\n') : 'Nothing else was planned.'}

Homework break: ${c.startTime} for ${c.duration} minutes.
New reduced time budget for the rest of today: ${c.newBudgetMinutes} minutes (was ${c.originalRemainingMinutes} before the break).
Schedule the new sessions to start after the homework break ends.`;
    return { system, user };
  },
  // The prompt asks for "total <= budget" but nothing enforced it. Now something does.
  validate(data, c, warnings) {
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    let used = 0; const kept = [];
    for (const s of sessions) {
      const d = Math.max(0, num(s.durationMinutes, 0));
      if (used + d <= c.newBudgetMinutes) { kept.push(s); used += d; continue; }
      const room = c.newBudgetMinutes - used;
      if (room >= 15) { kept.push(Object.assign({}, s, { durationMinutes: room })); used += room; warnings.push(`"${s.topic}" shortened to ${room} min to fit the budget`); }
      else warnings.push(`"${s.topic}" dropped — over the ${c.newBudgetMinutes}-min budget`);
    }
    return { sessions: kept };
  }
});

def('plan.tomorrowChanges', {
  title: "Suggest changes to tomorrow's plan after the daily log", tokens: 1000, parse: 'text', auto: true,
  needs: ['mood', 'workload', 'done', 'partial', 'skipped', 'total'],
  build(c) {
    const st = c.student || {};
    return {
      system: "You are a study plan adjustment advisor. Based on today's log, suggest SPECIFIC changes for tomorrow's plan. Be brief and use bullet points. Format: start each change with ✅ (keep), 🔄 (change), or ❌ (remove).",
      user: "Today's data:\n" +
        "Mood: " + (c.mood || "not set") + "\n" +
        "Workload: " + (c.workload || "not set") + "\n" +
        "Sessions: " + c.done + " done, " + c.partial + " partial, " + c.skipped + " skipped out of " + c.total + "\n" +
        "Current daily target: " + (st.dailyStudyTime || 3) + "h\n" +
        "Subjects: " + subjectNames(c) + "\n\n" +
        "Suggest 3-5 specific changes for tomorrow. Be direct. Example:\n" +
        "🔄 Reduce daily hours from 4h to 3h — student reported feeling overworked\n" +
        "✅ Keep Physics in morning — matches peak energy time\n" +
        "❌ Remove Brush Recap for Biology Ch.5 — already mastered"
    };
  }
});

def('plan.changeRequest', {
  title: "Student asks for a specific change to tomorrow's plan", tokens: 500, parse: 'text',
  needs: ['request'],
  build(c) {
    const st = c.student || {};
    return {
      system: "You are a study plan advisor. The student wants a change to tomorrow's plan. Confirm the change and explain what the new plan will look like. Be brief (3-4 sentences). Start with '✅ Got it.'",
      user: "Current suggestion:\n" + (c.currentSuggestion || 'No suggestion yet') + "\n\nStudent requests: \"" + c.request + "\"\nSubjects: " + subjectNames(c) + "\nDaily hours: " + (st.dailyStudyTime || 3) + "h"
    };
  }
});

def('plan.suggestion', {
  title: 'Mood + workload → tomorrow adjustment and suggested hours', tokens: 500,
  needs: [],
  build(c) {
    const cur = (c.student && c.student.dailyStudyTime) || 3;
    return {
      system: "You are a study coach. Based on mood and workload, suggest tomorrow's adjustment. Brief (2-3 sentences). Also suggest hours.",
      user: "Mood: " + (c.mood || "not set") + "\nWorkload: " + (c.workload || "not set") + "\nCurrent target: " + cur + "h\nMessage: " + (c.message || "none") + "\nRespond JSON only: {\"suggestion\":\"text\",\"suggestedHours\":number}"
    };
  },
  validate(data, c) {
    const cur = (c.student && c.student.dailyStudyTime) || 3;
    return { suggestion: data.suggestion || 'Keep going!', suggestedHours: clamp(num(data.suggestedHours, cur), 0.5, 12) };
  }
});
