"""Readable text ids (proj_6, sem_1, evt_12, ...) for every table.

Single source for the id prefixes, foreign keys, the text-id table definitions and
the one-off integer -> text migration (see scripts/migrate_text_ids.py).
"""
import re

# table -> prefix
ID_PREFIX = {
    'accounts': 'acct', 'assignments': 'asg', 'attendance': 'att', 'board_categories': 'cat',
    'board_items': 'item', 'board_links': 'link', 'board_nodes': 'node', 'boards': 'board',
    'ese_calculator_subjects': 'ese', 'events': 'evt', 'exercises': 'ex', 'focus_plans': 'plan',
    'focus_sessions': 'fsess', 'gym_exercise_log': 'gxl', 'gym_log': 'glog', 'gym_preset': 'gpre',
    'gym_preset_exercise': 'gpex', 'holidays': 'hol', 'internal_marks': 'imark',
    'override_attendance': 'oatt', 'project_logs': 'log', 'projects': 'proj',
    'semester_marks': 'smark', 'semesters': 'sem', 'subjects': 'subj', 'timetable': 'slot',
    'timetable_variations': 'tvar', 'transactions': 'txn', 'weekly_goals': 'goal',
    'weekly_overrides': 'wov', 'workout_sets': 'wset', 'workouts': 'wk',
}

# Tables whose create form asks the user for an id (everything else is auto-numbered).
USER_ID_TABLES = ('projects', 'semesters', 'events', 'assignments', 'weekly_goals',
                  'subjects', 'focus_plans', 'boards', 'gym_preset')

# table -> [(column, parent table)]; every column that holds another table's id.
FOREIGN_KEYS = {
    'assignments': [('subject_id', 'subjects')],
    'attendance': [('timetable_id', 'timetable')],
    'board_items': [('node_id', 'board_nodes')],
    'board_links': [('node_id', 'board_nodes'), ('from_item', 'board_items'), ('to_item', 'board_items')],
    'board_nodes': [('board_id', 'boards'), ('parent_id', 'board_nodes'), ('project_id', 'projects')],
    'boards': [('project_id', 'projects')],
    'focus_sessions': [('plan_id', 'focus_plans')],
    'focus_timer': [('plan_id', 'focus_plans'), ('current_session_id', 'focus_sessions')],
    'grade_subject_names': [('semester_id', 'semesters')],
    'gym_exercise_log': [('log_id', 'gym_log')],
    'gym_preset_exercise': [('preset_id', 'gym_preset')],
    'internal_marks': [('semester_id', 'semesters')],
    'override_attendance': [('subject_id', 'subjects')],
    'project_logs': [('project_id', 'projects')],
    'semester_marks': [('semester_id', 'semesters')],
    'timetable': [('subject_id', 'subjects')],
    'timetable_variations': [('timetable_id', 'timetable'), ('subject_id', 'subjects')],
    'transactions': [('account_id', 'accounts')],
    'weekly_goals': [('carried_from_goal_id', 'weekly_goals')],
    'weekly_overrides': [('subject_id', 'subjects')],
    'workout_sets': [('workout_id', 'workouts'), ('exercise_id', 'exercises')],
}

