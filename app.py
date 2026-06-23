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
    timetable_rows = db.execute(
        'SELECT t.start_time, s.short_name as subject '
        'FROM timetable t JOIN subjects s ON t.subject_id = s.id '
        'WHERE t.day_of_week = ?', (day_name,)
    ).fetchall()
    
    today_timetable = [{"time": r['start_time'], "subject": r['subject']} for r in timetable_rows]
    
    # --- 2. Attendance Snapshot ---
    # Simplified calculation: (attended) / (attended + missed) per subject
    subjects_rows = db.execute('SELECT id, name FROM subjects').fetchall()
    attendance_snapshot = []
    for sub in subjects_rows:
        counts = db.execute(
            'SELECT status, COUNT(*) as count '
            'FROM attendance a '
            'JOIN timetable t ON a.timetable_id = t.id '
            'WHERE t.subject_id = ? '
            'GROUP BY status', (sub['id'],)
        ).fetchall()
        
        attended = next((c['count'] for c in counts if c['status'] == 'attended'), 0)
        missed = next((c['count'] for c in counts if c['status'] == 'missed'), 0)
        total = attended + missed
        percentage = round((attended / total) * 100, 1) if total > 0 else 0
        attendance_snapshot.append({"subject": sub['name'], "percentage": percentage})

    # --- 3. Grades Snapshot ---
    semesters_rows = db.execute('SELECT number, sgpa FROM semesters ORDER BY number DESC').fetchall()
    cgpa = round(sum(r['sgpa'] for r in semesters_rows) / len(semesters_rows), 2) if semesters_rows else 0
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
    
    # Map label to colors (matching calendar-modal.js)
    label_colors = {
        'Personal': '#bb86fc', 
        'Exam': '#cf6679', 
        'Project': '#ffb74d', 
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
                           date=now.strftime("%B %d, %Y"), 
                           day=day_name,
                           timetable=today_timetable,
                           attendance=attendance_snapshot,
                           grades=grades_data,
                           finance=finance_summary,
                           goals=weekly_goals,
                           projects=projects_in_progress,
                           calendar=calendar_data)

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
    db.execute('UPDATE subjects SET name = ?, short_name = ? WHERE id = ?', 
               (data.get('name'), data.get('short_name'), data.get('id')))
    db.commit()
    return jsonify({"status": "success"})

# ── ISO week key helpers ──────────────────────────────────────────
def get_iso_week_key(dt, day_name):
    """Return a stable key like '2026-W25-Monday' for a given date and day name."""
    iso_year, iso_week, _ = dt.isocalendar()
    return f"{iso_year}-W{iso_week:02d}-{day_name}"

def cleanup_old_overrides(db):
    """Delete weekly_override rows whose week is more than 4 ISO weeks in the past."""
    cutoff = datetime.now() - timedelta(weeks=4)
    cutoff_year, cutoff_week, _ = cutoff.isocalendar()
    # Collect all distinct week_keys and delete outdated ones
    rows = db.execute('SELECT DISTINCT week_key FROM weekly_overrides').fetchall()
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
    db.commit()

