/* ─────────────────────────────────────────────────────────────────
   full-timetable.js
   Handles the Full Timetable modal (Classes + Tasks & Events).

   Arrow-nav:  Two views cycle via ‹ › buttons and swipe.
               - Index 0 = 'week'  (Classes)
               - Index 1 = 'tasks' (Tasks & Events)
   Swipe:      Attached once to #tt-tab-content (passive, 50px threshold).
               Vertical gestures are ignored so scroll isn't disrupted.
   ───────────────────────────────────────────────────────────────── */

// ── Tab ordering for the arrow-nav cycle ─────────────────────────
const TT_TABS   = ['week', 'tasks'];
const TT_LABELS = { week: 'Classes', tasks: 'Tasks & Events' };
let ttCurrentIndex   = 0;    // tracks active view
let ttSwipeAttached  = false; // guard: attach swipe only once per modal open

// ── Main loader ───────────────────────────────────────────────────
window.loadTimetableModal = async function(modalBody) {
    modalBody.innerHTML = '<p style="color: var(--text-muted);">Fetching schedule...</p>';
    ttCurrentIndex  = 0;

    try {
        const [ttRes, evRes] = await Promise.all([
            fetch('/api/timetable/week'),
            fetch('/api/calendar/events')
        ]);

        const ttData = await ttRes.json();
        const evData = await evRes.json();

        window.timetableData  = ttData.data;
        window.allEventsData  = evData.data;

        // Render shell with tab buttons + content pane
        let html = `<div style="display: flex; gap: 16px; flex-direction: column;">
            <div style="display: flex; gap: 16px; border-bottom: 1px solid var(--card-border); padding-bottom: 8px; margin-bottom: 16px;">
                <button class="tt-tab active" id="tt-btn-week"  onclick="switchTimetableTab('week',  this)" style="background:transparent; border:none; color:var(--text-main); font-weight:bold; cursor:pointer; padding: 8px 16px;">Classes</button>
                <button class="tt-tab"        id="tt-btn-tasks" onclick="switchTimetableTab('tasks', this)" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding: 8px 16px;">Tasks &amp; Events</button>
            </div>
            <div id="tt-tab-content"></div>
        </div>`;

        modalBody.innerHTML = html;

        // Populate first tab
        _renderTtContent('week');

        // Attach swipe once — scoped to the content pane
        if (!ttSwipeAttached) {
            window.initSwipe(
                document.getElementById('tt-tab-content'),
                () => window.switchTimetableTab('tasks', document.getElementById('tt-btn-tasks')), // swipe left -> tasks
                () => window.switchTimetableTab('week', document.getElementById('tt-btn-week'))   // swipe right -> week
            );
            ttSwipeAttached = true;
        }

    } catch (error) {
        console.error(error);
        modalBody.innerHTML = `<p style="color: var(--accent-red);">Error loading schedule.</p>`;
    }
};

// ── Tab switcher ──────────────────────────────────────────────────
window.switchTimetableTab = function(tab, btn) {
    const tabs = document.querySelectorAll('.tt-tab');
    tabs.forEach(t => {
        t.style.color      = 'var(--text-muted)';
        t.style.fontWeight = 'normal';
    });
    if (btn) {
        btn.style.color      = 'var(--text-main)';
        btn.style.fontWeight = 'bold';
    }
    const newIdx = TT_TABS.indexOf(tab);
    if (newIdx !== -1) ttCurrentIndex = newIdx;
    _renderTtContent(tab);
};

// ── Navigate via arrows ───────────────────────────────────────────
function _ttNavTo(newIndex) {
    if (newIndex < 0 || newIndex >= TT_TABS.length) return;
    const tab = TT_TABS[newIndex];
    const btn = document.getElementById(`tt-btn-${tab}`);
    window.switchTimetableTab(tab, btn);
}

// ── Render content pane + stable arrow-nav row ────────────────────
function _renderTtContent(tab) {
    const container = document.getElementById('tt-tab-content');
    if (!container) return;

    if (tab === 'tasks') {
        container.innerHTML = renderTasksView(window.allEventsData);
    } else {
        container.innerHTML = renderWeeklyTimetable(window.timetableData, false);
    }

    _updateTtArrowNav(container);
}

// Inserts the nav row once; on subsequent calls just updates state.
function _updateTtArrowNav(container) {
    // GUARD: Only inject arrow nav if we are inside the modal body
    if (container.id !== 'tt-tab-content') return;

    const idx    = ttCurrentIndex;
    const label  = TT_LABELS[TT_TABS[idx]];
    const atFirst = idx === 0;
    const atLast  = idx === TT_TABS.length - 1;

    let navRow = container.querySelector('.view-nav-row');
    if (!navRow) {
        navRow = document.createElement('div');
        navRow.className = 'view-nav-row';
        navRow.innerHTML = `
            <button class="view-nav-btn" id="tt-nav-prev" aria-label="Previous view" onclick="_ttNavTo(ttCurrentIndex - 1)">&#8249;</button>
            <span class="view-nav-label" id="tt-nav-label"></span>
            <button class="view-nav-btn" id="tt-nav-next" aria-label="Next view" onclick="_ttNavTo(ttCurrentIndex + 1)">&#8250;</button>
        `;
        container.prepend(navRow);
    }

    navRow.querySelector('#tt-nav-label').textContent = label;
    const prevBtn = navRow.querySelector('#tt-nav-prev');
    const nextBtn = navRow.querySelector('#tt-nav-next');
    prevBtn.disabled = atFirst;
    nextBtn.disabled = atLast;
    prevBtn.setAttribute('aria-disabled', String(atFirst));
    nextBtn.setAttribute('aria-disabled', String(atLast));
}

