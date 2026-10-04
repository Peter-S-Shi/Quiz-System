# V2 Release Candidate — evidence map

**Status: Human RC Gate PASS — RC ACCEPTED. Quiz Studio V2 `2.0.0` is RELEASED / MAINTENANCE** (this record stays as the RC evidence map; the GA promotion is described in section 11). Candidate identity `2.0.0-rc.1` (GA target `2.0.0`) on the long-lived `v2` branch. Entry truth: [`V2_HARDENING.md`](V2_HARDENING.md) (Product Hardening PASS — ACCEPTED / COMPLETE), [`V2_WHOLE_PRODUCT_FEATURE_GATE.md`](V2_WHOLE_PRODUCT_FEATURE_GATE.md) (Feature Freeze), [`../HARDENING_BACKLOG.md`](../HARDENING_BACKLOG.md).

RC is packaging, identity, exact-candidate verification and delivery evidence. It adds no feature, no bundled font, no signing or auto-update, and reopens no accepted semantics. At the time of the RC, merge to `main`, tags and the release were not authorized; they were done later by the GA promotion (section 11).

## 1. Identity

| Item | Value |
|---|---|
| RC version | `2.0.0-rc.1`; GA target `2.0.0` |
| Where it is set | `desktop/Cargo.toml` workspace version and `desktop/app/src-tauri/tauri.conf.json` (the CI run refuses to build if the two differ); `desktop/Cargo.lock` follows |
| Where it is visible | the shipped exe (`--identity`, file ProductVersion), the installer file name, the Windows *Installed apps* entry (DisplayVersion), **Settings → System** (`Quiz Studio 2.0.0-rc.1`), the version recorded in backups and migration records |
| Not changed | V1 `1.0.0` records, the preserved V1 root package metadata and V1 historical references |
| Conflict check | no authoritative V2 record contradicted `2.0.0-rc.1`; the previous identity was the development version `2.0.0-dev.0` |

## 2. Final application icon — Product Owner approved

The Product Owner approved **Concept A "Ink-tail Q"** as the final application icon for `2.0.0-rc.1`. Nothing else was invented or substituted; the old placeholder is removed.

| Item | Value |
|---|---|
| Source (committed) | `docs/design-inputs/Design model/app-icon/` (SVG master, small-size SVG, dark variant, `build_icon.py`, rasters, `quiz-studio.ico`) |
| Deterministic | `python build_icon.py` (Pillow) was re-run in a scratch copy and reproduced every shipped file byte for byte |
| Tauri icons | `32x32.png`←`icon-32`, `64x64.png`←`icon-64`, `128x128.png`←`icon-128`, `128x128@2x.png`←`icon-256`, `icon.png`←`icon-512`, `icon.ico`←`quiz-studio.ico` (copies, no resampling) |
| `icon.ico` SHA-256 | `2a1977e3938f19179d5712ee74bab295879dc839dee941c993555a1f5b0d680a` |
| `build_icon.py` SHA-256 | `049426d5ddc6b35dcad46e55b12d43f5a248e8f2d45667b45378d8a9100e54f3` |
| Verified in the executable | the largest `.ico` entry appears verbatim in the built exe (checked in `package-test.ps1`); the extracted exe icon is the Ink-tail Q (visual check on the developer machine) |
| Verified in the installer / installed entry | the package acceptance checks the uninstall entry's `DisplayIcon` and the Start-menu shortcut target |
| Window / taskbar | Tauri embeds the same icon as the window icon; confirming it by eye is manual smoke item **R1** |

## 3. Packaging path

The existing Desktop workflow was adapted, not replaced (`.github/workflows/desktop.yml`):

- the candidate version is **discovered** from the V2 config; Tauri and Cargo versions must agree or the run stops;
- the **exact candidate installer** is built without any version override: `quiz-studio_2.0.0-rc.1_x64-setup.exe`, uploaded as artifact `quiz-studio-2.0.0-rc.1-<sha7>-installer`;
- the **upgrade source** is a real earlier V2 build (the Product Hardening candidate, `4c04181`, version `2.0.0-dev.0`), built from its own checkout, named `upgrade-source_TEST-ONLY_…`, **never uploaded as an RC artifact**;
- `scripts/package-test.ps1` runs on the exact candidate: identity, icon, Start-menu / uninstall entries, smoke, clean install → silent uninstall keeps data, and the upgrade from the earlier build over a seeded synthetic data root;
- an evidence artifact `rc-evidence-2.0.0-rc.1-<sha7>` carries `rc-evidence.json` (commit, version, installer name and SHA-256, shipped exe SHA-256, icon hash and source, upgrade-source commit), the package report and the data-journeys report.

Note: the Tauri bundler stamps the bundle type into the shipped exe, so the **shipped (installed) exe differs from `target/release/quiz-studio.exe`**; the evidence records the shipped exe's hash.

## 4. Exact-candidate data journeys

Run by the package acceptance on the **data root the installed candidate upgraded** (synthetic data only), with `scripts/rc-data-journeys.mjs`:

1. every record that existed before the upgrade is still present and identical (records the app itself adds on launch — the accepted planning sweep — are reported, not hidden);
2. a V2 backup is created from that root;
3. content added after the backup is gone after the restore, and the original data returns;
4. a valid synthetic V1 backup migrates: history, learner responses, teacher reviews, translation documents and media are preserved;
5. repeating the same import is reported as already migrated and changes nothing;
6. a truncated / invalid V1 source is blocked (exit 3) and changes nothing.

**Scope, stated precisely:** the journeys drive the same Rust store / archive / migration crates the packaged exe links (through the test-only `qs-scenario` built at the same HEAD, which uses the same `Core` and `product_catalog` the app uses). They are **not** the GUI path through the native Open / Save dialogs. The packaged GUI path is the Product Owner smoke, [`../manual-qa/v2-rc-smoke.md`](../manual-qa/v2-rc-smoke.md) (R7, R8, R9). That smoke is **not run and not marked PASS**.

## 5. Evidence states for the candidate

Kept separate; a green workflow is **not** "everything passed" because one nested check reports NOT RUN.

| State | Items |
|---|---|
| **AUTO-PASS** (CI, exact head) | format / lint; JS unit, Rust (store, media, activation, archive, port, fault and memory suites), Learning Orchestration + task-domain integration; Focused Practice self-test; learning-session regression; final product UI self-test; offline / CSP / path-boundary assertions (inside those suites); shipped binary carries no fault-injection hook; release build + reproducibility; WebView2 `downloadBootstrapper` configuration (static) |
| **CI-L3 package PASS** (exact candidate installer) | per-user install; exe / file / uninstall-entry version `2.0.0-rc.1`; final icon embedded, uninstall-entry icon, Start-menu shortcut; installed smoke (single instance, no listener, no remote connection, crash-recovery relaunch); silent uninstall keeps data; upgrade from the earlier V2 build preserves the data root (15 pre-upgrade records identical; the app added one schedule and one suggestion on launch); backup → restore, valid V1 migration, repeat = already migrated, truncated source blocked (on the upgraded data root, engine level — section 4) |
| **DEV-PASS** (developer machine) | the same package acceptance on the exact candidate installer; packaged-app product check 19/19 on the shipped exe (section 7) |
| **PO-PASS** | none for RC yet — the Product Owner RC smoke is prepared and **not performed** |
| **NOT RUN** | the hosted-runner packaged WebView2 DevTools deep check (the hosted WebView2 refuses a debugging port; the step reports `SKIPPED (not run, not passed)`) — never PASS; the developer-machine 19/19 is the evidence for it |
| **Accepted known limitation** | F1, F2 (section 6) |
| **Unresolved blocker** | none known |

## 6. F1 and F2 — RC dispositions

**F1 — large-history read cost: accepted known performance limitation for `2.0.0`.** Measured on a **release build and in the real packaged exe** (`scripts/rc-f1-measure.mjs`; Windows 11, i7-12700H, 20 logical CPUs, 16 GiB; synthetic completed Objective sessions through the shipped store):

| Completed sessions | Evidence read | Library ready | Evidence history ready | Today ready | Today first paint after launch |
|---|---|---|---|---|---|
| 2 000 | 6.1 MiB | 0.37 s | 0.49 s | 0.69 s | 1.2 s |
| 5 000 | 15.3 MiB | 0.89 s | 1.15 s | 1.62 s | 2.7 s |

Growth is linear, the views stay usable well beyond ordinary use (several years of daily practice), and no correctness or data-integrity failure appeared. No read-model change was made. The limitation is stated in the quick start.

**F2 — export writes the chosen file in place: accepted known limitation for `2.0.0`.** Reconfirmed from the code (`native_export_text`): the function receives only the document text (bounded to 32 MiB) and a file name, shows the Save dialog (the OS asks before overwriting), and writes **only** the path the person chose; it never opens the Quiz Studio store, so no canonical data is touched, and on a write failure only that export file is affected. A person can deliberately choose a file inside the application's own data folder; the app does not prevent that (as with any application's Save dialog). No contrary evidence was found.

Neither observation was removed or described as fixed.

## 7. Local readiness evidence (CI-L1, developer machine)

Run on the developer machine (Windows 11, i7-12700H) before the candidate was pushed; these are **AUTO-PASS (local)** or **DEV-PASS**, not CI evidence:

- `cargo fmt --check` and `cargo clippy --workspace --all-targets -D warnings` clean; JS unit 235/235; integration 95/95; Rust 186/186; Focused Practice self-test 93/93; learning-session regression 23/23; product UI self-test 158/158.
- **DEV-PASS — exact candidate installer, full package acceptance** (`package-test.ps1` with the earlier V2 build as upgrade source and `-DataJourneys`): every check ok — per-user install, exe / file / uninstall-entry version `2.0.0-rc.1`, final icon embedded, Start-menu shortcut, installed smoke (single instance, no listener, no remote connection, crash-recovery relaunch), silent uninstall keeps data, upgrade from the earlier build (`2.0.0-dev.0`) preserves the data root (15 pre-upgrade records identical; the app added one schedule and one suggestion on launch), and the backup / restore / V1-migration / blocked-source journeys.
- **DEV-PASS — packaged-app product check** on the shipped exe: 19/19 (real WebView2, CSP, Tauri IPC, Rust store).
- Local installers were built with the same Tauri CLI version CI uses (`2.12.1`).

