/* Section D — Quiz Me: Normal/Mixed/Timed/Chaos/Mistake quizzes, and their grading. */
import { def } from '../../core/registry.js';
import { fail } from '../../core/errors.js';
import { num, checkQuestions } from '../../core/validators.js';
import { clamp } from '../../core/validators.js';
import { conceptBlock, refBlock, QUESTION_SHAPE, GET_PAST_MISTAKES_TOOL } from '../../core/prompts.js';

def('quiz.generate', {
  title: 'Normal / Mixed / Timed quiz over chosen chapters', tokens: 4000,
  needs: ['subject', 'chapters', 'difficulty', 'count'],
  tools: [GET_PAST_MISTAKES_TOOL],
  // c.qtypes: ['Multiple choice','Numerical',...]   c.timed: bool
  build(c, p) {
    const qtypes = c.qtypes || [];
    const subj = c.subject;
    const concept = conceptBlock(c, p, true) + refBlock(c, 'plain');
    if (p.jee) {
      const numOk = p.numericalOk(subj);
      const timedShort = c.timed && !numOk;
      const typeLine = qtypes.length ? `Question types to use: ${qtypes.join(', ')}.` : 'Use a natural mix of question types for this subject.';
      const mix = c.timed
        ? (numOk ? 'All questions must be "type":"numerical" — timed mode never uses multiple choice.' : 'All questions must be "type":"short" — timed mode never uses multiple choice.')
        : !numOk ? 'All questions must be "type":"mcq".'
        : (qtypes.includes('Multiple choice') && !qtypes.includes('Numerical')) ? 'All questions must be "type":"mcq" — student selected Multiple choice only.'
        : (qtypes.includes('Numerical') && !qtypes.includes('Multiple choice')) ? 'All questions must be "type":"numerical" — student selected Numerical only.'
        : 'Mix MCQ and numerical-value questions — roughly 3 MCQ to 1 numerical.';
      return {
        system: `You are a JEE/NEET expert creating quiz questions grounded in the NCERT syllabus, in the objective/numerical style these exams actually use — MCQ (single correct option)${numOk ? ' or numerical-value (integer/decimal, no options)' : ' — always MCQ for this subject/exam combination'}, never written/essay style. MCQ options must include realistic distractors, not obviously-wrong filler. Each answer must be a full worked solution as numbered steps ("Step 1: ... Step 2: ... Final answer: ..."), shown to the student after they submit regardless of correct/incorrect. Tag every question with the exact chapter it came from AND the specific topic/concept within that chapter it tests (e.g. "Newton's Third Law", not just the chapter name again) — this drives per-topic strengths/weaknesses feedback later. Return ONLY JSON.`,
        user: `Create ${c.count} JEE/NEET ${subj} quiz questions.
Chapters (spread questions across ALL of these): ${c.chapters.join(' | ')}
Difficulty: ${c.difficulty} — all questions worth 4 marks per JEE/NEET convention, 1 mark deducted for a wrong MCQ answer (0 for numerical or short-answer).
${typeLine} ${mix}${concept}

If one of these chapters plausibly has a mistake history worth targeting, you may call get_past_mistakes(subject, chapter) once for that chapter before writing questions — skip it otherwise.

Return ONLY JSON:
{ "questions": [${QUESTION_SHAPE.jeeMcq}] }
${QUESTION_SHAPE.jeeNumericalNote}${timedShort ? QUESTION_SHAPE.jeeShortNote : ''}`
      };
    }
    const markRange = c.difficulty === 'Easy' ? '1-2' : c.difficulty === 'Medium' ? '2-4' : c.difficulty === 'Very Hard' ? '5-8' : '4-6';
    let typeLine = qtypes.length ? `Question types to use: ${qtypes.join(', ')}.` : 'Use a natural mix of question types for this subject.';
    if (c.timed) typeLine += ' Do not use multiple-choice questions — every question must require a typed/written answer, not a selection from options (this is a timed, no-guessing mode).';
    return {
      system: `You are a Cambridge IGCSE examiner creating quiz questions in real past-paper style. Questions must read exactly like Cambridge board paper questions. Each answer must be a full worked solution as numbered steps ("Step 1: ... Step 2: ... Final answer: ..."). Tag every question with the exact chapter it came from AND the specific topic/concept within that chapter it tests (e.g. "Newton's Third Law", not just the chapter name again) — this drives per-topic strengths/weaknesses feedback later. Return ONLY JSON.`,
      user: `Create ${c.count} IGCSE ${subj} quiz questions.
Chapters (spread questions across ALL of these): ${c.chapters.join(' | ')}
Difficulty: ${c.difficulty} (${markRange} marks per question).
${typeLine}${concept}

If one of these chapters plausibly has a mistake history worth targeting, you may call get_past_mistakes(subject, chapter) once for that chapter before writing questions — skip it otherwise.

Return ONLY JSON:
{ "questions": [{"q":"Question text (past-paper style)","answer":"Step 1: ... Step 2: ... Final answer: ...","marks":<${markRange}>,"chapter":"<exact chapter name from the list>","topic":"<specific concept/topic within that chapter>","qtype":"<question type>"}] }`
    };
  },
  validate(data, c, warnings) {
    const out = checkQuestions(data, c, warnings);
    // Unknown/missing chapter tags fall back to the first chosen chapter (the app did this per-caller).
    out.questions = out.questions.map(q => {
      const chapter = (q.chapter && c.chapters.includes(q.chapter)) ? q.chapter : c.chapters[0];
      return Object.assign({}, q, { points: num(q.marks, 3), chapter, topic: q.topic || chapter });
    });
    return out;
  }
});