def resolve_day_schedule(db, day_name, date_str, week_key):
    """
    Return a tuple (classes, is_override, is_weekend) for a given day.

    - Saturday/Sunday with no override → classes=[], is_weekend=True
    - Any day with an override → override rows, is_override=True
    - Any weekday with no override → base timetable rows, is_override=False
    """
    is_weekend = day_name in ('Saturday', 'Sunday')
    is_sunday = day_name == 'Sunday'

    # Sunday is always a holiday — no overrides allowed
    if is_sunday:
        return [], False, True

    # Check for a weekly override
    override_rows = db.execute(
        'SELECT wo.rowid as id, wo.start_time, wo.end_time, wo.subject_id, '
        's.name as subject, s.short_name '
        'FROM weekly_overrides wo '
        'JOIN subjects s ON wo.subject_id = s.id '
        'WHERE wo.week_key = ? '
        'ORDER BY wo.start_time', (week_key,)
    ).fetchall()

    if override_rows:
        classes = [
            {
                'id': r['id'],
                'time': r['start_time'],
                'end_time': r['end_time'],
                'subject_id': r['subject_id'],
                'subject': r['subject'],
                'short_name': r['short_name'],
                'status': 'unmarked',   # override rows don't store attendance
            }
            for r in override_rows
        ]
        # Attach real attendance status for each override class slot
        for c in classes:
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

    # Regular weekday — return base timetable rows
    base_rows = db.execute(
        'SELECT t.id, t.start_time, t.end_time, t.subject_id, '
        's.name as subject, s.short_name, a.status '
        'FROM timetable t '
        'JOIN subjects s ON t.subject_id = s.id '
        'LEFT JOIN attendance a ON t.id = a.timetable_id AND a.date = ? '
        'WHERE t.day_of_week = ? '
        'ORDER BY t.start_time', (date_str, day_name)
    ).fetchall()
    classes = [
        {
            'id': r['id'],
            'time': r['start_time'],
            'end_time': r['end_time'],
            'subject_id': r['subject_id'],
            'subject': r['subject'],
            'short_name': r['short_name'],
            'status': r['status'] or 'unmarked',
        }
        for r in base_rows
    ]
    return classes, False, False

@app.route('/api/timetable/today', methods=['GET'])
def get_today_timetable():
    now = datetime.now()
    day_name = now.strftime("%A")
    date_str = now.strftime("%Y-%m-%d")
    week_key = get_iso_week_key(now, day_name)
    db = get_db()

    classes, is_override, is_weekend = resolve_day_schedule(db, day_name, date_str, week_key)

    # Dashboard tile only needs time + short_name
    data = [{"time": c['time'], "subject": c['short_name'] or c['subject']} for c in classes]
    return jsonify({"status": "success", "data": data})

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
        'FROM timetable t JOIN subjects s ON t.subject_id = s.id '
        'ORDER BY t.day_of_week, t.start_time'
    ).fetchall()
    for r in base_rows_all:
        d = r['day_of_week']
        if d not in base_by_day:
            base_by_day[d] = []
        base_by_day[d].append({
            'id': r['id'],
            'time': r['start_time'],
            'end_time': r['end_time'],
            'subject_id': r['subject_id'],
            'subject': r['subject'],
            'short_name': r['short_name'],
        })

    for i, day in enumerate(days):
        current_date = start_of_week + timedelta(days=i)
        date_str = current_date.strftime("%Y-%m-%d")
        week_key = get_iso_week_key(current_date, day)

        # Check if this date is a manual holiday
        is_holiday = db.execute('SELECT 1 FROM holidays WHERE date = ?', (date_str,)).fetchone() is not None

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
        subject_id = c.get('subject_id')
        start_time = c.get('start_time', '').strip()
        end_time   = c.get('end_time', '').strip() or None
        if not subject_id or not start_time:
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
        'SELECT wo.start_time, wo.end_time, wo.subject_id, s.name as subject, s.short_name '
        'FROM weekly_overrides wo '
        'JOIN subjects s ON wo.subject_id = s.id '
        'WHERE wo.week_key = ? ORDER BY wo.start_time', (week_key,)
    ).fetchall()
    return jsonify({"status": "success", "data": [dict(r) for r in rows]})

