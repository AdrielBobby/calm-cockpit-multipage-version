# Future Implementations

Status: Shell, Academics and Gym are built and committed (`1d66f7b`, `e70ab23`, and the Gym commit after them). Scrapbook is still planning only. No stack migration needed. Flask + SQLite + vanilla JS can handle everything below.

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

## 3. [ ] Scrapbook / noticeboard (needs more planning)
- **One board per project.**
- **Entry screen = graph view** (like graphify's UI): a main node branching into sub-nodes by category. Clicking a node opens that node's **canvas**.
- **Canvas**: pannable board with images, notes, pins; **strings** (SVG curved/sagging lines) connect pins/items, planner-style.
- Tech sketch: absolutely-positioned DOM items + SVG string layer, pointer-event drag; images uploaded to Flask `uploads/`, paths in SQLite. Graph view could use a small lib (d3-force / vis-network / cytoscape) or custom SVG. Konva/Fabric only if rotate/resize/zoom get painful.
- Rough tables: `board_nodes` (parent, category, title), `board_items` (node, type, x, y, size, content/image path), `board_links` (from, to, colour).
- Open questions: how categories are defined; node/graph layout (force vs manual); image storage/backup; zoom/pan; mobile use; how projects relate to the existing Projects modal.

## Dropped
- Valorant tracking page: no public Riot API for player stats, so it was scrapped.

## Cross-cutting notes
- Uploaded images need persistent disk on the host (relevant to hosting plan: Oracle Always Free OK; ephemeral platforms not). Back up DB + uploads together.
- `app.py` keeps growing (no Blueprints yet; Academics routes were added inline): consider Flask Blueprints per view before Gym/Scrapbook. One JS file per view in `static/js/features/` is the pattern in use.
- Build order: nav shell (done) -> Academics (done) -> Gym (done) -> Scrapbook.
- Housekeeping: all finished commits are local only (not pushed).
