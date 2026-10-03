import sqlite3
import os
from flask import Flask, render_template, jsonify, request, g
from datetime import datetime, timedelta, date as date_type

app = Flask(__name__)
app.config['DATABASE'] = os.path.join(app.instance_path, 'cockpit.db')

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(
            app.config['DATABASE'],
            detect_types=sqlite3.PARSE_DECLTYPES
        )
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()

@app.route('/')
def index():
    now = datetime.now()
    day_name = now.strftime("%A")
    db = get_db()
    
    # --- 1. Today's Timetable ---
    # Use resolve_day_schedule so we get attendance status per slot for SSR color-coding
    date_str_today = now.strftime("%Y-%m-%d")
    week_key_today = get_iso_week_key(now, day_name)
    is_holiday_today = is_date_holiday(db, date_str_today)
    classes_today, _, _ = resolve_day_schedule(db, day_name, date_str_today, week_key_today)
    # Compact tile: filter None slots (no class held) — matches JS tile behaviour
    today_timetable = [
        {
            "time": c['time'],
            "subject": c['short_name'] or c['subject'],
            "status": c['status'],    # attended/missed/unmarked/none
            "is_none": c.get('is_none', False),
        }
        for c in classes_today
        if not c.get('is_none', False)
    ]
    
    # --- 2. Attendance Snapshot ---
    # Uses _get_attendance_counts() which re-resolves each date via
    # resolve_day_schedule() so holidays and overrides match the calendar.
    subjects_rows = db.execute('SELECT id, name FROM subjects').fetchall()
    attendance_snapshot = []
    for sub in subjects_rows:
        counts   = _get_attendance_counts(db, sub['id'])
        attended = counts['attended']
        missed   = counts['missed']
        total    = attended + missed
        percentage = round((attended / total) * 100, 1) if total > 0 else 0
        attendance_snapshot.append({"subject": sub['name'], "percentage": percentage})

    # --- 3. Grades Snapshot ---
    semesters_rows = db.execute('SELECT number, sgpa FROM semesters ORDER BY number DESC').fetchall()
    cgpa = _cgpa(semesters_rows)
    grades_data = {
        "cgpa": cgpa,
        "history": [{"number": r['number'], "sgpa": r['sgpa']} for r in semesters_rows]
    }

    # --- 4. Finance Summary ---
    # Net balance across all accounts
    # Balance = (Income transactions) - (Expense transactions)
    # Transactions table schema: account_id, date, type, amount, category, note
    # type: 'income', 'expense'
    income = db.execute("SELECT SUM(amount) FROM transactions WHERE type = 'income'").fetchone()[0] or 0
    expense = db.execute("SELECT SUM(amount) FROM transactions WHERE type = 'expense'").fetchone()[0] or 0
    finance_summary = {
        "balance": income - expense,
        "income": income,
        "expense": expense
    }

    # --- 5. Weekly Goals ---
    # PRD says "Max 4-5 goal items displayed as checkboxes."
    # Filter by current week if possible, otherwise just latest goals
    goals_rows = db.execute(
        'SELECT id, text, is_completed FROM weekly_goals ORDER BY id DESC LIMIT 5'
    ).fetchall()
    weekly_goals = [{"id": r['id'], "text": r['text'], "completed": bool(r['is_completed'])} for r in goals_rows]

    # --- 6. Projects ---
    # PRD says "Only projects with status in_progress."
    projects_rows = db.execute(
        'SELECT name, status FROM projects WHERE status = "in_progress" LIMIT 4'
    ).fetchall()
    projects_in_progress = [{"name": r['name'], "status": r['status']} for r in projects_rows]
    
    # --- 7. Calendar ---
    # Simplified: Get days in current month and mark days with events
    import calendar as pycalendar
    today = now.day
    year = now.year
    month = now.month
    
    # Get range of month
    _, last_day = pycalendar.monthrange(year, month)
    
    # Calculate leading empty days (Mon=0)
    first_day_of_month = datetime(year, month, 1)
    leading_empty_days = first_day_of_month.weekday() 
    
    # Find event days this month with labels
    month_str = now.strftime("%Y-%m")
    event_rows = db.execute(
        "SELECT date, label FROM events WHERE date LIKE ?", (month_str + '%',)
    ).fetchall()
    
    # Map label to colors — must stay in sync with window.LABEL_COLORS in static/js/main.js
    label_colors = {
        'Personal': '#bb86fc',
        'Exam': '#cf6679',
        'Project': '#ffb74d',
        'Gym': '#03dac6',
        'Study': '#50fb07',
        'Clg': '#81d4fa'
    }
    
    events_by_day = {}
    for r in event_rows:
        day = int(r['date'].split('-')[2])
        if day not in events_by_day:
            events_by_day[day] = []
        events_by_day[day].append(label_colors.get(r['label'], 'var(--accent-teal)'))
    
    calendar_data = {
        "today": today,
        "month": month,
        "year": year,
        "days": range(1, last_day + 1),
        "leading_empty_days": range(leading_empty_days),
        "events_by_day": events_by_day
    }
    
    return render_template('index.html',
                           active_view='overview',
                           date=now.strftime("%B %d, %Y"),
                           day=day_name,
                           is_holiday_today=is_holiday_today,
                           timetable=today_timetable,
                           attendance=attendance_snapshot,
                           grades=grades_data,
                           finance=finance_summary,
                           goals=weekly_goals,
                           projects=projects_in_progress,
                           calendar=calendar_data)

@app.route('/academics')
def academics():
    return render_template('academics.html', active_view='academics')

@app.route('/gym')
def gym():
    return render_template('gym.html', active_view='gym')

@app.route('/scrapbook')
def scrapbook():
    return render_template('scrapbook.html', active_view='scrapbook')

# --- API Routes ---

@app.route('/api/subjects', methods=['GET'])
def get_subjects():
    db = get_db()
    rows = db.execute('SELECT id, name, short_name FROM subjects').fetchall()
    return jsonify({"status": "success", "data": [dict(r) for r in rows]})

@app.route('/api/subjects/update', methods=['POST'])
def update_subject():
    data = request.json
    db = get_db()
    # Only touch the fields the caller actually sent, so renaming from the
    # attendance modal (name only) doesn't wipe short_name (and vice versa).
    fields, params = [], []
    for col in ('name', 'short_name'):
        if col in data:
            fields.append(f'{col} = ?')
            params.append(data[col])
    if fields:
        db.execute(f'UPDATE subjects SET {", ".join(fields)} WHERE id = ?',
                   (*params, data.get('id')))
        db.commit()
    return jsonify({"status": "success"})

# ── ISO week key helpers ──────────────────────────────────────────
def get_iso_week_key(dt, day_name):
    """Return a stable key like '2026-W25-Monday' for a given date and day name."""
    iso_year, iso_week, _ = dt.isocalendar()
    return f"{iso_year}-W{iso_week:02d}-{day_name}"

# ── Unified attendance aggregation helper ─────────────────────────
def _get_attendance_counts(db, subject_id, start_date=None, end_date=None):
    """
    Aggregate attended/missed counts for a subject by re-resolving each
    candidate date through resolve_day_schedule() — the same live
    timetable/weekly_overrides/holidays resolution the Calendar View uses.

    This guarantees the count can never drift from what the calendar shows:
    holidays are excluded, an override week fully replaces the base schedule
    for that date (so stale/orphaned override_attendance rows left behind by
    an edited or reverted override are ignored, just as the calendar ignores
    them), and a slot always counts toward whichever subject currently owns
    it in the schedule.

    Args:
        subject_id  : integer subject pk
        start_date  : optional 'YYYY-MM-DD' lower bound (inclusive)
        end_date    : optional 'YYYY-MM-DD' upper bound (inclusive)

    Returns: dict {"attended": int, "missed": int}
    """
    date_filter_base     = ""
    date_filter_override = ""
    params_base          = [subject_id]
    params_override      = [subject_id]

    if start_date:
        date_filter_base     += " AND a.date >= ?"
        date_filter_override += " AND oa.date >= ?"
        params_base.append(start_date)
        params_override.append(start_date)
    if end_date:
        date_filter_base     += " AND a.date <= ?"
        date_filter_override += " AND oa.date <= ?"
        params_base.append(end_date)
        params_override.append(end_date)

    # Candidate dates: any date with a recorded mark for this subject in
    # either table. resolve_day_schedule() below decides what actually counts.
    base_dates = db.execute(
        'SELECT DISTINCT a.date FROM attendance a '
        'JOIN timetable t ON a.timetable_id = t.id '
        'WHERE t.subject_id = ? ' + date_filter_base,
        params_base
    ).fetchall()
    ov_dates = db.execute(
        'SELECT DISTINCT oa.date FROM override_attendance oa '
        'WHERE oa.subject_id = ? ' + date_filter_override,
        params_override
    ).fetchall()
    candidate_dates = sorted({r['date'] for r in base_dates} | {r['date'] for r in ov_dates})

    attended = 0
    missed   = 0
    for date_str in candidate_dates:
        if is_date_holiday(db, date_str):
            continue
        dt = datetime.strptime(date_str, '%Y-%m-%d')
        day_name = dt.strftime('%A')
        week_key = get_iso_week_key(dt, day_name)
        classes, _, _ = resolve_day_schedule(db, day_name, date_str, week_key)
        for c in classes:
            if c['subject_id'] == subject_id and c['counts_for_attendance']:
                if c['status'] == 'attended':
                    attended += 1
                elif c['status'] == 'missed':
                    missed += 1

    return {"attended": attended, "missed": missed}

