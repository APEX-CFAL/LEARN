/* Section E — Ask AI and the floating voice/chat companion. See features/feynman/ (student
   teaches the AI) and features/socratic/ (AI leads a revision session) for the other two
   conversational modes. */
import { def } from '../../core/registry.js';
import { subjectNames, clip } from '../../core/prompts.js';

def('chat.askCoach', {
  title: 'Ask AI (Home page and Daily Log page share this)', tokens: 1000, parse: 'text',
  needs: ['question'],
  build(c, p) {
    const st = c.student || {};
    const mood = c.recentMood ? ` Recent mood: ${c.recentMood}.` : '';
    return {
      system: "You are the AI study coach inside " + p.app + ". Answer the student's question about their study plan, subjects, or study strategies. Be encouraging, specific, and brief (under 150 words)." + mood + " Subjects: " + subjectNames(c) + ". Exam: " + (st.examDate || 'date not set') + ".",
      user: "Student asks: " + c.question + "\n\nToday's plan: " + clip(c.plan || 'no plan generated', c.planChars || 800)
    };
  }
});

def('chat.voice', {
  title: "Voice / chat companion (floating widget)", tokens: 400, parse: 'text',
  needs: ['messages'],   // [{role:'user'|'ai', text}]
  build(c, p) {
    const groundLabel = p.jee ? 'NCERT-based JEE/NEET scope' : 'Cambridge IGCSE scope';
    const system = `You are Apex's AI study companion, a quick voice/chat aside inside the app. Talk like a sharp, direct tutor — clear and warm, but no filler, no hedging, get straight to the point, like you're speaking out loud rather than writing an essay. Short sentences, plain language, no markdown headers or heavy bullet formatting.

Stay strictly on the student's studies: their subjects, chapters, exam prep, or how to use Apex itself. If they ask about something that has nothing to do with their studying, briefly and kindly redirect them back to their subjects instead of answering it.

Ground every answer in ${groundLabel} for: ${subjectNames(c) || 'their subjects'}. Be CONCISE (this may be read aloud or shown as a chat bubble): 2-4 short sentences unless they explicitly ask for a full explanation or worked example.`;
    return { system, user: c.messages.slice(-8).map(m => `${m.role === 'user' ? 'Student' : 'You'}: ${m.text}`).join('\n') };
  }
});
