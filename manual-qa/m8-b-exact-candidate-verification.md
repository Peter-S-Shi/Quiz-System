# Milestone 8 Batch B: Exact Candidate Verification (`v1.0.0-rc.1`)

This document records the exact candidate verification evidence executed by agent tooling on Quiz Studio Release Candidate 1 (`v1.0.0-rc.1`), and clearly isolates the genuine human/native browser gates handed over to Batch C.

## 1. Candidate Identity & Cut Record

- **Candidate Tag**: `v1.0.0-rc.1`
- **Candidate Commit SHA**: `f33bafcfe42ac8dd521466026c343102dc18897a`
- **Tag Type**: Annotated Git Tag (`git tag -a v1.0.0-rc.1`)
- **Remote Proof**: `git rev-parse "v1.0.0-rc.1^{commit}"` resolves to `f33bafcfe42ac8dd521466026c343102dc18897a`
- **Single-PR Vehicle**: PR #25 (`release/m8-a-rc1-candidate-preparation`)
- **Feature Freeze**: ACTIVE (0 product/runtime code changes)

---

## 2. Agent-Executable Verification (Evidenced & PASS)

| Check | Scope / Tooling | Target Environment | Result | Evidence / Details |
| :--- | :--- | :--- | :--- | :--- |
| **Clean Install** | `npm ci` clean dependency resolution | Node.js 20+ / Windows 11 | **PASS** | Dependencies resolved cleanly without vulnerability warnings |
| **Syntax & Automated Suite** | `npm run check` (syntax + 292 unit/integration tests) | Node.js 20+ / Windows 11 | **PASS** | 292/292 tests pass (0 fail, 0 skipped, 1663 ms) on exact candidate SHA |
| **Package Metadata** | `package.json` and `package-lock.json` | Repository tree | **PASS** | Both manifests locked to `1.0.0-rc.1` |
| **CI Execution** | GitHub Actions workflow on candidate SHA | Ubuntu runner (`ubuntu-latest`) | **PASS** | Ubuntu CI pipeline green on exact candidate commit |
| **Automated Runtime Contracts** | Python server binding, CRLF launcher, port collision | Local runtime tests | **PASS** | 13/13 runtime/launcher contract tests pass; loopback SW registration blocked |
| **Accumulated Backup Round Trip** | Representative full backup export → clean state restore → integrity verification | Node.js / core modules | **PASS** | Concrete execution verified: 5305-byte payload with papers, media Blobs, translation docs, reviews, and lineage restored with referential integrity |
| **Release Safety Scans** | Secrets, machine paths, and prompt-draft tracking | Repository tree | **PASS** | Zero credentials, generic paths, `.prompt-drafts/` untracked |
| **Synthetic Fixtures Audit** | Audit of test fixtures and examples | `examples/`, `manual-qa/samples/` | **PASS** | All committed samples audited as strictly synthetic |
| **Known Limitations** | Accurate boundary disclosure in documentation | Documentation review | **PASS** | Local storage quota boundaries, manual file exchange, no in-app AI |
| **macOS Environment** | Clean clone and execution on macOS | macOS / Safari | **DEFERRED / NOT VERIFIED** | Honestly recorded as deferred outside verified Windows/Ubuntu boundary |

---

## 3. Product Owner / Native Environment Gates (Handed to Batch C)

The following verification areas require genuine human interaction, physical native OS dialogs, or live browser rendering and remain **PENDING** for Product Owner execution in Batch C:

| Gate Area | Scope | Target Environment | Status | Verification Protocol |
| :--- | :--- | :--- | :--- | :--- |
| **Clean Windows Real Launch** | Launch via `start-local.bat`, verify browser opens `http://localhost:8000`, test clean shutdown & restart | Windows 11 (64-bit) | **PENDING** | Execute `start-local.bat` in clean terminal; confirm port 8000 binding and zero SW on loopback |
| **Browser Matrix Smoke** | Bounded product smoke across supported browsers | Google Chrome, Microsoft Edge, Mozilla Firefox (Windows) | **PENDING** | Verify authoring, practice, history, and theme switching in each browser |
| **Hosted HTTPS PWA** | HTTPS test origin: SW registration, online use, offline reopen/use, return online | Production HTTPS test origin | **PENDING** | Verify production Service Worker, offline caching, and user state preservation |
| **Native OS File Pickers** | Native OS file dialog for Teacher Review import and remediation Translation Document import | Windows 11 File Dialog | **PENDING** | Use real Windows file dialog to select and import external review JSON |
| **PO Final RC Acceptance** | Consolidated Product Owner sign-off on RC1 | Product Owner review | **PENDING** | Final milestone sign-off |

---

## 4. Batch B Exit Verdict

- **RC1 Candidate (`v1.0.0-rc.1`) Validity**: **VALID / UNCHANGED**
- **Agent-Executable Verification**: **COMPLETE / PASS**
- **Product/Runtime Code Changes in Batch B**: **NONE** (0 lines in `src/`, `scripts/`, `styles.css`, `index.html`, `sw.js`).
- **Milestone 8 Status**: Agent-executable Batch B verification complete; genuine human and native browser gates handed over to **Batch C (RC Human Acceptance & Closure)**.
