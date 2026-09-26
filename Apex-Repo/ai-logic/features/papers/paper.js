/* Section H — past-paper marking and the exam-timetable extractor. */
import { def } from '../../core/registry.js';
import { fail } from '../../core/errors.js';
import { clip, subjectNames } from '../../core/prompts.js';

def('paper.mark', {
  title: 'Estimate a mark for typed past-paper answers', tokens: 2000, parse: 'text',
  needs: ['subject', 'paper', 'year', 'answers'],
  // The app's uploaded photo/PDF (markUploadedData) was never sent. If the app can turn the upload
  // into text (OCR / PDF text) pass it as c.uploadedText and it is included; otherwise say so in the UI.
  build(c, p) {
    const up = c.uploadedText ? `\n\nText read from the student's uploaded work:\n${clip(c.uploadedText, 6000)}` : '';
    return {
      system: `You are ${p.aExaminer}. Mark the student answers using ${p.jee ? 'JEE/NEET marking conventions (+4 correct, -1 wrong MCQ)' : 'Cambridge mark scheme methodology'}. Be specific about what earns and loses marks. Format your response clearly.`,
      user: `Subject: ${c.subject}\nPaper: ${c.paper}\nYear: ${c.year}\n\nStudent answers:\n${c.answers}${up}\n\nProvide marking feedback: estimated score, what was done well, what needs improvement, and specific ${p.jee ? 'JEE/NEET' : 'Cambridge mark scheme'} tips.`
    };
  }
});

def('paper.timetable', {
  title: 'Read exam dates from TEXT of a timetable (the model cannot see images)', tokens: 1000,
  // The app read the image to base64 but never sent it — the model only ever saw the sentence
  // "this is an image". This version refuses to guess: it needs real text (typed, pasted or OCR'd).
  needs: ['timetableText'],
  build(c) {
    return {
      system: 'You extract exam dates from timetable text. Return ONLY a JSON object mapping subject names to dates in YYYY-MM-DD format. If a subject or date is not clearly present in the text, leave that subject out — never guess.',
      user: `Exam timetable text:\n"""\n${clip(c.timetableText, 6000)}\n"""\nThe subjects this student takes are: ${subjectNames(c)}. Return ONLY JSON like: {"Physics": "2025-05-15", "Chemistry": "2025-05-20"}`
    };
  },
  validate(data, c, warnings) {
    const mine = ((c.student && c.student.subjects) || []).map(s => s.name);
    const out = {};
    Object.keys(data).forEach(k => {
      const d = String(data[k] || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d))) { warnings.push(`${k}: "${d}" is not a valid YYYY-MM-DD date — dropped`); return; }
      if (mine.length && !mine.includes(k)) { warnings.push(`${k}: not one of the student's subjects — dropped`); return; }
      out[k] = d;
    });
    if (!Object.keys(out).length) throw fail('INVALID', 'No valid exam dates found in that text.');
    return out;
  }
});
