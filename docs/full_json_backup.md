---
name: Full JSON backup
overview: Server-side timestamped JSON backups, listed in an admin grid, with a three-tab admin shell — large tabbed modal on desktop, full-page admin on phone. Import always coerces so it cannot fail structurally.
todos:
  - id: snapshot
    content: Implement buildExportSnapshot() covering users, all adventures, occupancy, site, feedback, wg index
    status: completed
  - id: backups-api
    content: Store backups under data/runtime/backups with dated filenames; list/create/download/restore APIs
    status: completed
  - id: coerce
    content: Implement coerceImport() that always produces valid runtime JSON and replaces adventure files
    status: completed
  - id: admin-shell
    content: Three-tab admin (Yes, Promote, Backup); desktop large modal, phone full page
    status: completed
  - id: backup-grid
    content: Backup tab with Make backup button and AG Grid of stored backups
    status: completed
isProject: false
---

# Full-system JSON export and structural-safe import

## What gets exported

Live data lives under `data/runtime/` (legacy copies in `data/*.json` are only used on first boot). Export a single JSON snapshot from **runtime**, not secrets (`.env`, admin tokens, Discord/Reddit credentials).

Include:

- **users** — every account: `handle`, `email`, discord/timezone/role/characterStatus/ids/timestamps. Users who never created times keep `slotsAdded: []`.
- **adventures** — every `data/runtime/adventures/*.json` file (not only the live session). Each adventure already holds `times` (slots), `signups` (`votes` / `voteNotes` = who is in/yes/maybe/no/out of each slot), `wgSheets`, `promote`, titles/hooks/links. Empty `times: []` and empty `signups: []` stay as empty arrays.
- **derived views** (for humans / spreadsheets; restore uses the raw objects):
  - `slotsAddedByHandle`: handle → `{ email, timeIds }` (from `times[].createdBy`)
  - `occupancy`: each slot id → list of `{ email, handle, status, note }` from `signups[].votes`
- **site** — `{ defaultSessionId }` from [server.js](server.js) `siteFile`
- **feedback** — `data/runtime/feedback.json`
- **wgExportIndex** — `data/wg-exports-index.json` if present (file names/ownership). Skip binary zip blobs in `data/wg-exports/` (not JSON-restorable the same way).

Existing [GET `/api/export/signups.csv`](server.js) stays; this is a new full dump.

Example shape:

```json
{
  "version": 1,
  "exportedAt": "…",
  "site": { "defaultSessionId": "amba-workflow-test-1" },
  "users": [ { "handle": "Slippery-Signal", "email": "…", "slotsAdded": ["uuid"] } ],
  "adventures": [ { "id": "…", "times": [], "signups": [], "wgSheets": [], "promote": {} } ],
  "occupancy": [ { "adventureId": "…", "timeId": "…", "title": "…", "people": [] } ],
  "feedback": [],
  "wgExportIndex": {}
}
```

Occupancy rows still appear for slots with **nobody** signed (`people: []`). Users with no votes still appear in `users` with empty occupancy.

## Import that cannot fail structurally

`POST /api/admin/import` (admin token, same as other admin APIs):

1. If body is not JSON, treat as `{}`.
2. Coerce with existing helpers: `emptyAdventure`, `jsonDefaults`, `mergePromote`, `safeAdventureId`, `normalizeEmail`. Arrays that are missing/null/wrong type become `[]`. Objects become `{}` then merged with defaults. Unknown extra keys on records are ignored.
3. Write coerced result to runtime (`users.json`, `feedback.json`, `site.json`, replace adventure files). Do **not** return 400/422 for missing nodes.
4. Always respond `{ ok: true, users: N, adventures: N, … }`. Semantic junk (bad emails, unknown vote strings) is dropped or defaulted, not rejected.

Restore is a **replace** of runtime JSON (export → import round-trip). Do not merge with leftover adventure files that are absent from the snapshot: delete adventure JSONs not in the import so the store matches the dump.

Keep the current live-adventure merge behavior (`{ ...emptyAdventure(id), ...data }`) so a half-empty adventure file is still valid after write.

Coerce details from the live model:

- Users without a signup row stay users-only (`votes` not invented).
- Signups with `"votes": {}` stay (empty occupancy).
- Vote values other than `yes` / `maybe` / `no` / `in` are dropped; `leave` is not stored.
- Orphan vote keys (timeId not in `times`) are dropped on import.
- Email is the join key; if email is empty after normalize, drop that user/signup row rather than error.
- Handles missing on import: generate via existing `createHandle` / `normalizeHandle`.
- Derived export fields (`slotsAdded`, `occupancy`) are ignored on import; restore from `adventures` + `users`.

## Server backups (timestamped files)

Store snapshots on disk: `data/runtime/backups/`. **Make backup** writes the snapshot immediately; do not only download.

Filename includes wall-clock date and time, UTC offset-safe and filesystem-safe:

`amba-backup-2026-09-02-175530.json`

JSON also includes `exportedAt` (ISO). List newest first. Restore from a named file uses the same coerce path as a pasted/uploaded JSON (never a structural error). Optional **Restore from file** still uploads a JSON from the admin’s computer and coerce-imports it (also saved into the backups folder if they want a copy — skip extra copy unless they clicked Make backup).

Admin APIs (`requireAdmin`):

- `POST /api/admin/backups` — write a new timestamped file, return `{ name, exportedAt, bytes }`
- `GET /api/admin/backups` — `{ backups: [{ name, exportedAt, bytes }] }`
- `GET /api/admin/backups/file?name=` — download that JSON
- `POST /api/admin/backups/restore` — `{ name }` or raw JSON body; coerce + replace runtime
- `DELETE /api/admin/backups/file?name=` — remove one stored backup (grid action)

Do not put backups under a public static path (`data/` is already forbidden).

## Admin UI: three tabs, layout-specific chrome

Today `+a` opens a **small** password dialog ([header.js](header.js) `adminModal`) then redirects to [admin.html](admin.html), which already has Yes / Promote pills.

**Tabs:** Yes emails | Promote | Backup (same labels, third tab new).

**Desktop** (`data-layout="desktop"`): after password, stay on the current page. Grow `adminModal` into a large shell (`dialog.modal.admin-shell`, ~min(1100px, 96vw) × ~min(88vh), scroll inside). Put the three tabs **inside the dialog**. Password form is step 1; after success, replace the form with the tabbed admin app (no navigation to `admin.html`).

**Phone** (`data-layout="phone"`): do not use a large overlay. After password, go to `admin.html` as a **full page** (the usual phone pattern already used for the rest of the site: sticky header, page hero, wrap-capable tab pills at 44px). Same three tabs and Backup grid.

Extract the current admin page logic into something both hosts can mount (e.g. [admin.js](admin.js) targeting `#adminApp`) so desktop modal and phone page do not fork behavior.

## Backup tab

- Primary button: **Make backup** → `POST /api/admin/backups`, then refresh the grid.
- **AG Grid** (same stack as the scheduler in [src/scheduler.jsx](src/scheduler.jsx)): columns File name, Created, Size, Restore, Download. Empty state when none exist.
- Confirm before Restore (replaces live runtime).

## Files

- [server.js](server.js): snapshot, coerce, backup directory + routes
- New `admin.js` (or equivalent) + [admin.html](admin.html) + [header.js](header.js) / [site.js](site.js) for modal vs page
- [styles.css](styles.css): `.admin-shell` large dialog; keep existing phone tab/page rules

## Out of scope

- `.env` / admin password
- In-memory `adminTokens`
- WG zip file bytes (index only)
