/* The part that actually leaves the app: one queued, retried, key-failover-ed call() to Groq,
   and run() = build the feature's prompt -> call() -> parse -> validate.

   Error codes a caller might branch on (e.code):
     NO_API_KEY    — no groqApiKey/groqApiKey2 set
     API_ERROR     — the model API failed after retries (e.message has the status/body)
     BAD_JSON      — parse:'json' feature, reply had no recoverable JSON
     INVALID       — parsed fine, but validate() rejected the content (e.g. no usable questions)
     MISSING_INPUT — ctx is missing one of the feature's `needs`
     UNKNOWN_FEATURE / EXTERNAL — registry.js */
import { fail } from './errors.js';
import { SETTINGS, deps } from './settings.js';
import { programOf } from './program.js';
import { getFeature } from './registry.js';
import { builtinParseJson } from './parse-json.js';

let _queue = Promise.resolve();
let _lastAt = 0;
const retryable = (e) => e && (e.status === 429 || e.status === 413 || e.status >= 500 || e.network);

// once/attempt/callTurn all speak in `messages` arrays + an optional `tools` array (OpenAI-style
// function-calling schema) and hand back the FULL assistant message object, not just its text —
// callTurn's caller needs to see `.tool_calls` when present. `call()` below is the pre-tool-calling
// API, kept as a thin wrapper so every existing feature is completely unaffected.
async function once(key, messages, maxTokens, temperature, tools) {
  let res;
  try {
    res = await deps.fetch(SETTINGS.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify(Object.assign({
        model: SETTINGS.model,
        messages,
        max_tokens: maxTokens,
        temperature
      }, (tools && tools.length) ? { tools, tool_choice: 'auto' } : {}))
    });
  } catch (err) { throw { network: true, body: String(err && err.message || err) }; }
  if (!res.ok) {
    const body = await res.text();
    // Groq's 429 responses put the actual suggested wait inside the error message text itself
    // ("...Please try again in 8.66s") rather than a standard Retry-After header, which this app
    // never read — every 429 fell straight to the (much shorter) hardcoded fallback wait no
    // matter what Groq actually asked for, defeating the point of waiting for a per-minute
    // budget to clear. Header still wins if a gateway ever does send one.
    const headerWait = parseFloat(res.headers && res.headers.get && res.headers.get('retry-after')) || 0;
    const bodyMatch = body.match(/try again in ([\d.]+)s/i);
    const bodyWait = bodyMatch ? parseFloat(bodyMatch[1]) : 0;
    throw { status: res.status, body, retryAfter: headerWait || bodyWait || 0 };
  }
  const json = await res.json();
  return json.choices[0].message;
}

async function attempt(keys, messages, maxTokens, temperature, tools) {
  const tries = keys.length + SETTINGS.extraRetries;   // 2 keys -> key1, key2, key1 (as the app does today)
  let last;
  for (let i = 0; i < tries; i++) {
    const key = keys[i % keys.length];
    try { return await once(key, messages, maxTokens, temperature, tools); }
    catch (e) {
      last = e;
      if (!retryable(e) || i === tries - 1) break;
      // A 429 here means the account's whole per-minute token budget is spent, not a quick
      // hiccup — the old 2-3s default (meant for a transient 502/503) just retried straight back
      // into the same still-active window, producing the exact 429-after-429 cascade seen in
      // real usage. Groq's own Retry-After header is trusted first regardless; this only changes
      // the guess when it's missing.
      const fallbackWaitS = e.status === 429 ? 15 : (i === 0 ? 2 : 3);
      await deps.sleep(Math.min((e.retryAfter || fallbackWaitS) * 1000, SETTINGS.maxWaitMs));
    }
  }
  throw fail('API_ERROR', 'Groq API error: ' + ((last && (last.status || '')) + ' ' + ((last && (last.body || last.message)) || '')).trim().slice(0, 170));
}

/* Queued/retried/key-failover-ed single turn — returns the full assistant message (so a
   tool-calling caller can inspect .tool_calls), not just its text. */
