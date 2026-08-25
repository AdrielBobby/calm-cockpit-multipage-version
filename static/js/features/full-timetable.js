/* ─────────────────────────────────────────────────────────────────
   full-timetable.js
   Handles the Full Timetable modal (Classes + Tasks & Events + Manage).

   Arrow-nav:  Two views cycle via ‹ › buttons and swipe.
               - Index 0 = 'week'  (Classes)
               - Index 1 = 'tasks' (Tasks & Events)
               - Index 2 = 'manage' (Manage Timetable)
   Swipe:      Attached once to #tt-tab-content (passive, 50px threshold).
               Vertical gestures are ignored so scroll isn't disrupted.
   ───────────────────────────────────────────────────────────────── */

// ── Canonical status mapping ──────────────────────────────────────
// Maps backend attendance status strings → UI state strings used by
// the CSS .period-card[data-status] system and badge classes.
// Use this helper everywhere instead of ad-hoc string comparisons.
function _periodStatus(slot) {
    if (slot.is_none || slot.status === 'none') return 'none';
    if (slot.status === 'attended')  return 'present';
    if (slot.status === 'missed')    return 'absent';
    return 'pending';  // 'unmarked' or any unknown value
}

// ── Tab ordering for the arrow-nav cycle ─────────────────────────
const TT_TABS   = ['week', 'tasks', 'manage'];
const TT_LABELS = { week: 'Classes', tasks: 'Tasks & Events', manage: 'Manage Timetable' };
let ttCurrentIndex   = 0;    // tracks active view
let ttSwipeAttached  = false; // guard: attach swipe only once per modal open