def('quiz.chaos', {
  title: 'Chaos test: questions for ONE subject (one call per subject, interleaved by the app)', tokens: 3000,
  needs: ['subject', 'chapters', 'difficulty', 'count'],
  build(c, p) {
    const subj = c.subject;
    const concept = conceptBlock(c, p, false);
    if (p.jee) {
      const numOk = p.numericalOk(subj);
      return {
        system: `You are a JEE/NEET expert creating quiz questions grounded in the NCERT syllabus, in the objective/numerical style these exams actually use — MCQ (single correct option)${numOk ? ' or numerical-value (integer/decimal, no options)' : ' — always MCQ for this subject/exam combination'}, never written/essay style. Each answer must be a full worked solution as numbered steps ("Step 1: ... Final answer: ..."). Tag every question with the exact chapter it came from AND the specific topic/concept within that chapter it tests. Return ONLY JSON.`,
        user: `Create ${c.count} JEE/NEET ${subj} quiz questions.
Chapters (spread questions across ALL of these): ${c.chapters.join(' | ')}
Difficulty: ${c.difficulty} — all questions worth 4 marks per JEE/NEET convention, 1 mark deducted for a wrong MCQ answer (0 for numerical).
${numOk ? 'Mix MCQ and numerical-value questions — roughly 3 MCQ to 1 numerical.' : 'All questions must be "type":"mcq".'}${concept}

Return ONLY JSON:
{ "questions": [${QUESTION_SHAPE.jeeMcq}] }
${QUESTION_SHAPE.jeeNumericalNote}`
      };
    }
    const markRange = c.difficulty === 'Easy' ? '1-2' : c.difficulty === 'Medium' ? '2-4' : c.difficulty === 'Very Hard' ? '5-8' : '4-6';
    return {
      system: `You are a Cambridge IGCSE examiner creating quiz questions in real past-paper style. Each answer must be a full worked solution as numbered steps. Tag every question with the exact chapter it came from AND the specific topic/concept within that chapter it tests. Return ONLY JSON.`,
      user: `Create ${c.count} IGCSE ${subj} quiz questions.
Chapters (spread questions across ALL of these): ${c.chapters.join(' | ')}
Difficulty: ${c.difficulty} (${markRange} marks per question).${concept}

Return ONLY JSON:
{ "questions": [{"q":"Question text (past-paper style)","answer":"Step 1: ... Step 2: ... Final answer: ...","marks":<${markRange}>,"chapter":"<exact chapter name from the list>","topic":"<specific concept/topic within that chapter>","qtype":"<question type>"}] }`
    };
  },
  validate(data, c, warnings) {
    const out = checkQuestions(data, c, warnings);
    out.questions = out.questions.map(q => {
      const chapter = (q.chapter && c.chapters.includes(q.chapter)) ? q.chapter : c.chapters[0];
      return Object.assign({}, q, { points: num(q.marks, 3), subject: c.subject, chapter, topic: q.topic || chapter });
    });
    return out;
  }
});

