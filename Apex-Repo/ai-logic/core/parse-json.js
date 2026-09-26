/* Tolerant JSON parser for model output — same repair steps as apexParseAiJson in the app
   (fences, stray prose, missing/trailing commas, "<placeholder>" values, truncation). */
import { fail } from './errors.js';

export function builtinParseJson(raw) {
  if (raw == null) throw fail('BAD_JSON', 'empty AI response');
  let s = String(raw).replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = s.indexOf('{');
  if (start === -1) throw fail('BAD_JSON', 'no JSON object in AI response');
  s = s.slice(start);
  const scan = (str, stopAtClose) => {
    const stack = []; let end = -1, inStr = false, esc = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ']') { stack.pop(); if (!stack.length) { end = i; if (stopAtClose) break; } }
    }
    return { stack, end };
  };
  const { end } = scan(s, true);
  const repair = (x) => x
    .replace(/:\s*<[^">\n]*>/g, ': null')
    .replace(/(\})(\s*)(\{)/g, '$1,$2$3')
    .replace(/(\])(\s*)(\[)/g, '$1,$2$3')
    .replace(/,(\s*[}\]])/g, '$1');
  const candidates = [];
  if (end !== -1) {
    const body = s.slice(0, end + 1);
    candidates.push(body, repair(body));
  } else {
    const closersFor = (str) => scan(str, false).stack.slice().reverse().map(ch => (ch === '{' ? '}' : ']')).join('');
    const lastClose = s.lastIndexOf('}');
    const trimmed = lastClose > 0 ? s.slice(0, lastClose + 1) : s;
    candidates.push(repair(trimmed) + closersFor(repair(trimmed)), trimmed + closersFor(trimmed), repair(s) + closersFor(repair(s)));
    const stripDangling = (str) => str
      .replace(/,?\s*"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*$/, '')
      .replace(/,?\s*"(?:[^"\\]|\\.)*"\s*:\s*$/, '');
    const stripped = stripDangling(repair(s));
    if (stripped.length < repair(s).length) candidates.push(stripped + closersFor(stripped));
  }
  for (const c of candidates) { try { return JSON.parse(c); } catch (e) { /* next */ } }
  throw fail('BAD_JSON', 'the AI returned malformed JSON — try again');
}