// ── Main loader ───────────────────────────────────────────────────
window.loadTimetableModal = async function(modalBody) {
    modalBody.innerHTML = '<p style="color: var(--text-muted);">Fetching schedule...</p>';
    ttCurrentIndex  = 0;

    try {
        const [ttRes, evRes, subRes] = await Promise.all([
            fetch('/api/timetable/week'),
            fetch('/api/calendar/events'),
            fetch('/api/subjects')
        ]);

        const ttData = await ttRes.json();
        const evData = await evRes.json();
        const subData = await subRes.json();

        window.timetableData  = ttData.data;
        window.allEventsData  = evData.data;
        window.subjectsData   = subData.data;

        // Render shell with tab buttons + content pane
        let html = `<div style="display: flex; gap: 16px; flex-direction: column;">
            <div style="display: flex; gap: 16px; border-bottom: 1px solid var(--card-border); padding-bottom: 8px; margin-bottom: 16px;">
                <button class="tt-tab active" id="tt-btn-week"   onclick="switchTimetableTab('week',   this)" style="background:transparent; border:none; color:var(--text-main); font-weight:bold; cursor:pointer; padding: 8px 16px;">Classes</button>
                <button class="tt-tab"        id="tt-btn-tasks"  onclick="switchTimetableTab('tasks',  this)" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding: 8px 16px;">Tasks &amp; Events</button>
                <button class="tt-tab"        id="tt-btn-manage" onclick="switchTimetableTab('manage', this)" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding: 8px 16px;">Manage</button>
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
                () => {
                    if (ttCurrentIndex < TT_TABS.length - 1) {
                        const nextTab = TT_TABS[ttCurrentIndex + 1];
                        switchTimetableTab(nextTab, document.getElementById(`tt-btn-${nextTab}`));
                    }
                },
                () => {
                    if (ttCurrentIndex > 0) {
                        const prevTab = TT_TABS[ttCurrentIndex - 1];
                        switchTimetableTab(prevTab, document.getElementById(`tt-btn-${prevTab}`));
                    }
                }
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
    } else if (tab === 'manage') {
        container.innerHTML = renderManageView(window.timetableData, window.subjectsData);
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

        const classes    = dayData.classes || [];
        const date       = dayData.date;
        const isHoliday  = dayData.is_holiday;
        const isWeekend  = dayData.is_weekend;
        const isOverride = dayData.is_override;

        // Skip days with no classes and that aren't weekend placeholders
        if (!classes || (classes.length === 0 && !isWeekend)) return;

        const isToday = day === todayName;
        const isSunday = day === 'Sunday';
        const isSaturday = day === 'Saturday';

        // Override badge for the week view
        const overrideBadge = isOverride
            ? `<span style="font-size: 0.65rem; background: rgba(167,139,250,0.18); color: var(--accent-purple); border: 1px solid rgba(167,139,250,0.35); padding: 2px 8px; border-radius: 20px; font-weight: 600; letter-spacing: 0.3px; margin-left: 8px;">📅 Override</span>`
            : '';

        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; margin-bottom: 8px;">
                <h3 style="color: ${isToday ? 'var(--accent-teal)' : 'var(--accent-purple)'}; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    ${day} ${isToday ? '(Today)' : ''}
                    <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal;">${date || ''}</span>
                    ${overrideBadge}
                </h3>
                ${!hideControls && date && !isWeekend ? `
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

        // Weekend/holiday with no classes
        if ((isWeekend && classes.length === 0) || (isHoliday && !hideControls)) {
            const msg = isHoliday
                ? 'Closed for Holiday'
                : isSunday
                    ? 'No classes — Sunday is always a rest day 🌙'
                    : 'No classes this Saturday — add subjects in Manage to make it a class day 📅';
            const color = isHoliday ? 'var(--accent-red)' : 'var(--text-muted)';
            const border = isHoliday ? 'var(--accent-red)' : 'var(--card-border)';
            html += `<div style="background: rgba(255,255,255,0.02); border: 1px dashed ${border}; padding: 16px; border-radius: 8px; text-align: center; color: ${color}; font-weight: 500; font-size: 0.9rem;">${msg}</div>`;
            return;
        }

        html += `<div style="display: grid; gap: 0;">`;
        classes.forEach(c => {
            const uiStatus   = _periodStatus(c);
            const isNoneSlot = uiStatus === 'none';
            const isOverrideSlot = isOverride;

            if (isNoneSlot) {
                html += `
                    <div class="period-card" data-status="none" style="margin-bottom:8px;">
                        <span style="color: var(--text-muted); font-size: 0.9rem; margin-right: 12px;">${c.time}</span>
                        <span style="color: var(--text-muted); font-style: italic; font-size: 0.85rem; flex:1;">No class</span>
                    </div>
                `;
                return;
            }

            // Badge: only shown in read-only/compact mode (hideControls=true).
            // In the full interactive view the Present/Absent buttons communicate state,
            // so the chip would be redundant and is intentionally omitted.
            const badgeClass = uiStatus === 'present' ? 'badge-present' : uiStatus === 'absent' ? 'badge-absent' : '';
            const badgeText  = uiStatus === 'present' ? '&#10003; Present' : uiStatus === 'absent' ? '&#10007; Absent' : '';
            const badge      = (hideControls && badgeClass) ? `<span class="period-status-badge ${badgeClass}">${badgeText}</span>` : '';

            html += `
                <div class="period-card" data-status="${uiStatus}" style="margin-bottom:8px; gap:10px;">
                    <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                        <span style="color: var(--text-muted); font-size: 0.9rem; white-space:nowrap;">${c.time}</span>
                        <strong style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${c.short_name || c.subject}</strong>
                        ${badge}
                    </div>
                    ${!hideControls ? `
                    <div style="display: flex; gap: 8px; flex-shrink:0;">
                        <button
                            onclick="${isOverrideSlot ? `markOverrideAttendance('${dayData.override_key}', ${c.subject_id}, '${c.time}', 'attended', '${date}', this)` : `markAttendance(${c.id}, 'attended', '${date}', this)`}"
                            style="background: ${uiStatus === 'present' ? 'var(--accent-teal)' : 'transparent'}; border: 1px solid var(--accent-teal); color: ${uiStatus === 'present' ? 'var(--bg-color)' : 'var(--accent-teal)'}; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.8rem; transition: all 0.2s;">
                            Present
                        </button>
                        <button
                            onclick="${isOverrideSlot ? `markOverrideAttendance('${dayData.override_key}', ${c.subject_id}, '${c.time}', 'missed', '${date}', this)` : `markAttendance(${c.id}, 'missed', '${date}', this)`}"
                            style="background: ${uiStatus === 'absent' ? 'var(--accent-red)' : 'transparent'}; border: 1px solid var(--accent-red); color: ${uiStatus === 'absent' ? 'var(--text-main)' : 'var(--accent-red)'}; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.8rem; transition: all 0.2s;">
                            Absent
                        </button>
                    </div>
                    ` : ''}
                </div>
            `;
        });
        html += `</div>`;
    });
    return html;
}

