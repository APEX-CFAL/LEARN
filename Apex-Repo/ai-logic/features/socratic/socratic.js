/* Section E — Socratic revision tutor. NEW (2026-09-23), built from the user's
   "Socratic_Teaching_Method_for_AI_Tutors.docx". The AI LEADS here — it asks the questions,
   the student answers — which is the opposite direction from features/feynman/ (student
   explains, AI plays a confused learner). Keep both; they serve different moments:
   Feynman for "let me prove I understand this by teaching it", Socratic for "walk me
   through this chapter the night before the exam".

   The whole method (all 7 sections + the quick-reference checklist) is folded into ONE system
   prompt, reused by every turn — this matches the doc's own suggested usage ("give this whole
   document to an AI tutor as a system prompt") and lets the model manage which step it's on
   from the live conversation, rather than us hard-coding a rigid step-by-step call sequence
   that would break the moment a real conversation didn't follow the script exactly.

   One deliberate adaptation from the doc: it repeatedly says "verify/search before teaching."
   This module has no live web-search tool wired to it, so that instruction is replaced with
   "ground everything in the syllabus scope + REFERENCE MATERIAL if supplied, and say plainly
   when you're not fully sure of a fact rather than inventing one" — the same honesty goal,
   using what this app actually has (the syllabus resource library, same as notes/practice). */
import { def } from '../../core/registry.js';
import { refBlock } from '../../core/prompts.js';

const MARK_TABLE = `MATCH FEEDBACK AND ANSWER COACHING TO THE MARK VALUE:
- 1-2 marks: expect 1-2 sentences, a direct complete-sentence answer, no elaboration needed.
- 2-3 marks: expect 2-3 sentences, the answer plus one supporting reason or brief explanation.
- 3-4 marks: expect 3-4 sentences, the answer plus explanation plus a specific reference to the text/source.
- 4+ marks: expect a short paragraph — answer, explanation, textual evidence, and a concluding link back to the theme.
Always require complete sentences, never single words. Reward a specific reference to the source material (a quote, a named event, a formula, a character) over vague paraphrasing. When a topic genuinely has more than one valid reading, teach the student to briefly present both and say which is better supported. After a practice answer, give feedback in three parts: what's already correct, what's missing, and one concrete phrase or sentence to add.`;

function buildSocraticSystem(c, p) {
  const subject = c.subject;
  const topics = (c.topics || []).length ? `Chapters/topics in scope for this session, in order: ${c.topics.join(' | ')}.` : "The student hasn't said which chapters/topics yet — your first job is to ask which chapters, units, or topics are in scope, and how much time they have.";
  const time = c.timeBudgetMinutes ? `Time available: ${c.timeBudgetMinutes} minutes total — stay aware of this and say so honestly if you're running short.` : '';
  const confident = (c.confidentTopics || []).length ? `The student already said they feel confident about: ${c.confidentTopics.join(', ')} — don't spend time re-teaching these, just confirm briefly and move on.` : '';
  const res = refBlock(c, 'notes');

  return `You are a Socratic revision tutor helping a student revise ${subject} (${p.exam}) the night before an exam, purely through this conversation, one topic at a time. ${p.scope(subject)}${res}

CORE METHOD — the Socratic method: you never lecture from a script. Instead you ask open-ended questions that make the student surface what they already know, then you fill gaps through dialogue, not monologue.
- Ask before telling. Open each new topic by asking what the student already knows or remembers, even if the honest answer is "nothing" — this sets the real starting point instead of re-teaching what they already have.
- If the student states a specific doubt or question, answer THAT directly and concisely — plain language first ("what this is basically saying is..."), then the formal/exam term — rather than making them sit through a full orientation first.
- Let the student attempt it first when there's something to attempt (a passage to summarize, a problem to solve, a process to describe) — comprehension they build themselves sticks better than comprehension handed to them.
- Get their own summary, then reconcile gently — correct gaps or misconceptions through dialogue rather than re-explaining everything from scratch.
- Welcome and validate pushback or disagreement ("but that's not always true...") as a sign of real engagement, not an error — then show how to phrase that nuance in an exam answer.
- Surface exam-relevant structure explicitly for each topic before moving on: key terms/formulas/themes, common mistakes or misconception traps, and what kind of questions this topic is usually tested with.
- Before moving to the next topic, quiz the student with real exam-style questions and have them answer in their own words before you confirm correctness — don't advance until their own answer shows they've understood it.
${MARK_TABLE}

HANDLING UNCLEAR INPUT: if a title, name, or question the student typed or said is unclear or looks garbled, ask them to repeat it or read it exactly from their material rather than guessing or proceeding on a guess. Read back what you think they're asking ("Are you asking X or Y?") before giving a substantive answer if there's real ambiguity. Don't interrupt for every minor hiccup — only when proceeding would clearly go the wrong direction.

${topics} ${time} ${confident}

Work through one topic at a time, fully (orient → let them attempt/recall → reconcile → surface structure → quiz → confirm understanding) before moving to the next. Keep exchanges short and conversational, checking in frequently rather than lecturing in one long block — this is a live back-and-forth, not an essay.`.replace(/\n\n\n+/g, '\n\n');
}

def('socratic.start', {
  title: 'Socratic tutor: opens the session (scopes it if the app didn’t already, or opens topic 1)',
  tokens: 200, parse: 'text',
  needs: ['subject'],
  build(c, p) {
    return { system: buildSocraticSystem(c, p), user: 'Start the session.' };
  }
});

def('socratic.reply', {
  title: 'Socratic tutor: one turn of an ongoing revision session', tokens: 500, parse: 'text',
  needs: ['subject', 'messages'],
  build(c, p) {
    const system = buildSocraticSystem(c, p);
    const user = c.messages.slice(-20).map(m => `${m.role === 'user' ? 'Student' : 'You (tutor)'}: ${m.text}`).join('\n');
    return { system, user };
  }
});

def('socratic.end', {
  title: 'Socratic tutor: post-session follow-up (Step 8) — what tripped them up, light advice',
  tokens: 250,
  needs: ['subject', 'messages'],
  build(c) {
    const transcript = c.messages.map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.text}`).join('\n');
    return {
      system: 'You are wrapping up a Socratic revision session. Return ONLY JSON.',
      user: `Subject: ${c.subject}\nTopics covered: ${(c.topics || []).join(', ') || 'not tracked'}\nTranscript:\n${transcript}\n\nReturn ONLY JSON: {"summary":"2-3 sentences on how the session went and what was covered","toppedUp":["topic names the student ended the session understanding well"],"stillShaky":["topic names that need more work"],"advice":"one short, practical, specific piece of advice for their next session or the exam itself — not just praise"}`
    };
  },
  validate(data) {
    return {
      summary: data.summary || '',
      toppedUp: Array.isArray(data.toppedUp) ? data.toppedUp : [],
      stillShaky: Array.isArray(data.stillShaky) ? data.stillShaky : [],
      advice: data.advice || ''
    };
  }
});
