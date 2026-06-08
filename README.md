# Calm Cockpit v2 – Multipage Dashboard

Calm Cockpit v2 is a high-performance, single-viewport student "Mission Control" dashboard. It consolidates daily context into a glanceable overview and utilizes a modular system to provide deep-dive tools without page reloads.

## 🚀 Key Features

- **Single-Viewport Overview**: No scrolling required on desktop. See your timetable, attendance, grades, finance, and goals in ~3 seconds.
- **Multipage/Modal Architecture**: Powered by a centralized Vanilla JS modal system for fast, non-disruptive access to detailed views.
- **Dynamic Timetable**: Mark attendance (Present/Absent) or set Holidays directly from the dashboard.
- **Finance Suite**: Real-time balance breakout (Cash, HDFC, Metro Card) with a full transaction log and category tracking.
- **Interactive Project Logs**: Track development progress with expandable project cards and dedicated activity logs.
- **Compact Calendar**: Integrated month-view with color-coded event markers and a selected-day agenda view.
- **ESE Grade Calculator**: A perfect port of the original calculator, providing real-time End-Sem Exam requirement predictions.
- **Real-Time Sync**: Changes made in any modal are immediately reflected in the main dashboard snapshots.

## 🛠️ Technical Stack

- **Backend**: Python (Flask)
- **Database**: SQLite (SQLAlchemy compatible)
- **Frontend**: HTML5, CSS3 (CSS Grid/Flexbox), Vanilla JavaScript (Modular ES6 style)
- **Design**: Dark SaaS aesthetic with glassmorphism and teal/purple accents.

## 📥 Initialization & Setup

### 1. Prerequisites
Ensure you have **Python 3.8+** installed on your system.

### 2. Installation
Navigate to the project directory and install the required dependencies:
```bash
pip install -r requirements.txt
```

### 3. Database Initialization (First-Time Setup)
If you are setting up the project for the first time (no `cockpit.db` exists yet), you need to create and initialize the database before running the app.

Open a terminal in the project root and run:
```bash
python app.py initdb
```
> This creates the `instance/cockpit.db` SQLite file and sets up all required tables automatically.

Alternatively, you can initialize from the Python shell:
```bash
python
>>> from app import app, db
>>> with app.app_context():
...     db.create_all()
>>> exit()
```

After initialization the structure should look like:
```text
calm-cockpit-multipage-version/
└── instance/
    └── cockpit.db   ← created after init
```

### 4. Running the Dashboard
Start the Flask server:
```bash
python app.py
```
Then, visit `http://127.0.0.1:5000` in your web browser.

## 📋 Data Management
- **Editable Subjects**: Click on any subject name in the Attendance or Internal Grades view to edit it—changes save automatically.
- **Clear Data**: Use the "Clear All" buttons within modals to reset specific sections (with confirmation safety).
- **Auto-Sync**: The dashboard uses a global refresh system to ensure snapshots stay current without requiring a page refresh.

---
Built with ❤️ for productivity.
