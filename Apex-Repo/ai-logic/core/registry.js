/* The list every feature file registers itself into. This file never grows when you add a
   feature — you add a file under features/<section>/ instead and import it once from index.js.

   `def('group.name', spec)` spec shape:
     { title, tokens, parse, needs, temperature, build(c,p) -> {system,user}, validate?(data,c,warnings) }
   `external:true` = still lives in Apex_v100.html, not liftable as a pure prompt yet — kept in
   the registry so `ApexAI.list()` stays the complete map; run() on one throws EXTERNAL. */
import { fail } from './errors.js';

export const FEATURES = {};

export function def(id, spec) {
  FEATURES[id] = Object.assign({ id, group: id.split('.')[0], parse: 'json', needs: [], temperature: null }, spec);
}

export function getFeature(id) {
  const f = FEATURES[id];
  if (!f) throw fail('UNKNOWN_FEATURE', `Unknown AI feature "${id}". See ApexAI.list().`);
  return f;
}

/* group key -> letter, matching app plans/AI-Logic-Map.md's A-H lettering (S = system,
   M = new mastery/mistake-tracking logic, socratic joins chat/feynman under E — all three are
   "the AI talking with the student", not generation/grading). */
export const GROUP_LETTER = {
  plan: 'A', notes: 'B', practice: 'C', quiz: 'D',
  chat: 'E', feynman: 'E', socratic: 'E',
  insight: 'F', chapterDone: 'G', paper: 'H', system: 'S'
};

export function list() {
  return Object.values(FEATURES).map(f => ({
    id: f.id, group: GROUP_LETTER[f.group] || '?', title: f.title, external: !!f.external, auto: !!f.auto,
    tokens: typeof f.tokens === 'function' ? 'varies' : f.tokens, parse: f.parse, needs: f.needs
  }));
}

/* Deliberately NOT carried over from the old app (dead code — see AI-Logic-Map.md §9 item 9). */
export const RETIRED = [
  { id: 'generateChapterQuestions', why: 'Legacy chapter Questions tab: writes questions_* but renders from aiQ_* which nothing writes. Practice (practice.batch) replaced it.' },
  { id: 'cachedGroq',               why: 'No callers anywhere in the app.' },
  { id: 'practiceQ_ cache',         why: 'Read at practice start but never written.' },
  { id: 'getApiKey() rotation',     why: 'Only used by the settings screen; callGroq never used it. call() always tries key 1 then key 2.' },
  { id: 'apexGetAiRules*/apexGetChapters*', why: 'Seeded in Firebase, never read by any prompt. Wire in deliberately (via ctx) if wanted.' }
];