# Text-id table definitions. Column order matches the live DB (added-later columns last).
TABLES = {
    'accounts': '''CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL
    )''',
    'assignments': '''CREATE TABLE assignments (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL,
        subject_id TEXT,
        due_date   TEXT NOT NULL,
        status     TEXT NOT NULL DEFAULT 'not_started'
                   CHECK(status IN ('not_started', 'in_progress', 'submitted')),
        notes      TEXT NOT NULL DEFAULT '',
        created_at TEXT
    )''',
    'attendance': '''CREATE TABLE attendance (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        timetable_id TEXT NOT NULL,
        status TEXT NOT NULL, -- 'attended', 'missed'
        FOREIGN KEY (timetable_id) REFERENCES timetable (id),
        UNIQUE(date, timetable_id)
    )''',
    'board_categories': '''CREATE TABLE board_categories (
        id        TEXT PRIMARY KEY,
        name      TEXT NOT NULL UNIQUE COLLATE NOCASE,
        colour    TEXT NOT NULL,
        is_preset INTEGER NOT NULL DEFAULT 0
    )''',
    'board_items': '''CREATE TABLE board_items (
        id         TEXT PRIMARY KEY,
        node_id    TEXT NOT NULL,
        type       TEXT NOT NULL CHECK(type IN ('note', 'image', 'pin')),
        x          REAL NOT NULL DEFAULT 0,
        y          REAL NOT NULL DEFAULT 0,
        w          REAL NOT NULL DEFAULT 200,
        h          REAL NOT NULL DEFAULT 0,
        z          INTEGER NOT NULL DEFAULT 0,
        content    TEXT NOT NULL DEFAULT '',
        colour     TEXT NOT NULL DEFAULT 'yellow',
        image_path TEXT
    )''',
    'board_links': '''CREATE TABLE board_links (
        id        TEXT PRIMARY KEY,
        node_id   TEXT NOT NULL,
        from_item TEXT NOT NULL,
        to_item   TEXT NOT NULL,
        colour    TEXT NOT NULL DEFAULT '#ef4444'
    )''',
    'board_nodes': '''CREATE TABLE board_nodes (
        id        TEXT PRIMARY KEY,
        board_id  TEXT NOT NULL,
        parent_id TEXT,
        category  TEXT NOT NULL,
        title     TEXT NOT NULL,
        x         REAL NOT NULL DEFAULT 0,
        y         REAL NOT NULL DEFAULT 0,
        project_id TEXT
    )''',
    'boards': '''CREATE TABLE boards (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        project_id TEXT
    )''',
    'ese_calculator_subjects': '''CREATE TABLE ese_calculator_subjects (
        id TEXT PRIMARY KEY,
        subject_name TEXT NOT NULL,
        current_marks REAL NOT NULL,
        max_sessional REAL NOT NULL,
        max_ese REAL NOT NULL,
        created_at TEXT
    )''',
    'events': '''CREATE TABLE events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        date TEXT NOT NULL,
        start_time TEXT,
        end_time TEXT,
        label TEXT DEFAULT 'Personal',
        status TEXT DEFAULT "planned"
    )''',
    'exercises': '''CREATE TABLE exercises (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
    )''',
    'focus_plans': '''CREATE TABLE focus_plans (
        id                   TEXT PRIMARY KEY,
        name                 TEXT NOT NULL,
        created_at           TEXT NOT NULL,
        updated_at           TEXT NOT NULL,
        focus_min            INTEGER NOT NULL DEFAULT 25,
        short_break_min      INTEGER NOT NULL DEFAULT 5,
        long_break_min       INTEGER NOT NULL DEFAULT 25,
        sessions_before_long INTEGER NOT NULL DEFAULT 4
    )''',
    'focus_sessions': '''CREATE TABLE focus_sessions (
        id           TEXT PRIMARY KEY,
        plan_id      TEXT NOT NULL,
        position     INTEGER NOT NULL DEFAULT 0,
        title        TEXT NOT NULL,
        description  TEXT,
        status       TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'skipped')),
        completed_at TEXT
    )''',
    'focus_timer': '''CREATE TABLE focus_timer (
        plan_id                TEXT PRIMARY KEY,
        current_session_id     TEXT,
        phase                  TEXT NOT NULL DEFAULT 'idle',
        next_phase             TEXT,
        ends_at                INTEGER,
        remaining_sec          INTEGER,
        is_paused              INTEGER NOT NULL DEFAULT 0,
        focus_count_since_long INTEGER NOT NULL DEFAULT 0
    )''',
    'grade_subject_names': '''CREATE TABLE grade_subject_names (
        semester_id TEXT, subject_index INTEGER, name TEXT, PRIMARY KEY(semester_id, subject_index)
    )''',
    'gym_exercise_log': '''CREATE TABLE gym_exercise_log (
        id        TEXT PRIMARY KEY,
        log_id    TEXT NOT NULL,
        exercise  TEXT NOT NULL,
        position  INTEGER NOT NULL DEFAULT 0,
        sets      INTEGER,
        reps      INTEGER,
        weight_kg REAL,
        set_reps  TEXT
    )''',
    'gym_log': '''CREATE TABLE gym_log (
        id          TEXT PRIMARY KEY,
        date        TEXT NOT NULL UNIQUE,
        preset_name TEXT,
        notes       TEXT NOT NULL DEFAULT '',
        cardio      INTEGER NOT NULL DEFAULT 0,
        steps_10k   INTEGER NOT NULL DEFAULT 0
    )''',
    'gym_preset': '''CREATE TABLE gym_preset (
        id       TEXT PRIMARY KEY,
        name     TEXT NOT NULL,
        weekday  INTEGER CHECK(weekday IS NULL OR weekday BETWEEN 0 AND 6),
        position INTEGER NOT NULL DEFAULT 0
    )''',
    'gym_preset_exercise': '''CREATE TABLE gym_preset_exercise (
        id        TEXT PRIMARY KEY,
        preset_id TEXT NOT NULL,
        name      TEXT NOT NULL,
        position  INTEGER NOT NULL DEFAULT 0
    )''',
    'holidays': '''CREATE TABLE holidays (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        reason TEXT
    )''',
    'internal_marks': '''CREATE TABLE internal_marks (
        id TEXT PRIMARY KEY,
        semester_id TEXT NOT NULL,
        subject_index INTEGER NOT NULL, -- 0-5 for the 6 columns
        internal_number INTEGER NOT NULL, -- 1 or 2
        mark REAL,
        FOREIGN KEY (semester_id) REFERENCES semesters (id),
        UNIQUE(semester_id, subject_index, internal_number)
    )''',
    'override_attendance': '''CREATE TABLE override_attendance (
        id         TEXT PRIMARY KEY,
        week_key   TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        start_time TEXT NOT NULL,
        date       TEXT NOT NULL,
        status     TEXT NOT NULL CHECK(status IN ('attended', 'missed'))
    )''',
    'project_logs': '''CREATE TABLE project_logs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        date TEXT NOT NULL,
        note TEXT NOT NULL,
        state TEXT,
        FOREIGN KEY (project_id) REFERENCES projects (id)
    )''',
    'projects': '''CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL, -- 'planned', 'in_progress', 'paused', 'done'
        priority TEXT,
        started_date TEXT,
        target_date TEXT,
        last_updated TEXT
    )''',
    'semester_marks': '''CREATE TABLE semester_marks (
        id TEXT PRIMARY KEY,
        semester_id TEXT NOT NULL,
        subject_name TEXT NOT NULL,
        component TEXT NOT NULL CHECK(component IN ('internal', 'sessional', 'end_sem')),
        mark REAL,
        max_mark REAL NOT NULL,
        grade TEXT,
        UNIQUE (semester_id, subject_name, component)
    )''',
    'semesters': '''CREATE TABLE semesters (
        id TEXT PRIMARY KEY,
        number INTEGER NOT NULL UNIQUE,
        sgpa REAL
    )''',
    'subjects': '''CREATE TABLE subjects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        short_name TEXT
    )''',
    'timetable': '''CREATE TABLE timetable (
        id TEXT PRIMARY KEY,
        day_of_week TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        FOREIGN KEY (subject_id) REFERENCES subjects (id)
    )''',
    'timetable_variations': '''CREATE TABLE timetable_variations (
        id TEXT PRIMARY KEY,
        timetable_id TEXT, -- Nullable for new ad-hoc slots
        date TEXT NOT NULL,
        subject_id TEXT, -- Nullable if action is delete
        start_time TEXT,
        end_time TEXT,
        action TEXT NOT NULL, -- 'modify', 'delete', 'add'
        FOREIGN KEY (timetable_id) REFERENCES timetable (id),
        FOREIGN KEY (subject_id) REFERENCES subjects (id)
    )''',
    'transactions': '''CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT,
        note TEXT,
        FOREIGN KEY (account_id) REFERENCES accounts (id)
    )''',
    'weekly_goals': '''CREATE TABLE weekly_goals (
        id TEXT PRIMARY KEY,
        week_start_date TEXT NOT NULL,
        text TEXT NOT NULL,
        notes TEXT,
        is_completed BOOLEAN NOT NULL DEFAULT 0,
        carried_from_goal_id TEXT
    )''',
    'weekly_overrides': '''CREATE TABLE weekly_overrides (
        id         TEXT PRIMARY KEY,
        week_key   TEXT NOT NULL,
        subject_id TEXT,
        start_time TEXT NOT NULL,
        end_time   TEXT
    )''',
    'workout_sets': '''CREATE TABLE workout_sets (
        id TEXT PRIMARY KEY,
        workout_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        sets INTEGER NOT NULL,
        reps INTEGER NOT NULL,
        weight REAL,
        FOREIGN KEY (workout_id) REFERENCES workouts (id),
        FOREIGN KEY (exercise_id) REFERENCES exercises (id)
    )''',
    'workouts': '''CREATE TABLE workouts (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL
    )''',
}

