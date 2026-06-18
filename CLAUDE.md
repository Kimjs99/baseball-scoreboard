# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A baseball scoreboard single-page app deployed as a **Google Apps Script web app** — no Node server, no bundler, no build step. The entire frontend is one HTML file served by Apps Script's `HtmlService`; the backend is a couple of `Code.gs` functions. React/JSX/Tailwind run **in the browser** via CDN + Babel-standalone.

## Layout

```
apps-script/
  Index.html       # Entire React app (UMD React + Babel-standalone + Tailwind CDN), one <script type="text/babel">
  Code.gs          # doGet (serves Index) + doPost (writes results to Sheets)
  appsscript.json  # Web app manifest
.clasp.json        # clasp config — rootDir points at apps-script/
```

## Commands (clasp)

There are no tests, lint, or build. The dev/deploy loop is entirely `clasp` (v3.x; run from repo root):

```bash
clasp push                          # upload apps-script/* to the script project
clasp create-deployment -d "desc"   # NEW versioned deployment → new /exec URL
clasp redeploy <deploymentId>       # update an EXISTING deployment in place (keeps URL)
clasp list-deployments              # find deployment IDs
clasp open-web-app                  # open the deployed app in a browser
clasp open-script                   # open the Apps Script editor
clasp tail-logs                     # view Stackdriver logs
```

After editing any file under `apps-script/`, changes are NOT live until `clasp push` **and** a (re)deploy. `@HEAD` deployment reflects the latest push; versioned deployments are frozen snapshots.

## Architecture notes that span files

- **Front/back coupling via template injection.** `doGet` renders `Index.html` as an Apps Script *template* (`createTemplateFromFile`) and injects `template.webAppUrl = ScriptApp.getService().getUrl()`. Index.html reads it as `const WEB_APP_URL = "<?= webAppUrl ?>"` and uses it as the default result-export target. So the app POSTs results back to *its own* `/exec` URL — `doPost` and the export button are the same endpoint. Keep the `<?= webAppUrl ?>` scriptlet intact when editing Index.html.

- **doPost contract.** The browser sends results with `fetch(..., { mode:'no-cors', headers:{'Content-Type':'text/plain;charset=utf-8'} })`. `no-cors` forces a simple request, so the JSON body lands in `e.postData.contents` and `doPost` `JSON.parse`s it. Do **not** switch this to `application/json` — that triggers a CORS preflight Apps Script can't answer. The payload shape (`{date, awayTeam, homeTeam}` each with `name/runs/hits/scores/lineup`) is produced in `handleExportWebhook` and consumed in `saveGameResult_`; changing one side requires changing the other. Results accumulate into two sheets (`경기요약`, `타자기록`) in a spreadsheet auto-created on first POST, whose ID is cached in Script Properties (`RESULT_SPREADSHEET_ID`).

- **Game state machine (Index.html).** All scoring logic is React `useState` in `BaseballScoreboard`. The invariant: every action handler calls `saveHistory()` **before** mutating state (history is the Undo stack of deep-cloned snapshots). Flow is `updateStats` (runs/hits/at-bats + per-inning score array) → `advanceBatter` / `addOut` → `switchInning`. `scores` starts as a 9-length array and is grown on demand for extra innings (`while (newScores.length < inning) push(0)`); `displayInnings = Math.max(9, inning)` drives the table columns. Note `addOut` advances the batter *before* `switchInning` on the 3rd out so the next half-inning leads off correctly.

## Deployment gotchas

- **First-run authorization (HTTP 403).** Even with `ANYONE_ANONYMOUS` access, a freshly deployed web app returns 403 to everyone until the **deploying account authorizes the OAuth scopes once** (SpreadsheetApp etc.). The owner must open the `/exec` URL (or run a function in the editor) and accept the consent screen. This is interactive and cannot be scripted.

- **`clasp create-script` clobbers `appsscript.json`.** Creating/cloning a script overwrites the manifest with a default (wrong timezone, no `webapp` block). After any such operation, re-add the `webapp` block (`executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`) and `timeZone: Asia/Seoul`, then `clasp push`. clasp v3.x has **no** `--type webapp` — use `--type standalone` and rely on the manifest for web-app config.
```
