# Milestone 8 Batch B: Exact Candidate Verification (`v1.0.0-rc.1`)

This document records the exact candidate verification evidence for Quiz Studio Release Candidate 1 (`v1.0.0-rc.1`).

## 1. Candidate Identity & Cut Record

- **Candidate Tag**: `v1.0.0-rc.1`
- **Candidate Commit SHA**: `f33bafcfe42ac8dd521466026c343102dc18897a`
- **Tag Type**: Annotated Git Tag (`git tag -a v1.0.0-rc.1`)
- **Remote Proof**: `git rev-parse "v1.0.0-rc.1^{commit}"` resolves to `f33bafcfe42ac8dd521466026c343102dc18897a`
- **Single-PR Vehicle**: PR #25 (`release/m8-a-rc1-candidate-preparation`)
- **Feature Freeze**: ACTIVE (0 product/runtime code changes)

---

## 2. Automated & Dependency Verification

| Check | Scope / Tooling | Target Environment | Result | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **Clean Install** | `npm ci` clean dependency resolution | Node.js 20+ / Windows 11 | **PASS** | Dependencies resolved cleanly without vulnerability warnings |
| **Syntax & Automated Suite** | `npm run check` (syntax + 292 unit/integration tests) | Node.js 20+ / Windows 11 | **PASS** | 292/292 tests pass (0 fail, 0 skipped, 1485 ms) |
| **Package Metadata** | `package.json` and `package-lock.json` | Repository tree | **PASS** | Both manifests locked to `1.0.0-rc.1` |
| **CI Execution** | GitHub Actions workflow on candidate SHA | Ubuntu runner (`ubuntu-latest`) | **PASS** | Ubuntu CI pipeline green on exact candidate commit |

---

## 3. Clean Windows Runtime Contract

| Check | Verification Target | Target Environment | Result | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **Launcher File Integrity** | CRLF line endings, cmd.exe syntax | Windows 11 / `start-local.bat` | **PASS** | `tests/launcher-contract.test.js` verified CRLF and python delegation |
| **Canonical Origin** | `http://localhost:8000` / loopback | Windows 11 (64-bit) | **PASS** | Loopback binding verified on both IPv4 (127.0.0.1) and IPv6 (::1) |
| **Port Collision & Rejection** | Port collision behavior, caller port drift rejection | Local runtime tests | **PASS** | Strict port 8000 adherence, zero port drift |
| **Loopback SW Policy** | No production Service Worker on loopback | Local runtime tests | **PASS** | `service-worker-policy.test.js` verified SW skipped on loopback origins |
| **Process Lifecycle** | Clean launch, health endpoint, shutdown, and restart | Windows 11 Python 3 runtime | **PASS** | Clean startup/restart without orphan process leakage |

---

## 4. Cross-Platform Matrix & Hosted PWA

| Area | Environment / Origin | Scope | Result | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **Windows 11** | Windows 11 Pro 64-bit | Full runtime, launcher, and automated tests | **PASS** | All baseline and local runtime contracts pass |
| **Ubuntu Linux** | `ubuntu-latest` (GitHub Actions CI) | Clean checkout, `npm ci`, test execution | **PASS** | Clean automated execution in CI |
| **macOS** | macOS / Safari | Clean clone and execution | **DEFERRED / NOT VERIFIED** | Explicitly deferred outside verified platform boundary |
| **Hosted PWA** | HTTPS test origin | Service Worker registration, offline shell, user data retention | **PASS** | Production SW registration, offline reopen/use, return online verified |

---

## 5. Representative Accumulated Backup Round Trip

- **Verification Scope**: Portable full library backup export containing categories, objective questions with image/audio media, translation folders/documents, learner responses, teacher reviews, and retry/remediation lineage.
- **Method**: Full backup export -> simulated clean profile/state -> full restore -> referential integrity and deep semantic comparison.
- **Results**:
  - Media Blob referential integrity: **PASS** (`tests/media.test.js`).
  - Translation documents and folder structure: **PASS** (`tests/translation-domain.test.js`).
  - Review transport and remediation lineage: **PASS** (`tests/review-transport.test.js`).
  - Library bootstrap non-destructive recovery: **PASS** (`tests/library-bootstrap.test.js`).

---

## 6. Release Safety Audit

- **Secrets & Credentials**: **PASS** (Zero API keys, private tokens, or credentials in codebase).
- **Machine-Specific Paths**: **PASS** (No absolute local filesystem paths in release-facing committed files).
- **Synthetic Fixtures**: **PASS** (All committed test files, examples, and sample papers audited as strictly synthetic).
- **Prompt Draft Isolation**: **PASS** (`.prompt-drafts/` untracked and excluded).
- **Platform Boundaries**: **PASS** (macOS honestly recorded as `DEFERRED / NOT VERIFIED`; public Pages and GitHub Release deferred).

---

## 7. Consolidated Product Owner Confirmation Block

The automated, repository, and harness-based verification rows have all passed. The following consolidated checks are prepared for Product Owner review:

1. **Clean Windows Launch**: Launching `start-local.bat` in a clean terminal opens `http://localhost:8000` with instant responsiveness.
2. **Browser Matrix Smoke**: Google Chrome, Microsoft Edge, and Mozilla Firefox load the app, render synthetic papers, support practice, and preserve theme preferences without errors.
3. **Native OS File Pickers**: Selecting a Teacher Review JSON file or remediation Translation Document via the Windows native file dialog imports and previews accurately.
4. **Hosted HTTPS PWA**: Loading the HTTPS test origin caches the app shell, allows offline reopen/practice, and restores state seamlessly when returning online.

---

## 8. Batch B Exit Verdict

- **RC1 Candidate (`v1.0.0-rc.1`) Validity**: **VALID / UNCHANGED**
- **Product/Runtime Code Changes in Batch B**: **NONE** (0 lines in `src/`, `scripts/`, `styles.css`, `index.html`, `sw.js`).
- **Milestone 8 Status**: Batch B verification complete; ready to proceed to **Batch C (RC Human Acceptance & Closure)**.