# Indexes that live on the rebuilt tables (dropped with the old table, so recreated here).
INDEXES = [
    'CREATE INDEX IF NOT EXISTS ix_assignments_due ON assignments (due_date)',
    'CREATE INDEX IF NOT EXISTS ix_board_items_node ON board_items (node_id)',
    'CREATE INDEX IF NOT EXISTS ix_board_links_node ON board_links (node_id)',
    'CREATE INDEX IF NOT EXISTS ix_board_nodes_board ON board_nodes (board_id)',
    'CREATE INDEX IF NOT EXISTS ix_focus_sessions_plan ON focus_sessions (plan_id)',
    'CREATE INDEX IF NOT EXISTS ix_gym_ex_log ON gym_exercise_log (log_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS ux_board_nodes_project ON board_nodes (project_id) WHERE project_id IS NOT NULL',
    'CREATE UNIQUE INDEX IF NOT EXISTS ux_override_att ON override_attendance (week_key, subject_id, start_time, date)',
    'CREATE UNIQUE INDEX IF NOT EXISTS ux_override_slot ON weekly_overrides (week_key, start_time)',
]

ID_RE = re.compile(r'^[a-z0-9_]{3,40}$')


def table_has_text_id(db, table):
    """True once the table's id column is TEXT (or the table doesn't exist yet)."""
    cols = {c[1]: c[2].upper() for c in db.execute(f'PRAGMA table_info({table})')}
    return not cols or cols.get('id', cols.get('plan_id', 'TEXT')) == 'TEXT'