## 8. CI-L3 exact-head run (the one run)

[run 37176744235](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37176744235) — **green, every step**, on the exact candidate head. (The only workflow run for this candidate; no re-run.)

| Field | Value |
|---|---|
| Exact commit SHA | `cec737b53b59d2e88b98817880baf41abb6f2304` |
| RC version | `2.0.0-rc.1` (GA target `2.0.0`) |
| Installer file | `quiz-studio_2.0.0-rc.1_x64-setup.exe` (artifact `quiz-studio-2.0.0-rc.1-cec737b-installer`) |
| Installer SHA-256 | `34FE8E4DD189DB6281104C9D0EDE7B6178E1EA10A39A2243AE948E43774F052F` |
| Shipped (installed) exe SHA-256 | `961B17DC401F606B95B88A1D86318CD1487D29B2E6053FD938D83FFFF40D1E7E` |
| Build-tree exe SHA-256 | `DA1979AC81DBF124519585BEB926B56EA10C7F9F578EC5F36E633CD08AE33A0C` (differs by design: the Tauri bundler stamps the bundle type into the shipped exe) |
| `icon.ico` SHA-256 | `2A1977E3938F19179D5712EE74BAB295879DC839DEE941C993555A1F5B0D680A` |
| Icon source identity | Concept A "Ink-tail Q", Product Owner approved; `docs/design-inputs/Design model/app-icon/` |
| Evidence artifact | `rc-evidence-2.0.0-rc.1-cec737b` (`rc-evidence.json`, package report, data-journeys report) |
| Test-only upgrade source | commit `4c0418116c8f948f18ae3a1c9a851c92c92e491b` (version `2.0.0-dev.0`); not an RC artifact, not uploaded |
| Hosted WebView2 for the installed-app checks | Edge/WebView2 153.x on the runner |
| Packaged / manual evidence source | developer machine (DEV-PASS, section 7); Product Owner smoke pending |
| F1 / F2 disposition | accepted known limitations (section 6) |

The installer is an unsigned, per-user NSIS package; code signing and auto-update are outside the frozen V2 Core.

## 9. User-facing documentation

- [`V2_QUICKSTART.md`](V2_QUICKSTART.md) / [`.zh-CN`](V2_QUICKSTART.zh-CN.md): install, offline / data concept (no raw paths), main views, backup / restore, V1 migration, uninstall data choice, known limitations F1 / F2, Windows-only.
- Root `README.md` / `README.zh-CN.md`: a V2 release-candidate notice at the top and an honest "Current Version" line; the V1 sections stay as the preserved V1 record.
- **Merge-time changes** (they were prepared in the GA promotion commit, as listed here): in `README.md` / `README.zh-CN.md` change "release candidate `2.0.0-rc.1` … not yet released or merged" to the final `2.0.0` wording and make V2 the primary section; in the quick starts drop "Release Candidate / candidate" and the "not yet released" notes; bump the version from `2.0.0-rc.1` to `2.0.0` in `desktop/Cargo.toml`, `tauri.conf.json` and `Cargo.lock`, then rebuild.

## 10. Product Owner RC smoke

[`../manual-qa/v2-rc-smoke.md`](../manual-qa/v2-rc-smoke.md) (+ `.zh-CN`): about 15–30 minutes, ten items R1–R10, every result blank. **Ready for the Product Owner; nothing is pre-marked and nothing is PASS until performed.** Step 1 of its setup is to compare the downloaded installer's SHA-256 with section 8.

## 11. Human RC Gate and GA promotion

**Human RC Gate: PASS (Product Owner)** on the exact `2.0.0-rc.1` installer. Only the gate-level result was supplied; the R1–R10 items in the smoke guide are **not** individually marked here, and no per-item environment or date is invented. The evidence states of section 5 are unchanged: the hosted packaged WebView2 DevTools check stays **NOT RUN**, the developer-machine 19/19 stays **DEV-PASS**, F1 / F2 stay **accepted known limitations**.

**GA `2.0.0`.** The accepted RC was promoted with only the release identity (`2.0.0-rc.1` → `2.0.0` in the workspace, Tauri config and lockfile) and release-facing documentation changed. The Concept A icon source and every generated Tauri icon are byte-identical to the accepted RC. The GA installer is `quiz-studio_2.0.0_x64-setup.exe`, built and verified by its own exact-head CI-L3 run with the same version-aware workflow, and published with a checksum file. `main`, the annotated tag `v2.0.0` and the GitHub Release `v2.0.0` point at that exact commit; the commit, run and hashes are on the Release page. The provenance tag `v2.0.0-rc.1` marks the accepted RC runtime commit `cec737b` (not the docs-only close-out `2c4b8c7`). The `v2` branch is kept. Signing and auto-update were not added.

Lifecycle state: **Quiz Studio V2 `2.0.0` — RELEASED / MAINTENANCE.**
