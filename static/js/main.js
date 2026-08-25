// main.js - Handles global dashboard functions like the clock

function updateClock() {
    const timeDisplay = document.getElementById('current-time');
    if (!timeDisplay) return;

    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    minutes = minutes < 10 ? '0' + minutes : minutes;
    
    const strTime = hours + ':' + minutes + ' ' + ampm;
    timeDisplay.textContent = strTime;
}

// Update clock immediately and then every minute
updateClock();
setInterval(updateClock, 60000);

/* ── Shared swipe helper ─────────────────────────────────────────────
   Register once per target element. onSwipeLeft/onSwipeRight are
   callbacks fired when the user swipes ≥50px horizontally with
   horizontal movement dominating (prevents accidental scroll triggers).
   All listeners are passive — never blocks scroll.
   ──────────────────────────────────────────────────────────────────── */
window.initSwipe = function(targetEl, onSwipeLeft, onSwipeRight) {
    if (!targetEl) return;
    let startX = 0;
    let startY = 0;

    const handleStart = (clientX, clientY) => {
        startX = clientX;
        startY = clientY;
    };

    const handleEnd = (clientX, clientY) => {
        const dx = clientX - startX;
        const dy = clientY - startY;
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
        if (dx < 0) onSwipeLeft();
        else onSwipeRight();
    };

    targetEl.addEventListener('touchstart', (e) => handleStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    targetEl.addEventListener('touchend', (e) => handleEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY), { passive: true });
    
    targetEl.addEventListener('mousedown', (e) => handleStart(e.clientX, e.clientY));
    targetEl.addEventListener('mouseup', (e) => handleEnd(e.clientX, e.clientY));
};

/* ── Shared label color palette ──────────────────────────────────────
   Single source of truth for calendar/timetable category dot colors.
   Consumers must read window.LABEL_COLORS directly at render time
   (not copy it into a local const) so every surface stays in sync.
   Mirrored server-side in app.py — keep both in sync.
   ──────────────────────────────────────────────────────────────────── */
window.LABEL_COLORS = {
    Personal: '#bb86fc',
    Exam: '#cf6679',
    Project: '#ffb74d',
    Gym: '#03dac6',
    Study: '#50fb07',
    Clg: '#81d4fa',
};

/* ── Server-rendered icon hydration ──────────────────────────────────
   The initial page load is server-rendered (Jinja), which can't call
   window.icon()/window.renderStatusBadge() at template time. Those spots
   are rendered as placeholder <span data-icon="..."> / <span
   data-status-badge="..."> elements instead, and hydrated here once,
   after icons.js has loaded — so there's still exactly one source of
   truth for every icon's markup.
   ──────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-icon]').forEach(function (el) {
        const name = el.dataset.icon;
        const opts = {};
        if (el.dataset.iconSize) opts.size = parseFloat(el.dataset.iconSize);
        if (el.dataset.iconStrokeWidth) opts.strokeWidth = parseFloat(el.dataset.iconStrokeWidth);
        el.innerHTML = window.icon(name, opts);
    });
    document.querySelectorAll('[data-status-badge]').forEach(function (el) {
        el.outerHTML = window.renderStatusBadge(el.dataset.statusBadge);
    });
});

// Global Refresh Functions

// ── Canonical status mapping ──────────────────────────────────────
// Maps backend attendance status strings → UI state strings used by
// the CSS .period-card[data-status] system and badge classes.
// Use this helper everywhere instead of ad-hoc string comparisons.
// main.js loads before every feature script, so this is safe to call
// from any of them without a load-order dependency.
window._periodStatus = function(slot) {
    if (slot.is_none || slot.status === 'none') return 'none';
    if (slot.status === 'attended')  return 'present';
    if (slot.status === 'missed')    return 'absent';
    return 'pending';  // 'unmarked' or any unknown value
};

// ── Canonical attendance percentage → color mapping ────────────────
// Thresholds/colors must match the server-rendered mirror in
// templates/index.html (Jinja can't call this JS helper directly).
window.attendanceColor = function(percentage) {
    if (percentage >= 80) return 'var(--accent-teal)';
    if (percentage >= 60) return 'var(--accent-yellow)';
    return 'var(--accent-red)';
};

/* ── Shared client-side date formatting ──────────────────────────────
   window.formatDate(dateStr, options) — for date-only "YYYY-MM-DD"
   values (events, attendance, etc.). Appending 'T00:00:00' forces the
   browser to parse it as local midnight instead of UTC midnight —
   without it, new Date('YYYY-MM-DD') can render as the previous day in
   any timezone behind UTC. This is the same safe pattern every call
   site below already used individually; now centralized. Locale is
   fixed to 'en-US' to match what every existing call site already
   passed explicitly.

   window.formatTimestamp(isoString, options) — for full ISO timestamps
   that already include a time component (e.g. Python's
   datetime.now().isoformat(), used for project last_updated/log
   dates). These parse safely as local time already, so no date-only
   patching is needed or applied. Locale is left as the runtime default
   (undefined) to match what those call sites already did by omitting
   the locale argument.
   ──────────────────────────────────────────────────────────────────── */