// ── Tasks view renderer ───────────────────────────────────────────
function renderTasksView(events, filterStatus = 'all') {
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
                            <div style="width: 4px; height: 32px; background: ${window.LABEL_COLORS[e.label] || 'var(--accent-teal)'}; border-radius: 2px;"></div>
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
            if (window.invalidateHeatmapCache)   window.invalidateHeatmapCache();
            if (window.refreshTimetableSnapshot) window.refreshTimetableSnapshot();
        }
    } catch (e) {
        alert("Error toggling holiday");
    }
};

// ── Mark attendance (base timetable slots) ────────────────────────
window.markAttendance = async function(timetableId, status, date, btn) {
    try {
        const response = await fetch('/api/attendance/mark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timetable_id: timetableId, status: status, date: date })
        });

        if (response.ok) {
            _updateAttendanceBtnPair(btn, status);
            if (window.refreshAttendanceSnapshot) window.refreshAttendanceSnapshot();
            if (window.invalidateHeatmapCache) window.invalidateHeatmapCache();
        }
    } catch (error) {
        alert("Failed to mark attendance");
    }
};

// ── Mark attendance (override slots) ─────────────────────────────
window.markOverrideAttendance = async function(weekKey, subjectId, startTime, status, date, btn) {
    try {
        const response = await fetch('/api/attendance/override/mark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ week_key: weekKey, subject_id: subjectId, start_time: startTime, status: status, date: date })
        });

        if (response.ok) {
            _updateAttendanceBtnPair(btn, status);
            if (window.refreshAttendanceSnapshot) window.refreshAttendanceSnapshot();
            if (window.invalidateHeatmapCache) window.invalidateHeatmapCache();
        }
    } catch (error) {
        alert("Failed to mark attendance");
    }
};

function _updateAttendanceBtnPair(btn, status) {
    const newUiStatus = status === 'attended' ? 'present' : 'absent';

    // 1. Update the two attendance buttons in the button container
    const btnContainer = btn.parentElement;
    const buttons = btnContainer.querySelectorAll('button');
    buttons.forEach(b => {
        const isPresentBtn     = b.textContent.trim() === 'Present';
        const isMarkingPresent = status === 'attended';
        if (isPresentBtn) {
            b.style.background = isMarkingPresent ? 'var(--accent-teal)' : 'transparent';
            b.style.color      = isMarkingPresent ? 'var(--bg-color)'    : 'var(--accent-teal)';
        } else {
            b.style.background = !isMarkingPresent ? 'var(--accent-red)'  : 'transparent';
            b.style.color      = !isMarkingPresent ? 'var(--text-main)'   : 'var(--accent-red)';
        }
    });

    // 2. Flip the parent .period-card data-status so CSS transitions fire
    const card = btn.closest('.period-card');
    if (card) {
        card.dataset.status = newUiStatus;
        // Update the status badge text and class — only if a badge is present in the DOM.
        // In the full interactive view badges are intentionally omitted, so we never inject one.
        const badge = card.querySelector('.period-status-badge');
        if (badge) {
            badge.className = `period-status-badge badge-${newUiStatus}`;
            badge.innerHTML = newUiStatus === 'present' ? '&#10003; Present' : '&#10007; Absent';
        }
        // No else: compact/read-only views already have a badge rendered server-side;
        //          interactive views deliberately show no chip (buttons convey state instead).
    }
}

