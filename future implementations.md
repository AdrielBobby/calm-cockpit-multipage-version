# Future Implementations

Status: Shell `1d66f7b`, Academics `e70ab23`, Gym `6a6f7a2`, Scrapbook `f4341c2` are on `main`; Focus (Pomodoro) is on `main` too. No stack migration needed. Flask + SQLite + vanilla JS can handle everything below.

Legend: [x] done, [ ] not started

## 0. [x] Shell: top-level view navigation
- Done: nav strip above the dashboard (Overview | Academics | Gym | Scrapbook), Excel-sheet-style tabs.
- Built as separate Flask routes (`/`, `/academics`, `/gym`, `/scrapbook`) extending a shared `templates/base.html`; `active_view` highlights the current tab.
- Overview keeps its layout; modals remain for detail drill-downs. Gym and Scrapbook are "coming soon" placeholders until built.
- Phone/tablet: strip scrolls horizontally if it doesn't fit; no page overflow at 820 / 390 / 360px.

## 1. [x] Academics view
- Done at `/academics` (`templates/academics.html`, `static/js/features/academics.js`).
- [x] SGPA graph: Chart.js via CDN (cdnjs), line chart per semester.
- [x] Semester list: add / edit SGPA / delete; re-adding an existing number updates it. SGPA is optional, so a semester can exist before results.
- [x] Marks per semester: new `semester_marks` table (internal / sessional / end-sem, each with a mark and an editable max). Existing internals were migrated in (max assumed 50 for internal and sessional, 100 for end-sem).
- [x] "+ Add semester" button in the Marks card, with subject add / rename / delete.
- [x] ESE calculator moved here from the old grades modal (presets, grade thresholds S to P, saved subjects).
- [x] Overview grades tile is now a CGPA + SGPA summary linking to Academics; the grades modal, `grades-ese.js` and the old `/api/grades/subjects*` and `/internals*` routes were removed.
- Not done / ideas: credit-weighted CGPA (CGPA is a plain average of SGPAs), grade-point conversion, a way to link ESE calculator subjects to the marks table.
- Minor: on phones the Overview grades tile's SGPA table sits narrow instead of full width (pre-existing markup).

