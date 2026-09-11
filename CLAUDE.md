# Posting Closed extension — project context

Separate manual Chrome action for Job Tracker. Implemented locally on
2026-09-11. Backend deployed at `16398b1`; the owner tested the extension manually
and confirmed it worked. The initial manual closure feature is complete.

## Shared context

Read the sibling docs checkout, not detached backend/frontend submodule copies:

@../job-tracker-docs/POSTING_CLOSED_EXTENSION_PLAN.md
@../job-tracker-docs/POSTING_CLOSED_DEPLOYMENT.md

The owner chose **manual deployment**. Do not assume anything was committed,
pushed, installed, or deployed merely because tests passed; check current Git
and server state. This is a separate Git repository on `main`, with `origin` at
`https://github.com/nevans-job-tracker/chrome-extension-job-tracker-close-posting.git`.
The owner requested connecting and publishing this remote on 2026-09-11.

## Contract and design

- `PATCH {trackerOrigin}/api/applications/by-url/status` with exactly
  `{job_link: capturedTabUrl, status: "posting_closed"}`.
- The installed manifest's single `host_permissions` entry is the configuration
  source; `src/api.js` derives the origin from it. Only `manifest.example.json`
  with a placeholder address is tracked. `scripts/configure.mjs` creates the
  ignored local `manifest.json` from that template. Never force-add the local
  manifest or put its address into public documentation.
- 200 returns `id`, `company`, `role_title`, `job_link`, `status`, and `changed`.
  404 means no exact match; 409 means duplicate/archived; 422 means invalid
  input. An older backend's generic 404 gets a deploy-first message.
- No URL normalization. The backend verifies SQL candidates with Python
  equality; it locks matches on MariaDB and delegates writing to
  `crud.update_application` so status and history commit together.
- Plain MV3 module service worker. No popup: `action.onClicked` is the one-click
  trigger. Only `activeTab` plus tracker host access; no scraper/content scripts.
- Per-tab badge and tooltip feedback. Same-URL in-flight clicks share a request.
  Navigation invalidates previous feedback; late responses cannot label another
  posting. Toolbar setter promises are settled before queued resets run.
- Timeout covers both fetch and the response body. Transport/server errors
  can mean the server committed: display an unknown result, never false success.
- No automatic retries, automatic closure detection, batch API, or scheduler.
- Tests: `npm test`; real HTTP integration:
  `../job-tracker-backend/.venv/Scripts/python.exe scripts/smoke-test.py`.
  See README for Linux and verification limits.

## Next session

Public-repository preparation: the initial unpublished commit was rewritten to
exclude the configured manifest and use the owner's public GitHub username and
noreply email for both author and committer. Repo-local Git identity keeps future
commits from inheriting the global personal email. The local configured manifest
was preserved in place, so the Chrome installation directory is unchanged.

The owner has confirmed the manual workflow works. No further implementation
or deployment is needed for the initial feature. If exact matching frequently misses
real redirects, discuss that evidence before adding site-specific URL handling.
