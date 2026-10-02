// The thin DOM binding of the Typing session's event model (ADR 0004 section 8.5). It maps what the user agent reports
// to the plain event records `TypingSession.input` understands and applies the verdict back to the element; it holds no
// policy of its own. `isTrusted` is the user agent's own mark: script-dispatched events and the application's own
// programmatic changes to the element are never trusted events, so they cannot enter the committed-text channel.
// No layout, focus or scrolling concerns live here (long-text UI is a later milestone).

const TYPES = ['beforeinput', 'input', 'compositionstart', 'compositionupdate', 'compositionend', 'paste', 'drop'];

/** DOM event -> event-model record. `beforeinput` is only observed, never committed from. */
export function toModelEvent(e) {
  return {
    type: e.type,
    isTrusted: e.isTrusted === true,
    inputType: e.inputType,
    isComposing: e.isComposing,
    value: e.type === 'compositionend' || e.type === 'compositionupdate' || e.type === 'input' ? e.target?.value : undefined,
  };
}

/**
 * Wire `element` to `session`. Returns an unbind function. A rejected input (paste/drop, a disallowed correction)
 * reverts the element to the committed text and cancels the default action of the paste/drop itself.
 */
export function bindTypingInput(element, session) {
  const handler = (e) => {
    if (e.type === 'beforeinput') return; // nothing is committed before the user agent applies the change
    const verdict = session.input(toModelEvent(e));
    if (!verdict.accepted && verdict.reason === 'paste-drop' && typeof e.preventDefault === 'function') e.preventDefault();
    if (!verdict.accepted && typeof verdict.revertTo === 'string' && element.value !== verdict.revertTo) element.value = verdict.revertTo;
  };
  for (const t of TYPES) element.addEventListener(t, handler);
  return () => { for (const t of TYPES) element.removeEventListener(t, handler); };
}
