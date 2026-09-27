/* Tune the model + call behavior here — nothing else in the AI logic should need touching
   for a model swap, a token-budget change, or different retry behavior. */
export const SETTINGS = {
  model: 'openai/gpt-oss-120b',
  endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  temperature: 0.4,     // per-feature override: add `temperature` to a feature's def()
  minGapMs: 1100,       // spacing between calls (avoids free-tier 429 bursts)
  maxWaitMs: 65000,     // longest we ever sleep on a Retry-After — was 8000, too short to clear a
                        // real per-minute token-budget 429 (a 60s rolling window), which just
                        // retried straight back into the same still-active limit
  extraRetries: 1       // attempts beyond one-per-key. The app today only does this for chapter notes;
                        // here EVERY feature gets it (and a single-key user gets a 2nd attempt).
};

/* Injected by the app (or by the test page). Defaults work in a normal browser.
   Swap any of these via ApexAI.configure({ deps: {...} }) — most useful for tests
   (fake fetch/sleep/now) and for the app supplying its own getKeys()/onNoKey(). */
export const deps = {
  getKeys: () => {
    try { return [localStorage.getItem('groqApiKey'), localStorage.getItem('groqApiKey2')].filter(Boolean); }
    catch (e) { return []; }
  },
  fetch: (...a) => globalThis.fetch(...a),
  sleep: (ms) => new Promise(r => setTimeout(r, ms)),
  now: () => Date.now(),
  parseJson: null,        // default: core/parse-json.js's repair parser (same rules as apexParseAiJson)
  onNoKey: null,          // e.g. () => alert('Please set your Groq API key first')
  executeTool: null,      // (name, args, ctx) => result — only called for a feature that declares
                          // `tools:` in its def(); a feature with `tools` but no configured
                          // executor gets a safe { error: '...' } tool result, never a crash
  log: () => {}
};

export function configure(o) {
  if (!o) return;
  if (o.settings) Object.assign(SETTINGS, o.settings);
  if (o.deps) Object.assign(deps, o.deps);
}
