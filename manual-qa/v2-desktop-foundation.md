# V2 Desktop Foundation — manual acceptance checklist

Packaged-app checks that cannot be automated on the development machine or CI. They carry over from the Desktop Architecture Gate (ADR 0001 §14 "Deferred to Desktop Foundation / packaged acceptance"). Use synthetic files only; run on an installed per-user build (`quiz-studio` NSIS installer). Record the result next to each item (PASS / FAIL / not run, date, runtime version).

Before you start: if the disposable spike app is installed it shares the permanent identifier and data folder. Back that folder up or use a separate Windows profile.

| # | Check | Steps | Expected |
|---|---|---|---|
| D1 | Native **Open** dialog | Settings → System → *Add a file…*; pick an image from a normal folder and from a folder with CJK characters; repeat with *Restore from backup…* choosing a `.qsarchive` | The OS dialog opens, the chosen file is stored (hash shown; no preview in this milestone), restore verifies and asks for confirmation; cancelling changes nothing |
| D2 | **Drag-and-drop** ≥ 1 GiB | Drag a ≥ 1 GiB synthetic file onto the drop zone | Window stays responsive, progress bar advances, file is stored; process memory stays low (< 300 MiB working set) |
| D3 | **OneDrive-redirected** Desktop/Documents | *Create backup…* and save into the redirected Desktop and Documents; then *Restore from backup…* from the same places | Archive written and verified; restore works; data folder remains under `%LOCALAPPDATA%` (not in OneDrive) |
| D4 | **Runtime-less WebView2** | On a machine/profile without the Evergreen WebView2 runtime, run the installer interactively with network access | The bootstrapper downloads and installs the runtime, then the app starts |
| D5 | Uninstall checkbox | Uninstall interactively twice: once leaving the "delete application data" box unticked, once ticked | Unticked keeps `%LOCALAPPDATA%\io.github.peter-s-shi.quiz-studio`; ticked removes it |

Automated counterparts (for context): launch/single-instance/network/crash smoke and silent install/upgrade/uninstall run in CI (`scripts/smoke.ps1`, `scripts/package-test.ps1`); 400 MiB streaming ingest/archive/restore memory envelope runs in `qs-scenarios`.