## 2. [x] Gym tracking view
- Done at `/gym` (`templates/gym.html`, `static/js/features/gym.js`, `static/js/features/gym-heatmap.js`). Built, tested and committed.
- Decisions: weights in **kg**; presets get an **optional weekday hint** (a "Suggested" chip, never a constraint); **PRs are auto-detected**.
- [x] Calendar heatmap: separate `gym-heatmap.js` (copied the attendance heatmap's approach rather than parameterising it, so the attendance modal is untouched). 7 rows Mon-Sun, 26-week window (14 on phones), hover tooltip, click a day to log.
- [x] Heatmap intensity (4 levels, teal): none -> went -> went + one bonus -> went + both.
- [x] Day log modal: preset chips (prefill exercises, confirm before replacing), editable exercise rows (three blank per-set rep boxes + kg, name autocomplete), cardio and 10k+ steps checkboxes, free-text notes, delete day. Past days can be logged via the "Log another day" date picker; future days are rejected.
- [x] Workout presets: create / edit / delete, any preset usable on any day. Presets are snapshotted by name in the log, so deleting one never changes history.
- [x] PRs: a row is a PR when it beats the best earlier weight for that exercise (first-ever entry is the baseline, not a PR). Shown as a badge in the log, announced on save, and listed in the Personal Records card. Computed at read time, so editing an old day keeps later flags consistent.
- [x] Per-set reps: each exercise has Set 1/2/3 rep boxes (any can be blank) stored in `gym_exercise_log.set_reps` (comma list, added by an automatic `ALTER TABLE`). `sets` and `reps` are still filled (count done / best set) for PRs; old rows load as sets x reps.
- [x] Tables: `gym_preset`, `gym_preset_exercise`, `gym_log`, `gym_exercise_log` (created in `init_db_schema()`).
- Not done / ideas: per-exercise progress graphs (data model supports it), per-set weights (currently one kg per exercise), loading the user's weekly gym log in as presets with their exercises (presets store names only), streaks, copy-last-workout.

## 3. [x] Scrapbook / noticeboard
- Done at `/scrapbook` (`templates/scrapbook.html`, `static/js/features/scrapbook-core.js` (API, modals, pan/zoom, drag helpers), `scrapbook.js` (boards + graph), `scrapbook-canvas.js` (node canvas)). Built, tested and merged into `main`.
- [x] Boards: create / rename / delete from a board picker + "Board settings" modal. A board is just a named space (e.g. "Ideas") and can hold nodes for several projects.
- [x] Project links live on **nodes**, not boards (changed after first build): the node modal has a "Linked project" dropdown, including for the main node (linking the main node = the old "board for one project" case, and the header then shows "Project: X"). A project can be linked to one node across all boards; projects linked elsewhere are disabled in the dropdown with where they're linked (server returns 409). Linked nodes show a pill with the project name and status (Projects-modal colours). Deleting a project unlinks its node. `board_nodes.project_id` (partial unique index) + `GET /api/scrapbook/project-links`; older DBs keep an unused `boards.project_id` column.
- [x] Graph view (entry screen): main node plus category-coloured child nodes as HTML cards over an SVG edge layer, custom code with no library. Drag nodes anywhere (position saved on drop), click a node to open its canvas, hover "+" adds a branch, "..." edits (rename, recategorise, delete). Deleting a node also deletes the nodes branching from it and their canvases. The main node can't be deleted (delete the board instead); renaming it renames the board.
- [x] Auto-placement: new nodes fan out around their parent, pointing away from the grandparent, at the least crowded angle (tries 3 rings). No force simulation.
- [x] Canvas: sticky notes (double-click to edit, 4 colours, resizable), images (file picker, drag-and-drop or paste; polaroid frame, resizable), free pins. New items spawn in the nearest free spot. Drag to move (brought to front), Delete key or hover "x" removes (confirm for images and non-empty notes).
- [x] Strings: "String" tool, click item A then item B; 5 colours; sagging quadratic curves anchored at each item's pin head, redrawn live while dragging. Click a string to select it, then the "x" at its middle or Delete removes it. Visible strings are drawn above items; their click targets sit below items so a click on an item never grabs a string.
- [x] Pan (drag the background) + zoom (wheel, toolbar -, Fit, +) on both graph and canvas. Last-opened board remembered in localStorage.
- [x] Images: `POST /api/scrapbook/upload` (png/jpg/gif/webp, 10 MB max via `MAX_CONTENT_LENGTH`) saves a random filename into `instance/uploads/`, served by `/scrapbook-files/<name>`. Files are deleted when no item references them any more (item, node or board delete).
- [x] Tables: `boards` (name), `board_categories` (seeded presets + custom), `board_nodes` (board, parent, category, title, x, y, project_id), `board_items` (node, type note/image/pin, x, y, w, h, z, content, colour, image_path), `board_links` (node, from_item, to_item, colour). Created in `init_db_schema()`.
- [x] Categories: "Categories" button on the graph toolbar opens a manager. Custom categories can be added, renamed (click the name; Enter saves, Escape cancels; nodes using it are renamed too) and deleted (if nodes use it, you pick a category to move them to first). Built-in ones are read-only. Categories are shared by all boards. Routes: PATCH / DELETE `/api/scrapbook/categories/<id>`.
- Settled while building: preset categories are Ideas, Research, Design, Tasks, Resources, Inspiration (new ones can be added from the node modal or the Categories manager); strings attach to any item (notes, images, pins).
- Phone: usable layout (header compacts, no page overflow at 820 / 390px), but interactions are desktop-first: no pinch-zoom, and hover controls are always shown on touch screens.
- Not done / ideas: pinch-zoom and touch polish, rotating items, image captions, multi-select, undo, recolouring an existing string, moving an item between nodes, recolouring categories, showing a board's summary on the Projects modal.

## 4. [x] Focus view (Pomodoro plan importer)
- Done at `/focus` (`templates/focus.html`, `static/js/features/focus-parser.js` (pure text parser), `focus-timer.js` (pure phase engine), `focus.js` (UI)). Built from the "Padutham Timer" PRD, milestones 1-4.
- Decisions: **phases never auto-start**: when one ends it chimes (WebAudio), sends a browser notification and waits for "Start break" / "Start next". Default 25 / 5 / 25 min, long break every 4; settings are per plan.
- [x] Import: paste a plan, live preview, then Create. Recognises `Pomodoro 1 — Title`, `Pomodoro 1: Title`, `Session 1: Title`, `1. Title`, `1) Title`, `#1 Title` (markdown stripped). If any Pomodoro/Session lines exist only those count, so numbered sub-points become description. A spaced dash splits off a description (a colon does not: "DDL: CREATE, ALTER" stays the title). Bulleted/indented/following lines append to the description; headings and "Short break" lines are ignored. Plan name comes from the first line before the sessions. Warns about repeated or missing numbers.
- [x] Multi-Pomodoro topics: tables (markdown `| Topic | Pomodoros | Coverage |` or tab-separated text copied from a rendered chat table; columns picked by header name) and line forms `Pomodoro 2–3 — Title`, `Title (2 Pomodoros)`, `Title x2`, `Title — 2 pomodoros`. A topic worth N becomes `Title (1/N)` … `(N/N)`; if its coverage has exactly N `;`-separated parts, each Pomodoro gets one part. Max 12 per topic. Queue rows have a **+1** button (`POST /api/focus/sessions/<id>/extend`) that inserts another Pomodoro for that topic and renumbers its parts.
- [x] Timer: running phases store `ends_at` (epoch ms) and the countdown is recomputed from it, so it survives refreshes and background tabs; paused phases store `remaining_sec`. A phase that ran out while the page was closed is finished silently on load. Countdown shows in the tab title. Space pauses/resumes.
- [x] Controls: Start, Pause/Resume, Mark complete (counts), Skip (marked skipped, never counts toward the long break), Stop (session stays pending), Skip break / End break.
- [x] Queue: inline edit title + description (Enter / Escape), Skip / Restore, delete. Stats: done / total, focus time left, estimated finish including breaks, progress bar.
- [x] Plans: picker (last one remembered in localStorage), settings modal with rename and delete.
- [x] Tables: `focus_plans`, `focus_sessions` (pending / completed / skipped, completed_at), `focus_timer` (one row per plan). Routes under `/api/focus/*`.
- Not done / ideas: AI import (PRD milestone 5: Claude API endpoint for messy planner replies, needs an API key on the server), daily/weekly focus stats (data supports it via `completed_at`), drag-to-reorder sessions, an Overview tile for the active plan, linking plans to Academics subjects.

## Dropped
- Valorant tracking page: no public Riot API for player stats, so it was scrapped.

## Cross-cutting notes
- Uploaded images need persistent disk on the host (relevant to hosting plan: Oracle Always Free OK; ephemeral platforms not). Back up `instance/cockpit.db` and `instance/uploads/` together.
- `app.py` keeps growing (no Blueprints yet; Academics, Gym and Scrapbook routes are all inline, ~2100 lines): splitting into Flask Blueprints per view is the next cleanup. One JS file per view in `static/js/features/` is the pattern in use (Scrapbook uses three).
- Build order: nav shell (done) -> Academics (done) -> Gym (done) -> Scrapbook (done).
- Housekeeping: everything is pushed to GitHub (origin/main).