def is_date_holiday(db, date_str):
    """Return True if date_str (YYYY-MM-DD) is recorded in the holidays table."""
    return db.execute('SELECT 1 FROM holidays WHERE date = ?', (date_str,)).fetchone() is not None

def cleanup_old_overrides(db):
    """Delete weekly_override rows whose week is more than 4 ISO weeks in the past."""
    cutoff = datetime.now() - timedelta(weeks=4)
    cutoff_year, cutoff_week, _ = cutoff.isocalendar()
    # Collect all distinct week_keys and delete outdated ones
    # Include keys that only survive in override_attendance (orphans left by an
    # earlier revert) so their marks are purged along with expired overrides.
    rows = db.execute(
        'SELECT week_key FROM weekly_overrides '
        'UNION SELECT week_key FROM override_attendance'
    ).fetchall()
    for row in rows:
        key = row['week_key']  # e.g. "2026-W25-Monday"
        parts = key.split('-W')
        if len(parts) != 2:
            continue
        try:
            key_year = int(parts[0])
            key_week = int(parts[1].split('-')[0])
        except ValueError:
            continue
        # Compare by year then week number
        if (key_year, key_week) < (cutoff_year, cutoff_week):
            db.execute('DELETE FROM weekly_overrides WHERE week_key = ?', (key,))
            db.execute('DELETE FROM override_attendance WHERE week_key = ?', (key,))
    db.commit()

def resolve_day_schedule(db, day_name, date_str, week_key):
    """
    Return a tuple (classes, is_override, is_weekend) for a given day.

    - Saturday/Sunday with no override → classes=[], is_weekend=True
    - Any day with an override → override rows, is_override=True
    - Any weekday with no override → base timetable rows, is_override=False

    Each class dict contains 'is_none': True when subject_id is NULL (no class held).
    None slots have counts_for_attendance=False and status='none'.
    """
    is_weekend = day_name in ('Saturday', 'Sunday')
    is_sunday = day_name == 'Sunday'

    # Sunday is always a holiday — no overrides allowed
    if is_sunday:
        return [], False, True

    # Check for a weekly override (LEFT JOIN so None slots are included)
    override_rows = db.execute(
        'SELECT wo.rowid as id, wo.start_time, wo.end_time, wo.subject_id, '
        's.name as subject, s.short_name '
        'FROM weekly_overrides wo '
        'LEFT JOIN subjects s ON wo.subject_id = s.id '
        'WHERE wo.week_key = ? '
        'ORDER BY wo.start_time', (week_key,)
    ).fetchall()

    if override_rows:
        classes = []
        for r in override_rows:
            is_none = r['subject_id'] is None
            classes.append({
                'id': r['id'],
                'time': r['start_time'],
                'end_time': r['end_time'],
                'subject_id': r['subject_id'],
                'subject': r['subject'] if not is_none else 'None',
                'short_name': r['short_name'] if not is_none else 'NONE',
                'is_none': is_none,
                'counts_for_attendance': not is_none,
                'status': 'none' if is_none else 'unmarked',
            })
        # Attach real attendance status for each eligible override slot
        for c in classes:
            if c['is_none']:
                continue  # Never look up / write attendance for None slots
            att = db.execute(
                'SELECT status FROM override_attendance '
                'WHERE week_key = ? AND subject_id = ? AND start_time = ? AND date = ?',
                (week_key, c['subject_id'], c['time'], date_str)
            ).fetchone()
            if att:
                c['status'] = att['status']
        return classes, True, is_weekend

    # Saturday with no override → holiday
    if is_weekend:
        return [], False, True

    # Regular weekday — return base timetable rows (LEFT JOIN so None slots survive)
    base_rows = db.execute(
        'SELECT t.id, t.start_time, t.end_time, t.subject_id, '
        's.name as subject, s.short_name, a.status '
        'FROM timetable t '
        'LEFT JOIN subjects s ON t.subject_id = s.id '
        'LEFT JOIN attendance a ON t.id = a.timetable_id AND a.date = ? '
        'WHERE t.day_of_week = ? '
        'ORDER BY t.start_time', (date_str, day_name)
    ).fetchall()
    classes = []
    for r in base_rows:
        is_none = r['subject_id'] is None
        classes.append({
            'id': r['id'],
            'time': r['start_time'],
            'end_time': r['end_time'],
            'subject_id': r['subject_id'],
            'subject': r['subject'] if not is_none else 'None',
            'short_name': r['short_name'] if not is_none else 'NONE',
            'is_none': is_none,
            'counts_for_attendance': not is_none,
            'status': 'none' if is_none else (r['status'] or 'unmarked'),
        })
    return classes, False, False

@app.route('/api/timetable/today', methods=['GET'])
def get_today_timetable():
    now = datetime.now()
    day_name = now.strftime("%A")
    date_str = now.strftime("%Y-%m-%d")
    week_key = get_iso_week_key(now, day_name)
    db = get_db()

    # Holiday check must come before resolve_day_schedule so a holiday day
    # always returns an empty class list regardless of overrides.
    if is_date_holiday(db, date_str):
        return jsonify({"status": "success", "is_holiday": True, "date": date_str, "data": []})

    classes, is_override, is_weekend = resolve_day_schedule(db, day_name, date_str, week_key)

    # Return all slots including is_none; the compact dashboard tile filters None out client-side.
    # status field included so the tile can colour-code attendance state.
    data = [{
        "time": c['time'],
        "subject": c['short_name'] or c['subject'],
        "is_none": c.get('is_none', False),
        "status": c['status'],   # attended / missed / unmarked / none
    } for c in classes]
    return jsonify({"status": "success", "is_holiday": False, "date": date_str, "data": data})

@app.route('/api/timetable/week', methods=['GET'])
def get_timetable():
    db = get_db()
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    data = {}

    # Auto-clean overrides older than 4 weeks
    cleanup_old_overrides(db)

    # Calculate dates for the current week (Monday to Sunday)
    now = datetime.now()
    start_of_week = now - timedelta(days=now.weekday())

    # Also fetch base timetable for use in override pre-population
    base_by_day = {}
    base_rows_all = db.execute(
        'SELECT t.id, t.start_time, t.end_time, t.subject_id, t.day_of_week, '
        's.name as subject, s.short_name '
        'FROM timetable t LEFT JOIN subjects s ON t.subject_id = s.id '
        'ORDER BY t.day_of_week, t.start_time'
    ).fetchall()
    for r in base_rows_all:
        d = r['day_of_week']
        if d not in base_by_day:
            base_by_day[d] = []
        is_none_base = r['subject_id'] is None
        base_by_day[d].append({
            'id': r['id'],
            'time': r['start_time'],
            'end_time': r['end_time'],
            'subject_id': r['subject_id'],
            'subject': r['subject'] if not is_none_base else 'None',
            'short_name': r['short_name'] if not is_none_base else 'NONE',
            'is_none': is_none_base,
        })

    for i, day in enumerate(days):
        current_date = start_of_week + timedelta(days=i)
        date_str = current_date.strftime("%Y-%m-%d")
        week_key = get_iso_week_key(current_date, day)

        # Check if this date is a manual holiday
        is_holiday = is_date_holiday(db, date_str)

        classes, is_override, is_weekend = resolve_day_schedule(db, day, date_str, week_key)

        data[day] = {
            "date": date_str,
            "is_holiday": is_holiday,
            "is_override": is_override,
            "is_weekend": is_weekend,
            "override_key": week_key,
            "base_classes": base_by_day.get(day, []),  # always available for pre-population
            "classes": classes
        }

    return jsonify({"status": "success", "data": data})