def install_triggers(db):
    """Auto-number rows inserted without an id: prefix_(highest number so far + 1).

    Semesters default to sem_<number> so "semester 1" is always sem_1.
    """
    for table, prefix in ID_PREFIX.items():
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
            continue
        skip = len(prefix) + 2
        if table == 'semesters':
            value = f"'sem_' || NEW.number"
        else:
            value = (f"'{prefix}_' || (SELECT COALESCE(MAX(CAST(SUBSTR(id, {skip}) AS INTEGER)), 0) + 1 "
                     f"FROM {table} WHERE id LIKE '{prefix}\\_%' ESCAPE '\\')")
        db.execute(f'DROP TRIGGER IF EXISTS trg_{table}_id')
        db.execute(f'''CREATE TRIGGER trg_{table}_id AFTER INSERT ON {table} WHEN NEW.id IS NULL
                       BEGIN UPDATE {table} SET id = {value} WHERE rowid = NEW.rowid; END''')


def next_id(db, table):
    """The id the trigger would hand out next (used to prefill create forms)."""
    prefix = ID_PREFIX[table]
    if table == 'semesters':
        n = db.execute('SELECT COALESCE(MAX(number), 0) + 1 FROM semesters').fetchone()[0]
        return f'sem_{n}'
    skip = len(prefix) + 2
    n = db.execute(f"SELECT COALESCE(MAX(CAST(SUBSTR(id, {skip}) AS INTEGER)), 0) + 1 FROM {table} "
                   f"WHERE id LIKE ? ESCAPE '\\'", (prefix + '\\_%',)).fetchone()[0]
    return f'{prefix}_{n}'


def validate_user_id(db, table, value):
    """Returns (id, error, http_status). A blank value means "auto-number"."""
    if value is None or str(value).strip() == '':
        return None, None, 200
    value = str(value).strip().lower()
    prefix = ID_PREFIX[table]
    if not ID_RE.match(value) or not value.startswith(prefix + '_') or len(value) == len(prefix) + 1:
        return None, f"id must look like {prefix}_<name> (lowercase letters, digits, _; 3-40 chars)", 400
    if db.execute(f'SELECT 1 FROM {table} WHERE id = ?', (value,)).fetchone():
        return None, f"id '{value}' is already taken", 409
    return value, None, 200