// Expose nav function globally (called from onclick attributes in nav row)
window._ttNavTo = _ttNavTo;

// ═══════════════════════════════════════════════════════════════════
//  MANAGE VIEW
// ═══════════════════════════════════════════════════════════════════

function renderManageView(data, subjects) {
    let html = `<div style="display: flex; flex-direction: column; gap: 16px;">
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 4px;">
            Edit the timetable structure. Toggle <strong style="color:var(--accent-purple);">This week only</strong> to save changes just for this week without touching the permanent base schedule.
        </p>`;

    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    days.forEach(day => {
        html += _buildManageDaySection(day, data[day], subjects);
    });

    // ── Subject names editor ──────────────────────────────────────
    html += `<div style="margin-top: 24px;">
        <h4 style="border-bottom: 1px solid var(--card-border); padding-bottom: 6px; margin-bottom: 12px;">Subject Names</h4>
        <div style="display: flex; flex-direction: column; gap: 8px;">`;

    subjects.forEach(s => {
        html += `
            <div style="display: flex; gap: 8px; align-items: center; background: rgba(255,255,255,0.02); padding: 8px; border-radius: 8px; border: 1px solid var(--card-border);">
                <input type="text" value="${s.name}" onchange="updateTimetableSubjectName(${s.id}, this.value, null)"
                       placeholder="Long Name" style="flex: 2; background: transparent; border: 1px solid transparent; color: var(--text-main); font-size: 0.85rem; padding: 4px; border-radius: 4px; font-weight: 600;">
                <input type="text" value="${s.short_name || ''}" onchange="updateTimetableSubjectName(${s.id}, null, this.value)"
                       placeholder="Short" style="flex: 1; background: transparent; border: 1px solid var(--card-border); color: var(--text-muted); font-size: 0.8rem; padding: 4px; border-radius: 4px; text-align: center;">
            </div>
        `;
    });
    html += `</div></div></div>`;
    return html;
}

