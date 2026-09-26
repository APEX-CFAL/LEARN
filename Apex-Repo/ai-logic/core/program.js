/* IGCSE vs JEE/NEET wording, in ONE place. This is what fixes the "Cambridge examiner" voice
   that used to leak into JEE/NEET students' feedback everywhere in the old app — every feature
   asks this file for its wording instead of hardcoding "Cambridge IGCSE" itself. */
export function programOf(c) {
  const st = (c && c.student) || {};
  const jee = st.program === 'jee_neet';
  return {
    jee,
    id: jee ? 'jee_neet' : 'igcse',
    exam: jee ? 'JEE/NEET' : 'IGCSE',
    board: jee ? 'JEE/NEET' : 'Cambridge IGCSE',
    aExam: jee ? 'a JEE/NEET' : 'an IGCSE',        // "an IGCSE teacher" / "a JEE/NEET teacher"
    aBoard: jee ? 'a JEE/NEET' : 'a Cambridge IGCSE',
    aExaminer: jee ? 'a JEE/NEET expert examiner' : 'a Cambridge IGCSE examiner',
    examiner: jee ? 'JEE/NEET expert examiner' : 'Cambridge IGCSE examiner',
    app: jee ? 'Apex JEE/NEET study app' : 'Apex IGCSE study app',
    marksNote: jee
      ? 'JEE/NEET convention: 4 marks for a correct answer, 1 deducted for a wrong MCQ (0 for numerical/short).'
      : 'Cambridge mark-scheme conventions.',
    examTipLabel: jee ? 'JEE/NEET tip' : 'Cambridge marking tip',
    // NEET is pure MCQ and Biology is NEET-only, so neither ever gets numerical questions.
    numericalOk: (subject) => jee && subject !== 'Biology' && st.examGoal !== 'neet',
    // One-line scope lock used by chat-style features.
    scope: (subject) => jee
      ? `Stay strictly within the NCERT ${subject} syllabus scope for JEE/NEET — never introduce topics beyond it.`
      : `Stay strictly within the Cambridge IGCSE ${subject} syllabus scope — never introduce A-Level/IB/university-level depth.`
  };
}
