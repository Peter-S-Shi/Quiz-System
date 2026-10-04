# V2 Product Hardening — milestone record

**Status: Product Hardening — PASS, ACCEPTED / COMPLETE.** The Product Owner's Human Hardening Gate **PASSED on 2026-10-03**: every item of the Human Hardening Pack was actually performed and passed. Next phase: **Release Candidate — ACCEPTED (Human RC Gate PASS); Quiz Studio V2 `2.0.0` released / maintenance** (see [`V2_RELEASE_CANDIDATE.md`](V2_RELEASE_CANDIDATE.md)). Entry truth: [`V2_WHOLE_PRODUCT_FEATURE_GATE.md`](V2_WHOLE_PRODUCT_FEATURE_GATE.md) (V2 is FEATURE COMPLETE / FROZEN). Canonical inventory: [`../HARDENING_BACKLOG.md`](../HARDENING_BACKLOG.md). Product Owner manual pack: [`../manual-qa/v2-hardening-pack.md`](../manual-qa/v2-hardening-pack.md).

Hardening attacks the frozen product; it adds no feature, no bundled font, no signing or auto-update, and does not start RC. The final application icon and the release version are RC acceptance items.

## Evidence states

AUTOMATED PASS · DEVELOPER-MACHINE packaged PASS · PRODUCT OWNER / manual PASS · NOT RUN · OPEN (not waived). They are never merged: a green Action is not a PH exit by itself.

## Backlog reconciliation

The inventory was rebuilt from the real checklists in `manual-qa/v2-*.md`, not from the summaries. It includes **D5 (interactive uninstall)**, which the checklist has but several summary lines omitted ("D1–D4"); those lines now say D1–D5. All 30 open checklist items (D1–D5, M1–M7, M-T1b/d/e, M-T2a–d, M-T3a–c, M-U1–M-U8), the physical-sound quality check (S1) and the hosted-runner packaged-check limitation (P1) are listed, none dropped, none waived.

## Lane results so far

Local development machine, plus the hosted run 37172021453 where noted.

| Lane | Evidence | Result |
|---|---|---|
| 1 Data integrity / durability / crash recovery | Rust H2 crash loop, H3 activation faults, H4/H5 media + archive suites, migration faults, JS `orch-faults` / `task-faults` (real store, fault matrix, kills) | AUTOMATED PASS (Rust 186, integration 94 → 95 with the PH test) |
| 2 Migration / upgrade | `core/migrate_v1/tests/*`, `orch-migrated`, archive 2→3 upgrade, migration memory envelope | AUTOMATED PASS. Native packaged flows M1–M7: PO-PASS (Human Hardening Gate) |
| 3 Native Windows / packaging | Release build of the packaged app: `packaged-product-check` **19/19**; `smoke.ps1` (single instance, crash-recovery relaunch, pinned comparison, no listener, no remote connection, no stray Python/Node) all ok | DEVELOPER-MACHINE PASS. Hosted CI: packaged DevTools check **NOT RUN** (WebView2 refuses a debugging port); installer install / upgrade / uninstall is covered by the CI package acceptance, not re-run here (the Tauri CLI is not installed on this machine). D1–D5 PO-PASS (Human Hardening Gate) |
| 4 Input / international text | `typing-*.spec.mjs`, practice self-test 93 (committed-text / IME path, paste and drop rejection, long text) | AUTOMATED PASS. Real IME / dead keys / AltGr / resize items: PO-PASS (M-T1a, M-T1c at the earlier Human Gate; the rest at the Human Hardening Gate) |
| 5 Accessibility / visual resilience | Practice 93 and product 158 self-test accessibility bases (names, focus, keyboard, no colour-only meaning), narrow window | AUTOMATED PASS. Narrator, high contrast, 200 % scale, mixed DPI, visual review, audible quality: PO-PASS (Human Hardening Gate) |
| 6 Performance / bounded resources | `typing-compare-scale`, `typing-long-text`, migration and media envelopes, **new** `ph-scale.spec.mjs` (400 completed sessions: correct result, ceiling) | AUTOMATED PASS. See Findings F1 |
| 7 Security / privacy / offline | `product-architecture.spec.mjs`, `boundary.spec.mjs`, `webview_contract.rs`; static audit this round: no remote URL in the UI, no browser-origin storage, CSP `'self'` only, capability `core:default` only, native dialogs keep paths in Rust, CI step proves no fault-injection hook in the shipped binary | AUTOMATED PASS; release binary smoke shows no listener and no remote connection |

Other local checks: `cargo fmt --check` clean, `cargo clippy --workspace --all-targets -D warnings` clean, JS unit 235, product UI self-test 158, learning-session regression 23.

## Findings

No product defect has been found so far, so no product code changed. Observations, classified:

- **F1 (observation, not a defect): the read cost of a very large history is linear and not small.** On the debug store, reading all Objective Evidence costs about 0.4–0.8 ms per session record (about 3 KB each). Library state and Today read the whole Evidence collections, so a history of several thousand sessions makes those screens take seconds on a debug build (release is faster; not measured on the packaged app). It is not a Feature Freeze blocker class (nothing is lost or wrong), the resource guards are intact, and fixing it would be a read-model redesign, so it is **carried to RC as an observation** with the numbers above. The new test pins correctness at 400 sessions plus a ceiling; a growth-ratio assertion was tried and removed because the test bridge's own line reader doubles the per-byte cost above about 1 MB and would have measured the harness.
- **F2 (observation): exchange export writes the chosen file in place** (`std::fs::write`), not via a temporary file and rename. The target is a file the person chose in the Save dialog (the OS asks before overwriting), no canonical data is involved, and the write is bounded to 32 MiB. Recorded, not changed.