def('quiz.mistake', {
  title: "Mistake quiz: NEW questions targeting the student's logged wrong answers", tokens: 4000,
  needs: ['subject', 'difficulty', 'mistakes'],   // mistakes: last ~30 entries of mistakeLog for this subject
  build(c, p) {
    const log = c.mistakes;
    const lines = log.map((m, i) => `${i + 1}. [${m.chapter || 'General'}] Q: ${m.questionText}\n   Their answer: ${m.studentAnswer}\n   Correct answer: ${m.correctAnswer}`).join('\n');
    const count = Math.min(30, Math.max(20, log.length));
    const numOk = p.numericalOk(c.subject);
    const mix = !p.jee ? '' : !numOk ? 'All questions must be "type":"mcq".' : 'Mix MCQ and numerical-value questions — roughly 3 MCQ to 1 numerical.';
    return {
      system: p.jee
        ? `You are a JEE/NEET expert creating NEW quiz questions grounded in the NCERT syllabus, targeting a specific student's actual weak spots from their mistake history. MCQ (single correct option)${numOk ? ' or numerical-value (integer/decimal, no options)' : ' — always MCQ for this subject/exam combination'}, never written/essay style. Each answer must be a full worked solution as numbered steps ("Step 1: ... Final answer: ..."). Tag every question with the chapter it targets AND the specific topic/concept within that chapter it tests. Return ONLY JSON.`
        : `You are a Cambridge IGCSE examiner creating NEW quiz questions in real past-paper style, targeting a specific student's actual weak spots from their mistake history. Each answer must be a full worked solution as numbered steps. Tag every question with the chapter it targets AND the specific topic/concept within that chapter it tests. Return ONLY JSON.`,
      user: `This student's last ${log.length} logged mistakes in ${c.subject} (most recent last):
${lines}

Create ${count} BRAND NEW ${c.subject} questions that target the SAME underlying gaps these mistakes reveal — genuinely new questions testing the same concepts/skills, NOT reworded copies of the questions above. Spread across the concepts shown, weighted toward whichever come up most. Difficulty: ${c.difficulty}.
${mix}

Return ONLY JSON:
${p.jee
  ? `{ "questions": [{"q":"Question text (JEE/NEET style)","type":"mcq","options":["A text","B text","C text","D text"],"correctIndex":0,"answer":"Step 1: ... Final answer: ...","marks":4,"negativeMarks":1,"chapter":"<the chapter this targets>","topic":"<specific concept/topic within that chapter>"}] }\n${QUESTION_SHAPE.jeeNumericalNote}`
  : `{ "questions": [{"q":"Question text (past-paper style)","answer":"Step 1: ... Step 2: ... Final answer: ...","marks":<2-6>,"chapter":"<the chapter this targets>","topic":"<specific concept/topic within that chapter>","qtype":"<question type>"}] }`}`
    };
  },
  validate(data, c, warnings) {
    const out = checkQuestions(data, c, warnings);
    out.questions = out.questions.map(q => {
      const chapter = q.chapter || 'General';
      return Object.assign({}, q, { points: num(q.marks, 3), chapter, topic: q.topic || chapter });
    });
    return out;
  }
});

def('quiz.grade', {
  title: 'Grade a free-response quiz answer (also JEE/NEET Timed "short" answers)', tokens: 800,
  needs: ['question', 'answer'],   // question: { q, answer, points }
  build(c, p) {
    const max = c.question.points || 5;
    return {
      system: `You are ${p.aExaminer}. Grade against the mark scheme. Return ONLY JSON.`,
      user: `Q: ${c.question.q}\nModel: ${c.question.answer}\nStudent: ${c.answer}\nMax marks: ${max}\nReturn JSON: {"marks":<0-${max}>,"correct":true/false,"feedback":"Brief specific feedback on what was right/missing"}`
    };
  },
  validate(data, c) { return Object.assign({}, data, { marks: clamp(num(data.marks, 0), 0, c.question.points || 5) }); }
});

def('quiz.brushRecap', {
  title: 'Ultra-condensed recap, one card per chapter', tokens: 3000,
  needs: ['subject', 'chapters'],
  build(c, p) {
    return {
      system: `You create ultra-condensed ${p.board} revision recaps. Scannable, fact-dense, no filler. Return ONLY JSON.`,
      user: `Create a brush recap for ${p.exam} ${c.subject}, one recap per chapter:
Chapters: ${c.chapters.join(' | ')}

Each recap: the 5-8 most exam-critical points for that chapter — key facts, formulas, definitions. Each point under 20 words.

Return ONLY JSON:
{ "recaps": [{"chapter":"<chapter name>","points":["point 1","point 2",...]}] }`
    };
  },
  validate(data) {
    const recaps = (Array.isArray(data.recaps) ? data.recaps : []).filter(r => r && r.chapter && Array.isArray(r.points) && r.points.length);
    if (!recaps.length) throw fail('INVALID', 'The AI returned no recap cards.');
    return { recaps };
  }
});
