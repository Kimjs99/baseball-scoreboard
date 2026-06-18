# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A baseball scoreboard single-page app deployed as a **Google Apps Script web app** — no Node server. The frontend is one HTML file served by Apps Script's `HtmlService`; the backend is a couple of `Code.gs` functions.

**The JSX and Tailwind are PRE-COMPILED at build time** into plain inline JS + static inline CSS. This is deliberate: the Apps Script sandboxed iframe breaks browser-runtime Babel-standalone (white screen) and Tailwind Play CDN. So React UMD is loaded from CDN, but the app code and all CSS are static. **Never re-introduce `text/babel` or `cdn.tailwindcss.com` — edit `src/app.jsx` and rebuild instead.**

## Layout

```
src/
  app.jsx               # SOURCE OF TRUTH for the React component (JSX). Edit here.
  index.template.html   # HTML shell with /*__APP__*/ and /*__TAILWIND__*/ placeholders
  tw-input.css          # @tailwind base/components/utilities
build.cjs               # JSX→JS (Babel standalone) + Tailwind scan → writes apps-script/Index.html
tailwind.config.cjs     # content: ['./apps-script/Index.html'] (scans the built file)
apps-script/
  Index.html            # GENERATED — do not hand-edit; produced by `npm run build`
  Code.gs               # doGet (serves Index) + doPost (writes results to Sheets) + authorize() helper
  appsscript.json       # Web app manifest
.clasp.json             # clasp config — rootDir points at apps-script/
```

## Commands

Build first (regenerates `apps-script/Index.html` from `src/`), then deploy with `clasp` (v3.x; from repo root):

```bash
npm install                         # one-time: @babel/standalone, tailwindcss
npm run build                       # src/app.jsx + Tailwind → apps-script/Index.html (REQUIRED after editing src/)
clasp push                          # upload apps-script/* to the script project
clasp create-deployment -d "desc"   # NEW versioned deployment → new /exec URL
clasp redeploy <deploymentId>       # update an EXISTING deployment in place (keeps URL)
clasp list-deployments              # find deployment IDs
clasp open-web-app                  # open the deployed app in a browser
clasp open-script                   # open the Apps Script editor
clasp tail-logs                     # view Stackdriver logs
```

Editing flow: change `src/app.jsx` → `npm run build` → `clasp push` → (re)deploy. Changes are NOT live until pushed **and** (re)deployed. `@HEAD` deployment reflects the latest push; versioned deployments are frozen snapshots.

## Architecture notes that span files

- **Front/back coupling via template injection.** `doGet` renders `Index.html` as an Apps Script *template* (`createTemplateFromFile`) and injects `template.webAppUrl = ScriptApp.getService().getUrl()`. The app code reads it as `const WEB_APP_URL = "<?= webAppUrl ?>"` and uses it as the default result-export target. So the app POSTs results back to *its own* `/exec` URL — `doPost` and the export button are the same endpoint. The `<?= webAppUrl ?>` scriptlet lives in `src/app.jsx` as a plain string literal and survives Babel compilation; the template substitution happens server-side at serve time. Keep it intact.

- **doPost contract.** The browser sends results with `fetch(..., { mode:'no-cors', headers:{'Content-Type':'text/plain;charset=utf-8'} })`. `no-cors` forces a simple request, so the JSON body lands in `e.postData.contents` and `doPost` `JSON.parse`s it. Do **not** switch this to `application/json` — that triggers a CORS preflight Apps Script can't answer. The payload shape (`{date, awayTeam, homeTeam}` each with `name/runs/hits/scores/lineup`) is produced in `handleExportWebhook` and consumed in `saveGameResult_`; changing one side requires changing the other. Results accumulate into two sheets (`경기요약`, `타자기록`) in a spreadsheet auto-created on first POST, whose ID is cached in Script Properties (`RESULT_SPREADSHEET_ID`).

- **Game state machine (`src/app.jsx`).** All scoring logic is React `useState` in `BaseballScoreboard`. The invariant: every action handler calls `saveHistory()` **before** mutating state (history is the Undo stack of deep-cloned snapshots). Flow is `updateStats` (runs/hits/at-bats + per-inning score array) → `advanceBatter` / `addOut` → `switchInning`. `scores` starts as a 9-length array and is grown on demand for extra innings (`while (newScores.length < inning) push(0)`); `displayInnings = Math.max(9, inning)` drives the table columns. Note `addOut` advances the batter *before* `switchInning` on the 3rd out so the next half-inning leads off correctly.

## Deployment gotchas

- **First-run authorization (HTTP 403).** Even with `ANYONE_ANONYMOUS` access, a freshly deployed web app returns 403 to everyone until the **deploying account authorizes the OAuth scopes once** (SpreadsheetApp etc.). The owner must open the `/exec` URL (or run a function in the editor) and accept the consent screen. This is interactive and cannot be scripted.

- **`clasp create-script` clobbers `appsscript.json`.** Creating/cloning a script overwrites the manifest with a default (wrong timezone, no `webapp` block). After any such operation, re-add the `webapp` block (`executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`) and `timeZone: Asia/Seoul`, then `clasp push`. clasp v3.x has **no** `--type webapp` — use `--type standalone` and rely on the manifest for web-app config.

- **White screen = runtime compilation blocked.** The Apps Script sandboxed iframe breaks in-browser Babel-standalone and Tailwind Play CDN, rendering a blank white page (React never mounts). This is why the build pre-compiles everything. If you see a white screen after a change, check you ran `npm run build` and that no `text/babel` script or `cdn.tailwindcss.com` slipped back into the output. After redeploying, hard-refresh — Apps Script caches the iframe content aggressively.
