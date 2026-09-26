/* Section C — practice questions, grading, and the small chat/approach helpers around them. */
import { def } from '../../core/registry.js';
import { fail } from '../../core/errors.js';
import { num, clamp, checkQuestions } from '../../core/validators.js';
import { refBlock, AND_NOT_BUT, GET_PAST_MISTAKES_TOOL } from '../../core/prompts.js';

def('practice.batch', {
  title: 'A batch of practice questions for one chapter (adaptive difficulty)', tokens: 3000,
  needs: ['subject', 'batchSize'],
  tools: [GET_PAST_MISTAKES_TOOL],
  build(c, p) {
    const pct = c.runningPct == null ? 50 : c.runningPct;   // running score %, 50 before the first answer
    const diffMix = pct >= 75 ? '2 Easy (1-2 marks), 4 Medium (2-3 marks), 4 Hard (4-6 marks)'
      : pct >= 50 ? '3 Easy (1-2 marks), 4 Medium (2-3 marks), 3 Hard (4-6 marks)'
      : '5 Easy (1-2 marks), 3 Medium (2-3 marks), 2 Hard (4-6 marks)';
    const res = refBlock(c, 'plain');
    const subj = c.subject;
    const batchLine = (c.batchNum || 1) > 1 ? `Batch ${c.batchNum} — generate DIFFERENT questions from previous batches.` : '';
    if (p.jee) {
      const numOk = p.numericalOk(subj);
      const system = `You are a JEE/NEET question generator grounded in the NCERT syllabus. Generate objective questions in the exact format these exams use — MCQ (single correct option)${numOk ? ' or numerical-value (integer/decimal answer, no options)' : ''}, never written/essay style.${res}

QUESTION RULES:
- "type": "mcq" for multiple-choice (4 options, exactly one correct)${numOk ? ', or "numerical" for a question whose answer is a single number (no options)' : ' — always use "mcq" for this subject/exam combination, never "numerical"'}.
- MCQ options must be plausible — include realistic distractors (common calculation errors, close-but-wrong values, classic misconceptions), not obviously-wrong filler.
- "correctIndex" is the 0-based index (0-3) of the correct option in "options".
- Numerical questions: "correctValue" is the exact numeric answer, "tolerance" is the acceptable absolute error (0 for exact-integer answers, small decimal for calculated values).
- "answer" MUST be a full WORKED solution as numbered steps: "Step 1: ... Step 2: ... Final answer: ..." — shown to the student after they submit, regardless of correct/incorrect.
- "points": marks for a correct answer (JEE/NEET convention: 4). "negativeMarks": marks deducted for a wrong MCQ answer (JEE/NEET convention: 1) — always 0 for numerical-type questions (no negative marking on numerical in real JEE Main/Advanced).
- "topic": the specific concept within this chapter the question tests (e.g. "Newton's Third Law"), not just the chapter name again — drives per-topic strengths/weaknesses feedback later.

If this chapter plausibly has a mistake history worth targeting, you may call get_past_mistakes(subject, chapter) once before writing questions, then bias the mix toward those weak spots — skip it if there's no reason to expect useful history.

Return ONLY valid JSON.`;
      const user = `Generate ${c.batchSize} JEE/NEET ${subj} questions for: ${c.chapter || 'general revision'}
Mix: ${diffMix.replace(/marks/g, 'marks, all worth 4 points regardless of difficulty per JEE/NEET convention')}.
${numOk ? 'Mix MCQ and numerical-value questions — roughly 3 MCQ to 1 numerical.' : 'All questions must be "type":"mcq".'}
${batchLine}

Return ONLY JSON:
{
  "questions": [
    {
      "q": "Question text (JEE/NEET style)",
      "type": "mcq",
      "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
      "correctIndex": 0,
      "answer": "Step 1: ... Step 2: ... Final answer: ... (full worked method)",
      "difficulty": "Easy|Medium|Hard",
      "points": 4,
      "negativeMarks": 1,
      "topic": "specific concept/topic within this chapter",
      "examTip": "JEE/NEET tip (max 20 words)"
    }
  ]
}
(For a "numerical" question, omit "options"/"correctIndex" and instead include "correctValue": <number>, "tolerance": <number>, "negativeMarks": 0.)`;
      return { system, user };
    }
    const system = `You are a Cambridge IGCSE question generator. Generate questions with REAL Cambridge mark values.${res}

MARK SCHEME RULES:
- 1-mark: Simple recall, definition, or single calculation
- 2-mark: Short answer, state + explain, or two-step calculation
- 3-mark: Extended explanation, compare two things, multi-step calculation
- 4-6 mark: Structured answer, describe a process, longer explanation

ANSWER RULES (critical):
- "answer" MUST be a full WORKED solution as numbered steps: "Step 1: ... Step 2: ... Step 3: ..."
- For calculations/conversions: show EVERY line of working. Example for binary conversion: "Step 1: Write the place values: 128 64 32 16 8 4 2 1. Step 2: Find the largest value ≤ 75, which is 64, so write 1 under 64..." — never just state the final answer.
- For explanations: each step = one mark point worded as the mark scheme expects.
- End with "Final answer: ..." on its own step.

HINT RULES:
- "hint1": A gentle conceptual clue. Never reveal the answer. Point toward the right topic/formula/method.
- "hint2": A more specific clue. Give the formula or key step, but NOT the final answer. Set to null if the question is Easy (1-2 marks).

Tag every question with "topic": the specific concept within this chapter it tests (e.g. "Balancing Equations"), not just the chapter name again — drives per-topic strengths/weaknesses feedback later.

If this chapter plausibly has a mistake history worth targeting, you may call get_past_mistakes(subject, chapter) once before writing questions, then bias the mix toward those weak spots — skip it if there's no reason to expect useful history.

Return ONLY valid JSON.`;
    const user = `Generate ${c.batchSize} IGCSE ${subj} questions for: ${c.chapter || 'general revision'}
Mix: ${diffMix}.
${batchLine}

Return ONLY JSON:
{
  "questions": [
    {
      "q": "Question text (Cambridge exam style)",
      "answer": "Step 1: ... Step 2: ... Step 3: ... Final answer: ... (full worked method, every line of working shown)",
      "difficulty": "Easy|Medium|Hard",
      "points": <1-6 — real IGCSE marks>,
      "hint1": "Gentle conceptual clue (never the answer)",
      "hint2": "More specific clue with formula/method or null if Easy",
      "topic": "specific concept/topic within this chapter",
      "examTip": "How Cambridge awards marks here (max 20 words)"
    }
  ]
}`;
    return { system, user };
  },
  validate(data, c, warnings) {
    const out = checkQuestions(data, c, warnings);
    out.questions = out.questions.map(q => Object.assign({}, q, { topic: q.topic || c.chapter || 'General' }));
    return out;
  }
});

