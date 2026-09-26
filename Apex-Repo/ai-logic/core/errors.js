/* One tiny helper, its own file because almost every other file needs it.
   fail('CODE', 'message') -> an Error with e.code set, so callers can branch on e.code
   without parsing message text (see the CODE list in core/engine.js's header comment). */
export function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}
