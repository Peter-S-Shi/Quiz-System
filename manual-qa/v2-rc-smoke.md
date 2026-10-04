# V2 Release Candidate — Product Owner smoke guide (2.0.0-rc.1)

About 15–30 minutes, on the **exact candidate installer**. This is not another Hardening session: it checks that the packaged candidate carries the right identity and that the delivery-critical journeys work on it. Use synthetic data only; never your real learning data.

Record **PASS / FAIL / NOT RUN** for each item with the date and the installer you used. **Nothing here is PASS until you perform it**; this guide pre-marks nothing. An item whose setup you do not have stays NOT RUN with the reason.

## Setup (once)

1. Download the candidate installer from the green CI-L3 run (run 37176744235, artifact `quiz-studio-2.0.0-rc.1-cec737b-installer`) and compare its SHA-256 with `34FE8E4DD189DB6281104C9D0EDE7B6178E1EA10A39A2243AE948E43774F052F` (`rc-evidence.json`, also in `docs/V2_RELEASE_CANDIDATE.md`).
2. Build the synthetic fixtures: `powershell -File desktop\scripts\make-hardening-pack.ps1 -Out "$env:TEMP\qs-rc-pack" -BigBackupMiB 8 -DropFileGiB 1` (a small big-backup is enough here; skip the 1 GiB file if you like).
3. For a clean, harmless run use the seeded sample data: after installing, start the app from a prompt with `$env:LOCALAPPDATA="$env:TEMP\qs-rc-pack\data-root"` set, or simply let the app create a fresh data folder on a test Windows profile.

## Checks

| # | Check | Steps | Expected | Result |
|---|---|---|---|---|
| R1 | Installer and identity | Run the installer. Look at the installer file, the Start-menu entry, the window/taskbar icon and Settings → System | Per-user install without an administrator prompt; the **Ink-tail Q** icon on the installer, Start menu, window/taskbar and in Windows *Installed apps*; Settings → System shows `Quiz Studio 2.0.0-rc.1` | |
| R2 | Clean launch | Start from the Start menu | The app opens on Today with a healthy store chip; no error dialog | |
| R3 | Objective journey with media | Library → *Figures and sounds* (seeded) → Practice. Answer, finish, read the result | The image shows, the sound plays, the explanation appears in the right place for the chosen feedback mode, the score hero and per-question cards show, the attempt is in Evidence history | |
| R4 | Translation / Teacher Review | Library → the seeded translation document → practice, finish; open Review and save a review | The response and the review are separate records in History / Review | |
| R5 | Typing journey | Library → New → Typing text (paste a short passage) → Practice and type it → finish | The result shows *Time taken*; History lists the attempt | |
| R6 | Today / Calendar start path | Today → start a suggestion; then Calendar → open a day and start or move an occurrence | The session records its reason; the Calendar change shows with its identity | |
| R7 | Backup and restore | Exchange & backup → *Back up now…* → save. Add a new paper. *Choose a backup…* → confirm | The paper added after the backup is gone and the original data is back; a snapshot of the pre-restore data exists | |
| R8 | Representative V1 migration | Settings → System → *Import from Quiz Studio V1* → *Choose V1 backup…* → `v1\normal\r-full.json` → preview → confirm. Then choose `v1\blocked\truncated-backup.json` | The first imports (history, review, media appear) and importing it again says it is already imported; the truncated file is refused with an explanation and changes nothing | |
| R9 | Upgrade preservation (only if you have a pre-RC build installed) | With data in the app, install the RC over it | The same data is there after the upgrade. If you have no earlier build: NOT RUN | |
| R10 | Uninstall data choice (only if you want to re-check; the exact-RC packaging did not change it since Hardening) | Uninstall twice: delete-data box unticked, then ticked | Unticked keeps your data; ticked removes it. Optional | |

## If something fails

Write the item, what you did, what you saw, and the installer name. A failure in data integrity, security, migration / upgrade, accessibility or a frozen workflow is a release blocker and is reproduced and repaired; anything else is recorded and carried. A repair changes the candidate and needs fresh exact-candidate evidence.