@app.route('/api/timetable/override/<path:week_key>', methods=['DELETE'])
def delete_timetable_override(week_key):
    """Remove all override rows for a given week_key (revert to base)."""
    db = get_db()
    db.execute('DELETE FROM weekly_overrides WHERE week_key = ?', (week_key,))
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

    if not all([week_key, subject_id, start_time, status]):
        return jsonify({"status": "error", "message": "Missing fields"}), 400

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
    db = get_db()
    subjects_rows = db.execute('SELECT id, name FROM subjects').fetchall()
    data = []
    for sub in subjects_rows:
        counts = db.execute(
            'SELECT status, COUNT(*) as count '
            'FROM attendance a '
            'JOIN timetable t ON a.timetable_id = t.id '
            'WHERE t.subject_id = ? '
            'GROUP BY status', (sub['id'],)
        ).fetchall()
        
        attended = next((c['count'] for c in counts if c['status'] == 'attended'), 0)
        missed = next((c['count'] for c in counts if c['status'] == 'missed'), 0)
        total = attended + missed
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
    
    db = get_db()
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
    start_str = request.args.get('start')
    end_str = request.args.get('end')
    if not start_str or not end_str:
        return jsonify({"error": "Start and end dates required"}), 400
    
    db = get_db()
    subjects = db.execute('SELECT id, name FROM subjects').fetchall()
    data = []
    for sub in subjects:
        records = db.execute('''
            SELECT a.status, COUNT(*) as count
            FROM attendance a
            JOIN timetable t ON a.timetable_id = t.id
            LEFT JOIN holidays h ON a.date = h.date
            WHERE t.subject_id = ? AND h.date IS NULL AND a.date BETWEEN ? AND ?
            GROUP BY a.status
        ''', (sub['id'], start_str, end_str)).fetchall()
        
        attended = next((r['count'] for r in records if r['status'] == 'attended'), 0)
        missed = next((r['count'] for r in records if r['status'] == 'missed'), 0)
        total = attended + missed
        percentage = round((attended / total) * 100, 1) if total > 0 else 0
        
        if total > 0:
            data.append({
                "subject": sub['name'],
                "percentage": percentage,
                "attended": attended,
                "total": total
            })
    return jsonify({"status": "success", "data": data})

