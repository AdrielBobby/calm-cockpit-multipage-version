/**
 * gym-heatmap.js
 * Workout heatmap for the Gym page (Mon-Sun rows, rolling week window).
 * Rendering approach mirrors attendance-heatmap.js; levels come from the server:
 * 0 none, 1 went, 2 went + one bonus (cardio / 10k steps), 3 went + both.
 */
(function () {
    const WEEKS_DESKTOP = 26;
    const WEEKS_MOBILE = 14;
    const SHIFT = 4;
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const ROW_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];

    let current = null; // { container, opts, offset }

    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function mondayOnOrBefore(d) {
        const day = new Date(d);
        const dow = day.getDay();
        day.setDate(day.getDate() + (dow === 0 ? -6 : 1 - dow));
        return day;
    }

    function weeksInWindow() {
        return window.matchMedia('(max-width: 767px)').matches ? WEEKS_MOBILE : WEEKS_DESKTOP;
    }

    function buildColumns(start, end, dayMap) {
        const columns = [];
        const cur = mondayOnOrBefore(start);
        while (true) {
            const days = [];
            for (let r = 0; r < 7; r++) {
                const d = new Date(cur);
                d.setDate(d.getDate() + r);
                const ds = iso(d);
                days.push(d < start || d > end ? null : (dayMap[ds] || { date: ds, level: 0 }));
            }
            columns.push({ days });
            cur.setDate(cur.getDate() + 7);
            const sun = new Date(cur);
            sun.setDate(sun.getDate() - 1);
            if (sun > end) break;
        }
        return columns;
    }

    function mkNavBtn(html, label, disabled, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-icon';
        btn.setAttribute('aria-label', label);
        btn.innerHTML = html;
        if (disabled) btn.disabled = true;
        else btn.addEventListener('click', onClick);
        return btn;
    }

    function buildLegend() {
        const wrap = document.createElement('div');
        wrap.className = 'heatmap-legend';
        const items = [
            [0, 'No workout'], [1, 'Went'], [2, 'Went + cardio or 10k steps'], [3, 'Went + cardio and 10k steps']
        ];
        const label = (t) => { const s = document.createElement('span'); s.className = 'heatmap-legend-label'; s.textContent = t; return s; };
        wrap.appendChild(label('Less'));
        items.forEach(([level, tip]) => {
            const c = document.createElement('div');
            c.className = 'heatmap-legend-cell';
            c.dataset.level = level;
            c.title = tip;
            wrap.appendChild(c);
        });
        wrap.appendChild(label('More'));
        return wrap;
    }

    /* ── Tooltip (desktop hover) ───────────────────────────────── */
    function ensureTooltip() {
        let tip = document.getElementById('gym-tooltip');
        if (!tip) {
            tip = document.createElement('div');
            tip.id = 'gym-tooltip';
            tip.className = 'heatmap-tooltip';
            document.body.appendChild(tip);
        }
        return tip;
    }

    function tooltipHTML(day) {
        const date = window.formatDate(day.date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        let html = `<div class="heatmap-tooltip-date">${esc(date)}</div>`;
        if (!day.level) return html + '<div class="heatmap-tooltip-summary">No workout logged. Click to log.</div>';
        html += `<div class="heatmap-tooltip-summary">${esc(day.preset_name || 'Workout')}</div>`;
        html += `<div class="heatmap-tooltip-subject attended">${day.exercise_count} exercise${day.exercise_count === 1 ? '' : 's'}</div>`;
        if (day.cardio) html += '<div class="heatmap-tooltip-subject attended">Cardio</div>';
        if (day.steps_10k) html += '<div class="heatmap-tooltip-subject attended">10k+ steps</div>';
        return html;
    }

    function showTip(e, day) {
        const tip = ensureTooltip();
        tip.innerHTML = tooltipHTML(day);
        tip.classList.add('visible');
        const margin = 12;
        let x = e.clientX + margin;
        let y = e.clientY - tip.offsetHeight / 2;
        if (x + tip.offsetWidth > window.innerWidth - margin) x = e.clientX - tip.offsetWidth - margin;
        y = Math.max(margin, Math.min(y, window.innerHeight - tip.offsetHeight - margin));
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
    }

    function hideTip() {
        const tip = document.getElementById('gym-tooltip');
        if (tip) tip.classList.remove('visible');
    }

    /* ── Render ────────────────────────────────────────────────── */
    async function render(container, opts, offset) {
        current = { container, opts, offset };
        const weeks = weeksInWindow();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const end = new Date(today);
        end.setDate(end.getDate() - offset * 7);
        const start = new Date(end);
        start.setDate(start.getDate() - (weeks * 7 - 1));

        let data;
        try {
            const res = await fetch(`/api/gym/heatmap?from=${iso(start)}&to=${iso(end)}`);
            const js = await res.json();
            if (js.status !== 'success') throw new Error(js.message || 'API error');
            data = js.data;
        } catch (err) {
            container.innerHTML = `<p class="gym-error">Failed to load heatmap. <small>${esc(err.message)}</small></p>`;
            return;
        }

        const dayMap = {};
        data.forEach((d) => { dayMap[d.date] = d; });
        const todayStr = iso(today);
        const columns = buildColumns(start, end, dayMap);
        hideTip();
        container.innerHTML = '';

        const oldest = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate());
        const nav = document.createElement('div');
        nav.className = 'heatmap-nav';
        const title = document.createElement('span');
        title.className = 'heatmap-nav-title';
        const fmt = { month: 'short', day: 'numeric', year: 'numeric' };
        title.textContent = `${start.toLocaleDateString('en-US', fmt)} — ${end.toLocaleDateString('en-US', fmt)}`;
        nav.appendChild(mkNavBtn('&#8249;', 'Earlier weeks', start <= oldest, () => render(container, opts, offset + SHIFT)));
        nav.appendChild(title);
        nav.appendChild(mkNavBtn('&#8250;', 'Later weeks', offset <= 0, () => render(container, opts, Math.max(0, offset - SHIFT))));
        container.appendChild(nav);

        const wrapper = document.createElement('div');
        wrapper.className = 'heatmap-wrapper';
        const layout = document.createElement('div');
        layout.className = 'heatmap-layout';
        wrapper.appendChild(layout);
        container.appendChild(wrapper);

        const monthsRow = document.createElement('div');
        monthsRow.className = 'heatmap-months';
        let lastMonth = -1;
        columns.forEach((col, ci) => {
            const first = col.days.find((d) => d !== null);
            if (!first) return;
            const m = new Date(first.date + 'T00:00:00').getMonth();
            if (m !== lastMonth) {
                lastMonth = m;
                const lbl = document.createElement('span');
                lbl.className = 'heatmap-month-label';
                lbl.textContent = MONTHS[m];
                lbl.dataset.colIndex = ci;
                monthsRow.appendChild(lbl);
            }
        });
        layout.appendChild(monthsRow);

        const body = document.createElement('div');
        body.className = 'heatmap-body';
        layout.appendChild(body);

        const labelsCol = document.createElement('div');
        labelsCol.className = 'heatmap-day-labels';
        ROW_LABELS.forEach((text) => {
            const el = document.createElement('div');
            el.className = 'heatmap-day-label' + (text ? '' : ' hidden-label');
            el.textContent = text || '·';
            labelsCol.appendChild(el);
        });
        body.appendChild(labelsCol);

        const grid = document.createElement('div');
        grid.className = 'heatmap-grid';
        const frag = document.createDocumentFragment();
        columns.forEach((col) => col.days.forEach((day) => {
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            if (day === null) {
                cell.dataset.level = '0';
                cell.style.visibility = 'hidden';
                cell.style.pointerEvents = 'none';
            } else {
                cell.dataset.level = String(day.level);
                cell.dataset.date = day.date;
                if (day.date === todayStr) cell.dataset.today = 'true';
                cell.addEventListener('mouseenter', (e) => showTip(e, day));
                cell.addEventListener('mouseleave', hideTip);
                cell.addEventListener('click', () => { hideTip(); if (opts.onDayClick) opts.onDayClick(day.date); });
            }
            frag.appendChild(cell);
        }));
        grid.appendChild(frag);
        body.appendChild(grid);

        if (container._gymRo) container._gymRo.disconnect();
        container._gymRo = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const cw = entry.contentRect.width;
                if (cw <= 0) continue;
                const labelW = window.matchMedia('(max-width: 767px)').matches ? 24 : 28;
                const cols = columns.length || 1;
                let size = Math.floor((cw - labelW - (cols - 1) * 3) / cols);
                size = Math.max(9, Math.min(size, 26));
                body.style.setProperty('--hm-cell', `${size}px`);
                monthsRow.querySelectorAll('.heatmap-month-label').forEach((lbl) => {
                    lbl.style.left = `${parseInt(lbl.dataset.colIndex, 10) * (size + 3)}px`;
                });
            }
        });
        container._gymRo.observe(layout);

        container.appendChild(buildLegend());
    }

    window.loadGymHeatmap = function (container, opts) {
        return render(container, opts || {}, 0);
    };

    window.reloadGymHeatmap = function () {
        return current ? render(current.container, current.opts, current.offset) : Promise.resolve();
    };
})();
