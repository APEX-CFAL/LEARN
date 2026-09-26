/* Section F — small, cheap insights. The app caches each of these once per day (in
   trackingData.logInsight / .metricsInsight / .subjectTips) — that caching stays app-side,
   this file only owns the prompt. */
import { def } from '../../core/registry.js';

def('insight.log', {
  title: 'Daily Log insight from the last few mood/workload check-ins', tokens: 120, parse: 'text', auto: true,
  needs: ['logs'],   // [{date, mood, workload}] newest first. JOURNAL TEXT MUST NEVER BE PASSED IN.
  build(c) {
    return {
      system: "You are a direct, encouraging study coach. Given a student's last few daily check-ins (mood and workload only — journal text is private and never shared), write ONE short sentence (max 30 words) noticing a real pattern (a recurring low mood, a workload trend) and suggest one concrete adjustment. No greeting, no filler, just the sentence.",
      user: c.logs.slice(0, 7).map(l => `${l.date}: mood=${l.mood || '—'}, workload=${l.workload || '—'}`).join('\n')
    };
  }
});

def('insight.metrics', {
  title: 'Metrics page insight about the weakest subject', tokens: 100, parse: 'text', auto: true,
  needs: ['weakest', 'avgHours'],   // weakest: {label, pct}
  build(c) {
    return {
      system: "You are a direct, encouraging study coach. In ONE sentence (max 35 words), name the student's weakest subject and mastery %, and suggest a focused recap session for tomorrow's plan. Phrase the ending as a short question offering to add it.",
      user: `Weakest subject: ${c.weakest.label} at ${c.weakest.pct}% mastery. This week's avg study hours: ${Number(c.avgHours).toFixed(1)}h/day.`
    };
  }
});

def('insight.subjectTip', {
  title: 'One-line next step for a subject at its mastery %', tokens: 80, parse: 'text', auto: true,
  needs: ['subject', 'pct'],
  build(c) {
    return {
      system: "You are a direct study coach. Given a subject and the student's current mastery %, write ONE short, concrete sentence (max 25 words) on what to do next with it.",
      user: `${c.subject}: ${c.pct}% mastery`
    };
  }
});