function callTurn(messages, maxTokens, temperature, tools) {
  const keys = deps.getKeys();
  if (!keys.length) {
    if (deps.onNoKey) { try { deps.onNoKey(); } catch (e) { /* ignore */ } }
    return Promise.reject(fail('NO_API_KEY', 'No API key'));
  }
  const temp = temperature == null ? SETTINGS.temperature : temperature;
  const run = _queue.then(async () => {
    const wait = SETTINGS.minGapMs - (deps.now() - _lastAt);
    if (wait > 0) await deps.sleep(wait);
    return attempt(keys, messages, maxTokens == null ? 4096 : maxTokens, temp, tools);
  });
  _queue = run.then(() => { _lastAt = deps.now(); }, () => { _lastAt = deps.now(); });
  return run;
}

/* The one place any prompt leaves the app, pre-tool-calling shape. Drop-in for the app's old
   callGroq(system, user, maxTokens) — unchanged signature and return type (a content string). */
export async function call(system, user, maxTokens, temperature) {
  const messages = system ? [{ role: 'system', content: system }, { role: 'user', content: user }] : [{ role: 'user', content: user }];
  const message = await callTurn(messages, maxTokens, temperature);
  return message.content;
}

function prepare(id, ctx) {
  const f = getFeature(id);
  if (f.external) throw fail('EXTERNAL', `"${id}" still runs inside Apex_v100.html (${f.where || 'see registry'}) — not liftable as a pure prompt yet.`);
  const c = ctx || {};
  const missing = (f.needs || []).filter(k => c[k] === undefined || c[k] === null || c[k] === '');
  if (missing.length) throw fail('MISSING_INPUT', `${id} is missing: ${missing.join(', ')}`);
  const p = programOf(c);
  const built = f.build(c, p);
  const tokens = typeof f.tokens === 'function' ? f.tokens(c) : f.tokens;
  return { f, c, p, system: built.system, user: built.user, tokens };
}

/* Prompts + budget only. No API call. Use it to read and refine a prompt. */
export function preview(id, ctx) {
  const x = prepare(id, ctx);
  return { id, program: x.p.id, tokens: x.tokens, system: x.system, user: x.user };
}

async function attemptRun(x) {
  let messages = x.system ? [{ role: 'system', content: x.system }, { role: 'user', content: x.user }] : [{ role: 'user', content: x.user }];
  let message = await callTurn(messages, x.tokens, x.f.temperature, x.f.tools);

  // Tool-calling: at most ONE ask-then-answer round trip, never an open-ended agent loop — a
  // feature opts in with `tools: [...]` in its def(); everything without it never sees this
  // branch (message.tool_calls is only ever present when we sent `tools` in the first place).
  if (message.tool_calls && message.tool_calls.length) {
    messages = messages.concat([{ role: 'assistant', content: message.content || null, tool_calls: message.tool_calls }]);
    for (const tc of message.tool_calls) {
      let args = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch (e) { /* malformed args -> {} */ }
      let result;
      try {
        result = deps.executeTool ? await deps.executeTool(tc.function.name, args, x.c) : { error: 'no tool executor configured' };
      } catch (e) { result = { error: String(e && e.message || e) }; }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }
    message = await callTurn(messages, x.tokens, x.f.temperature, x.f.tools);
  }

  const raw = message.content;
  const warnings = [];
  let data;
  if (x.f.parse === 'text') {
    data = String(raw == null ? '' : raw).trim();
    if (!data) throw fail('INVALID', 'The AI returned an empty reply.');
  } else {
    data = (deps.parseJson || builtinParseJson)(raw);
    if (x.f.validate) data = x.f.validate(data, x.c, warnings);
  }
  return { id: x.id, data, raw, warnings };
}

export async function run(id, ctx) {
  const x = prepare(id, ctx);
  x.id = id;
  // A reply that comes back 200 OK but isn't usable — no JSON object at all, or one that fails
  // the feature's own validate() (e.g. "no sessions") — is usually a one-off model slip, not a
  // sign the request itself is broken; retryable() above only covers network/429/5xx for the raw
  // HTTP call, so this is the equivalent one extra try for a bad-content response, before it
  // reaches the caller as a real failure.
  try {
    return await attemptRun(x);
  } catch (e) {
    if (e && (e.code === 'BAD_JSON' || e.code === 'INVALID')) {
      return await attemptRun(x);
    }
    throw e;
  }
}
