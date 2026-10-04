# V2 Product Hardening — Product Owner manual pack

One coherent session that covers every still-open manual item. It does **not** replace the individual checklists (`v2-desktop-foundation.md`, `v2-migration.md`, `v2-focused-practice.md`, `v2-final-product-ui.md`), which keep the exact steps and expected results. This pack consolidates the **setup** so nothing is prepared twice, and records **one result per item**.

Nothing here is PASS until a person performed it. Record `PASS`, `FAIL` or `NOT RUN` with the environment, the date and the candidate identity. An item whose environment is unavailable stays **OPEN** with the reason; it is not waived.

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
| M-T1b | OPEN | | | | |
| M-T1d | OPEN | | | | |
| M-T1e | OPEN | | | | |
| M-T2a | OPEN | | | | |
| M-T2b | OPEN | | | | |
| M-T2c | OPEN | | | | |
| M-T2d | OPEN | | | | |
| M-U5 | OPEN | | | | |
| M-T3a | OPEN | | | | |
| M-T3b | OPEN | | | | |
| M-T3c | OPEN | | | | |
| M-U1 | OPEN | | | | |
| M-U2 | OPEN | | | | |
| M-U3 | OPEN | | | | |
| M-U4 | OPEN | | | | |
| S1 (sound quality) | OPEN | | | | |
| D1 | OPEN | | | | |
| M-U6 | OPEN | | | | |
| M-U7 | OPEN | | | | |
| M1 | OPEN | | | | |
| M2 | OPEN | | | | |
| M3 | OPEN | | | | |
| M4 | OPEN | | | | |
| M5 | OPEN | | | | |
| D2 | OPEN | | | | |
| M7 | OPEN | | | | |
| D3 | OPEN | | | | |
| M6 | OPEN | | | | |
| M-U8 | OPEN | | | | |
| D5 | OPEN | | | | |
| D4 | OPEN | | | | |

Already **PASS** (Product Owner, 2026-10-03): M-T1a, M-T1c. Automated in CI: M-T4. The hosted-runner packaged DevTools check (P1) is **NOT RUN** on hosted CI by design; developer-machine evidence exists.

## 3. If something fails

Write the item ID, what you did, what you saw and (if you can) a screenshot of the window only. A failure that is a release blocker in a Feature Freeze class (data integrity, security, migration / upgrade, accessibility, a frozen workflow that does not work) is reproduced and repaired under Product Hardening; anything else is recorded and carried to RC without a code change.
