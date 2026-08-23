# Milestone 8 — Release Candidate 1 (`v1.0.0-rc.1`) Verification Checklist

This document establishes the completed verification and acceptance record for Quiz Studio Release Candidate 1 (`v1.0.0-rc.1`).

## Candidate Metadata

- **Candidate Tag**: `v1.0.0-rc.1`
- **Candidate Commit SHA**: `f33bafcfe42ac8dd521466026c343102dc18897a`
- **Candidate Commit Identity**: The exact frozen product commit snapshot in PR #25 tagged as `v1.0.0-rc.1`
- **Feature Freeze**: ACTIVE (0 product/runtime code modifications)
- **Milestone 7 Product Hardening**: COMPLETE / ACCEPTED (292 tests green, H-01 resolved, C1–C4 PASS)
- **Milestone 8 Status**: **COMPLETE / ACCEPTED** (Batch A prepared; Batch B verified; Batch C accepted by Product Owner)
- **Overall Candidate Status**: **ACCEPTED** (0 release-blocking defects)
- **Public Release Authorization**: NOT AUTHORIZED (RC verification only; public Pages and formal GitHub Release deferred)

---

## Verification Matrix

| Area | Verification Scope | Target Environment | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- | :--- |
| **1. Automated Suite** | Clean `npm ci` and `npm run check` (292 tests) | Node.js 20+ / Windows & Ubuntu | **PASS** | 292/292 tests passed (0 failures, 0 skipped, 1443 ms) on exact candidate SHA |
| **2. CI Pipeline** | GitHub Actions workflow execution | Ubuntu runner (`ubuntu-latest`) | **PASS** | Green CI run on candidate commit `f33bafcfe42ac8dd521466026c343102dc18897a` |
| **3. Clean Windows Launch** | Clean clone checkout, `start-local.bat`, loopback `localhost:8000`, clean startup/restart | Windows 11 (64-bit) | **PASS** | Product Owner verified: port 8000 instant startup, zero loopback SW, clean shutdown/restart (`manual-qa/m8-c-human-acceptance.md`) |
| **4. Browser Matrix** | Bounded product smoke across supported browsers | Google Chrome, Microsoft Edge, Mozilla Firefox (Windows 11) | **PASS** | Product Owner verified: authoring, practice, history, theme toggle without defects (`manual-qa/m8-c-human-acceptance.md`) |
| **5. Hosted PWA** | HTTPS test origin: SW registration, online use, offline reopen/use, return online | Production HTTPS test origin | **PASS** | Product Owner verified: SW registration, offline caching, and seamless state recovery (`manual-qa/m8-c-human-acceptance.md`) |
| **6. Accumulated Portability** | Representative accumulated full backup export → fresh profile restore → integrity check | Node.js / Core APIs | **PASS** | Full backup/restore verified: 5305-byte payload with media, categories, reviews, and lineage restored with referential integrity (`manual-qa/m8-b-exact-candidate-verification.md`) |
| **7. Native File Pickers** | Native OS file picker for Teacher Review import and remediation Translation Document import | Windows 11 File Dialog | **PASS** | Product Owner verified: real Windows file dialog import for Teacher Review and remediation docs (`manual-qa/m8-c-human-acceptance.md`) |
| **8. Release Safety** | Privacy, credentials, machine-specific paths, and prompt-draft tracking scans | Repository tree | **PASS** | Zero private credentials, machine paths, or untracked prompt drafts (`manual-qa/m8-b-exact-candidate-verification.md`) |
| **9. Synthetic Fixtures** | Audit of committed sample papers, backups, reviews, and examples | `examples/`, `manual-qa/samples/` | **PASS** | All committed fixtures audited as strictly synthetic (`manual-qa/m8-b-exact-candidate-verification.md`) |
| **10. Known Limitations** | Accurate disclosure and acceptance of known boundaries | Documentation review | **PASS** | Local storage quotas, manual file-based interchange, no in-app AI formally accepted |
| **11. macOS Environment** | Clean clone and execution on macOS | macOS / Safari | **DEFERRED / NOT VERIFIED** | Explicitly deferred outside verified Windows/Ubuntu boundary |
| **12. PO Final RC Gate** | Product Owner review and acceptance of the exact RC candidate | Product Owner review | **PASS — ACCEPTED** | Consolidated final RC human acceptance gate passed with 0 release-blocking defects (`manual-qa/m8-c-human-acceptance.md`) |

---

## Exit Conditions for Milestone 8 RC1

Milestone 8 RC1 validation is complete and accepted:
1. Exact candidate tag `v1.0.0-rc.1` was cut on frozen candidate commit `f33bafcfe42ac8dd521466026c343102dc18897a` (**PASS**).
2. Items 1–10 have all passed with documented agent and human evidence (**PASS**).
3. Item 11 remains honestly recorded as **DEFERRED / NOT VERIFIED** (**PASS**).
4. Item 12 received formal Product Owner human acceptance (**PASS — ACCEPTED**).
5. Zero product or runtime code modifications were introduced post-tag (**PASS**).
6. Milestone 8 is **COMPLETE**; PR #25 is ready for final merge authorization into `main`.
