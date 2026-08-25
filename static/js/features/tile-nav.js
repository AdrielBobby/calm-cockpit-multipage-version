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
                    const html = `<p style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:16px 0;">No upcoming tasks! ${window.icon('sparkles', { size: 14 })}</p>`;
                    ttTileCache[1] = html;
                    content.innerHTML = html;
                } else {
                    const STATUS_COLORS = {
                        planned: 'var(--text-muted)',
                        in_progress: 'var(--accent-yellow)',
                        done: 'var(--accent-teal)'
                    };
                    let html = '<ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:8px;">';
                    events.forEach(e => {
                        const dateStr = window.formatDate(e.date, { month: 'short', day: 'numeric' });
                        const accentColor = window.LABEL_COLORS[e.label] || 'var(--accent-teal)';
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

        // Expose current index globally so refreshGradesSnapshot() can
        // re-render whichever view is active without resetting to idx 0.
        window._gradesTileIdx = gradesTileIdx;

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

    // ── Projects Tile ────────────────────────────────────────────────
    let projTileIdx = 0;
    const projTileMax = 1; // 0 = In Progress, 1 = Paused
    let projTileData = null; // cached from /api/projects/tile-data

    // ── Data helpers ─────────────────────────────────────────────────
    // Filter + sort by last_updated DESC so ordering is always explicit,
    // independent of whatever the backend query order happens to be.
    function _projForView(view) {
        if (!projTileData) return [];
        return projTileData
            .filter(p => p.status === view)
            .sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated));
    }

    // Latest log preview — the server already shapes it; just use directly.
    // Client-side safety truncation as a fallback (≤90 chars visible).
    function _projLogPreview(proj) {
        const raw = proj.latest_log_preview;
        if (!raw) return null;
        return raw.length > 90 ? raw.slice(0, 87) + '…' : raw;
    }

    // ── Render: In Progress view ──────────────────────────────────────
    function _renderProjInProgress(content, projects) {
        if (projects.length === 0) {
            content.innerHTML = `
                <p style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:20px 0;">
                    No projects in progress
                </p>`;
            return;
        }

        const MAX_VISIBLE = 3;
        const shown = projects.slice(0, MAX_VISIBLE);
        const overflow = projects.length - MAX_VISIBLE;

        let html = '<div style="display:flex; flex-direction:column; gap:10px;">';
        shown.forEach(proj => {
            const preview = _projLogPreview(proj);
            html += `
                <div class="proj-tile-card proj-tile-card--inprogress"
                     onclick="window.openProjectFromTile && window.openProjectFromTile(${proj.id})"
                     role="button" tabindex="0"
                     onkeydown="if(event.key==='Enter')window.openProjectFromTile&&window.openProjectFromTile(${proj.id})"
                     onmouseenter="this.style.borderColor='rgba(6,214,160,0.4)'; this.style.background='rgba(6,214,160,0.06)';"
                     onmouseleave="this.style.borderColor='rgba(6,214,160,0.18)'; this.style.background='rgba(255,255,255,0.02)';">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                        <span style="font-weight:500; font-size:0.9rem; line-height:1.3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${proj.name}</span>
                        <span style="flex-shrink:0; font-size:0.65rem; padding:2px 7px; border-radius:10px;
                                     background:rgba(6,214,160,0.12); color:var(--accent-teal);
                                     border:1px solid rgba(6,214,160,0.25); white-space:nowrap; font-weight:600; text-transform:uppercase; letter-spacing:0.03em;">
                            In Progress
                        </span>
                    </div>
                    <div class="proj-tile-log-preview">
                        ${preview
                            ? `<span style="color:var(--text-muted);">Latest:</span> ${preview}`
                            : `<span style="color:var(--text-muted); font-style:italic;">No recent update</span>`
                        }
                    </div>
                </div>`;
        });

        if (overflow > 0) {
            html += `<p style="font-size:0.75rem; color:var(--text-muted); text-align:center; margin:2px 0 0;">+${overflow} more — open modal to view all</p>`;
        }

        html += '</div>';
        content.innerHTML = html;
    }

    // ── Render: Paused view ───────────────────────────────────────────
    function _renderProjPaused(content, projects) {
        if (projects.length === 0) {
            content.innerHTML = `
                <p style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:20px 0;">
                    No paused projects
                </p>`;
            return;
        }

        const MAX_VISIBLE = 3;
        const shown = projects.slice(0, MAX_VISIBLE);
        const overflow = projects.length - MAX_VISIBLE;

        let html = '<div style="display:flex; flex-direction:column; gap:10px;">';
        shown.forEach(proj => {
            html += `
                <div class="proj-tile-card proj-tile-card--paused"
                     onclick="window.openProjectFromTile && window.openProjectFromTile(${proj.id})"
                     role="button" tabindex="0"
                     onkeydown="if(event.key==='Enter')window.openProjectFromTile&&window.openProjectFromTile(${proj.id})"
                     onmouseenter="this.style.borderColor='rgba(245,158,11,0.4)'; this.style.background='rgba(245,158,11,0.06)';"
                     onmouseleave="this.style.borderColor='rgba(245,158,11,0.18)'; this.style.background='rgba(255,255,255,0.015)';">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                        <span style="font-weight:500; font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${proj.name}</span>
                        <span style="flex-shrink:0; font-size:0.65rem; padding:2px 7px; border-radius:10px;
                                     background:rgba(245,158,11,0.12); color:var(--accent-yellow);
                                     border:1px solid rgba(245,158,11,0.25); white-space:nowrap; font-weight:600; text-transform:uppercase; letter-spacing:0.03em;">
                            Paused
                        </span>
                    </div>
                </div>`;
        });

        if (overflow > 0) {
            html += `<p style="font-size:0.75rem; color:var(--text-muted); text-align:center; margin:2px 0 0;">+${overflow} more — open modal to view all</p>`;
        }

        html += '</div>';
        content.innerHTML = html;
    }

    // ── Fetch tile data (caches in projTileData) ──────────────────────
    async function _fetchProjTileData() {
        const resp = await fetch('/api/projects/tile-data');
        const result = await resp.json();
        if (result.status !== 'success') throw new Error(result.message || 'Failed to load projects');
        projTileData = result.data;
    }

    // ── Render current view from cache ────────────────────────────────
    function _renderProjCurrentView() {
        const content = document.getElementById('projects-snapshot-container');
        if (!content) return;
        if (projTileIdx === 0) {
            _renderProjInProgress(content, _projForView('in_progress'));
        } else {
            _renderProjPaused(content, _projForView('paused'));
        }
    }

    // ── Nav function (globally exposed, clamped, matches tt/grades pattern) ──
    window.projTileNav = async function(dir) {
        projTileIdx += dir;
        if (projTileIdx < 0) projTileIdx = 0;
        if (projTileIdx > projTileMax) projTileIdx = projTileMax;

        const prevBtn  = document.getElementById('proj-tile-prev');
        const nextBtn  = document.getElementById('proj-tile-next');
        const labelEl  = document.getElementById('proj-tile-label');
        const content  = document.getElementById('projects-snapshot-container');

        if (prevBtn) prevBtn.disabled = (projTileIdx === 0);
        if (nextBtn) nextBtn.disabled = (projTileIdx === projTileMax);
        if (labelEl) labelEl.textContent = projTileIdx === 0 ? 'Projects (In Progress)' : 'Projects (Paused)';

        // Render from cache if available, otherwise fetch first
        if (projTileData) {
            _renderProjCurrentView();
        } else {
            if (content) content.innerHTML = '<p class="proj-tile-loading">Loading projects…</p>';
            try {
                await _fetchProjTileData();
                _renderProjCurrentView();
            } catch (e) {
                if (content) content.innerHTML = '<p style="color:var(--accent-red); font-size:0.82rem; text-align:center;">Error loading projects.</p>';
            }
        }
    };

    // ── Refresh: called after any modal mutation (add/delete/status change) ──
    window.refreshProjectsSnapshot = async function() {
        projTileData = null; // invalidate cache
        const content = document.getElementById('projects-snapshot-container');
        if (!content) return;
        try {
            await _fetchProjTileData();
            _renderProjCurrentView();
        } catch (e) {
            console.error('refreshProjectsSnapshot error:', e);
        }
    };

    // ── Swipe registration ────────────────────────────────────────────
    const projTileContent = document.getElementById('projects-snapshot-container');
    if (projTileContent) {
        // swipe left = next view (in_progress → paused), swipe right = prev
        initTileSwipe(projTileContent, () => window.projTileNav(1), () => window.projTileNav(-1));
    }

    // ── Initial load ──────────────────────────────────────────────────
    // Fetch data and render In Progress view on page load.
    (async () => {
        try {
            await _fetchProjTileData();
            _renderProjCurrentView();
            // Sync next button: disable if only 0 or 1 view has data (still show, just visual)
        } catch (e) {
            const c = document.getElementById('projects-snapshot-container');
            if (c) c.innerHTML = '<p style="color:var(--accent-red); font-size:0.82rem; text-align:center;">Error loading projects.</p>';
        }
    })();

});
