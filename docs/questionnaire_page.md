# Global Questionnaire Page

## Summary

Add a global questionnaire feature that works on either `amba-test` or `amba-play`: the GM designs questions in Admin, players fill them out on a new dedicated Questionnaire page, and responses are stored as JSON until the site moves to Postgres.

## Key Changes

- Add a new `questionnaire.html` page linked from the shared navigation and guide links.
- Make the default `questionnaire.html` experience the player-facing form once a player is logged in.
- Add `data/runtime/questionnaire.json` as the first explicit global runtime save file for site-wide data that is not tied to an adventure/run.
- Wire `questionnaire.json` through the existing runtime JSON/defaults and backup/import/export helpers instead of storing it under an adventure file.
- Use this JSON shape:
  - `questions`: ordered list of `{ id, type, label, required, options, createdAt, updatedAt }`
  - `responses`: one row per logged-in user email: `{ email, handle, answers, submittedAt, updatedAt }`
- Support question types:
  - `text`: free-form textarea
  - `select`: dropdown, single answer
  - `checkbox`: multiple answers
  - `radio`: single answer
- Keep response identity keyed by normalized email. Store the current handle on each response only as display metadata, so handle changes do not create duplicate questionnaire responses.

## Admin Behavior

- Add a new Admin tab: `Questionnaire`.
- GM can use a questionnaire builder to add, remove, reorder, and edit questions.
- Each question has:
  - stable generated `id`
  - prompt text
  - type selector
  - required toggle
  - editable options for dropdown, checkbox, and radio questions
- Builder includes a `View as player` mode that renders the current unsaved client-side draft exactly like the player form before the GM saves it.
- There is no separate publish state in v1: saving the builder replaces the active public questionnaire.
- Removing a question or changing its options does not delete historical answers from saved responses.
- Admin response review should still show answers for removed question ids under an `Archived questions` or `Removed questions` grouping.
- New and edited player submissions validate only against the current active question list.
- Admin can view submitted responses grouped by handle.
- Admin can download questionnaire JSON from a dedicated export button.
- Existing full-site backup/export should include `questionnaire.json`.
- Full-site restore/import should replace `questionnaire.json` with the imported questionnaire data, falling back to an empty default if the imported payload has none.
- User export/import should include only that user's questionnaire response, not the full question builder definition.

## Player Behavior

- Questionnaire page requires the existing email/handle login.
- After login from the Questionnaire page, players land directly in the default player view instead of the schedule flow.
- Each logged-in email has one editable response, displayed by handle.
- If a player revisits the page, their saved answers prefill.
- Submit validates required questions:
  - text requires non-empty text
  - select/radio require one selected option
  - checkbox requires at least one checked option
- After submit, the page shows a saved/updated confirmation.

## API Changes

- `GET /api/questionnaire`: returns public questions plus the current user's response when `email` is supplied.
- `POST /api/questionnaire/response`: saves or updates the logged-in user's response, keyed by normalized email and refreshed with the current handle.
- `GET /api/admin/questionnaire`: admin-only, returns questions and all responses.
- `PUT /api/admin/questionnaire`: admin-only, replaces the question definition after validation.
- `GET /api/admin/questionnaire/export.json`: admin-only JSON download.

## Test Plan

- Add persistence tests confirming questionnaire data survives adventure/run switches.
- Add server tests for questionnaire JSON defaults, admin save, player save/update, required validation, and response export.
- Add tests confirming response identity follows email rather than handle.
- Add tests confirming removed questions/options do not erase historical answers and do not block future submissions.
- Add backup tests confirming full export/restore includes questionnaire data and user export/import includes only the matching user's response.
- Run `npm test`.
- Manually verify:
  - new nav link opens the Questionnaire page
  - unauthenticated users are prompted to log in
  - required validation works for all four question types
  - player response edits overwrite the same handle's previous response
  - Admin can view and export responses
  - backup/export includes questionnaire data

## Assumptions

- Questionnaire is global site-wide, not tied to the live adventure.
- `data/runtime/questionnaire.json` is the concrete global save structure for this feature.
- Players are identified by the existing email login and displayed by their current handle.
- `View as player` is a client-side preview mode in v1, not a separate draft/publish workflow.
- Historical answers are preserved even when questions are edited or removed.
- Postgres migration later should map cleanly from `questions` and `responses` without changing the public UI.
