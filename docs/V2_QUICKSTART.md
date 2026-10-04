# Quiz Studio V2 — desktop quick start (Release Candidate 2.0.0-rc.1)

Quiz Studio V2 is a Windows desktop app for local-first practice: Objective papers, Translation practice with Teacher Review, and Typing practice, with an evidence history and a study calendar. It runs entirely on your computer, with no account, no cloud and no network use.

> **Status: release candidate.** `2.0.0-rc.1` is the candidate for `2.0.0`. It is verified on **Windows only** (Windows 11, WebView2). macOS is deferred and **not verified**. It is not yet released.

## Install and launch

1. Run the installer (`quiz-studio_2.0.0-rc.1_x64-setup.exe`). It installs **per user**; it does not need administrator rights.
2. The app needs the Microsoft **WebView2** runtime, which current Windows 11 already includes. If it is missing, the installer downloads it once; that is the only time the installer uses the network.
3. Start **Quiz Studio** from the Start menu. **Settings → System** shows the version (`Quiz Studio 2.0.0-rc.1`).

## Where your data lives

Everything you create is stored on your computer, in your personal Windows application-data area, in one data folder owned by the app. You never need to find it: use **Exchange & backup** to keep copies, and the app never sends anything anywhere. Do not edit that folder by hand.

## The main views

- **Today** — what to practice now: suggestions with the reasons they were chosen, items that are due, and an unfinished session you can continue. Starting from here records why you started.
- **Calendar** — your study schedule by month. Move, skip or cancel an occurrence; suggested dates wait for your decision.
- **Library** — your material. **New** creates an Objective paper, a Translation document or a Typing text. Each row shows a quiet factual state: *Not started*, *In progress* or *Practiced* (a fact, not a mastery level). Choose an item to practice it; Objective papers can optionally shuffle the question order.
- **Focused Practice** — one distraction-free surface for all three kinds. Objective supports instant feedback or *submit at the end*; Translation lets you mark uncertain sentences; Typing follows long text and works with input methods. Closing mid-session asks whether to save and leave or discard.
- **Evidence history** — every finished attempt as recorded facts (scores for Objective, time taken for Typing), with retry of missed questions.
- **Review** — Teacher Review of a Translation response, kept as separate records.
- **Settings** — language (English / 简体中文), appearance, sounds (off by default), media files, and **System** (version, store health, V1 import).

## Back up and restore

**Exchange & backup → Backup → Back up now…** writes one `.qsarchive` file with your material, evidence, reviews and media. To restore, choose **Choose a backup…**, review the preview, then confirm. A snapshot of your current data is kept automatically before it is replaced, and cancelling changes nothing.

## Bring in data from Quiz Studio V1

**Settings → System → Import from Quiz Studio V1 → Choose V1 backup…**. You get a preview first (counts, media, notes, what V1 never contained); nothing changes until you confirm. Importing the same backup twice is recognised and does nothing. The import can be undone while nothing else depends on it. A file that is not a V1 backup is refused with an explanation and changes nothing.

## Uninstall

Uninstall from Windows Settings. The uninstaller asks whether to **delete your application data**: leave the box unticked to keep your data for a later reinstall, or tick it to remove everything.

## Known limitations in this candidate

- **Large histories load slower.** Library state and Today read the whole history; after several thousand finished sessions these views take noticeably longer to appear (see `docs/V2_RELEASE_CANDIDATE.md` for the measured numbers). Nothing is lost or wrong.
- **Export overwrites the file you choose in place.** An exchange export writes directly to the file you pick in the Save dialog. It never touches your Quiz Studio data; if a write fails, only that export file is affected.
- **Windows only.** macOS and Linux are not supported or verified.
- The application is not code-signed and does not update itself; Windows may show an "unrecognized app" prompt on first run.