def('practice.grade', {
  title: 'Grade a written practice answer with partial credit', tokens: 1200,
  needs: ['question', 'answer'],
  // question: { q, answer, points }
  build(c, p) {
    const q = c.question;
    return {
      system: p.jee
        ? `You are a JEE/NEET expert examiner and teacher. Grade the working and the final answer with PARTIAL CREDIT for correct method steps. After grading, ALWAYS provide a step-by-step breakdown that teaches the student the method. Return ONLY JSON.`
        : 'You are a Cambridge IGCSE examiner and teacher. Grade with PARTIAL CREDIT like real Cambridge marking. Award marks for each valid point. After grading, ALWAYS provide a step-by-step breakdown that teaches the student the method. Return ONLY JSON.',
      user: `Question: ${q.q}\nMax marks: ${q.points}\nModel answer: ${q.answer}\nStudent answer: ${c.answer}

Return ONLY JSON:
{
  "marksEarned": <0 to ${q.points} — partial credit allowed>,
  "feedback": "What was right and how to improve (max 60 words). ${AND_NOT_BUT}",
  "steps": ["Step 1: [what to do and why]", "Step 2: [calculation or reasoning]", "Step 3: [result]"],
  "modelAnswer": "Full model answer with mark breakdown",
  "examTip": "${p.jee ? 'How JEE/NEET rewards or penalises this' : 'How Cambridge awards marks here'} (max 25 words)"
}`
    };
  },
  validate(data, c) { return Object.assign({}, data, { marksEarned: clamp(num(data.marksEarned, 0), 0, num(c.question.points, 1)) }); }
});

def('practice.approach', {
  title: 'Worked example of a SIMILAR question (never the student\'s own)', tokens: 450, parse: 'text',
  needs: ['subject', 'questionText'],
  build(c, p) {
    return {
      system: `You are ${p.aExam} ${c.subject} teacher. A student is stuck on a question. Give ONE fully worked example of a SIMILAR question — same method, different numbers/context. NEVER solve or reference their actual question. Format: **Similar question:** ... then **Step 1:** ... **Step 2:** ... **Answer:** ... Keep under 150 words.`,
      user: 'Their question (do NOT solve this one): ' + c.questionText
    };
  }
});