window.formatDate = function(dateStr, options) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', options || {});
};

window.formatTimestamp = function(isoString, options) {
    return new Date(isoString).toLocaleDateString(undefined, options);
};

window.refreshTimetableSnapshot = async function() {
    const container = document.getElementById('tt-tile-content');
    if (!container) return;
    try {
        const response = await fetch('/api/timetable/today');
        const result = await response.json();
        if (result.status === 'success') {
            // Holiday takes priority — show closed state, no period rows
            if (result.is_holiday) {
                container.innerHTML = `
                    <div class="tt-holiday-state">
                        <span class="tt-holiday-icon">${window.icon('umbrella', { size: 26 })}</span>
                        <p>Closed for holiday</p>
                    </div>`;
                return;
            }
            // Compact tile: hide None slots (no class held) — full timetable still shows them
            const slots = result.data.filter(c => !c.is_none);
            if (slots.length === 0) {
                container.innerHTML = `<p class="text-muted" style="color: var(--text-muted); font-size: 0.9rem;">No classes today! ${window.icon('sparkles', { size: 15 })}</p>`;
            } else {
                let html = '<ul style="list-style: none; padding: 0;">';
                slots.forEach(c => {
                    const uiStatus  = _periodStatus(c);
                    const badgeHTML = uiStatus === 'present' || uiStatus === 'absent'
                        ? window.renderStatusBadge(uiStatus)
                        : '';
                    html += `
                        <li class="period-card" data-status="${uiStatus}">
                            <span style="color: var(--text-muted); font-size: 0.9rem;">${c.time}</span>
                            <strong style="flex:1; text-align: right; margin: 0 8px;">${c.subject}</strong>
                            ${badgeHTML}
                        </li>
                    `;
                });
                html += '</ul>';
                container.innerHTML = html;
            }
        }
    } catch (e) { console.error(e); }
};

window.refreshAttendanceSnapshot = async function() {
    const container = document.getElementById('attendance-snapshot-container');
    if (!container) return;

    try {
        const response = await fetch('/api/attendance/snapshot');
        const result = await response.json();
        
        if (result.status === 'success') {
            let html = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">';
            result.data.forEach(item => {
                const color = window.attendanceColor(item.percentage);
                html += `
                    <div class="snapshot-item" data-subject="${item.subject}" style="text-align: center; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; border: 1px solid var(--card-border);">
                        <div class="percentage-value" style="font-size: 1.2rem; font-weight: bold; color: ${color};">
                            ${item.percentage}%
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">${item.subject}</div>
                    </div>
                `;
            });
            html += '</div>';
            container.innerHTML = html;
        }
    } catch (error) {
        console.error("Failed to refresh attendance snapshot", error);
    }
};

window.refreshFinanceSnapshot = async function() {
    const container = document.getElementById('finance-snapshot-container');
    if (!container) return;
    try {
        const response = await fetch('/api/finance/summary');
        const result = await response.json();
        if (result.status === 'success') {
            const f = result.data;
            container.innerHTML = `
                <div style="margin-bottom: 16px;">
                    <div style="font-size: 1.5rem; font-weight: 700;">₹${f.balance}</div>
                    <div style="color: var(--text-muted); font-size: 0.8rem;">Net Balance</div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <div style="flex: 1; background: rgba(6, 214, 160, 0.1); border: 1px solid rgba(6, 214, 160, 0.2); padding: 8px; border-radius: 8px;">
                        <div style="font-size: 0.7rem; color: var(--accent-teal); text-transform: uppercase;">Income</div>
                        <div style="font-weight: 600;">₹${f.income}</div>
                    </div>
                    <div style="flex: 1; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); padding: 8px; border-radius: 8px;">
                        <div style="font-size: 0.7rem; color: var(--accent-red); text-transform: uppercase;">Expense</div>
                        <div style="font-weight: 600;">₹${f.expense}</div>
                    </div>
                </div>
            `;
        }
    } catch (e) { console.error(e); }
};