// (swipe is now handled by window.initSwipe called from loadTimetableModal)

// ── Weekly timetable renderer ─────────────────────────────────────
function renderWeeklyTimetable(data, hideControls = false) {
    let html = '';
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const todayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());

    days.forEach(day => {
        const dayData = data[day];
        if (!dayData) return;

        const classes    = dayData.classes || dayData;
        const date       = dayData.date;
        const isHoliday  = dayData.is_holiday;

        if (!classes || classes.length === 0) return;

        const isToday = day === todayName;

        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; margin-bottom: 8px;">
                <h3 style="color: ${isToday ? 'var(--accent-teal)' : 'var(--accent-purple)'};">
                    ${day} ${isToday ? '(Today)' : ''}
                    <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal; margin-left: 8px;">${date || ''}</span>
                </h3>
                ${!hideControls && date ? `
                    <button onclick="toggleHoliday('${date}', ${isHoliday}, this)"
                            style="background: ${isHoliday ? 'var(--accent-red)' : 'rgba(239, 68, 68, 0.1)'};
                                   border: 1px solid var(--accent-red);
                                   color: ${isHoliday ? 'white' : 'var(--accent-red)'};
                                   padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 600;">
                        ${isHoliday ? 'Remove Holiday' : 'Mark Holiday'}
                    </button>
                ` : ''}
            </div>
        `;

        if (isHoliday && !hideControls) {
            html += `<div style="background: rgba(239, 68, 68, 0.05); border: 1px dashed var(--accent-red); padding: 16px; border-radius: 8px; text-align: center; color: var(--accent-red); font-weight: 500;">Closed for Holiday</div>`;
        } else {
            html += `<div style="display: grid; gap: 8px;">`;
            classes.forEach(c => {
                const isAttended = c.status === 'attended';
                const isMissed   = c.status === 'missed';

                html += `
                    <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <span style="color: var(--text-muted); font-size: 0.9rem; margin-right: 12px;">${c.time}</span>
                            <strong>${c.subject}</strong>
                        </div>
                        ${!hideControls ? `
                        <div style="display: flex; gap: 8px;">
                            <button
                                onclick="markAttendance(${c.id}, 'attended', this)"
                                style="background: ${isAttended ? 'var(--accent-teal)' : 'transparent'}; border: 1px solid var(--accent-teal); color: ${isAttended ? 'var(--bg-color)' : 'var(--accent-teal)'}; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.8rem; transition: all 0.2s;">
                                Present
                            </button>
                            <button
                                onclick="markAttendance(${c.id}, 'missed', this)"
                                style="background: ${isMissed ? 'var(--accent-red)' : 'transparent'}; border: 1px solid var(--accent-red); color: ${isMissed ? 'var(--text-main)' : 'var(--accent-red)'}; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.8rem; transition: all 0.2s;">
                                Absent
                            </button>
                        </div>
                        ` : ''}
                    </div>
                `;
            });
            html += `</div>`;
        }
    });
    return html;
}

// ── Tasks view renderer ───────────────────────────────────────────
function renderTasksView(events, filterStatus = 'all') {
    const LABEL_COLORS  = { Personal: '#bb86fc', Exam: '#cf6679', Project: '#03dac6', Gym: '#ffb74d', Study: '#81d4fa' };
    const STATUS_COLORS = { planned: 'var(--text-muted)', in_progress: 'var(--accent-yellow)', done: 'var(--accent-teal)' };

    let filteredEvents = events;
    if (filterStatus !== 'all') {
        filteredEvents = events.filter(e => e.status === filterStatus);
    }

    let html = `
        <div style="display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;">
            <button onclick="filterTasks('all')"         style="background: ${filterStatus === 'all'         ? 'var(--card-border)' : 'transparent'}; border: 1px solid var(--card-border); color: white; padding: 6px 12px; border-radius: 20px; cursor: pointer; font-size: 0.8rem;">All</button>
            <button onclick="filterTasks('planned')"     style="background: ${filterStatus === 'planned'     ? 'rgba(148, 163, 184, 0.1)' : 'transparent'}; border: 1px solid var(--text-muted); color: var(--text-muted); padding: 6px 12px; border-radius: 20px; cursor: pointer; font-size: 0.8rem;">Planning</button>
            <button onclick="filterTasks('in_progress')" style="background: ${filterStatus === 'in_progress' ? 'rgba(245, 158, 11, 0.1)' : 'transparent'}; border: 1px solid var(--accent-yellow); color: var(--accent-yellow); padding: 6px 12px; border-radius: 20px; cursor: pointer; font-size: 0.8rem;">In Progress</button>
            <button onclick="filterTasks('done')"        style="background: ${filterStatus === 'done'        ? 'rgba(6, 214, 160, 0.1)' : 'transparent'}; border: 1px solid var(--accent-teal); color: var(--accent-teal); padding: 6px 12px; border-radius: 20px; cursor: pointer; font-size: 0.8rem;">Done</button>
        </div>
        <div style="display: grid; gap: 12px;">
    `;

    if (!filteredEvents || filteredEvents.length === 0) {
        html += `<p style="color: var(--text-muted); text-align: center; padding: 40px;">No tasks found for this filter.</p>`;
    } else {
        const grouped = {};
        filteredEvents.forEach(e => {
            if (!grouped[e.date]) grouped[e.date] = [];
            grouped[e.date].push(e);
        });
        const sortedDates = Object.keys(grouped).sort();

        sortedDates.forEach(date => {
            const displayDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            html += `<h4 style="color: var(--accent-purple); margin-top: 12px; font-size: 0.9rem;">${displayDate}</h4>`;

            grouped[date].forEach(e => {
                html += `
                    <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); padding: 16px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 16px;">
                            <div style="width: 4px; height: 32px; background: ${LABEL_COLORS[e.label] || 'var(--accent-teal)'}; border-radius: 2px;"></div>
                            <div>
                                <div style="font-weight: 600; margin-bottom: 4px;">${e.title}</div>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <span style="font-size: 0.7rem; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px;">${e.label || 'Personal'}</span>
                                    <span style="font-size: 0.7rem; color: ${STATUS_COLORS[e.status] || 'white'}; font-weight: bold; text-transform: uppercase;">● ${e.status?.replace('_', ' ') || 'planned'}</span>
                                </div>
                            </div>
                        </div>
                        <select onchange="updateTaskStatus(${e.id}, this.value)" style="background: var(--bg-color); border: 1px solid var(--card-border); color: var(--text-main); padding: 6px; border-radius: 6px; font-size: 0.75rem;">
                            <option value="planned"     ${e.status === 'planned'     ? 'selected' : ''}>Planning</option>
                            <option value="in_progress" ${e.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                            <option value="done"        ${e.status === 'done'        ? 'selected' : ''}>Done</option>
                        </select>
                    </div>
                `;
            });
        });
    }

    html += `</div>`;
    return html;
}

// ── Filter tasks (re-render tasks view) ───────────────────────────
window.filterTasks = function(status) {
    const container = document.getElementById('tt-tab-content');
    if (!container) return;
    container.innerHTML = renderTasksView(window.allEventsData, status);
    _updateTtArrowNav(container);
};

// ── Update task status ────────────────────────────────────────────
window.updateTaskStatus = async function(id, status) {
    try {
        const response = await fetch(`/api/calendar/event/${id}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: status })
        });
        if (response.ok) {
            const task = window.allEventsData.find(e => e.id === id);
            if (task) task.status = status;
        }
    } catch (e) {
        alert("Failed to update status");
    }
};

