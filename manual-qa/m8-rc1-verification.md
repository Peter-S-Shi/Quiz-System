# Milestone 8 — Release Candidate 1 (`v1.0.0-rc.1`) Verification Checklist

This document establishes the exact verification contract for Quiz Studio Release Candidate 1 (`v1.0.0-rc.1`).

## Candidate Metadata

- **Candidate Tag**: `v1.0.0-rc.1` *(Cut pending Product Owner merge of Batch A)*
- **Candidate Commit SHA**: *(Pending merged main baseline commit)*
- **Feature Freeze**: ACTIVE
- **Milestone 7 Product Hardening**: COMPLETE / ACCEPTED (292 tests green, H-01 resolved, C1–C4 PASS)
- **Public Release Authorization**: NOT AUTHORIZED (RC verification only)

---

## Verification Matrix

| Area | Verification Scope | Target Environment | Status | Evidence / Notes |
| :--- | :--- | :--- | :--- | :--- |
| **1. Automated Suite** | Clean `npm ci` and `npm run check` (292 tests) | Node.js 20+ / Windows & Ubuntu | **PENDING** | Must pass 292/292 tests with 0 failures on exact candidate SHA |
| **2. CI Pipeline** | GitHub Actions workflow execution | Ubuntu runner (`ubuntu-latest`) | **PENDING** | Automated validation in CI |
| **3. Clean Windows Launch** | Clean clone checkout, `start-local.bat`, loopback `localhost:8000`, clean startup/restart | Windows 11 (64-bit) | **PENDING** | Strict port 8000, zero production SW on loopback |
| **4. Browser Matrix** | Bounded product smoke across supported browsers | Google Chrome, Microsoft Edge, Mozilla Firefox (Windows) | **PENDING** | Authoring, practice, history, and theme switching in each browser |
| **5. Hosted PWA** | HTTPS test origin: SW registration, online use, offline reopen/use, return online | Production HTTPS test origin | **PENDING** | Offline shell caching and dynamic data preservation |
| **6. Accumulated Portability** | Representative accumulated full backup export → fresh profile restore → integrity check | Chrome / Edge | **PENDING** | Bounded realistic long-term usage state (papers, responses, reviews, lineage) |
| **7. Native File Pickers** | Native OS file picker for Teacher Review import and remediation Translation Document import | Windows 11 File Dialog | **PENDING** | Real OS file-picker selection and import round-trip |
| **8. Release Safety** | Privacy, credentials, machine-specific paths, and prompt-draft tracking scans | Repository tree | **PENDING** | Zero private credentials, machine paths, or untracked prompt drafts |
| **9. Synthetic Fixtures** | Audit of committed sample papers, backups, reviews, and examples | `examples/`, `manual-qa/samples/` | **PENDING** | All committed fixtures verified strictly synthetic |
| **10. Known Limitations** | Accurate disclosure and acceptance of known boundaries | Documentation review | **PENDING** | Local storage quotas, manual file-based interchange, no in-app AI |
| **11. macOS Environment** | Clean clone and execution on macOS | macOS / Safari | **DEFERRED / NOT VERIFIED** | Explicitly deferred outside verified Windows/Ubuntu boundary |
| **12. PO Final RC Gate** | Product Owner review and acceptance of the exact RC candidate | Product Owner review | **PENDING** | Consolidated final RC acceptance gate |

---

## Exit Conditions for Milestone 8 RC1

Milestone 8 RC1 validation is complete only when:
1. Exact candidate tag `v1.0.0-rc.1` is cut on the accepted merged `main` commit.
2. Items 1–10 pass with documented evidence.
3. Item 11 remains honestly recorded as **DEFERRED / NOT VERIFIED**.
4. Item 12 receives formal Product Owner acceptance.
5. No runtime or product code changes are introduced without invalidating the candidate and cutting a new RC (`rc.2`).
