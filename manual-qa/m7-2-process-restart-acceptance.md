# M7.2 Genuine Browser Process Restart Acceptance

Status: **PASS — Product Owner accepted; no issues found**

This checklist closes C2 only when Quiz Studio is exercised with synthetic data through a genuine full browser-process exit and a forced browser-process termination. Refresh-only testing does not count. Do not record private quiz content, personal data, local absolute paths, or sensitive screenshots.

## Evidence metadata

- Tester code: Product Owner
- Date: 2026-08-22
- OS: Not supplied
- Browser and exact version: Google Chrome 151.0.7922.173 (Official Build) (64-bit)
- Quiz Studio commit: Not supplied
- Local launch method: Returned to `http://localhost:8000` after reopening Chrome
- Normal restart method (how every browser process was confirmed closed): Complete browser close, reopen Chrome, and return to Quiz Studio
- Forced termination method: Forced Chrome process termination, reopen Chrome, and continue the detected unfinished session

For every row below record: expected state, observed recovered state, restart method, and PASS/FAIL.

## 1. Objective Quiz — instant feedback

1. Start a synthetic multi-question quiz in `instant` mode.
2. Answer at least one question, leave another unanswered, advance to a non-first question, and retain visible graded feedback for an earlier submitted answer.
3. Close the browser completely, reopen it, return to the same Paper, and verify question index, answered/unanswered state, results, and feedback.
4. Repeat from a newly changed in-progress state using forced browser-process termination.
5. Complete the session, restart the browser, and verify the completed active session is not offered or restored.

Result: PASS

## 2. Objective Quiz — submit at end

1. Start a synthetic multi-question quiz in `submitAtEnd` mode.
2. Enter multiple answers, leave at least one unanswered, and stop on a non-first question. Confirm no grading/result leakage appears before final submission.
3. Execute complete close/reopen, then forced termination/reopen; after each, verify mode, current index, answers, unanswered state, and absence of pre-submit feedback.
4. Cancel the final-submit confirmation once and verify the active state remains unchanged.
5. Complete the session, restart, and verify completed-session cleanup.

Result: PASS

## 3. Translation Practice — normal provenance

1. Start a synthetic Translation Document with at least three items.
2. Enter multiple answers; move to a non-first item; reveal a reference; add a span annotation; add a whole-item mark.
3. Execute complete close/reopen and verify every listed state exactly.
4. Change one state, force-terminate the browser, reopen, and verify the latest persisted state.
5. Cancel an explicit discard/overwrite prompt and verify no state changes; then confirm discard and verify the old active session does not return.
6. Complete another session, restart, and verify completed-session cleanup.

Result: PASS

## 4. Translation Practice — retry and remediation provenance

1. From synthetic finalized evidence, start a retry session and record its source response/material identifiers.
2. Add multiple answers, a non-first index, reveal state, span annotation, and whole-item mark; complete close/reopen and then forced termination/reopen. Verify working state and retry provenance after each.
3. From a synthetic Teacher Review, start remediation practice and record source response/review/material identifiers.
4. Repeat both restart methods and verify working state plus remediation provenance after each.
5. Verify explicit discard and completed-session cleanup for both provenance paths.

Retry result: PASS

Remediation result: PASS

## 5. Storage isolation

1. Leave one Objective and one Translation session in progress under their separate workflows.
2. Discard or complete only the Objective session and verify Translation recovery remains intact after process restart.
3. Recreate Objective progress, then discard or complete only Translation and verify Objective recovery remains intact.

Result: PASS

## Final acceptance

- Normal full-process close/reopen: PASS
- Forced process termination/reopen: PASS
- Objective `instant`: PASS
- Objective `submitAtEnd`: PASS
- Translation normal: PASS
- Translation retry: PASS
- Translation remediation: PASS
- Discard/cancellation semantics: PASS
- Completed-session cleanup: PASS
- Objective/Translation key isolation: PASS
- Overall C2 Human Gate: **PASS**

Acceptance note: The Product Owner reported that normal complete browser close/reopen restored in-progress state, forced Chrome termination/reopen detected the unfinished session and offered continuation, continuation restored the prior state, and all corresponding scoped C2 recovery scenarios passed with no observed defects. This was genuine browser-process restart evidence, not refresh-only testing. No screenshots or additional per-scenario evidence were supplied or added.
