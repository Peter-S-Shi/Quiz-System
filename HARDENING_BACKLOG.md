# Quiz Studio V2 — Product Hardening backlog

**Phase:** Product Hardening (PH) — **PASS — ACCEPTED / COMPLETE** (Product Owner Human Hardening Gate PASS, 2026-10-03; candidate: green CI-L2 run 37172021453, head `4c04181`). Next phase: **Release Candidate — ACCEPTED (Human RC Gate PASS); Quiz Studio V2 `2.0.0` released / maintenance** (see `docs/V2_RELEASE_CANDIDATE.md`). Entry truth: [`docs/V2_WHOLE_PRODUCT_FEATURE_GATE.md`](docs/V2_WHOLE_PRODUCT_FEATURE_GATE.md). Milestone record: [`docs/V2_HARDENING.md`](docs/V2_HARDENING.md).
**Rules:** Feature Freeze applies. No new features, no bundled fonts, no signing or auto-update, no RC work. Final app icon and release version are RC acceptance items.

This file is the single canonical inventory. It was reconciled against the real checklists in `manual-qa/v2-*.md` (not only the summary docs), so it includes **D5**, which the summaries omit.

## Evidence states (never collapsed)

| State | Meaning |
|---|---|
| **AUTO-PASS** | An automated suite passes (local, and CI where it runs there). |
| **DEV-PASS** | Packaged app verified on the developer machine. |
| **PO-PASS** | The Product Owner performed it by hand and recorded the result. |
| **NOT RUN** | The check exists but was not executed in an environment that can run it. Never PASS. |
| **OPEN** | Not performed; not waived. A ready procedure exists or is listed. |

## A. Manual / environment items (from the real checklists)

| ID | Item (source) | Lane | Environment needed | State (PH entry → Human Hardening Gate) |
|---|---|---|---|---|
| D1 | Native Open dialog for media, normal + CJK path (`v2-desktop-foundation.md`) | 3 | Installed app, real dialog | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| D2 | Drag-and-drop ≥ 1 GiB file | 3, 6 | Installed app, 1 GiB synthetic file | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| D3 | Backup / restore through OneDrive-redirected Desktop and Documents | 1, 3 | Windows profile with OneDrive known-folder redirection | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| D4 | Runtime-less WebView2 (bootstrapper installs runtime) | 3 | Machine/profile without the Evergreen runtime, network | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| D5 | Interactive uninstall, delete-data box unticked then ticked | 3 | Installed app, interactive uninstaller | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M1 | Native Open dialog for a V1 backup, normal + CJK path | 2, 3 | Installed app | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M2 | Migration confirm / cancel | 2 | Installed app | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M3 | Blocked input (wrong kind, truncated) | 2 | Installed app | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M4 | Optional recovery artifact | 2 | Installed app | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M5 | Repeat import and Undo | 2 | Installed app | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M6 | OneDrive-redirected source | 2, 3 | OneDrive-redirected profile | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M7 | Large backup (≥ 400 MiB media) | 2, 6 | Installed app, large synthetic backup | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M-T1a | Microsoft IME composition | 4 | Real IME | **PO-PASS** (2026-10-03) |
| M-T1b | Cancel a composition (Esc does not open the exit dialog) | 4 | Real IME | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M-T1c | Third-party IME emitting only `input` events | 4 | Third-party IME | **PO-PASS** (2026-10-03) |
| M-T1d | Dead keys / AltGr | 4 | US-International layout | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M-T1e | Paste and drop rejection in Typing | 4 | Installed app | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M-T2a | ≥ 3 000-character reading and following | 4 | Installed app | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M-T2b | Resize / DPI / mixed monitors | 4, 5 | Mixed-DPI monitors where available | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M-T2c | Test intent opacity | 4 | Installed app | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M-T2d | Interrupt (kill) and resume | 1, 4 | Installed app | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M-T3a | Keyboard-only Objective, both feedback modes | 5 | Installed app | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M-T3b | Narrator across Objective / Translation / Typing | 5 | Narrator | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M-T3c | High Contrast and 200 % scale | 5 | Windows settings | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M-T4 | Packaged WebView smoke (`package-test.ps1`) | 3 | Automated | AUTO-PASS (CI) |
| M-U1 | Visual review of the seven views (DPI, dark, contrast) | 5 | Human eyes | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M-U2 | Narrator across the views | 5 | Narrator | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M-U3 | High contrast and reduced motion | 5 | Windows settings | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M-U4 | Keyboard-only primary journeys | 5 | Installed app | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M-U5 | Real IME in the Library editors | 4 | Real IME | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M-U6 | Native file dialogs with real files (Library / Exchange) | 3 | Installed app | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M-U7 | Drag-and-drop and media into a question | 3 | Installed app | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| M-U8 | Backup, restore and upgrade with the new UI | 1, 2 | Two builds for the upgrade | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| S1 | Real audible quality of the physical sounds | 5 | Speakers / headphones | **PO-PASS** (Human Hardening Gate, 2026-10-03) |
| P1 | Packaged-product DevTools check on the hosted runner | 3 | Hosted runner WebView2 refuses a debugging port | **NOT RUN** on hosted CI (confirmed again in run 37172021453; unchanged by the Human Hardening Gate); **DEV-PASS** 19/19 on the developer machine at the PH candidate |

## B. Automatable hardening lanes (risk order)

| Lane | Scope | Existing regression oracle | PH state |
|---|---|---|---|
| 1 | Data integrity, durability, crash recovery, backup/restore boundaries, archive corruption | Rust H2/H3/H4/H5 suites, `migration_faults`, `orch-faults`, `task-faults` | See `docs/V2_HARDENING.md` |
| 2 | Migration / upgrade | `core/migrate_v1/tests/*`, `orch-migrated`, archive 2→3 upgrade test | See record |
| 3 | Native Windows / packaging | `package-test.ps1`, `smoke.ps1`, `webview_contract.rs` | See record |
| 4 | Input / international text | `typing-*.spec.mjs`, practice self-test | See record |
| 5 | Accessibility / visual resilience | practice and product self-tests (a11y base) | See record |
| 6 | Performance / bounded resources | `typing-compare-scale`, `typing-long-text`, envelope tests (`QS_HEAVY_MIB`) | See record |
| 7 | Security / privacy / offline boundary | `product-architecture.spec.mjs`, `boundary.spec.mjs`, `webview_contract.rs`, CI "no fault-injection hook" step | See record |

## C. Not PH work (carried, not waived)

- Final application icon and release version → **RC acceptance items.**
- System font stacks: **accepted**; no font assets.
- Code signing, auto-update: outside the frozen V2 Core unless the Product Owner decides otherwise.
- The disposable `spike/desktop-runtime` branch stays unmerged.

## D. Findings (carried to RC as known observations — not resolved)

Defects and observations found during hardening are listed in `docs/V2_HARDENING.md` (section "Findings") with their classification (defect / observation / freeze-reopening candidate).

- **F1** large-history read cost (linear, not small) and **F2** exchange export written in place: both stay **known RC observations**; the Human Hardening Gate PASS does not resolve or remove them.