## PH additions in this candidate (no product behavior change)

- `desktop/ui/tests/integration/ph-scale.spec.mjs` — correctness and ceiling over a large history (lane 6).
- `desktop/scripts/make-hardening-pack.ps1` — builds the synthetic fixtures for the manual session (CJK-path and blocked V1 backups, a 420 MiB V1 backup, a 1 GiB drop file, media, a long typing text, a seeded data folder). Not run in CI.
- `HARDENING_BACKLOG.md`, `manual-qa/v2-hardening-pack.md`, this record.

## CI evidence (the PH candidate)

One PH candidate, two CI-L2 runs, the first failing for a test-infrastructure reason:

- **Run 37168470932** (head `21f05bd`): **FAILED** in the *Final product UI self-test*; the job stopped there, so the later steps — release build, no-fault-hook check, NSIS installers, packaged-app check, installer check and **Package acceptance — were SKIPPED, not PASS.** This run is **not** candidate evidence.
- **Run 37172021453** (head `4c04181`, [run 37172021453](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37172021453)): **GREEN, every step.** Includes Rust tests, orchestration integration, practice 93, learning regression 23, product UI 158, release build and reproducibility, no fault-injection hook in the shipped binary, NSIS base and upgrade installers, and Package acceptance (per-user install, installed smoke, single instance, no listener / remote connection, crash-recovery relaunch, upgrade keeps data, silent uninstall keeps data). The packaged DevTools product check ran as designed on the hosted runner and reported **NOT RUN (the hosted WebView2 refuses a debugging port) — not PASS**; the developer-machine result (19/19) is the evidence for it.

**F3 (test-infrastructure defect, repaired, no product change).** The first failure was a race in the product self-test: *Finish* was clicked while still disabled (the last answer had not rendered yet) and a fixed 120 ms sleep guarded the confirmation dialog. It was reproduced locally only under load (two throttled runs in parallel, 6x CPU, about one round in three) and not on a single run, even at 20x. The repair is condition-based: wait until Finish is enabled, poll the dialog until Done is offered, retry a click for a button that is not there yet; the 20 s budget is only a timeout ceiling. After the fix: 12 of 12 paired parallel + throttled runs green; practice and app self-tests green under throttle. No wait / timeout loop was iterated just to turn Actions green.

## CI plan

CI-L1 / local checks while iterating; one PH candidate; the evidence close-out is docs-only (CI-L0, this commit) and does not trigger CI. If a CI failure is not a product defect, it is classified first; a repeated identical non-product failure stops the retry loop and the verification source is redefined instead.

## Human Hardening Gate — PASS (2026-10-03)

Decided by the Product Owner. Candidate: PH head `4c04181`, CI-L2 [run 37172021453](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37172021453) (green, every step). The Gate executed the whole [manual pack](../manual-qa/v2-hardening-pack.md); each item is now **PO-PASS** in its own checklist and in [`HARDENING_BACKLOG.md`](../HARDENING_BACKLOG.md):

| Group | Items | State |
|---|---|---|
| Desktop Foundation | D1, D2, D3, D4, D5 | PO-PASS |
| V1 Migration | M1–M7 | PO-PASS |
| Focused Practice / Typing | M-T1b, M-T1d, M-T1e, M-T2a–d, M-T3a–c | PO-PASS (M-T1a, M-T1c: PO-PASS earlier, history kept) |
| Final Product UI | M-U1–M-U8 | PO-PASS |
| Physical sound quality | S1 | PO-PASS |
| Hosted-runner packaged DevTools deep check | P1 | **NOT RUN on hosted CI** (unchanged; not a manual item); developer-machine 19/19 = **DEV-PASS** |

Per-item environment details were not itemised to this record; the Product Owner's Gate report is the source. No product defect was reported by the Gate, so no product code changed in Product Hardening.

## Known RC observations (carried, not resolved)

- **F1** — reading a very large Evidence history is linear and not small (about 0.4–0.8 ms per session record on the debug store); Library state and Today read whole collections. Not a Feature Freeze blocker class; a read-model change is out of PH scope.
- **F2** — exchange export writes the chosen file in place rather than via a temporary file and rename; bounded to 32 MiB; no canonical data involved.

Product Hardening PASS does not delete or "resolve" either; they travel to RC.

## RC acceptance items (not PH work, untouched)

Final application icon; release version. Not changed here: no version, icon, tag, merge to `main`, GitHub Release, code signing or auto-update.

## Not done / carried (as of the PH candidate; superseded by the Gate section above)

At candidate time every manual item was OPEN (not PASS, not waived); they became PO-PASS at the Human Hardening Gate (above). Final application icon, release version, code signing and auto-update are not PH work. Product Hardening is **ACCEPTED**. RC has not started; the icon, release version, tag, merge to `main` and publication are untouched.
