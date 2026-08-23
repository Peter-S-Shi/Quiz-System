# M7.3 Final Product Hardening Human Acceptance

Status: **PENDING — Product Owner execution required**

This is the consolidated M7.3 exit gate. Use only synthetic content and do not commit screenshots, browser profiles, private prompts, external-session identifiers, or machine paths.

## Prerequisites already established

- M7.0 audit and contract lock: PASS
- M7.1 UX/interaction Human Gate: PASS
- M7.2 C2 genuine browser-process restart Human Gate: PASS
- H-01: RESOLVED
- C1 and B4: complete
- C4 clean environment matrix: PASS, with macOS accurately deferred

## Product Owner rows

1. Complete `m7-3-c3-external-review.md` with a genuinely independent external reviewer and record only the requested non-private acceptance facts.
2. Run one bounded synthetic critical journey: import or create Translation material, practice and finalize, reopen History, import the external Teacher Review, inspect Correction Workspace, start retry/remediation, and confirm the original response and lineage remain intact.
3. On a supported hosted HTTP(S) origin where production Service Worker registration is enabled, verify install/registration, online use, offline reopen and shell use, then return online successfully.
4. Verify a cache upgrade from an older Quiz Studio shell to the current shell replaces stale application assets while preserving local user data. Confirm the recovery entry removes only Quiz Studio Service Worker/cache state and does not remove localStorage data.
5. Verify the canonical local workflow separately: `start-local.bat`, `http://localhost:8000`, intentional zero production Service Worker registrations on loopback, clean shutdown, and restart. Confirm direct `file://` use is treated as unsupported.
6. Repeat the bounded journey in Chinese and English UI at representative narrow and normal widths; confirm no new M7.3 regression in accepted M7.1/M7.2 behavior.

## Acceptance record

- C3 authentic external round trip: PENDING
- Bounded critical journey: PENDING
- Hosted PWA online/offline/return-online: PENDING
- Hosted cache upgrade and data preservation: PENDING
- Canonical local runtime policy: PENDING
- Chinese/English and responsive regression: PENDING
- Overall M7.3 Human Gate: **PENDING**
- Product Hardening complete: **NO**
- Release Candidate started: **NO**

Do not mark M7.3 or Product Hardening complete until every Product Owner row passes. Do not begin Milestone 8 / Release Candidate work from this checklist.
