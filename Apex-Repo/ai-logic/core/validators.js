/* Small helpers most `validate()` functions need. */
import { fail } from './errors.js';

export const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* Drops malformed questions instead of letting them crash the quiz screen mid-question.
   Shared by every question-generating feature (practice, quiz, chaos, mistake quiz). */
export function checkQuestions(data, c, warnings) {
  const list = Array.isArray(data && data.questions) ? data.questions : [];
  const good = list.filter((q, i) => {
    if (!q || typeof q.q !== 'string' || !q.q.trim()) { warnings.push(`question ${i + 1}: no text — dropped`); return false; }
    if (typeof q.answer !== 'string' || !q.answer.trim()) { warnings.push(`question ${i + 1}: no model answer — dropped`); return false; }
    if (q.type === 'mcq') {
      const okOpts = Array.isArray(q.options) && q.options.length === 4;
      const okIdx = Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex <= 3;
      if (!okOpts || !okIdx) { warnings.push(`question ${i + 1}: bad MCQ options/correctIndex — dropped`); return false; }
    }
    if (q.type === 'numerical' && !Number.isFinite(Number(q.correctValue))) { warnings.push(`question ${i + 1}: numerical without correctValue — dropped`); return false; }
    return true;
  });
  if (!good.length) throw fail('INVALID', 'The AI returned no usable questions.');
  return { questions: good };
}
