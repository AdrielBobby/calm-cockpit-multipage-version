document.addEventListener('DOMContentLoaded', () => {

    // ── Shared Tile Swipe Helper ────────────────────────────────────
    function initTileSwipe(tileEl, onSwipeLeft, onSwipeRight) {
        let startX = 0, startY = 0;
        
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

        tileEl.addEventListener('touchstart', (e) => handleStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
        tileEl.addEventListener('touchend', (e) => handleEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY), { passive: true });
        
        tileEl.addEventListener('mousedown', (e) => handleStart(e.clientX, e.clientY));
        tileEl.addEventListener('mouseup', (e) => handleEnd(e.clientX, e.clientY));
    }

    // ── Timetable Tile ──────────────────────────────────────────────
    let ttTileIdx = 0;
    const ttTileMax = 1;
    let ttTileCache = {};

    const ttTileContent = document.getElementById('tt-tile-content');
    if (ttTileContent) {
        ttTileCache[0] = ttTileContent.innerHTML;
        initTileSwipe(ttTileContent, () => window.ttTileNav(1), () => window.ttTileNav(-1));
    }

    window.ttTileNav = async function(dir) {
        ttTileIdx += dir;
        if (ttTileIdx < 0) ttTileIdx = 0;
        if (ttTileIdx > ttTileMax) ttTileIdx = ttTileMax;

        const prevBtn = document.getElementById('tt-tile-prev');
        const nextBtn = document.getElementById('tt-tile-next');
        const labelEl = document.getElementById('tt-tile-label');
        const content = document.getElementById('tt-tile-content');

        if (prevBtn) prevBtn.disabled = (ttTileIdx === 0);
        if (nextBtn) nextBtn.disabled = (ttTileIdx === ttTileMax);

        if (ttTileIdx === 0) {
            if (labelEl) labelEl.textContent = "Today's Timetable";
            content.innerHTML = ttTileCache[0];
            return;
        }

        if (ttTileIdx === 1) {
            if (labelEl) labelEl.textContent = "Tasks & Events";
            if (ttTileCache[1]) {
                content.innerHTML = ttTileCache[1];
                return;
            }

            content.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:16px 0;">Loading tasks...</p>';
            try {
                const resp = await fetch('/api/calendar/events');
                const result = await resp.json();
                const events = (result.data || [])
                    .filter(e => e.status !== 'done')
                    .sort((a, b) => new Date(a.date) - new Date(b.date))
                    .slice(0, 6);

                if (events.length === 0) {
                    const html = '<p style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:16px 0;">No upcoming tasks! 🎉</p>';
                    ttTileCache[1] = html;
                    content.innerHTML = html;
                } else {
                    const STATUS_COLORS = {
                        planned: 'var(--text-muted)',
                        in_progress: 'var(--accent-yellow)',
                        done: 'var(--accent-teal)'
                    };
                    const LABEL_COLORS = {
                        Personal: '#bb86fc',
                        Exam: '#cf6679',
                        Project: '#03dac6',
                        Gym: '#ffb74d',
                        Study: '#81d4fa'
                    };
                    let html = '<ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:8px;">';
                    events.forEach(e => {
                        const dateStr = new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        const accentColor = LABEL_COLORS[e.label] || 'var(--accent-teal)';
                        const statusColor = STATUS_COLORS[e.status] || 'var(--text-muted)';
                        const statusLabel = (e.status || 'planned').replace('_', ' ');
                        html += `
                            <li style="display:flex; align-items:center; gap:10px;
                                       background:rgba(255,255,255,0.02);
                                       border:1px solid var(--card-border);
                                       border-left:3px solid ${accentColor};
                                       padding:8px 12px; border-radius:8px;">
                                <div style="flex:1; min-width:0;">
                                    <div style="font-size:0.88rem; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                        ${e.title}
                                    </div>
                                    <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">
                                        ${dateStr}
                                    </div>
                                </div>
                                <span style="font-size:0.65rem; color:${statusColor}; font-weight:bold; text-transform:uppercase; white-space:nowrap;">
                                    ● ${statusLabel}
                                </span>
                            </li>`;
                    });
                    html += '</ul>';
                    ttTileCache[1] = html;
                    content.innerHTML = html;
                }
            } catch (e) {
                content.innerHTML = '<p style="color:var(--accent-red); font-size:0.82rem;">Error loading tasks.</p>';
            }
        }
    };

    // ── Grades Tile ─────────────────────────────────────────────────
    let gradesTileIdx = 0;
    const gradesTileMax = 2;
    let gradesTileCache = {};

    const gradesTileContent = document.getElementById('grades-tile-content');
    if (gradesTileContent) {
        gradesTileCache[0] = gradesTileContent.innerHTML;
        initTileSwipe(gradesTileContent, () => window.gradesTileNav(1), () => window.gradesTileNav(-1));
    }

    window.gradesTileNav = async function(dir) {
        gradesTileIdx += dir;
        if (gradesTileIdx < 0) gradesTileIdx = 0;
        if (gradesTileIdx > gradesTileMax) gradesTileIdx = gradesTileMax;

        const prevBtn = document.getElementById('grades-tile-prev');
        const nextBtn = document.getElementById('grades-tile-next');
        const labelEl = document.getElementById('grades-tile-label');
        const content = document.getElementById('grades-tile-content');

        if (prevBtn) prevBtn.disabled = (gradesTileIdx === 0);
        if (nextBtn) nextBtn.disabled = (gradesTileIdx === gradesTileMax);

        if (gradesTileIdx === 0) {
            if (labelEl) labelEl.textContent = "Grades Snapshot";
            content.innerHTML = gradesTileCache[0];
            return;
        }

        if (gradesTileIdx === 1) {
            if (labelEl) labelEl.textContent = "Internal Grades";
            // Use global render function exposed in grades-ese.js
            if (window.renderInternalsTab) {
                await window.renderInternalsTab(content);
            } else {
                content.innerHTML = '<p style="color:var(--accent-red); font-size:0.82rem;">Feature loading...</p>';
            }
            return;
        }

        if (gradesTileIdx === 2) {
            if (labelEl) labelEl.textContent = "ESE Calculator";
            // Use global render function exposed in grades-ese.js
            if (window.renderEseTab) {
                window.renderEseTab(content);
                if (window.fetchEseSubjects) window.fetchEseSubjects();
            } else {
                content.innerHTML = '<p style="color:var(--accent-red); font-size:0.82rem;">Feature loading...</p>';
            }
            return;
        }
    };

});
