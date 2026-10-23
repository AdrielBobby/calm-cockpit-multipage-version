"""One-off: convert every integer id in the cockpit DB to a readable text id (proj_6, sem_1, ...).

    python scripts/migrate_text_ids.py [path/to/cockpit.db]

Defaults to instance/cockpit.db. Run it on a copy first; it refuses to touch a DB that is
already migrated and rolls everything back on any error.
"""
import os
import sqlite3
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import text_ids  # noqa: E402

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', 'instance', 'cockpit.db')
db = sqlite3.connect(path, isolation_level=None)
db.row_factory = sqlite3.Row
db.execute('PRAGMA foreign_keys = OFF')
db.execute('BEGIN')
try:
    counts = text_ids.migrate(db)
    if not counts:
        print('Nothing to do: already on text ids.')
        db.execute('ROLLBACK')
    else:
        db.execute('COMMIT')
        for table, n in sorted(counts.items()):
            print(f'  {table}: {n} rows')
        print(f'Migrated {len(counts)} tables in {path}')
except Exception as exc:
    db.execute('ROLLBACK')
    print(f'FAILED, rolled back: {exc}')
    sys.exit(1)
