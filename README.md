# Job Tracker — Posting Closed

A separate, one-click Chrome extension for a posting already saved in Job
Tracker. After you determine the posting is closed, click the orange briefcase
button to set that record to **Posting Closed**.

## Install

Deploy the backend's `PATCH /applications/by-url/status` endpoint first. See
[the deployment checklist](../job-tracker-docs/POSTING_CLOSED_DEPLOYMENT.md).

1. Create your local `manifest.json`: copy `manifest.example.json` to
   `manifest.json` and replace `http://tracker.example/*` with your tracker
   origin, keeping the final `/*`. Alternatively, with Node 22+ installed, run
   `npm run configure -- http://your-tracker-host`.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select this directory (the one containing
   `manifest.json`). No build or dependency installation is needed.
4. Pin **Job Tracker — Posting Closed** using Chrome's Extensions menu.

The public repository contains only a placeholder manifest template. Your
generated `manifest.json` is ignored by Git, keeping the tracker address local.
To change it, edit its single `host_permissions` entry or rerun the configure
command. After pulling template updates, rerun configure with your tracker
origin to refresh the local manifest.
Use the frontend origin, without `/api`; the client adds that prefix. Reload
the extension after changing the manifest. Do not expose the unauthenticated
tracker publicly; this extension uses the existing LAN deployment.

## Use

Open a posting from Job Tracker, wait for loading to finish, check whether it
is closed, then click the orange briefcase once.

| Badge | Meaning |
|---|---|
| `...` | The update is in progress |
| `DONE` | Saved, or already Posting Closed; hover for the record ID/company/title |
| `ERR` | Hover over the button for the reason and next action |

Refresh Job Tracker to see the change. Its Active filter may now hide the row;
choose Posting Closed or All to find it. Correct an accidental click through
the normal status editor in Job Tracker.

The URL must match the saved `job_link` **exactly**, including queries, case,
fragments, and trailing slash. A redirect or added tracking parameter can
produce a no-match error. The extension does not guess which record you meant.
Duplicate URL matches and archived matches require manual resolution in Job
Tracker. Nothing is created, archived, or scraped. Other fields, including
the next action, are preserved.

A timeout or connection failure can occur after the server saved the update.
The message therefore says the result is unknown. Check Job Tracker or retry;
setting an already-closed status adds no duplicate history.

## Development and verification

Plain JavaScript, Manifest V3, no runtime/build dependencies. Node 22+ is used
only for development tests and the optional configuration command.

```powershell
npm.cmd test
../job-tracker-backend/.venv/Scripts/python.exe scripts/smoke-test.py
```

The smoke test needs the sibling backend and its installed development
environment. On Linux, use its `.venv/bin/python` instead. It migrates a unique
temporary SQLite database, runs a loopback-only Python API, and exercises the
real JS handler/client with five job-site URL forms. It removes its temporary
database when finished. It does not open or scrape real postings.

Regenerate the committed PNG icons on Windows with
`./scripts/generate-icons.ps1`. Their briefcase motif follows the import
extension; orange and a minus distinguish this action from saving a new job.

Verified 2026-09-11: 46 extension tests; 304 backend tests; real-HTTP smoke test;
122 existing importer tests. Backend deployment succeeded and the owner
confirmed a successful manual Chrome test on the same date. This confirms the
basic workflow; all-site redirect behavior and concurrent MariaDB requests were
not separately verified live.
