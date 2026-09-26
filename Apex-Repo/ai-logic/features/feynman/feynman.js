/* Section E — Feynman-teach: the STUDENT explains a concept, the AI plays a curious learner
   and asks questions to surface the gaps in the student's own understanding. This is the
   opposite direction from features/socratic/ (where the AI leads and asks the questions) —
   both are real, separate modes; keep them separate rather than merging. */
import { def } from '../../core/registry.js';
import { fail } from '../../core/errors.js';
import { GET_PAST_MISTAKES_TOOL } from '../../core/prompts.js';

def('feynman.start', {
  title: 'Feynman: the AI "student" opens the session', tokens: 200, parse: 'text',
  needs: ['subject', 'topic'],
  tools: [GET_PAST_MISTAKES_TOOL],
  build(c, p) {
    return {
      system: `You are a curious student about to be taught "${c.topic}" (${c.subject}) by a friend, Feynman-technique style. ${p.scope(c.subject)} If this topic plausibly has a mistake history worth knowing about, you may call get_past_mistakes(subject="${c.subject}", chapter="${c.topic}") once before opening, so your questions later in the session can quietly probe where they've actually struggled before — skip it if there's no reason to expect useful history. Open with ONE short, friendly line inviting them to start explaining, in your own words as an engaged student — no more than 2 sentences. Your final reply must be ONLY that opening line, never the tool result or any commentary about it.`,
      user: 'Start the conversation.'
    };
  }
});

def('feynman.reply', {
  title: 'Feynman: the AI "student" responds to the explanation', tokens: 250, parse: 'text',
  needs: ['subject', 'topic', 'messages'],
  build(c, p) {
    const system = `You are a curious student being taught "${c.topic}" (${c.subject}) by a friend using the Feynman Technique — they explain it in their own words, and your job is to help THEM find the gaps in their own understanding, not to teach them yourself.
Play an engaged, slightly-confused student: ask a clarifying question when something is vague or skipped over, point out a specific spot that didn't make sense (e.g. "wait, why does that happen then?"), or ask them to re-explain a part more simply. Never just confirm they're right, and never lecture them with the correct answer yourself — if they're genuinely stuck, give the smallest possible nudge as a question, not an explanation.
${p.scope(c.subject)}
Keep replies short and conversational (1-3 sentences) — this is a spoken back-and-forth, not an essay.`;
    return { system, user: c.messages.slice(-16).map(m => `${m.role === 'user' ? 'Teacher' : 'You (student)'}: ${m.text}`).join('\n') };
  }
});

def('feynman.end', {
  title: 'Feynman: summarise the session and rate understanding', tokens: 300,
  needs: ['subject', 'topic', 'messages'],
  build(c) {
    const transcript = c.messages.map(m => `${m.role === 'user' ? 'Teacher' : 'Student'}: ${m.text}`).join('\n');
    return {
      system: 'You are evaluating a Feynman-technique teaching session — a student explaining a concept to an AI playing a curious learner. Return ONLY JSON.',
      user: `Topic: ${c.topic} (${c.subject})\nTranscript:\n${transcript}\n\nReturn ONLY JSON: {"summary":"2-3 sentence summary of what they explained and how well it went","understanding":"strong, good, shaky, or weak"}`
    };
  },
  validate(data) {
    const ok = ['strong', 'good', 'shaky', 'weak'];
    const u = String(data.understanding || '').toLowerCase();
    return { summary: data.summary || '', understanding: ok.includes(u) ? u : '' };
  }
});