window.refreshGoalsSnapshot = async function() {
    const container = document.getElementById('goals-snapshot-container');
    if (!container) return;
    try {
        const response = await fetch('/api/goals/all');
        const result = await response.json();
        if (result.status === 'success') {
            const goals = result.data.slice(0, 5); // Max 5
            let html = '<ul style="list-style: none; padding: 0;">';
            goals.forEach(goal => {
                html += `
                    <li onclick="toggleGoalStatus(${goal.id}, ${!goal.completed})" 
                        style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px; font-size: 0.95rem; cursor: pointer; ${goal.completed ? 'color: var(--text-muted); text-decoration: line-through;' : ''}">
                        <div style="width: 18px; height: 18px; border: 2px solid ${goal.completed ? 'var(--accent-teal)' : 'var(--card-border)'}; border-radius: 4px; background: ${goal.completed ? 'var(--accent-teal)' : 'transparent'}; display: flex; align-items: center; justify-content: center;">
                            ${goal.completed ? window.icon('check', { size: 12, strokeWidth: 4 }) : ''}
                        </div>
                        ${goal.text}
                    </li>
                `;
            });
            html += '</ul>';
            container.innerHTML = html;
        }
    } catch (e) { console.error(e); }
};

// Global Clear Data Function
window.clearData = async function(type) {
    if (!confirm(`Are you sure you want to clear all ${type} data? This cannot be undone.`)) return;
    let url = '';
    if (type === 'grades-history') url = '/api/grades/clear/history';
    if (type === 'grades-internals') url = '/api/grades/clear/internals';
    if (type === 'attendance') url = '/api/attendance/clear';
    if (type === 'finance') url = '/api/finance/clear';
    if (type === 'goals') url = '/api/goals/clear';

    try {
        const response = await fetch(url, { method: 'DELETE' });
        if (response.ok) {
            // Refresh currently open modal content
            const modalBody = document.getElementById('modal-body');
            if (type.startsWith('grades') && window.loadGradesModal) window.loadGradesModal(modalBody);
            if (type === 'attendance' && window.loadAttendanceModal) window.loadAttendanceModal(modalBody);
            if (type === 'finance' && window.loadFinanceModal) window.loadFinanceModal(modalBody);
            if (type === 'goals' && window.loadGoalsModal) window.loadGoalsModal(modalBody);
            
            // Refresh dashboard snapshots
            if (window.refreshAttendanceSnapshot) window.refreshAttendanceSnapshot();
            if (window.refreshFinanceSnapshot) window.refreshFinanceSnapshot();
            if (window.refreshGoalsSnapshot) window.refreshGoalsSnapshot();
            // Invalidate heatmap cache so next open re-fetches
            if (window.invalidateHeatmapCache) window.invalidateHeatmapCache();
        }
    } catch (e) { alert("Error clearing data"); }
};

// --- Overview Calendar Navigation ---
window.dashCurrentMonth = new Date().getMonth();
window.dashCurrentYear = new Date().getFullYear();

