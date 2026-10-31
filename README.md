# Calm Cockpit v2 – Multipage Dashboard

Calm Cockpit is a single-user student dashboard: an at-a-glance Overview plus dedicated pages for the deeper tools. It runs locally on Flask and SQLite with a vanilla JavaScript front end.

## Pages and features

| Page | What it does |
|---|---|
| **Overview** (`/`) | Today's timetable, attendance snapshot, CGPA, weekly goals, in-progress projects, a month calendar and a Tasks & Events panel. Modals open the full timetable, attendance details, goals, projects and calendar. |
| **Assignments** (`/assignments`) | Assignments with a subject, due date, status (not started / in progress / submitted) and notes. Past-due, unsubmitted items move to an Overdue column. Due dates also show on the Overview calendar. |
| **Academics** (`/academics`) | SGPA graph (Chart.js), semester list, per-semester marks and grades, and the ESE grade calculator. |
| **Gym** (`/gym`) | Workout heatmap, day logs with per-set reps and weights, presets and automatic personal records. |
| **Scrapbook** (`/scrapbook`) | Boards of linked nodes, each with a canvas of notes, images and pins joined by strings. Image uploads are stored on disk. |
| **Focus** (`/focus`) | Paste a study plan, turn it into Pomodoro sessions and run the timer. |

Other behaviour worth knowing:
- **Close attendance / migrate semester:** from the attendance modal you can close the semester's attendance. While closed, marking is blocked and the timetable tiles are empty. "Migrate to next sem" wipes the timetable, subjects, holidays and attendance and seeds the next semester's subjects.
- **Readable ids:** every row has a text id such as `proj_6`, `sem_1`, `evt_12` or `asg_3`. Create forms suggest the next id and let you type your own.
- **Finance:** the Overview finance tile was removed. The `/api/finance/*` routes and tables remain but have no UI.

## Technical stack

- **Backend:** Python, Flask, raw `sqlite3` (no ORM)
- **Database:** SQLite at `instance/cockpit.db`
- **Frontend:** HTML, CSS, vanilla JavaScript; Chart.js (cdnjs) on Academics; Manrope from Google Fonts

## Setup

1. Install Python 3.9 or newer.
2. Install the dependency:
   ```bash
   pip install -r requirements.txt
   ```
3. Start the server:
   ```bash
   python app.py
   ```
   Then open `http://127.0.0.1:5000`. On Windows, `start-cockpit.bat` activates `.venv`, starts the server and opens the browser.

There is no separate init step. On start-up the app creates any missing tables, indexes and id triggers in `instance/cockpit.db` (it creates the file if needed).

### Environment variables
- `COCKPIT_DB`: path to use instead of `instance/cockpit.db`.

### Old databases with numeric ids
The app refuses to start if it finds a database that still uses integer ids (the message names the tables). Back up the file, then run:
```bash
python scripts/migrate_text_ids.py [path/to/cockpit.db]
```
The script runs in one transaction and rolls back on any error.

## Data and backups
- Back up `instance/cockpit.db` **and** `instance/uploads/` together; Scrapbook images live in the uploads folder.
- The app has no login and runs with Flask's debug mode on. Keep it bound to `127.0.0.1` and do not expose it to a network.

## Project layout
```text
app.py                 Flask app, routes and helpers
text_ids.py            id prefixes, table definitions, triggers, id migration
scripts/               one-off scripts (migrate_text_ids.py)
templates/             base.html + one template per page
static/js/             main.js, modals.js, theme.js, icons.js
static/js/features/    one or more scripts per page
future implementations.md   build log and ideas
```