@app.route('/api/attendance/details', methods=['GET'])
def get_attendance():
    db = get_db()
    subjects_rows = db.execute('SELECT id, name FROM subjects').fetchall()
    data = []
    for sub in subjects_rows:
        counts = db.execute(
            'SELECT status, COUNT(*) as count '
            'FROM attendance a '
            'JOIN timetable t ON a.timetable_id = t.id '
            'WHERE t.subject_id = ? '
            'GROUP BY status', (sub['id'],)
        ).fetchall()
        
        attended = next((c['count'] for c in counts if c['status'] == 'attended'), 0)
        missed = next((c['count'] for c in counts if c['status'] == 'missed'), 0)
        total = attended + missed
        percentage = round((attended / total) * 100, 1) if total > 0 else 0
        data.append({
            "subject": sub['name'], 
            "percentage": percentage, 
            "missed": missed, 
            "remaining": 0 # Not calculated in current schema
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

@app.route('/api/grades/subjects', methods=['GET'])
def get_grade_subjects():
    db = get_db()
    latest_sem = db.execute('SELECT id FROM semesters ORDER BY id DESC LIMIT 1').fetchone()
    if not latest_sem:
        return jsonify({"status": "success", "data": []})
    
    rows = db.execute('SELECT subject_index, name FROM grade_subject_names WHERE semester_id = ?', (latest_sem['id'],)).fetchall()
    return jsonify({"status": "success", "data": [dict(r) for r in rows]})

@app.route('/api/grades/subjects/add', methods=['POST'])
def add_grade_subject():
    data = request.json
    db = get_db()
    latest_sem = db.execute('SELECT id FROM semesters ORDER BY id DESC LIMIT 1').fetchone()
    if not latest_sem: return jsonify({"error": "No semester found"}), 400
    
    # Get next index
    idx_row = db.execute('SELECT MAX(subject_index) FROM grade_subject_names WHERE semester_id = ?', (latest_sem['id'],)).fetchone()
    next_idx = (idx_row[0] + 1) if idx_row[0] is not None else 0
    
    db.execute('INSERT INTO grade_subject_names (semester_id, subject_index, name) VALUES (?, ?, ?)',
               (latest_sem['id'], next_idx, data.get('name')))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/grades/subjects/update', methods=['POST'])
def update_grade_subject():
    data = request.json
    db = get_db()
    latest_sem = db.execute('SELECT id FROM semesters ORDER BY id DESC LIMIT 1').fetchone()
    if not latest_sem: return jsonify({"error": "No semester found"}), 400
    
    db.execute('UPDATE grade_subject_names SET name = ? WHERE semester_id = ? AND subject_index = ?',
               (data.get('name'), latest_sem['id'], data.get('subject_index')))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/grades/internals/update', methods=['POST'])
def update_internal_mark():
    data = request.json
    db = get_db()
    latest_sem = db.execute('SELECT id FROM semesters ORDER BY id DESC LIMIT 1').fetchone()
    if not latest_sem: return jsonify({"error": "No semester found"}), 400
    
    db.execute('''
        INSERT INTO internal_marks (semester_id, subject_index, internal_number, mark)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(semester_id, subject_index, internal_number) DO UPDATE SET mark=excluded.mark
    ''', (latest_sem['id'], data.get('subject_index'), data.get('internal_number'), data.get('mark')))
    db.commit()
    return jsonify({"status": "success"})

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

@app.route('/api/grades/clear/history', methods=['DELETE'])
def clear_grades_history():
    db = get_db()
    db.execute('DELETE FROM semesters')
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/grades/clear/internals', methods=['DELETE'])
def clear_grades_internals():
    db = get_db()
    db.execute('DELETE FROM internal_marks')
    db.execute('DELETE FROM grade_subject_names')
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/grades/internals', methods=['GET'])
def get_internal_marks():
    db = get_db()
    # Fetch for latest semester (highest id)
    latest_sem = db.execute('SELECT id FROM semesters ORDER BY id DESC LIMIT 1').fetchone()
    if not latest_sem:
        return jsonify({"status": "success", "data": []})
    
    rows = db.execute('''
        SELECT g.name, i.mark, i.internal_number
        FROM internal_marks i
        JOIN grade_subject_names g ON i.semester_id = g.semester_id AND i.subject_index = g.subject_index
        WHERE i.semester_id = ?
    ''', (latest_sem['id'],)).fetchall()
    
    # Group by subject
    subjects = {}
    for r in rows:
        if r['name'] not in subjects:
            subjects[r['name']] = []
        subjects[r['name']].append({"internal": r['internal_number'], "mark": r['mark']})
    
    return jsonify({"status": "success", "data": subjects})

@app.route('/api/grades/add', methods=['POST'])
def add_semester():
    data = request.json
    db = get_db()
    db.execute('INSERT INTO semesters (number, sgpa) VALUES (?, ?)', (data.get('number'), data.get('sgpa')))
    db.commit()
    return jsonify({"status": "success"})

@app.route('/api/grades/history', methods=['GET'])
def get_grades_history():
    db = get_db()
    semesters_rows = db.execute('SELECT number, sgpa FROM semesters ORDER BY number DESC').fetchall()
    cgpa = round(sum(r['sgpa'] for r in semesters_rows) / len(semesters_rows), 2) if semesters_rows else 0
    return jsonify({
        "status": "success",
        "data": {
            "cgpa": cgpa,
            "history": [{"number": r['number'], "sgpa": r['sgpa']} for r in semesters_rows]
        }
    })

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

def init_db_schema():
    with app.app_context():
        db = get_db()
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
        db.execute('''
            CREATE TABLE IF NOT EXISTS weekly_overrides (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                week_key   TEXT NOT NULL,
                subject_id INTEGER NOT NULL,
                start_time TEXT NOT NULL,
                end_time   TEXT,
                FOREIGN KEY (subject_id) REFERENCES subjects(id)
            )
        ''')
        db.execute('''
            CREATE UNIQUE INDEX IF NOT EXISTS ux_override_slot
            ON weekly_overrides (week_key, start_time)
        ''')
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
        db.commit()

init_db_schema()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
