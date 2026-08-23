# Milestone 8 — Release Candidate 1 (`v1.0.0-rc.1`) Verification Checklist

This document establishes the exact verification contract for Quiz Studio Release Candidate 1 (`v1.0.0-rc.1`).

## Candidate Metadata

- **Candidate Tag**: `v1.0.0-rc.1`
- **Candidate Commit SHA**: `f33bafcfe42ac8dd521466026c343102dc18897a`
- **Candidate Commit Identity**: The exact frozen product commit snapshot in PR #25 tagged as `v1.0.0-rc.1`
- **Feature Freeze**: ACTIVE
- **Milestone 7 Product Hardening**: COMPLETE / ACCEPTED (292 tests green, H-01 resolved, C1–C4 PASS)
- **Milestone 8 Status**: ACTIVE (Unified execution via PR #25; Batch A complete; Batch B agent checks verified; Batch C human acceptance in progress)
- **Public Release Authorization**: NOT AUTHORIZED (RC verification only; public Pages and formal GitHub Release deferred)

---

## Verification Matrix

| Area | Verification Scope | Target Environment | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- | :--- |
| **1. Automated Suite** | Clean `npm ci` and `npm run check` (292 tests) | Node.js 20+ / Windows & Ubuntu | **PASS** | 292/292 tests passed (0 failures, 0 skipped, 1663 ms) on exact candidate SHA |
| **2. CI Pipeline** | GitHub Actions workflow execution | Ubuntu runner (`ubuntu-latest`) | **PASS** | Green CI run on candidate commit `f33bafcfe42ac8dd521466026c343102dc18897a` |
| **3. Clean Windows Launch** | Clean clone checkout, `start-local.bat`, loopback `localhost:8000`, clean startup/restart | Windows 11 (64-bit) | **PENDING** | Automated contracts pass; real-browser launch journey prepared for Product Owner gate |
| **4. Browser Matrix** | Bounded product smoke across supported browsers | Google Chrome, Microsoft Edge, Mozilla Firefox (Windows) | **PENDING** | Prepared for Product Owner smoke testing in Batch C |
| **5. Hosted PWA** | HTTPS test origin: SW registration, online use, offline reopen/use, return online | Production HTTPS test origin | **PENDING** | Prepared for Product Owner live-origin verification in Batch C |
| **6. Accumulated Portability** | Representative accumulated full backup export → fresh profile restore → integrity check | Node.js / Core APIs | **PASS** | Bounded full backup/restore round-trip verified (5305 bytes, papers, media, translation, reviews, lineage) |
| **7. Native File Pickers** | Native OS file picker for Teacher Review import and remediation Translation Document import | Windows 11 File Dialog | **PENDING** | Prepared for Product Owner native OS dialog verification in Batch C |
| **8. Release Safety** | Privacy, credentials, machine-specific paths, and prompt-draft tracking scans | Repository tree | **PASS** | Zero private credentials, machine paths, or untracked prompt drafts |
| **9. Synthetic Fixtures** | Audit of committed sample papers, backups, reviews, and examples | `examples/`, `manual-qa/samples/` | **PASS** | All committed fixtures audited as strictly synthetic |
| **10. Known Limitations** | Accurate disclosure and acceptance of known boundaries | Documentation review | **PASS** | Local storage quotas, manual file-based interchange, no in-app AI |
| **11. macOS Environment** | Clean clone and execution on macOS | macOS / Safari | **DEFERRED / NOT VERIFIED** | Explicitly deferred outside verified Windows/Ubuntu boundary |
| **12. PO Final RC Gate** | Product Owner review and acceptance of the exact RC candidate | Product Owner review | **PENDING** | Consolidated final RC acceptance gate (Batch C) |

---

## Exit Conditions for Milestone 8 RC1

Milestone 8 RC1 validation is complete only when:
1. Exact candidate tag `v1.0.0-rc.1` is cut on the frozen candidate commit snapshot in PR #25 (`f33bafcfe42ac8dd521466026c343102dc18897a`).
2. Items 1, 2, 6, 8, 9, 10 pass with agent-executable documented evidence (`manual-qa/m8-b-exact-candidate-verification.md`).
3. Genuine human/native environment items 3, 4, 5, 7 receive formal Product Owner acceptance in Batch C.
4. Item 11 remains honestly recorded as **DEFERRED / NOT VERIFIED**.
5. Item 12 receives formal Product Owner sign-off in Batch C.
6. All subsequent commits in PR #25 add only verification records and lifecycle evidence with zero product/runtime code changes (any product code change requires invalidating RC1 and creating `v1.0.0-rc.2`).
7. Final merge of PR #25 to `main` occurs only after all exit conditions and Product Owner acceptance are complete.