// ── Toggle holiday ────────────────────────────────────────────────
window.toggleHoliday = async function(date, currentIsHoliday, btn) {
    const method = currentIsHoliday ? 'DELETE' : 'POST';
    try {
        const response = await fetch('/api/attendance/holiday', {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: date })
        });
        if (response.ok) {
            const modalBody = document.getElementById('modal-body');
            window.loadTimetableModal(modalBody);
            if (window.refreshAttendanceSnapshot) window.refreshAttendanceSnapshot();
        }
    } catch (e) {
        alert("Error toggling holiday");
    }
};

// ── Mark attendance ───────────────────────────────────────────────
window.markAttendance = async function(timetableId, status, btn) {
    try {
        const response = await fetch('/api/attendance/mark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timetable_id: timetableId, status: status })
        });

        if (response.ok) {
            const parent  = btn.parentElement;
            const buttons = parent.querySelectorAll('button');
            buttons.forEach(b => {
                const isPresentBtn      = b.textContent.trim() === 'Present';
                const isMarkingPresent  = status === 'attended';
                if (isPresentBtn) {
                    b.style.background = isMarkingPresent ? 'var(--accent-teal)' : 'transparent';
                    b.style.color      = isMarkingPresent ? 'var(--bg-color)'    : 'var(--accent-teal)';
                } else {
                    b.style.background = !isMarkingPresent ? 'var(--accent-red)'  : 'transparent';
                    b.style.color      = !isMarkingPresent ? 'var(--text-main)'   : 'var(--accent-red)';
                }
            });
            if (window.refreshAttendanceSnapshot) window.refreshAttendanceSnapshot();
        }
    } catch (error) {
        alert("Failed to mark attendance");
    }
};

// Expose nav function globally (called from onclick attributes in nav row)
window._ttNavTo = _ttNavTo;