window.navOverviewMonth = async function(dir) {
    window.dashCurrentMonth += dir;
    if (window.dashCurrentMonth > 11) { window.dashCurrentMonth = 0; window.dashCurrentYear++; }
    if (window.dashCurrentMonth < 0) { window.dashCurrentMonth = 11; window.dashCurrentYear--; }
    
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const label = document.getElementById('dash-month-label');
    if (label) label.textContent = `${monthNames[window.dashCurrentMonth]} ${window.dashCurrentYear}`;

    try {
        const response = await fetch('/api/calendar/events');
        const result = await response.json();
        const events = result.data || [];
        
        const grid = document.getElementById('dash-cal-grid');
        if (grid) {
            grid.innerHTML = `
                ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="cal-day-name">${d}</div>`).join('')}
                ${window.generateDashboardGrid(window.dashCurrentYear, window.dashCurrentMonth, events)}
            `;
        }
    } catch (e) { console.error("Failed to load overview calendar events", e); }
};

window.generateDashboardGrid = function(year, month, events) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // Adjust to Monday start
    
    let html = '';
    for (let i = 0; i < startDow; i++) {
        html += `<div class="cal-day-cell cal-day-empty" style="opacity: 0.1;"></div>`;
    }
    
    const todayStr = new Date().toISOString().split('T')[0];

    for (let d = 1; d <= lastDay.getDate(); d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = dateStr === todayStr;
        const dayEvents = events.filter(e => e.date === dateStr);

        html += `
            <div onclick="openCalendarAtDate('${dateStr}')"
                 class="cal-day-cell ${isToday ? 'cal-today' : ''}"
                 data-date="${dateStr}">
                <span class="cal-day-num">${d}</span>
                <div class="cal-dots">
                    ${dayEvents.slice(0, 3).map(e => `<span class="cal-dot" style="background: ${window.LABEL_COLORS[e.label] || 'var(--accent-teal)'};"></span>`).join('')}
                    ${dayEvents.length > 3 ? `<span style="font-size: 0.6rem; color: var(--text-muted); line-height: 1;">+</span>` : ''}
                </div>
            </div>
        `;
    }
    return html;
};

// ── Grades tile refresh ───────────────────────────────────────────────────────
// The grades tile has no standalone "refresh" since it can show three different
// sub-views (Snapshot / Internal Grades / ESE Calculator). This function
// re-renders whichever view is currently active, preserving the tile's index.
//
// tile-nav.js exposes the current index on window so this function can read it:
//   window._gradesTileIdx  (set by gradesTileNav on each navigation)
//
// NOTE: gradesTileCache[0] holds the SSR snapshot HTML. On refresh we re-fetch
// from /api/grades/snapshot (if the tile is on idx 0) or re-call renderInternalsTab
// (idx 1) or renderEseTab (idx 2). The cache is NOT invalidated for idx 0 because
// the grades snapshot is SSR-derived and doesn't have a lightweight client-side
// re-fetch path — refreshing will just leave idx 0 as-is (acceptable: grades data
// doesn't change during a session).
window.refreshGradesSnapshot = async function() {
    const idx     = window._gradesTileIdx ?? 0;
    const content = document.getElementById('grades-tile-content');
    if (!content) return;

    if (idx === 1 && window.renderInternalsTab) {
        await window.renderInternalsTab(content);
    } else if (idx === 2 && window.renderEseTab) {
        window.renderEseTab(content);
        if (window.fetchEseSubjects) await window.fetchEseSubjects();
    }
    // idx === 0: SSR-rendered snapshot — no client-side refresh path, leave as-is.
};

// ── Refresh all dashboard tiles (mobile refresh button) ───────────────────────
// Uses Promise.allSettled so one tile's failure doesn't block the rest.
// Each function is guarded with ?. — if a tile's script hasn't loaded or the
// function doesn't exist, the call is silently skipped (not treated as an error).
// Returns the settled results so callers can detect partial failure.
window.refreshAllTiles = async function() {
    // invalidateHeatmapCache is synchronous (just nulls the cache object) — call
    // it directly, before the refreshes start, rather than as a pseudo-async
    // allSettled entry.
    window.invalidateHeatmapCache?.();
    return Promise.allSettled([
        window.refreshTimetableSnapshot?.(),
        window.refreshAttendanceSnapshot?.(),
        window.refreshFinanceSnapshot?.(),
        window.refreshGoalsSnapshot?.(),
        window.refreshGradesSnapshot?.(),
        window.refreshProjectsSnapshot?.(),
    ]);
};

// ── Mobile refresh button wiring ──────────────────────────────────────────────
(function() {
    const btn = document.getElementById('mobile-refresh-btn');
    if (!btn) return;

    // Guard: true while a refresh is already in progress
    let _isRefreshing = false;
    // Cooldown timer — prevents accidental double-tap re-trigger
    let _cooldownTimer = null;
    const COOLDOWN_MS = 1500;

    btn.addEventListener('click', async function handleRefreshClick() {
        // Block if already running or in cooldown
        if (_isRefreshing || btn.classList.contains('is-refreshing')) return;

        // ── Enter loading state ──
        _isRefreshing = true;
        btn.classList.add('is-refreshing');
        btn.classList.remove('has-error');
        btn.setAttribute('aria-busy', 'true');

        let anyError = false;

        try {
            const results = await window.refreshAllTiles();

            // Check if any settled as rejected
            anyError = results.some(r => r.status === 'rejected');
        } catch (_) {
            anyError = true;
        }

        // ── Leave loading state ──
        btn.classList.remove('is-refreshing');
        btn.removeAttribute('aria-busy');

        if (anyError) {
            // Brief red tint to signal partial failure, then clear
            btn.classList.add('has-error');
            setTimeout(() => btn.classList.remove('has-error'), 2500);
        }

        // Cooldown: ignore additional taps for COOLDOWN_MS after completion
        if (_cooldownTimer) clearTimeout(_cooldownTimer);
        _cooldownTimer = setTimeout(() => {
            _isRefreshing = false;
            _cooldownTimer = null;
        }, COOLDOWN_MS);
    });
})();