@app.route('/api/timetable/update', methods=['POST'])
def update_timetable_entry():
    data = request.json
    db = get_db()
    db.execute(
        'UPDATE timetable SET subject_id = ?, start_time = ?, end_time = ? WHERE id = ?',
        (data.get('subject_id'), data.get('start_time'), data.get('end_time'), data.get('id'))
    )
    db.commit()
    return jsonify({"status": "success"})

# ── Weekly Override Routes ────────────────────────────────────────

@app.route('/api/timetable/override/save', methods=['POST'])
def save_timetable_override():
    """Save (replace) all class slots for a given week_key override."""
    payload = request.json
    week_key = payload.get('week_key', '')
    classes = payload.get('classes', [])

    if not week_key:
        return jsonify({"status": "error", "message": "week_key is required"}), 400

    # Sunday overrides are forbidden
    if week_key.endswith('-Sunday'):
        return jsonify({"status": "error", "message": "Sunday cannot be overridden"}), 400

    db = get_db()
    # Replace all existing rows for this key
    db.execute('DELETE FROM weekly_overrides WHERE week_key = ?', (week_key,))
    for c in classes:
        # subject_id may be None (meaning "no class this slot") — that is valid.
        raw_subject_id = c.get('subject_id')
        subject_id = int(raw_subject_id) if raw_subject_id not in (None, '', 'null') else None
        start_time = c.get('start_time', '').strip()
        end_time   = c.get('end_time', '').strip() or None
        if not start_time:  # only skip rows with no time
            continue
        db.execute(
            'INSERT INTO weekly_overrides (week_key, subject_id, start_time, end_time) VALUES (?, ?, ?, ?)',
            (week_key, subject_id, start_time, end_time)
        )
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/timetable/override/<path:week_key>', methods=['GET'])
def get_timetable_override(week_key):
    """Fetch override slots for a given week_key."""
    db = get_db()
    rows = db.execute(
        'SELECT wo.start_time, wo.end_time, wo.subject_id, '
        'CASE WHEN wo.subject_id IS NULL THEN "None" ELSE s.name END as subject, '
        'CASE WHEN wo.subject_id IS NULL THEN "NONE" ELSE s.short_name END as short_name '
        'FROM weekly_overrides wo '
        'LEFT JOIN subjects s ON wo.subject_id = s.id '
        'WHERE wo.week_key = ? ORDER BY wo.start_time', (week_key,)
    ).fetchall()
    return jsonify({"status": "success", "data": [
        dict(r) | {'is_none': r['subject_id'] is None}
        for r in rows
    ]})

@app.route('/api/timetable/override/<path:week_key>', methods=['DELETE'])
def delete_timetable_override(week_key):
    """Remove all override rows for a given week_key (revert to base)."""
    db = get_db()
    db.execute('DELETE FROM weekly_overrides WHERE week_key = ?', (week_key,))
    # Marks for a reverted override are already ignored by the counts; drop them
    # so they can't resurface if the same slot is overridden again later.
    db.execute('DELETE FROM override_attendance WHERE week_key = ?', (week_key,))
    db.commit()
    return jsonify({"status": "success"})

# ── Override Attendance Mark Route ────────────────────────────────

@app.route('/api/attendance/override/mark', methods=['POST'])
def mark_override_attendance():
    """Mark attendance for an override class slot (identified by week_key + subject_id + start_time)."""
    data = request.json
    week_key   = data.get('week_key')
    subject_id = data.get('subject_id')
    start_time = data.get('start_time')
    status     = data.get('status')
    # Accept explicit date from frontend; fall back to today
    date_str   = data.get('date') or datetime.now().strftime("%Y-%m-%d")

    if not all([week_key, start_time, status]):
        return jsonify({"status": "error", "message": "Missing fields"}), 400

    # Reject attendance writes for None slots (no subject_id = no class held)
    if subject_id is None:
        return jsonify({"status": "error", "message": "Cannot mark attendance for a None slot"}), 400

    db = get_db()
    try:
        db.execute(
            'INSERT INTO override_attendance (week_key, subject_id, start_time, date, status) '
            'VALUES (?, ?, ?, ?, ?) '
            'ON CONFLICT(week_key, subject_id, start_time, date) DO UPDATE SET status=excluded.status',
            (week_key, subject_id, start_time, date_str, status)
        )
        db.commit()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/attendance/snapshot', methods=['GET'])
def get_attendance_snapshot():
    """Return per-subject attendance %. Unions base + override_attendance tables."""
    db = get_db()
    subjects_rows = db.execute('SELECT id, name FROM subjects').fetchall()
    data = []
    for sub in subjects_rows:
        counts   = _get_attendance_counts(db, sub['id'])
        attended = counts['attended']
        missed   = counts['missed']
        total    = attended + missed
        percentage = round((attended / total) * 100, 1) if total > 0 else 0
        data.append({"subject": sub['name'], "percentage": percentage})
    return jsonify({"status": "success", "data": data})

@app.route('/api/attendance/mark', methods=['POST'])
def mark_attendance():
    data = request.json
    timetable_id = data.get('timetable_id')
    status = data.get('status') # 'attended' or 'missed'
    # Accept an explicit date from the frontend (for marking past/future days in the week);
    # fall back to today only if none is provided.
    date = data.get('date') or datetime.now().strftime("%Y-%m-%d")

    if not timetable_id or not status:
        return jsonify({"status": "error", "message": "Missing fields"}), 400

    db = get_db()

    # Reject attendance writes for None slots (timetable rows with no subject)
    slot = db.execute('SELECT subject_id FROM timetable WHERE id = ?', (timetable_id,)).fetchone()
    if slot is None:
        return jsonify({"status": "error", "message": "Timetable slot not found"}), 404
    if slot['subject_id'] is None:
        return jsonify({"status": "error", "message": "Cannot mark attendance for a None slot"}), 400

    try:
        db.execute(
            'INSERT INTO attendance (date, timetable_id, status) VALUES (?, ?, ?) '
            'ON CONFLICT(date, timetable_id) DO UPDATE SET status=excluded.status',
            (date, timetable_id, status)
        )
        db.commit()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/attendance/holiday', methods=['POST'])
def mark_holiday():
    data = request.json
    date = data.get('date') # YYYY-MM-DD
    db = get_db()
    try:
        db.execute('INSERT INTO holidays (date) VALUES (?)', (date,))
        db.commit()
        return jsonify({"status": "success"})
    except:
        return jsonify({"status": "success"}) # Ignore if already exists

@app.route('/api/attendance/holiday', methods=['DELETE'])
def remove_holiday():
    data = request.json
    date = data.get('date')
    db = get_db()
    db.execute('DELETE FROM holidays WHERE date = ?', (date,))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/attendance/window', methods=['GET'])
def get_attendance_window():
    """Return per-subject attendance % for a date range. Unions base + override tables."""
    start_str = request.args.get('start')
    end_str   = request.args.get('end')
    if not start_str or not end_str:
        return jsonify({"error": "Start and end dates required"}), 400

    db = get_db()
    subjects = db.execute('SELECT id, name FROM subjects').fetchall()
    data = []
    for sub in subjects:
        counts = _get_attendance_counts(db, sub['id'],
                                        start_date=start_str, end_date=end_str)
        attended = counts['attended']
        missed   = counts['missed']
        total    = attended + missed
        percentage = round((attended / total) * 100, 1) if total > 0 else 0

        if total > 0:
            data.append({
                "id": sub['id'],
                "subject": sub['name'],
                "percentage": percentage,
                "attended": attended,
                "missed": missed,
                "total": total
            })
    return jsonify({"status": "success", "data": data})

