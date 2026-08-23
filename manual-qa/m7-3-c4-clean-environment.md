# M7.3 C4 Clean Environment Verification

Status: **PASS — required Windows and Ubuntu rows passed; macOS explicitly deferred**

Date: 2026-08-22

Verified baseline: remote `main` at `e3d6a693c29d6be93848ffb652743f8919e17216`

No private data, machine-specific paths, screenshots, browser-profile contents, or exported local state are retained in the repository.

## Required Windows 11 row — PASS

- Created a genuinely fresh temporary clone of remote `main`; no dependencies or working-tree files were copied from the development checkout.
- `npm ci`: PASS, 5 packages installed from the lockfile.
- Full repository check: PASS, 290/290 tests.
- Runtime versions: Windows 11 25H2 build 26200.9168; Node.js 24.18.0; npm 11.16.0; Python 3.12.13; Chrome 151.0.7922.173.
- First `start-local.bat --no-browser` attempt without `py`/`python` on `PATH`: expected safe failure with a bilingual Python prerequisite message; no origin drift or partial runtime remained.
- After supplying the documented Python 3 prerequisite, `start-local.bat --no-browser`: PASS; canonical IPv4 + IPv6 `http://localhost:8000` runtime became ready.
- Health endpoint: PASS with `{ "status": "ok", "origin": "http://localhost:8000" }`.
- Current root and `sw.js`: HTTP 200 with `no-store` cache control.
- Fresh isolated Chrome profile: PASS; `Quiz Studio` rendered in the editor, import/export controls were present, and the complete ESM graph loaded.
- Synthetic import/export: PASS; `examples/sample-quiz.json` imported as `Sample Web Basics Quiz`, then exported as one `quiz-studio.quiz-paper` JSON file.
- Canonical loopback Service Worker policy: PASS; zero production Service Worker registrations, as intentionally required for the no-store development origin.
- Shutdown and restart: PASS; the runtime was stopped, relaunched on the canonical origin, returned a healthy response, and stopped again without origin drift.
- `file://`: unsupported by contract; no contrary claim is made.

## Required Ubuntu CI row — PASS

- GitHub Actions `CI` on `ubuntu-latest`: PASS for the exact merged baseline commit above.
- Workflow retained Node.js 22, Python 3.12, `npm ci`, and `npm run check`; no weakening or platform bypass was introduced.
- The M7.3 branch CI must still pass after the Draft PR is pushed; that is a delivery check, not a replacement for this clean-baseline row.

## macOS row — DEFERRED / NOT VERIFIED

No macOS runner or clean macOS environment was available. macOS is not a mandatory M7.3 exit row under the revised C4 contract. The repository does not claim macOS verification or add artificial macOS infrastructure.

## C4 conclusion

- Clean Windows 11: PASS
- Ubuntu CI: PASS
- Runtime defect found: none
- macOS: DEFERRED / NOT VERIFIED
- Overall C4: **PASS**
