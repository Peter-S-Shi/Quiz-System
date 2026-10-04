# V2 Product Hardening — Product Owner manual pack

One coherent session that covers every still-open manual item. It does **not** replace the individual checklists (`v2-desktop-foundation.md`, `v2-migration.md`, `v2-focused-practice.md`, `v2-final-product-ui.md`), which keep the exact steps and expected results. This pack consolidates the **setup** so nothing is prepared twice, and records **one result per item**.

**Executed: the Product Owner performed every item in this pack and the Human Hardening Gate PASSED on 2026-10-03 (PH candidate `4c04181`, CI-L2 [run 37172021453](https://github.com/Peter-S-Shi/Quiz-System/actions/runs/37172021453)).** The rule that produced this is kept for the next pack: nothing is PASS until a person performed it; record `PASS`, `FAIL` or `NOT RUN` with environment, date and candidate; an unavailable environment stays **OPEN**, never waived.

## 0. Setup (once)

```powershell
# 1. fixtures (synthetic; safe to delete afterwards). Needs the repo's Rust + Node toolchain.
powershell -File desktop\scripts\make-hardening-pack.ps1 -Out "$env:TEMP\qs-hardening-pack"

# 2. the candidate build (installed per-user build, or the release exe)
Open Quiz Studio (latest).bat scratch        # quick local build; or install the NSIS installer from the CI artifact
```

For anything that touches real-looking data use the seeded folder so your own data is never touched:

```powershell
$env:LOCALAPPDATA = "$env:TEMP\qs-hardening-pack\data-root"; & "<path to>\quiz-studio.exe"
```

Candidate identity to record: the PH candidate commit and, for an installed build, the version string from the installer (`v2.0.0-dev.0`; the final release version is an RC item).

## 1. Session order (about 90 minutes)

| Block | Items | What you need |
|---|---|---|
| A. Typing and input methods | M-T1b, M-T1d, M-T1e, M-T2a, M-T2b, M-T2c, M-T2d, M-U5 | `text\long-typing-text.txt` (paste its text into *New → Typing text*), Microsoft Pinyin / Japanese IME, a US-International layout, a second monitor at a different scale if you have one |
| B. Accessibility and appearance | M-T3a, M-T3b, M-T3c, M-U1, M-U2, M-U3, M-U4, S1 | Narrator, a High Contrast theme, 200 % scale, speakers (turn *Physical sound* on in Settings) |
| C. Native dialogs and files | D1, M-U6, M-U7 | `media\pixel.png`, `media\tone.wav`; use both a normal folder and the CJK-named folder |
| D. Migration | M1, M2, M3, M4, M5 | `v1\normal\`, `v1\<CJK folder>\`, `v1\blocked\` (3 files) |
| E. Large data | D2, M7 | `media\drop-1GiB.bin`, `v1\big\big-backup.json` (watch the window stays responsive and memory stays bounded) |
| F. Backup, OneDrive, upgrade, uninstall | D3, M6, M-U8, D5 | A Windows profile with OneDrive known-folder redirection (D3, M6); two installer builds for the upgrade; the interactive uninstaller (D5) |
| G. Environment-dependent | D4 | A machine or profile **without** the WebView2 runtime. If none is available, leave D4 OPEN |

## 2. Result sheet

| ID | Result | Environment | Date | Candidate | Note |
|---|---|---|---|---|---|
| M-T1b | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M-T1d | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M-T1e | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M-T2a | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M-T2b | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M-T2c | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M-T2d | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M-U5 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M-T3a | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M-T3b | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M-T3c | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M-U1 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M-U2 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M-U3 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M-U4 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| S1 (sound quality) | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| D1 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M-U6 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M-U7 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M1 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M2 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M3 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M4 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M5 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| D2 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M7 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| D3 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M6 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| M-U8 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| D5 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |
| D4 | PO-PASS | Product Owner's machine (per-item environment not itemised in this record) | 2026-10-03 | `4c04181` | Human Hardening Gate PASS |

Earlier **PO-PASS** (Product Owner, 2026-10-03, Human Gate): M-T1a, M-T1c — history kept as recorded. Automated in CI: M-T4. The hosted-runner packaged DevTools check (P1) stays **NOT RUN** on hosted CI by design (it is not a manual item and was not converted by this Gate); the developer-machine 19/19 is **DEV-PASS**.

## 3. If something fails

Write the item ID, what you did, what you saw and (if you can) a screenshot of the window only. A failure that is a release blocker in a Feature Freeze class (data integrity, security, migration / upgrade, accessibility, a frozen workflow that does not work) is reproduced and repaired under Product Hardening; anything else is recorded and carried to RC without a code change.