@app.route('/api/attendance/heatmap', methods=['GET'])
def get_attendance_heatmap():
    """
    GET /api/attendance/heatmap?from=YYYY-MM-DD&to=YYYY-MM-DD
    Returns per-day attendance health for the given date range.
    Uses resolve_day_schedule so weekly overrides and weekend rules are respected.
    """
    from_str = request.args.get('from')
    to_str   = request.args.get('to')

    today = date_type.today()

    # Parse dates, fallback to last 18 weeks → today
    try:
        from_date = date_type.fromisoformat(from_str) if from_str else today - timedelta(weeks=18)
        to_date   = date_type.fromisoformat(to_str)   if to_str   else today
    except (ValueError, TypeError):
        return jsonify({"status": "error", "message": "Invalid date format"}), 400

    # Cap to_date at today — no future heatmap data
    if to_date > today:
        to_date = today

    db = get_db()

    # Build a set of manual holidays for fast lookup
    holiday_rows = db.execute('SELECT date FROM holidays').fetchall()
    manual_holidays = {r['date'] for r in holiday_rows}

    day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    result = []

    current = from_date
    while current <= to_date:
        date_str = current.isoformat()
        day_name = day_names[current.weekday()]  # 0=Monday … 6=Sunday
        week_key = get_iso_week_key(
            datetime.combine(current, datetime.min.time()), day_name
        )

        # Check manual holiday first
        if date_str in manual_holidays:
            result.append({
                "date": date_str,
                "status": "holiday",
                "attended": 0,
                "total": 0,
                "percentage": None,
                "subjects": [],
                "note": "Holiday"
            })
            current += timedelta(days=1)
            continue

        # Use resolve_day_schedule to get classes (handles overrides + weekend)
        classes, is_override, is_weekend = resolve_day_schedule(db, day_name, date_str, week_key)

        # Exclude None slots — they never count for attendance
        eligible = [c for c in classes if not c.get('is_none', False)]

        total    = len(eligible)
        attended = sum(1 for c in eligible if c['status'] == 'attended')
        missed   = sum(1 for c in eligible if c['status'] == 'missed')
        marked   = attended + missed  # only count explicitly-marked classes

        # Build subject detail list (eligible only — no None slots in heatmap)
        subjects = [
            {"name": c.get('short_name') or c['subject'], "status": c['status']}
            for c in eligible
        ]

        is_future = current > date_type.today()

        # Deterministic status resolution
        if is_weekend or total == 0:
            # Weekend, all-None day, or truly no classes → holiday
            # Future with no eligible classes → no_data (can't know yet if it's truly holiday)
            if is_future and total == 0 and not is_weekend:
                day_status = "no_data"
            else:
                day_status = "holiday"
            percentage = None
        elif marked == 0:
            # Eligible classes exist but none marked yet
            # Future date: no_data. Past date with nothing marked: no_data (could be unmotivated)
            day_status = "no_data"
            percentage = None
        elif attended == 0:
            day_status = "absent"
            percentage = 0.0
        else:
            pct = (attended / marked) * 100
            percentage = round(pct, 1)
            if pct == 100:
                day_status = "full"
            elif pct >= 75:
                day_status = "good"
            elif pct >= 50:
                day_status = "partial"
            else:
                day_status = "low"

        result.append({
            "date": date_str,
            "status": day_status,
            "attended": attended,
            "total": marked,
            "percentage": percentage,
            "subjects": subjects
        })

        current += timedelta(days=1)

    return jsonify({"status": "success", "data": result})


@app.route('/api/attendance/details', methods=['GET'])
def get_attendance():
    """Return per-subject attendance details. Unions base + override_attendance tables."""
    db = get_db()
    subjects_rows = db.execute('SELECT id, name FROM subjects').fetchall()
    data = []
    for sub in subjects_rows:
        counts   = _get_attendance_counts(db, sub['id'])
        attended = counts['attended']
        missed   = counts['missed']
        total    = attended + missed
        percentage = round((attended / total) * 100, 1) if total > 0 else 0
        data.append({
            "id": sub['id'],
            "subject": sub['name'],
            "percentage": percentage,
            "missed": missed,
            "total": total,
            "remaining": 0  # Not calculated in current schema
        })
    return jsonify({"status": "success", "data": data})

@app.route('/api/finance/transactions', methods=['GET'])
def get_transactions():
    db = get_db()
    rows = db.execute(
        'SELECT t.id, t.date, t.type, t.amount, t.category, t.note, a.name as account_name '
        'FROM transactions t JOIN accounts a ON t.account_id = a.id '
        'ORDER BY t.date DESC, t.id DESC'
    ).fetchall()
    data = [dict(r) for r in rows]
    return jsonify({"status": "success", "data": data})

@app.route('/api/finance/transaction', methods=['POST'])
def add_transaction():
    data = request.json
    db = get_db()
    # Find or create account
    acc_name = data.get('account', 'Cash')
    acc = db.execute('SELECT id FROM accounts WHERE name = ?', (acc_name,)).fetchone()
    if acc:
        account_id = acc['id']
    else:
        cur = db.execute('INSERT INTO accounts (name, type) VALUES (?, ?)', (acc_name, 'other'))
        account_id = cur.lastrowid
    
    db.execute(
        'INSERT INTO transactions (account_id, date, type, amount, category, note) VALUES (?, ?, ?, ?, ?, ?)',
        (account_id, data.get('date'), data.get('type'), data.get('amount'), data.get('category'), data.get('note'))
    )
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/finance/transaction/<int:id>', methods=['DELETE'])
def delete_transaction(id):
    db = get_db()
    db.execute('DELETE FROM transactions WHERE id = ?', (id,))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/finance/summary', methods=['GET'])
def get_finance_summary():
    db = get_db()
    income = db.execute("SELECT SUM(amount) FROM transactions WHERE type = 'income'").fetchone()[0] or 0
    expense = db.execute("SELECT SUM(amount) FROM transactions WHERE type = 'expense'").fetchone()[0] or 0
    
    accounts_rows = db.execute('SELECT name FROM accounts').fetchall()
    accounts_data = {}
    for acc in accounts_rows:
        # Simplified: balance per account
        acc_income = db.execute(
            "SELECT SUM(amount) FROM transactions JOIN accounts ON transactions.account_id = accounts.id "
            "WHERE accounts.name = ? AND transactions.type = 'income'", (acc['name'],)
        ).fetchone()[0] or 0
        acc_expense = db.execute(
            "SELECT SUM(amount) FROM transactions JOIN accounts ON transactions.account_id = accounts.id "
            "WHERE accounts.name = ? AND transactions.type = 'expense'", (acc['name'],)
        ).fetchone()[0] or 0
        accounts_data[acc['name']] = acc_income - acc_expense
        
    return jsonify({
        "status": "success",
        "data": {
            "balance": income - expense,
            "income": income,
            "expense": expense,
            "accounts": accounts_data
        }
    })

@app.route('/api/goals', methods=['POST'])
def add_goal():
    data = request.json
    db = get_db()
    
    # Calculate current week start date (Monday)
    now = datetime.now()
    week_start = now - timedelta(days=now.weekday())
    week_start_str = week_start.strftime("%Y-%m-%d")
    
    db.execute(
        'INSERT INTO weekly_goals (text, is_completed, week_start_date) VALUES (?, ?, ?)', 
        (data.get('text'), 0, week_start_str)
    )
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/goals/<int:id>', methods=['PATCH'])
def toggle_goal(id):
    data = request.json
    db = get_db()
    db.execute('UPDATE weekly_goals SET is_completed = ? WHERE id = ?', (data.get('completed'), id))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/goals/<int:id>', methods=['DELETE'])
def delete_goal(id):
    db = get_db()
    db.execute('DELETE FROM weekly_goals WHERE id = ?', (id,))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/goals/all', methods=['GET'])
def get_goals():
    db = get_db()
    rows = db.execute('SELECT id, text, is_completed FROM weekly_goals ORDER BY id DESC').fetchall()
    data = [{"id": r['id'], "text": r['text'], "completed": bool(r['is_completed'])} for r in rows]
    return jsonify({"status": "success", "data": data})

