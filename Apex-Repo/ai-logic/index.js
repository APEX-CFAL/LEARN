/* =====================================================================
   APEX AI — entry point. Loads every section below and hands back one object, ApexAI.
   ---------------------------------------------------------------------
   Status: standalone (not wired into Apex_v100.html yet). See app plans/AI-Logic-Map.md
   for what each feature does in the LIVE app today, and app plans/CLAUDE.md for the dated
   integration notes.

   WHERE EVERYTHING LIVES
     core/            settings, IGCSE-vs-JEE/NEET wording, shared prompt text, the engine
                       (call/run/preview), the feature registry. You basically never touch
                       this unless you're changing HOW calls work, not WHAT they say.
     features/<name>/ one folder per app section (plan, notes, practice, quiz, chat, feynman,
                       socratic, insights, chapter-completion, papers, system). Each file
                       registers its features as a side effect of being imported below —
                       that's the ONLY thing this index.js needs to know about a new file.
     mastery/         mistake tracking + strengths/weaknesses. Pure logic, no AI call — the
                       app calls these functions directly (ApexAI.mastery.*), not via run().

   ADDING A NEW AI FEATURE (the workflow the user asked for)
     1. Pick the file it belongs in (or start a new folder under features/ if it's a genuinely
        new section of the app — e.g. features/<newSection>/<newSection>.js).
     2. In that file: import { def } from '<path to>/core/registry.js', then
        def('<section>.<name>', { title, tokens, needs, build(c,p){...}, validate?(...) }).
     3. Add one import line for that file below (if it's a new file — existing files need no
        change). That's it — ApexAI.run('<section>.<name>', ctx) works everywhere the moment
        this index.js is loaded.
     4. Add a sample ctx for it in apex-ai-test.html's sample() function and reload the test
        page — the self-tests find it automatically via ApexAI.list().

   HOW TO USE (once wired into the app)
     <script type="module" src="apex sub apps/ai-logic/index.js"></script>
     const out = await ApexAI.run('practice.grade', { student, question, answer });
     out.data      parsed JSON (or trimmed text for parse:'text' features)
     out.warnings  things the checker had to fix or drop (empty = clean)
     ApexAI.preview('practice.grade', ctx)   -> { system, user, tokens }, no API call
     ApexAI.mastery.logMistake(log, entry)    -> { log, added, entry }
   ===================================================================== */

// -- core --
import { SETTINGS, deps, configure } from './core/settings.js';
import { programOf } from './core/program.js';
import { FEATURES, RETIRED, list } from './core/registry.js';
import { builtinParseJson } from './core/parse-json.js';
import { call, preview, run } from './core/engine.js';

// -- features (each import registers that file's features as a side effect) --
import './features/plan/plan.js';
import './features/notes/notes.js';
import './features/practice/practice.js';
import './features/quiz/quiz.js';
import './features/chat/chat.js';
import './features/feynman/feynman.js';
import './features/socratic/socratic.js';
import './features/insights/insight.js';
import './features/chapter-completion/chapterDone.js';
import './features/papers/paper.js';
import './features/system/system.js';

// -- mastery (pure logic, not run() features) --
import * as mastery from './mastery/mistakes.js';

const api = {
  run, preview, call, list, configure,
  parseJson: builtinParseJson, program: programOf,
  SETTINGS, RETIRED, mastery,
  _FEATURES: FEATURES   // test-page / debugging use only — features/* files are the source of truth
};

const root = typeof window !== 'undefined' ? window : globalThis;
root.ApexAI = api;
export default api;
export { run, preview, call, list, configure, builtinParseJson as parseJson, programOf as program, SETTINGS, RETIRED, mastery };