// ── Build per-day section in Manage tab ───────────────────────────
function _buildManageDaySection(day, dayData, subjects) {
    if (!dayData) return '';
    const isSunday   = day === 'Sunday';
    const isSaturday = day === 'Saturday';
    const isOverride = dayData.is_override;
    const isWeekend  = dayData.is_weekend;
    const overrideKey = dayData.override_key || '';

    // ── Sunday: always read-only ──────────────────────────────────
    if (isSunday) {
        return `
            <div class="manage-day-section" style="margin-bottom: 16px; opacity: 0.55;">
                <div class="manage-day-header" style="display:flex; align-items:center; gap:8px; border-bottom: 1px solid var(--card-border); padding-bottom: 6px; margin-bottom: 10px;">
                    <h4 style="flex:1; margin:0;">${day}</h4>
                    <span style="font-size:0.72rem; color:var(--text-muted); background:rgba(255,255,255,0.04); border:1px solid var(--card-border); padding:2px 8px; border-radius:12px;">Always a holiday</span>
                </div>
                <p style="font-size:0.82rem; color:var(--text-muted); padding: 10px 0;">Sunday is always a rest day. No override available.</p>
            </div>`;
    }

    // ── Determine override badge & revert link ────────────────────
    const modifiedBadge = isOverride
        ? `<span class="override-badge">✦ Modified this week</span>`
        : '';
    const revertLink = isOverride
        ? `<button class="day-revert-link" onclick="revertOverride('${overrideKey}', '${day}')" title="Remove this week's override and go back to the base schedule">↩ Revert to base</button>`
        : '';

    // ── Saturday: override mode is forced ON ─────────────────────
    const forcedOverride = isSaturday;
    const toggleId       = `override-toggle-${day}`;
    // Default: Saturday always in override mode; other days OFF by default (unless already overridden)
    const defaultOn = isSaturday || isOverride;

    const toggleHTML = forcedOverride
        ? `<label class="override-toggle-label" style="cursor:default;" title="Saturday edits always apply this week only">
               <input type="checkbox" id="${toggleId}" class="override-toggle-cb" data-day="${day}" checked disabled style="display:none;">
               <span class="override-toggle-track forced">This week only</span>
           </label>`
        : `<label class="override-toggle-label" title="When ON, changes apply only to this week">
               <input type="checkbox" id="${toggleId}" class="override-toggle-cb" data-day="${day}" ${defaultOn ? 'checked' : ''}
                   onchange="onOverrideToggleChange('${day}', '${overrideKey}', this.checked)">
               <span class="override-toggle-track" id="toggle-track-${day}">This week only</span>
           </label>`;

    // ── Classes to show in the edit grid ─────────────────────────
    // In override mode: show existing override slots (or base as starting point)
    // In base mode: show base slots
    const editClasses = isOverride ? (dayData.classes || []) : (dayData.base_classes || dayData.classes || []);

    // Saturday with no override and not in Saturday-forced-mode: show holiday note
    if (isSaturday && !isOverride) {
        // Saturday gets the toggle + the "holiday by default" notice + an empty slot builder
        return `
            <div class="manage-day-section" id="manage-section-${day}" style="margin-bottom: 16px;">
                <div class="manage-day-header" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; border-bottom: 1px solid var(--card-border); padding-bottom: 6px; margin-bottom: 10px;">
                    <h4 style="flex:1; margin:0;">${day}</h4>
                    ${modifiedBadge}
                    ${toggleHTML}
                    ${revertLink}
                </div>
                <div class="weekend-holiday-note">
                    📅 Holiday by default — add subjects below to make this Saturday a class day for this week only.
                </div>
                <div id="override-slots-${day}" style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
                    ${_renderOverrideSlotRows([], subjects, day, overrideKey, true)}
                </div>
                <div style="display:flex; gap:8px; margin-top:10px; align-items:center;">
                    <button onclick="addOverrideSlot('${day}')"
                            style="background: rgba(167,139,250,0.12); border: 1px solid rgba(167,139,250,0.3); color: var(--accent-purple); padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 600;">
                        + Add class slot
                    </button>
                    <button onclick="saveNewOverride('${overrideKey}', '${day}')"
                            style="background: var(--accent-purple); border: none; color: white; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 700;">
                        Save Saturday schedule
                    </button>
                </div>
            </div>`;
    }

    // ── Regular day section ───────────────────────────────────────
    // Determine if we're currently showing override editor
    // We render the grid differently based on toggle state, but since JS handles the live toggle,
    // we bake both states into the DOM and show/hide via JS after render.
    const isNewOverride = !isOverride; // toggle is OFF by default for base days

    return `
        <div class="manage-day-section" id="manage-section-${day}" style="margin-bottom: 16px;">
            <div class="manage-day-header" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; border-bottom: 1px solid var(--card-border); padding-bottom: 6px; margin-bottom: 10px;">
                <h4 style="flex:1; margin:0;">${day}</h4>
                ${modifiedBadge}
                ${toggleHTML}
                ${revertLink}
            </div>

            <!-- BASE MODE: standard onchange per row -->
            <div id="base-mode-${day}" style="display:${defaultOn ? 'none' : 'flex'}; flex-direction:column; gap:8px;">
                ${(dayData.base_classes || []).map(c => _renderBaseSlotRow(c, subjects)).join('')}
            </div>

            <!-- OVERRIDE MODE: full add/remove editor -->
            <div id="override-mode-${day}" style="display:${defaultOn ? 'flex' : 'none'}; flex-direction:column; gap:8px;">
                <div id="override-slots-${day}" style="display:flex; flex-direction:column; gap:8px;">
                    ${_renderOverrideSlotRows(editClasses, subjects, day, overrideKey, !isOverride)}
                </div>
                <div style="display:flex; gap:8px; margin-top:8px; align-items:center; flex-wrap:wrap;">
                    <button onclick="addOverrideSlot('${day}')"
                            style="background: rgba(167,139,250,0.12); border: 1px solid rgba(167,139,250,0.3); color: var(--accent-purple); padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 600;">
                        + Add slot
                    </button>
                    ${!isOverride ? `
                    <button onclick="saveNewOverride('${overrideKey}', '${day}')"
                            style="background: var(--accent-purple); border: none; color: white; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 700;">
                        Save as "This week only"
                    </button>` : ''}
                </div>
                ${isOverride ? `<p style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">Changes auto-save per row. <em>Revert to base</em> removes this week's override.</p>` : ''}
            </div>
        </div>`;
}

// ── Render a base-timetable slot row (onchange, existing approach) ─
function _renderBaseSlotRow(c, subjects) {
    return `
        <div style="display: flex; gap: 8px; align-items: center; background: rgba(255,255,255,0.02); padding: 8px; border-radius: 8px; border: 1px solid var(--card-border);">
            <input type="text" value="${c.time}" onchange="updateTimetableEntry(${c.id}, this.value, null, null)"
                   placeholder="Start" style="width: 70px; background: transparent; border: 1px solid var(--card-border); color: var(--text-main); font-size: 0.8rem; padding: 4px; border-radius: 4px;">
            <span style="color: var(--text-muted); font-size: 0.8rem;">to</span>
            <input type="text" value="${c.end_time || ''}" onchange="updateTimetableEntry(${c.id}, null, this.value, null)"
                   placeholder="End" style="width: 70px; background: transparent; border: 1px solid var(--card-border); color: var(--text-main); font-size: 0.8rem; padding: 4px; border-radius: 4px;">
            <select onchange="updateTimetableEntry(${c.id}, null, null, this.value)"
                    style="flex: 1; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 4px; border-radius: 4px; font-size: 0.85rem;">
                <option value="" ${c.subject_id == null ? 'selected' : ''}>None</option>
                ${window.subjectsData.map(s => `<option value="${s.id}" ${s.id === c.subject_id ? 'selected' : ''}>${s.name}</option>`).join('')}
            </select>
        </div>`;
}

// ── Render override slot rows ─────────────────────────────────────
// isNew = true means this is a collect-then-save scenario (no auto-save per row)
function _renderOverrideSlotRows(classes, subjects, day, overrideKey, isNew) {
    if (!classes || classes.length === 0) {
        return `<p style="font-size:0.8rem; color:var(--text-muted); padding: 4px 0;" id="override-empty-${day}">No slots yet — click "+ Add slot" to begin.</p>`;
    }
    return classes.map((c, idx) => _renderOverrideSlotRow(c, subjects, day, overrideKey, isNew, idx)).join('');
}

function _renderOverrideSlotRow(c, subjects, day, overrideKey, isNew, idx) {
    const startVal  = c.time || c.start_time || '';
    const endVal    = c.end_time || '';
    // subject_id may be null for None slots; use null (not first subject) as default for new rows
    const subjectId = c.subject_id !== undefined ? c.subject_id : null;

    const onchangeAttr = isNew
        ? ''  // collect-then-save: no onchange
        : `onchange="onOverrideRowChange('${overrideKey}', '${day}')"`;

    return `
        <div class="override-slot-row" data-start="${startVal}" data-end="${endVal}" data-subject="${subjectId}"
             style="display: flex; gap: 8px; align-items: center; background: rgba(167,139,250,0.04); padding: 8px; border-radius: 8px; border: 1px solid rgba(167,139,250,0.2);">
            <input type="text" value="${startVal}" placeholder="Start" class="ov-start"
                   style="width: 70px; background: transparent; border: 1px solid var(--card-border); color: var(--text-main); font-size: 0.8rem; padding: 4px; border-radius: 4px;"
                   ${onchangeAttr}>
            <span style="color: var(--text-muted); font-size: 0.8rem;">to</span>
            <input type="text" value="${endVal}" placeholder="End" class="ov-end"
                   style="width: 70px; background: transparent; border: 1px solid var(--card-border); color: var(--text-main); font-size: 0.8rem; padding: 4px; border-radius: 4px;"
                   ${onchangeAttr}>
            <select class="ov-subject" style="flex: 1; background: var(--bg-color); border: 1px solid rgba(167,139,250,0.3); color: white; padding: 4px; border-radius: 4px; font-size: 0.85rem;"
                    ${onchangeAttr}>
                <option value="" ${subjectId == null ? 'selected' : ''}>None</option>
                ${(window.subjectsData || subjects).map(s => `<option value="${s.id}" ${s.id == subjectId ? 'selected' : ''}>${s.name}</option>`).join('')}
            </select>
            <button onclick="removeOverrideSlot(this, '${overrideKey}', '${day}', ${isNew})"
                    title="Remove slot"
                    style="background: rgba(239,68,68,0.1); border: 1px solid var(--accent-red); color: var(--accent-red); width: 28px; height: 28px; border-radius: 6px; cursor: pointer; font-size: 1rem; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                ×
            </button>
        </div>`;
}

// ── Toggle handler: switch between base-mode and override-mode ────
window.onOverrideToggleChange = function(day, overrideKey, isOn) {
    const baseDiv     = document.getElementById(`base-mode-${day}`);
    const overrideDiv = document.getElementById(`override-mode-${day}`);
    const trackEl     = document.getElementById(`toggle-track-${day}`);

    if (baseDiv)     baseDiv.style.display     = isOn ? 'none' : 'flex';
    if (overrideDiv) overrideDiv.style.display = isOn ? 'flex' : 'none';
    if (trackEl)     trackEl.style.color       = isOn ? 'var(--accent-purple)' : '';
};

// ── Add a new empty override slot row ─────────────────────────────
window.addOverrideSlot = function(day) {
    const container = document.getElementById(`override-slots-${day}`);
    if (!container) return;

    // Remove empty placeholder text if present
    const emptyMsg = container.querySelector(`#override-empty-${day}`);
    if (emptyMsg) emptyMsg.remove();

    const dayData   = window.timetableData[day];
    const overrideKey = dayData ? dayData.override_key : '';
    const isNew     = !dayData?.is_override; // new override = collect-then-save
    const subjects  = window.subjectsData || [];

    const row = document.createElement('div');
    row.innerHTML = _renderOverrideSlotRow({}, subjects, day, overrideKey, isNew, Date.now());
    container.appendChild(row.firstElementChild);
};