@app.route('/api/projects/add', methods=['POST'])
def add_project():
    data = request.json
    db = get_db()
    now_str = datetime.now().isoformat()
    db.execute('INSERT INTO projects (name, status, last_updated) VALUES (?, ?, ?)', 
               (data.get('name'), data.get('status', 'planned'), now_str))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/projects/<int:id>/status', methods=['PATCH'])
def update_project_status(id):
    data = request.json
    db = get_db()
    now_str = datetime.now().isoformat()
    db.execute('UPDATE projects SET status = ?, last_updated = ? WHERE id = ?', 
               (data.get('status'), now_str, id))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/projects/<int:id>', methods=['DELETE'])
def delete_project(id):
    db = get_db()
    db.execute('DELETE FROM projects WHERE id = ?', (id,))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/projects/<int:id>/logs', methods=['GET'])
def get_project_logs(id):
    db = get_db()
    logs = db.execute('SELECT * FROM project_logs WHERE project_id = ? ORDER BY date DESC', (id,)).fetchall()
    return jsonify({"status": "success", "data": [dict(l) for l in logs]})

@app.route('/api/projects/<int:id>/logs', methods=['POST'])
def add_project_log(id):
    data = request.json
    db = get_db()
    now_str = datetime.now().isoformat()
    db.execute('INSERT INTO project_logs (project_id, date, note, state) VALUES (?, ?, ?, ?)',
               (id, now_str, data.get('note'), data.get('state', '')))
    
    # Update project last_updated
    db.execute('UPDATE projects SET last_updated = ? WHERE id = ?', (now_str, id))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/projects-data', methods=['GET'])