def check_id(table, value):
    """True if value is shaped like an id for this table (cheap route guard)."""
    return isinstance(value, str) and value.startswith(ID_PREFIX[table] + '_') and bool(ID_RE.match(value))


def migrate(db):
    """Rebuild every integer-id table with text ids. Returns {table: rows}. Raises on any inconsistency.

    The caller owns the connection; this runs in one transaction and the caller commits.
    """
    existing = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    todo = [t for t in list(TABLES) if t in existing and not table_has_text_id(db, t)]
    # focus_timer / grade_subject_names have no id column but carry FKs
    for t in ('focus_timer', 'grade_subject_names'):
        if t in existing and t not in todo and any(
                c[2].upper() == 'INTEGER' for c in db.execute(f'PRAGMA table_info({t})')
                if c[1] in ('plan_id', 'semester_id')):
            todo.append(t)
    if not todo:
        return {}
    counts = {t: db.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in todo}
    db.execute('PRAGMA legacy_alter_table = ON')  # RENAME must not rewrite other tables' FOREIGN KEY clauses

    # old integer id -> new text id, for every table being rebuilt
    for t in todo:
        if t not in ID_PREFIX:
            continue
        db.execute(f'DROP TABLE IF EXISTS _map_{t}')
        db.execute(f'CREATE TEMP TABLE _map_{t} (old INTEGER PRIMARY KEY, new TEXT NOT NULL)')
        expr = "'sem_' || number" if t == 'semesters' else f"'{ID_PREFIX[t]}_' || id"
        db.execute(f'INSERT INTO _map_{t} SELECT id, {expr} FROM {t}')

    def mapped(parent, col):
        if parent in ID_PREFIX and parent in todo:
            return f"COALESCE((SELECT new FROM _map_{parent} WHERE old = o.{col}), '{ID_PREFIX[parent]}_' || o.{col})"
        return f'o.{col}'

    for t in todo:
        fks = dict(FOREIGN_KEYS.get(t, []))
        db.execute(f'ALTER TABLE {t} RENAME TO _old_{t}')
        for name, in db.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL",
                                (f'_old_{t}',)).fetchall():
            db.execute(f'DROP INDEX IF EXISTS {name}')
        db.execute(TABLES[t])
        old_cols = [c[1] for c in db.execute(f'PRAGMA table_info(_old_{t})')]
        new_cols = [c[1] for c in db.execute(f'PRAGMA table_info({t})')]
        shared = [c for c in new_cols if c in old_cols]
        select = []
        for c in shared:
            if c == 'id':
                select.append(f"(SELECT new FROM _map_{t} WHERE old = o.id)")
            elif c in fks:
                select.append(mapped(fks[c], c))
            else:
                select.append(f'o.{c}')
        db.execute(f'INSERT INTO {t} ({", ".join(shared)}) SELECT {", ".join(select)} FROM _old_{t} o ORDER BY o.rowid')
        db.execute(f'DROP TABLE _old_{t}')
    for sql in INDEXES:
        try:
            db.execute(sql)
        except Exception:
            pass  # index on a table that doesn't exist in this DB
    # verify: same row counts, no dangling references
    for t, n in counts.items():
        now = db.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
        if now != n:
            raise RuntimeError(f'{t}: {n} rows before, {now} after')
    for t, fks in FOREIGN_KEYS.items():
        if t not in existing:
            continue
        for col, parent in fks:
            pcol = 'plan_id' if parent == 'focus_timer' else 'id'
            bad = db.execute(f'SELECT COUNT(*) FROM {t} c WHERE c.{col} IS NOT NULL AND '
                             f'NOT EXISTS (SELECT 1 FROM {parent} p WHERE p.{pcol} = c.{col})').fetchone()[0]
            if bad:
                print(f'  note: {t}.{col} has {bad} dangling reference(s) to {parent} (already orphaned before migration)')
    db.execute('PRAGMA legacy_alter_table = OFF')
    install_triggers(db)
    return counts