// ── Remove an override slot row ───────────────────────────────────
window.removeOverrideSlot = async function(btn, overrideKey, day, isNew) {
    const row = btn.closest('.override-slot-row');
    if (row) row.remove();

    // If this is an existing (already saved) override, auto-save the updated set
    if (!isNew) {
        await onOverrideRowChange(overrideKey, day);
    }
};

// ── Auto-save existing override (onchange for existing override rows) ─
window.onOverrideRowChange = async function(overrideKey, day) {
    await _collectAndSaveOverride(overrideKey, day);
};

// ── Collect-then-save: called by the "Save" button for new overrides ─
window.saveNewOverride = async function(overrideKey, day) {
    const ok = await _collectAndSaveOverride(overrideKey, day);
    if (ok) {
        // Refresh the whole modal so badges and classes update
        const modalBody = document.getElementById('modal-body');
        if (modalBody) await window.loadTimetableModal(modalBody);
        if (window.refreshTimetableSnapshot) window.refreshTimetableSnapshot();
    }
};

async function _collectAndSaveOverride(overrideKey, day) {
    const container = document.getElementById(`override-slots-${day}`);
    if (!container) return false;

    const rows = container.querySelectorAll('.override-slot-row');
    const classes = [];
    rows.forEach(row => {
        const startTime = row.querySelector('.ov-start')?.value?.trim();
        const endTime   = row.querySelector('.ov-end')?.value?.trim() || null;
        const rawVal    = row.querySelector('.ov-subject')?.value;
        // Empty string means None slot (no subject selected)
        const subjectId = rawVal === '' || rawVal == null ? null : parseInt(rawVal);
        if (startTime) {  // Only skip rows with no time; None subject is valid
            classes.push({ subject_id: subjectId, start_time: startTime, end_time: endTime });
        }
    });

    try {
        const res = await fetch('/api/timetable/override/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ week_key: overrideKey, classes })
        });
        const result = await res.json();
        if (result.status === 'success') {
            // Update local cache
            if (window.timetableData[day]) {
                window.timetableData[day].is_override = classes.length > 0;
                window.timetableData[day].classes = classes.map(c => {
                    const isNone = c.subject_id == null;
                    return {
                        ...c,
                        time: c.start_time,
                        subject_id: c.subject_id,
                        subject: isNone ? 'None' : ((window.subjectsData.find(s => s.id === c.subject_id) || {}).name || ''),
                        short_name: isNone ? 'NONE' : ((window.subjectsData.find(s => s.id === c.subject_id) || {}).short_name || ''),
                        is_none: isNone,
                        status: isNone ? 'none' : 'unmarked',
                    };
                });
            }
            if (window.refreshTimetableSnapshot) window.refreshTimetableSnapshot();
            return true;
        }
    } catch (e) {
        console.error('Failed to save override', e);
    }
    return false;
}