def get_projects_data():
    try:
        print("DEBUG: get_projects_data called")
        status_filter = request.args.get('status')
        db = get_db()
        query = 'SELECT * FROM projects'
        params = []
        if status_filter:
            query += ' WHERE status = ?'
            params.append(status_filter)
        
        query += ' ORDER BY last_updated DESC'
        
        rows = db.execute(query, params).fetchall()
        data = [dict(r) for r in rows]
        print(f"DEBUG: Found {len(data)} projects")
        return jsonify({"status": "success", "data": data})
    except Exception as e:
        print(f"DEBUG Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/projects/tile-data', methods=['GET'])
def get_projects_tile_data():
    """
    Returns all projects with their latest log pre-joined for the dashboard tile.
    Uses a single correlated sub-query (no N+1).  The client receives:
      id, name, status, last_updated,
      latest_log_preview  – server-truncated to 100 chars (or null),
      latest_log_at       – ISO timestamp of the latest log (or null)
    """
    try:
        db = get_db()
        rows = db.execute('''
            SELECT
                p.id,
                p.name,
                p.status,
                p.last_updated,
                pl.note       AS latest_log_note,
                pl.date       AS latest_log_at
            FROM projects p
            LEFT JOIN project_logs pl
              ON pl.id = (
                  SELECT id FROM project_logs
                  WHERE project_id = p.id
                  ORDER BY date DESC
                  LIMIT 1
              )
            ORDER BY p.last_updated DESC
        ''').fetchall()

        data = []
        for r in rows:
            row = dict(r)
            note = row.pop('latest_log_note', None)
            # Shape a clean preview string server-side (max 100 chars)
            if note:
                preview = ' '.join(note.split())  # collapse whitespace
                row['latest_log_preview'] = preview[:100] + ('…' if len(preview) > 100 else '')
            else:
                row['latest_log_preview'] = None
            data.append(row)

        return jsonify({"status": "success", "data": data})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/calendar/event/<int:id>/update', methods=['POST'])
def update_calendar_event(id):
    data = request.json
    db = get_db()
    
    # Dynamically build update query based on provided fields
    fields = []
    values = []
    for k, v in data.items():
        if k in ['title', 'description', 'date', 'start_time', 'end_time', 'label', 'status']:
            fields.append(f"{k} = ?")
            values.append(v)
    
    if not fields:
        return jsonify({"status": "error", "message": "No valid fields provided"}), 400
        
    values.append(id)
    query = f"UPDATE events SET {', '.join(fields)} WHERE id = ?"
    db.execute(query, values)
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/calendar/event', methods=['POST'])
def add_calendar_event():
    data = request.json
    db = get_db()
    db.execute(
        'INSERT INTO events (date, title, label, status) VALUES (?, ?, ?, ?)',
        (data.get('date'), data.get('title'), data.get('label', 'Personal'), data.get('status', 'planned'))
    )
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/calendar/event/<int:id>', methods=['DELETE'])
def delete_calendar_event(id):
    db = get_db()
    db.execute('DELETE FROM events WHERE id = ?', (id,))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/calendar/events', methods=['GET'])
def get_calendar_events():
    db = get_db()
    # Fetch all relevant fields
    rows = db.execute('SELECT id, date, title, label, status FROM events ORDER BY date ASC').fetchall()
    data = [dict(r) for r in rows]
    return jsonify({"status": "success", "data": data})

# --- Clear Data Routes ---

@app.route('/api/attendance/clear', methods=['DELETE'])
def clear_attendance():
    db = get_db()
    db.execute('DELETE FROM attendance')
    db.execute('DELETE FROM holidays')
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/finance/clear', methods=['DELETE'])
def clear_finance():
    db = get_db()
    db.execute('DELETE FROM transactions')
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/goals/clear', methods=['DELETE'])
def clear_goals():
    db = get_db()
    db.execute('DELETE FROM weekly_goals')
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/grades/history', methods=['GET'])
def get_grades_history():
    db = get_db()
    semesters_rows = db.execute('SELECT number, sgpa FROM semesters ORDER BY number DESC').fetchall()
    cgpa = _cgpa(semesters_rows)
    return jsonify({
        "status": "success",
        "data": {
            "cgpa": cgpa,
            "history": [{"number": r['number'], "sgpa": r['sgpa']} for r in semesters_rows]
        }
    })

# --- Academics Routes ---

MARK_COMPONENTS = ('internal', 'sessional', 'end_sem')
DEFAULT_MAX_MARK = {'internal': 50, 'sessional': 50, 'end_sem': 100}

def _cgpa(rows):
    scored = [r['sgpa'] for r in rows if r['sgpa'] is not None]
    return round(sum(scored) / len(scored), 2) if scored else 0

@app.route('/api/academics/semesters', methods=['GET'])
def academics_get_semesters():
    db = get_db()
    rows = db.execute('SELECT id, number, sgpa FROM semesters ORDER BY number ASC').fetchall()
    return jsonify({"status": "success", "data": {
        "cgpa": _cgpa(rows),
        "semesters": [dict(r) for r in rows]
    }})

@app.route('/api/academics/semesters', methods=['POST'])
def academics_upsert_semester():
    data = request.json or {}
    try:
        number = int(data.get('number'))
        sgpa = None if data.get('sgpa') in (None, '') else float(data['sgpa'])
    except (TypeError, ValueError):
        return jsonify({"status": "error", "message": "number must be an integer and sgpa a number"}), 400
    if number < 1 or (sgpa is not None and not (0 <= sgpa <= 10)):
        return jsonify({"status": "error", "message": "number must be >= 1 and sgpa between 0 and 10"}), 400
    db = get_db()
    # A missing sgpa creates the semester without one and never wipes an existing value.
    db.execute('''
        INSERT INTO semesters (number, sgpa) VALUES (?, ?)
        ON CONFLICT(number) DO UPDATE SET sgpa = COALESCE(excluded.sgpa, semesters.sgpa)
    ''', (number, sgpa))
    db.commit()
    row = db.execute('SELECT id FROM semesters WHERE number = ?', (number,)).fetchone()
    return jsonify({"status": "success", "id": row['id']})

@app.route('/api/academics/semesters/<int:semester_id>', methods=['DELETE'])
def academics_delete_semester(semester_id):
    db = get_db()
    db.execute('DELETE FROM semester_marks WHERE semester_id = ?', (semester_id,))
    db.execute('DELETE FROM semesters WHERE id = ?', (semester_id,))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/academics/marks', methods=['GET'])
def academics_get_marks():
    semester_id = request.args.get('semester_id', type=int)
    if semester_id is None:
        return jsonify({"status": "error", "message": "semester_id is required"}), 400
    db = get_db()
    rows = db.execute('''
        SELECT subject_name, component, mark, max_mark FROM semester_marks
        WHERE semester_id = ? ORDER BY id ASC
    ''', (semester_id,)).fetchall()
    subjects = {}
    for r in rows:
        entry = subjects.setdefault(r['subject_name'], {"name": r['subject_name']})
        entry[r['component']] = {"mark": r['mark'], "max": r['max_mark']}
    return jsonify({"status": "success", "data": list(subjects.values())})

@app.route('/api/academics/marks', methods=['PUT'])
def academics_put_mark():
    data = request.json or {}
    component = data.get('component')
    name = (data.get('subject_name') or '').strip()
    if component not in MARK_COMPONENTS or not name or data.get('semester_id') is None:
        return jsonify({"status": "error", "message": "semester_id, subject_name and a valid component are required"}), 400
    try:
        mark = None if data.get('mark') in (None, '') else float(data['mark'])
        max_mark = float(data['max_mark']) if data.get('max_mark') not in (None, '') else DEFAULT_MAX_MARK[component]
    except (TypeError, ValueError):
        return jsonify({"status": "error", "message": "mark and max_mark must be numbers"}), 400
    if max_mark <= 0 or (mark is not None and (mark < 0 or mark > max_mark)):
        return jsonify({"status": "error", "message": "mark must be between 0 and max_mark"}), 400
    db = get_db()
    db.execute('''
        INSERT INTO semester_marks (semester_id, subject_name, component, mark, max_mark)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(semester_id, subject_name, component)
        DO UPDATE SET mark = excluded.mark, max_mark = excluded.max_mark
    ''', (data['semester_id'], name, component, mark, max_mark))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/academics/marks', methods=['DELETE'])
def academics_delete_subject():
    data = request.json or {}
    db = get_db()
    db.execute('DELETE FROM semester_marks WHERE semester_id = ? AND subject_name = ?',
               (data.get('semester_id'), data.get('subject_name')))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/academics/subjects', methods=['POST'])
def academics_add_subject():
    data = request.json or {}
    name = (data.get('name') or '').strip()
    if not name or data.get('semester_id') is None:
        return jsonify({"status": "error", "message": "semester_id and name are required"}), 400
    db = get_db()
    for component in MARK_COMPONENTS:
        db.execute('''
            INSERT OR IGNORE INTO semester_marks (semester_id, subject_name, component, mark, max_mark)
            VALUES (?, ?, ?, NULL, ?)
        ''', (data['semester_id'], name, component, DEFAULT_MAX_MARK[component]))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/academics/subjects', methods=['PATCH'])
def academics_rename_subject():
    data = request.json or {}
    new_name = (data.get('new_name') or '').strip()
    if not new_name or data.get('semester_id') is None or not data.get('old_name'):
        return jsonify({"status": "error", "message": "semester_id, old_name and new_name are required"}), 400
    db = get_db()
    clash = db.execute('SELECT 1 FROM semester_marks WHERE semester_id = ? AND subject_name = ?',
                       (data['semester_id'], new_name)).fetchone()
    if clash and new_name != data['old_name']:
        return jsonify({"status": "error", "message": "A subject with that name already exists"}), 409
    db.execute('UPDATE semester_marks SET subject_name = ? WHERE semester_id = ? AND subject_name = ?',
               (new_name, data['semester_id'], data['old_name']))
    db.commit()
    return jsonify({"status": "success"})

# --- Gym Routes ---

def _gym_date(value):
    try:
        return datetime.strptime(value, '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return None

def _gym_name(value, limit=60):
    return ' '.join(str(value or '').split())[:limit]

def _gym_number(value, cast, lo, hi):
    """Optional number: returns (ok, value). Blank means None."""
    if value in (None, ''):
        return True, None
    try:
        n = cast(value)
    except (TypeError, ValueError):
        return False, None
    return (True, n) if lo <= n <= hi else (False, None)

GYM_SET_SLOTS = 3

def _gym_set_reps(value, sets, reps):
    """Per-set reps as a fixed-length list (None = blank); older rows only stored sets x reps."""
    if value:
        parts = [int(p) if p else None for p in value.split(',')]
    else:
        parts = [reps] * min(sets or 1, GYM_SET_SLOTS) if reps else []
    return (parts + [None] * GYM_SET_SLOTS)[:GYM_SET_SLOTS]

def _gym_parse_exercises(raw):
    if not isinstance(raw, list) or len(raw) > 60:
        return None, "exercises must be a list of at most 60 rows"
    parsed = []
    for row in raw:
        if not isinstance(row, dict):
            return None, "each exercise must be an object"
        name = _gym_name(row.get('exercise'))
        if not name:
            return None, "every exercise needs a name"
        raw_sets = row.get('set_reps') or []
        if not isinstance(raw_sets, list) or len(raw_sets) > GYM_SET_SLOTS:
            return None, f"set_reps must be a list of at most {GYM_SET_SLOTS} values"
        set_reps = []
        for v in raw_sets:
            ok, n = _gym_number(v, int, 1, 999)
            if not ok:
                return None, "reps must be valid numbers"
            set_reps.append(n)
        ok_w, weight = _gym_number(row.get('weight_kg'), float, 0, 1000)
        if not ok_w:
            return None, "weight must be a valid number"
        done = [n for n in set_reps if n]
        parsed.append({"exercise": name, "set_reps": set_reps, "sets": len(done) or None,
                       "reps": max(done) if done else None, "weight_kg": weight})
    return parsed, None

def _gym_pr_indexes(db, date_str, rows):
    """Indexes of rows that beat the best weight for that exercise on earlier dates.

    The first-ever weighted entry is a baseline, not a PR. Within one day only the
    heaviest row per exercise can be a PR.
    """
    day_best = {}
    for i, r in enumerate(rows):
        if r['weight_kg'] is None:
            continue
        key = r['exercise'].lower()
        if key not in day_best or r['weight_kg'] > day_best[key][0]:
            day_best[key] = (r['weight_kg'], i)
    flags = set()
    for key, (weight, idx) in day_best.items():
        prior = db.execute('''
            SELECT MAX(e.weight_kg) AS best, COUNT(*) AS n
            FROM gym_exercise_log e JOIN gym_log l ON l.id = e.log_id
            WHERE LOWER(e.exercise) = ? AND l.date < ? AND e.weight_kg IS NOT NULL
        ''', (key, date_str)).fetchone()
        if prior['n'] and weight > prior['best']:
            flags.add(idx)
    return flags

def _gym_day(db, date_str):
    log = db.execute('SELECT * FROM gym_log WHERE date = ?', (date_str,)).fetchone()
    if not log:
        return {"date": date_str, "exists": False, "preset_name": None, "notes": "",
                "cardio": False, "steps_10k": False, "exercises": []}
    rows = [dict(r) for r in db.execute('''
        SELECT exercise, sets, reps, set_reps, weight_kg FROM gym_exercise_log
        WHERE log_id = ? ORDER BY position ASC, id ASC
    ''', (log['id'],)).fetchall()]
    prs = _gym_pr_indexes(db, date_str, rows)
    for i, r in enumerate(rows):
        r['is_pr'] = i in prs
        r['set_reps'] = _gym_set_reps(r['set_reps'], r['sets'], r['reps'])
    return {"date": date_str, "exists": True, "preset_name": log['preset_name'], "notes": log['notes'],
            "cardio": bool(log['cardio']), "steps_10k": bool(log['steps_10k']), "exercises": rows}

@app.route('/api/gym/heatmap', methods=['GET'])
def gym_heatmap():
    start, end = _gym_date(request.args.get('from')), _gym_date(request.args.get('to'))
    if not start or not end or end < start or (end - start).days > 800:
        return jsonify({"status": "error", "message": "from and to must be valid dates (YYYY-MM-DD), at most ~2 years apart"}), 400
    db = get_db()
    rows = db.execute('''
        SELECT l.date, l.preset_name, l.cardio, l.steps_10k,
               (SELECT COUNT(*) FROM gym_exercise_log e WHERE e.log_id = l.id) AS exercise_count
        FROM gym_log l WHERE l.date BETWEEN ? AND ? ORDER BY l.date ASC
    ''', (start.isoformat(), end.isoformat())).fetchall()
    data = [{"date": r['date'], "level": 1 + (1 if r['cardio'] else 0) + (1 if r['steps_10k'] else 0),
             "preset_name": r['preset_name'], "cardio": bool(r['cardio']),
             "steps_10k": bool(r['steps_10k']), "exercise_count": r['exercise_count']} for r in rows]
    return jsonify({"status": "success", "data": data})

@app.route('/api/gym/log/<date_str>', methods=['GET'])
def gym_get_log(date_str):
    if not _gym_date(date_str):
        return jsonify({"status": "error", "message": "invalid date"}), 400
    return jsonify({"status": "success", "data": _gym_day(get_db(), date_str)})

@app.route('/api/gym/log/<date_str>', methods=['PUT'])
def gym_put_log(date_str):
    day = _gym_date(date_str)
    if not day:
        return jsonify({"status": "error", "message": "invalid date"}), 400
    if day > date_type.today():
        return jsonify({"status": "error", "message": "cannot log a future date"}), 400
    data = request.json or {}
    exercises, err = _gym_parse_exercises(data.get('exercises', []))
    if err:
        return jsonify({"status": "error", "message": err}), 400
    notes = str(data.get('notes') or '')[:2000]
    preset_name = _gym_name(data.get('preset_name')) or None
    db = get_db()
    db.execute('''
        INSERT INTO gym_log (date, preset_name, notes, cardio, steps_10k) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET preset_name = excluded.preset_name, notes = excluded.notes,
            cardio = excluded.cardio, steps_10k = excluded.steps_10k
    ''', (date_str, preset_name, notes, 1 if data.get('cardio') else 0, 1 if data.get('steps_10k') else 0))
    log_id = db.execute('SELECT id FROM gym_log WHERE date = ?', (date_str,)).fetchone()['id']
    db.execute('DELETE FROM gym_exercise_log WHERE log_id = ?', (log_id,))
    for pos, ex in enumerate(exercises):
        db.execute('''
            INSERT INTO gym_exercise_log (log_id, exercise, position, sets, reps, set_reps, weight_kg)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (log_id, ex['exercise'], pos, ex['sets'], ex['reps'],
              ','.join('' if n is None else str(n) for n in ex['set_reps']), ex['weight_kg']))
    db.commit()
    prs = _gym_pr_indexes(db, date_str, exercises)
    return jsonify({"status": "success", "new_prs": [
        {"exercise": exercises[i]['exercise'], "weight_kg": exercises[i]['weight_kg']} for i in sorted(prs)
    ]})

@app.route('/api/gym/log/<date_str>', methods=['DELETE'])
def gym_delete_log(date_str):
    if not _gym_date(date_str):
        return jsonify({"status": "error", "message": "invalid date"}), 400
    db = get_db()
    row = db.execute('SELECT id FROM gym_log WHERE date = ?', (date_str,)).fetchone()
    if row:
        db.execute('DELETE FROM gym_exercise_log WHERE log_id = ?', (row['id'],))
        db.execute('DELETE FROM gym_log WHERE id = ?', (row['id'],))
        db.commit()
    return jsonify({"status": "success"})

def _gym_read_preset_body(db, preset_id=None):
    data = request.json or {}
    name = _gym_name(data.get('name'), 40)
    if not name:
        return None, "preset name is required"
    ok, weekday = _gym_number(data.get('weekday'), int, 0, 6)
    if not ok:
        return None, "weekday must be 0 (Mon) to 6 (Sun) or empty"
    raw = data.get('exercises', [])
    if not isinstance(raw, list) or len(raw) > 40:
        return None, "exercises must be a list of at most 40 names"
    names = [_gym_name(x) for x in raw]
    if not all(names):
        return None, "exercise names cannot be empty"
    clash = db.execute('SELECT id FROM gym_preset WHERE LOWER(name) = ? AND id != ?',
                       (name.lower(), preset_id if preset_id is not None else -1)).fetchone()
    if clash:
        return None, "a preset with that name already exists"
    return {"name": name, "weekday": weekday, "exercises": names}, None

def _gym_write_exercises(db, preset_id, names):
    db.execute('DELETE FROM gym_preset_exercise WHERE preset_id = ?', (preset_id,))
    for pos, n in enumerate(names):
        db.execute('INSERT INTO gym_preset_exercise (preset_id, name, position) VALUES (?, ?, ?)', (preset_id, n, pos))

@app.route('/api/gym/presets', methods=['GET'])
def gym_get_presets():
    db = get_db()
    presets = [dict(r) for r in db.execute('SELECT id, name, weekday FROM gym_preset ORDER BY position ASC, id ASC').fetchall()]
    for p in presets:
        p['exercises'] = [r['name'] for r in db.execute(
            'SELECT name FROM gym_preset_exercise WHERE preset_id = ? ORDER BY position ASC, id ASC', (p['id'],)).fetchall()]
    return jsonify({"status": "success", "data": presets})

@app.route('/api/gym/presets', methods=['POST'])
def gym_create_preset():
    db = get_db()
    body, err = _gym_read_preset_body(db)
    if err:
        return jsonify({"status": "error", "message": err}), 409 if 'exists' in err else 400
    pos = db.execute('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM gym_preset').fetchone()['p']
    cur = db.execute('INSERT INTO gym_preset (name, weekday, position) VALUES (?, ?, ?)', (body['name'], body['weekday'], pos))
    _gym_write_exercises(db, cur.lastrowid, body['exercises'])
    db.commit()
    return jsonify({"status": "success", "id": cur.lastrowid})

@app.route('/api/gym/presets/<int:preset_id>', methods=['PUT'])
def gym_update_preset(preset_id):
    db = get_db()
    if not db.execute('SELECT 1 FROM gym_preset WHERE id = ?', (preset_id,)).fetchone():
        return jsonify({"status": "error", "message": "preset not found"}), 404
    body, err = _gym_read_preset_body(db, preset_id)
    if err:
        return jsonify({"status": "error", "message": err}), 409 if 'exists' in err else 400
    db.execute('UPDATE gym_preset SET name = ?, weekday = ? WHERE id = ?', (body['name'], body['weekday'], preset_id))
    _gym_write_exercises(db, preset_id, body['exercises'])
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/gym/presets/<int:preset_id>', methods=['DELETE'])
def gym_delete_preset(preset_id):
    db = get_db()
    db.execute('DELETE FROM gym_preset_exercise WHERE preset_id = ?', (preset_id,))
    db.execute('DELETE FROM gym_preset WHERE id = ?', (preset_id,))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/gym/prs', methods=['GET'])
def gym_get_prs():
    db = get_db()
    rows = db.execute('''
        SELECT e.exercise, e.weight_kg, e.reps, l.date
        FROM gym_exercise_log e JOIN gym_log l ON l.id = e.log_id
        WHERE e.weight_kg IS NOT NULL ORDER BY l.date ASC, e.id ASC
    ''').fetchall()
    best = {}
    for r in rows:  # ascending dates, strict '>' keeps the earliest date that hit the best weight
        key = r['exercise'].lower()
        if key not in best or r['weight_kg'] > best[key]['weight_kg']:
            best[key] = {"exercise": r['exercise'], "weight_kg": r['weight_kg'], "reps": r['reps'], "date": r['date']}
    data = sorted(best.values(), key=lambda x: x['date'], reverse=True)
    return jsonify({"status": "success", "data": data})

@app.route('/api/gym/exercises', methods=['GET'])
def gym_get_exercises():
    db = get_db()
    names = {}
    for table in ('gym_preset_exercise', 'gym_exercise_log'):
        col = 'name' if table == 'gym_preset_exercise' else 'exercise'
        for r in db.execute(f'SELECT DISTINCT {col} AS n FROM {table}').fetchall():
            names.setdefault(r['n'].lower(), r['n'])
    return jsonify({"status": "success", "data": sorted(names.values(), key=str.lower)})

# --- ESE Calculator Routes ---

@app.route('/api/grades/ese-subjects', methods=['GET'])
def get_ese_subjects():
    db = get_db()
    rows = db.execute('SELECT * FROM ese_calculator_subjects ORDER BY id ASC').fetchall()
    return jsonify({"status": "success", "data": [dict(r) for r in rows]})

@app.route('/api/grades/ese-subjects', methods=['POST'])
def add_ese_subject():
    data = request.json
    db = get_db()
    now_str = datetime.now().isoformat()
    db.execute('''
        INSERT INTO ese_calculator_subjects (subject_name, current_marks, max_sessional, max_ese, created_at)
        VALUES (?, ?, ?, ?, ?)
    ''', (data.get('name'), data.get('current'), data.get('maxSess'), data.get('maxESE'), now_str))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/grades/ese-subjects/<int:id>', methods=['DELETE'])
def delete_ese_subject(id):
    db = get_db()
    db.execute('DELETE FROM ese_calculator_subjects WHERE id = ?', (id,))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/grades/ese-subjects/<int:id>', methods=['PATCH'])
def update_ese_subject(id):
    data = request.json
    db = get_db()
    db.execute('''
        UPDATE ese_calculator_subjects 
        SET subject_name = ?, current_marks = ?, max_sessional = ?, max_ese = ?
        WHERE id = ?
    ''', (data.get('name'), data.get('current'), data.get('maxSess'), data.get('maxESE'), id))
    db.commit()
    return jsonify({"status": "success"})

def _migrate_weekly_overrides_nullable(db):
    """
    Ensure weekly_overrides.subject_id allows NULL (supports 'None' slots).
    SQLite cannot ALTER a column constraint directly, so if the table already
    exists with NOT NULL we recreate it using the rename-copy-rename pattern,
    preserving all existing rows and indexes.
    """
    # Check if the table already exists
    existing = db.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='weekly_overrides'"
    ).fetchone()

    if existing is None:
        # Table doesn't exist yet — create it with nullable subject_id from scratch
        db.execute('''
            CREATE TABLE weekly_overrides (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                week_key   TEXT NOT NULL,
                subject_id INTEGER,
                start_time TEXT NOT NULL,
                end_time   TEXT
            )
        ''')
        db.execute('''
            CREATE UNIQUE INDEX IF NOT EXISTS ux_override_slot
            ON weekly_overrides (week_key, start_time)
        ''')
        return

    # Table exists — check whether subject_id is already nullable
    create_sql = existing['sql'] or ''
    if 'subject_id INTEGER NOT NULL' not in create_sql and 'subject_id integer not null' not in create_sql.lower():
        # Already nullable (or column definition not explicit), nothing to do
        return

    # Need to migrate: rename old → copy → rename back
    db.execute('ALTER TABLE weekly_overrides RENAME TO _weekly_overrides_old')
    db.execute('''
        CREATE TABLE weekly_overrides (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            week_key   TEXT NOT NULL,
            subject_id INTEGER,
            start_time TEXT NOT NULL,
            end_time   TEXT
        )
    ''')
    db.execute('''
        INSERT INTO weekly_overrides (id, week_key, subject_id, start_time, end_time)
        SELECT id, week_key, subject_id, start_time, end_time
        FROM _weekly_overrides_old
    ''')
    db.execute('DROP TABLE _weekly_overrides_old')
    db.execute('''
        CREATE UNIQUE INDEX IF NOT EXISTS ux_override_slot
        ON weekly_overrides (week_key, start_time)
    ''')


def _migrate_semester_marks(db):
    """Create semester_marks; on first creation, copy legacy internal marks into it."""
    existed = db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='semester_marks'"
    ).fetchone()
    db.execute('''
        CREATE TABLE IF NOT EXISTS semester_marks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            semester_id INTEGER NOT NULL,
            subject_name TEXT NOT NULL,
            component TEXT NOT NULL CHECK(component IN ('internal', 'sessional', 'end_sem')),
            mark REAL,
            max_mark REAL NOT NULL,
            UNIQUE (semester_id, subject_name, component)
        )
    ''')
    if existed:
        return
    # Legacy data: prefer internal_number = 1, fall back to 2 (first row wins via OR IGNORE).
    subjects = db.execute('SELECT semester_id, subject_index, name FROM grade_subject_names').fetchall()
    for s in subjects:
        legacy = db.execute('''
            SELECT mark FROM internal_marks
            WHERE semester_id = ? AND subject_index = ?
            ORDER BY internal_number ASC LIMIT 1
        ''', (s['semester_id'], s['subject_index'])).fetchone()
        mark = legacy['mark'] if legacy else None
        for component in MARK_COMPONENTS:
            db.execute('''
                INSERT OR IGNORE INTO semester_marks (semester_id, subject_name, component, mark, max_mark)
                VALUES (?, ?, ?, ?, ?)
            ''', (s['semester_id'], s['name'], component,
                  mark if component == 'internal' else None, DEFAULT_MAX_MARK[component]))
    db.commit()


def init_db_schema():
    with app.app_context():
        db = get_db()
        db.execute('''
            CREATE TABLE IF NOT EXISTS semesters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                number INTEGER UNIQUE NOT NULL,
                sgpa REAL
            )
        ''')
        db.execute('''
            CREATE TABLE IF NOT EXISTS grade_subject_names (
                semester_id INTEGER,
                subject_index INTEGER,
                name TEXT,
                PRIMARY KEY (semester_id, subject_index)
            )
        ''')
        db.execute('''
            CREATE TABLE IF NOT EXISTS internal_marks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                semester_id INTEGER,
                subject_index INTEGER,
                internal_number INTEGER,
                mark REAL,
                UNIQUE (semester_id, subject_index, internal_number)
            )
        ''')
        _migrate_semester_marks(db)
        db.execute('''
            CREATE TABLE IF NOT EXISTS ese_calculator_subjects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject_name TEXT NOT NULL,
                current_marks REAL NOT NULL,
                max_sessional REAL NOT NULL,
                max_ese REAL NOT NULL,
                created_at TEXT
            )
        ''')
        # Weekly schedule overrides
        # subject_id is nullable — NULL means "None" (no class held this slot)
        # Safe migration: check if column allows NULL; if the table was created with NOT NULL,
        # recreate it preserving existing data.
        _migrate_weekly_overrides_nullable(db)

        # Attendance for override class slots
        db.execute('''
            CREATE TABLE IF NOT EXISTS override_attendance (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                week_key   TEXT NOT NULL,
                subject_id INTEGER NOT NULL,
                start_time TEXT NOT NULL,
                date       TEXT NOT NULL,
                status     TEXT NOT NULL CHECK(status IN ('attended', 'missed'))
            )
        ''')
        db.execute('''
            CREATE UNIQUE INDEX IF NOT EXISTS ux_override_att
            ON override_attendance (week_key, subject_id, start_time, date)
        ''')

        # Gym tracking
        db.execute('''
            CREATE TABLE IF NOT EXISTS gym_preset (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                name     TEXT NOT NULL,
                weekday  INTEGER CHECK(weekday IS NULL OR weekday BETWEEN 0 AND 6),
                position INTEGER NOT NULL DEFAULT 0
            )
        ''')
        db.execute('''
            CREATE TABLE IF NOT EXISTS gym_preset_exercise (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                preset_id INTEGER NOT NULL,
                name      TEXT NOT NULL,
                position  INTEGER NOT NULL DEFAULT 0
            )
        ''')
        db.execute('''
            CREATE TABLE IF NOT EXISTS gym_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                date        TEXT NOT NULL UNIQUE,
                preset_name TEXT,
                notes       TEXT NOT NULL DEFAULT '',
                cardio      INTEGER NOT NULL DEFAULT 0,
                steps_10k   INTEGER NOT NULL DEFAULT 0
            )
        ''')
        db.execute('''
            CREATE TABLE IF NOT EXISTS gym_exercise_log (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                log_id    INTEGER NOT NULL,
                exercise  TEXT NOT NULL,
                position  INTEGER NOT NULL DEFAULT 0,
                sets      INTEGER,
                reps      INTEGER,
                weight_kg REAL
            )
        ''')
        if 'set_reps' not in [c['name'] for c in db.execute('PRAGMA table_info(gym_exercise_log)')]:
            db.execute('ALTER TABLE gym_exercise_log ADD COLUMN set_reps TEXT')
        db.execute('CREATE INDEX IF NOT EXISTS ix_gym_ex_log ON gym_exercise_log (log_id)')
        db.commit()

init_db_schema()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