def('practice.errorReport', {
  title: 'Second-opinion re-check when the student reports wrong grading', tokens: 500,
  needs: ['questionText', 'modelAnswer', 'studentAnswer', 'maxMarks', 'aiMarks'],
  build(c, p) {
    return {
      system: `You are a strict ${p.examiner} double-checking a colleague's marking. Be honest — if the original grading or model answer was wrong, say so and correct it. If it was actually fine, say so plainly; do not invent an error just to please the student. Return ONLY JSON.`,
      user: `Question: ${c.questionText}\nModel answer given: ${c.modelAnswer}\nStudent's answer: ${c.studentAnswer}\nMax marks: ${c.maxMarks}\nOriginal marks awarded: ${c.aiMarks}\nOriginal feedback given: ${c.aiFeedback || ''}\nStudent's complaint: ${c.studentNote || '(no note given — just re-check the grading)'}\n\nReturn ONLY JSON:\n{\n  "verdict": "error_confirmed" or "no_error_found",\n  "correctedMarks": <0 to ${c.maxMarks}, only if error_confirmed>,\n  "correctedFeedback": "<corrected feedback, only if error_confirmed>",\n  "explanation": "<1-2 sentences, shown to the student either way>"\n}`
    };
  },
  validate(data, c) {
    if (data.verdict !== 'error_confirmed' && data.verdict !== 'no_error_found') throw fail('INVALID', 'Re-check returned no verdict.');
    if (data.verdict === 'error_confirmed') data.correctedMarks = clamp(num(data.correctedMarks, c.aiMarks), 0, c.maxMarks);
    return data;
  }
});

def('practice.stuckChat', {
  title: 'Chat with a teacher about ONE question the student is stuck on', tokens: 300, parse: 'text',
  needs: ['subject', 'questionText', 'messages'],   // messages: [{role:'user'|'ai', text}]
  build(c, p) {
    const system = `You are ${p.aExam} ${c.subject} teacher having a live back-and-forth with a student who is stuck on a specific question. Work through their confusion conversationally — ask a guiding question or explain the ONE piece they're missing, don't dump the full solution unprompted. NEVER just state the final answer to their actual question unless they've clearly worked through the reasoning with you and are just confirming it. Keep replies short (2-4 sentences) — this is a chat, not an essay. Question they're stuck on: "${c.questionText}".${c.extraContext ? ' ' + c.extraContext : ''}`;
    const user = c.messages.slice(-10).map(m => `${m.role === 'user' ? 'Student' : 'You'}: ${m.text}`).join('\n');
    return { system, user };
  }
});

def('practice.inlineQuiz', {
  title: 'Quick-check questions after a study session (5, or 8 for Brush Recap)', tokens: 2000,
  needs: ['subject', 'topic'],
  build(c, p) {
    const isBrush = c.activity === 'Brush Recap';
    const n = isBrush ? 8 : 5;
    const extra = isBrush
      ? "Focus on KEY CONCEPTS, core formulas, and definitions from this chapter. Test whether the student truly understands the fundamentals."
      : "Mix of easy and medium.";
    return {
      system: `You generate quick-check questions for ${p.board} ${c.subject}. Return ONLY valid JSON.`,
      user: `Generate ${n} quick questions for: ${c.subject} — ${c.topic}\n${extra} Each worth 2 marks.\nReturn JSON: {"questions":[{"q":"question","answer":"correct answer","marks":2}]}`
    };
  },
  validate(data, c, warnings) {
    const qs = (Array.isArray(data.questions) ? data.questions : []).filter(q => q && q.q && q.answer);
    if (!qs.length) throw fail('INVALID', 'Could not generate questions.');
    return { questions: qs.map(q => Object.assign({}, q, { marks: num(q.marks, 2) })) };
  }
});

def('practice.inlineGrade', {
  title: 'Grade one quick-check answer', tokens: 300,
  needs: ['question', 'answer'],   // question: { q, answer, marks }
  build(c) {
    return {
      system: "Grade this answer. Return ONLY JSON: {\"correct\":true/false,\"points\":0-" + c.question.marks + ",\"feedback\":\"brief\"}",
      user: "Q: " + c.question.q + "\nModel: " + c.question.answer + "\nStudent: " + c.answer
    };
  },
  validate(data, c) { return { correct: !!data.correct, points: clamp(num(data.points, 0), 0, num(c.question.marks, 2)), feedback: data.feedback || '' }; }
});