// ── Revert override (delete week's override, go back to base) ─────
window.revertOverride = async function(overrideKey, day) {
    if (!confirm(`Remove this week's override for ${day} and revert to the base timetable?`)) return;
    try {
        const res = await fetch(`/api/timetable/override/${encodeURIComponent(overrideKey)}`, { method: 'DELETE' });
        if ((await res.json()).status === 'success') {
            const modalBody = document.getElementById('modal-body');
            if (modalBody) await window.loadTimetableModal(modalBody);
            if (window.refreshTimetableSnapshot) window.refreshTimetableSnapshot();
        }
    } catch (e) {
        alert('Failed to revert override');
    }
};

// ── Update Subject Name ──────────────────────────────────────────
window.updateTimetableSubjectName = async function(id, name, shortName) {
    const sub = window.subjectsData.find(s => s.id === id);
    if (!sub) return;

    const payload = {
        id: id,
        name: name || sub.name,
        short_name: shortName || sub.short_name
    };

    try {
        const response = await fetch('/api/subjects/update', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            // Update local cache
            sub.name = payload.name;
            sub.short_name = payload.short_name;

            // Also update timetableData names
            for (const day in window.timetableData) {
                window.timetableData[day].classes.forEach(c => {
                    if (c.subject_id === id) {
                        c.subject = payload.name;
                        c.short_name = payload.short_name;
                    }
                });
            }
            if (window.refreshAttendanceSnapshot) window.refreshAttendanceSnapshot();
            if (window.refreshTimetableSnapshot) window.refreshTimetableSnapshot();
        }
    } catch (e) { console.error("Failed to update subject name"); }
};

// ── Update Timetable Entry (base timetable) ────────────────────────
window.updateTimetableEntry = async function(id, startTime, endTime, subjectId) {
    // Find current data
    let entry = null;
    for (const day in window.timetableData) {
        entry = (window.timetableData[day].base_classes || []).find(c => c.id === id);
        if (entry) break;
    }
    if (!entry) {
        // Fallback: search classes array
        for (const day in window.timetableData) {
            entry = window.timetableData[day].classes.find(c => c.id === id);
            if (entry) break;
        }
    }
    if (!entry) return;

    const payload = {
        id: id,
        start_time: startTime || entry.time,
        end_time: endTime || entry.end_time,
        subject_id: subjectId || entry.subject_id
    };

    try {
        const response = await fetch('/api/timetable/update', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            // Update local cache (base_classes)
            entry.time = payload.start_time;
            entry.end_time = payload.end_time;
            entry.subject_id = parseInt(payload.subject_id);
            const sub = window.subjectsData.find(s => s.id == entry.subject_id);
            if (sub) { entry.subject = sub.name; entry.short_name = sub.short_name; }

            if (window.refreshTimetableSnapshot) window.refreshTimetableSnapshot();
        }
    } catch (e) { console.error("Failed to update timetable entry"); }
};
