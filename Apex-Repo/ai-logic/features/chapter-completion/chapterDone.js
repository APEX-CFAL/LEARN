/* Section G — chapter-completion flow (the "log this chapter as done" wizard). In the old
   app these three calls used raw fetch(), bypassing the queue/retry/backup-key logic — running
   them through core/engine.js's run() gives them all three for free, no extra code needed here. */
import { def } from '../../core/registry.js';
import { fail } from '../../core/errors.js';
import { clamp, num } from '../../core/validators.js';
import { clip } from '../../core/prompts.js';

def('chapterDone.notesAnalysis', {
  title: 'Analyse the notes a student just logged for a chapter', tokens: 600, temperature: 0.3,
  needs: ['subject', 'chapter', 'notes'],
  build(c, p) {
    const lvl = c.level ? ` ${c.level}` : '';
    return {
      system: '',
      user: `You are analyzing a student's notes for ${p.exam} ${c.subject}, chapter: "${c.chapter}".

The student's notes:
"""
${clip(c.notes, 3000)}
"""

Respond in this exact JSON format (no markdown, no backticks):
{
  "quality": "great" or "good" or "needs_work",
  "feedback": "2-3 sentences about what they've covered well. Use encouraging language. Never use the word 'but' — use 'and' instead.",
  "missing": ["concept 1 that should be in this chapter and isn't in their notes yet", "concept 2", ...],
  "relatedChapters": ["name of another chapter where some of these concepts also appear"]
}

Be specific about ${p.exam} ${c.subject}${lvl} curriculum requirements.`
    };
  },
  validate(data) {
    const q = ['great', 'good', 'needs_work'].includes(data.quality) ? data.quality : 'good';
    return { quality: q, feedback: data.feedback || '', missing: data.missing || [], relatedChapters: data.relatedChapters || [] };
  }
});

def('chapterDone.recapQuestions', {
  title: '5 quick recall questions after logging a chapter', tokens: 1200, temperature: 0.4,
  needs: ['subject', 'chapter'],
  build(c, p) {
    return {
      system: '',
      user: `Generate 5 quick recall questions for ${p.exam} ${c.subject} (${c.level || 'Core'}), chapter: "${c.chapter}".
${c.notes ? 'Student notes:\n' + clip(c.notes, 2000) : ''}

Mix difficulties: 3 easy (1-2 marks), 2 medium (3 marks).
Return ONLY JSON:
{
  "questions": [
    {"q": "Question text", "answer": "Brief model answer", "marks": 2, "steps": ["Step 1: ...", "Step 2: ..."]}
  ]
}`
    };
  },
  validate(data) {
    const qs = (Array.isArray(data.questions) ? data.questions : []).filter(q => q && q.q && q.answer);
    if (!qs.length) throw fail('INVALID', 'No recall questions came back.');
    return { questions: qs.map(q => Object.assign({}, q, { marks: num(q.marks, 2) })) };
  }
});

def('chapterDone.recapGrade', {
  title: 'Grade one recall answer', tokens: 500, temperature: 0.2,
  needs: ['question', 'answer'],   // question: { q, answer, marks }
  build(c, p) {
    return {
      system: '',
      user: `Grade this ${p.exam} answer. Use encouraging "and" language, never "but".
Question: ${c.question.q} (${c.question.marks} marks)
Model answer: ${c.question.answer}
Student answer: ${c.answer}
Return ONLY JSON: {"marks": <0 to ${c.question.marks}>, "feedback": "encouraging feedback", "steps": ["Step 1: ...", "Step 2: ..."]}`
    };
  },
  validate(data, c) { return Object.assign({}, data, { marks: clamp(num(data.marks, 0), 0, num(c.question.marks, 2)) }); }
});
