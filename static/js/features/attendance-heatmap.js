/**
 * attendance-heatmap.js
 * GitHub-style attendance heatmap rendered inside the Attendance modal's
 * "Calendar View" tab. No external libraries — pure vanilla JS + CSS classes.
 */

// ── Constants ──────────────────────────────────────────────────────────────
const HM_WEEKS  = 18;   // week columns in visible window
const HM_SHIFT  = 4;    // weeks shifted per ‹ / › click
const HM_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Row labels: index 0=Mon … 5=Sat
const HM_ROW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Session cache ──────────────────────────────────────────────────────────
window._hmCache = null;          // { data, fromStr, toStr }
window._hmWeekOffset = 0;        // 0 = most-recent 18 weeks; positive = further back

/** Invalidate cache — call after any attendance mark. */
window.invalidateHeatmapCache = function () {
    window._hmCache = null;
};

// ── Public entry point ─────────────────────────────────────────────────────
window.loadAttendanceHeatmap = async function (container) {
    window._hmWeekOffset = 0;
    await _renderAtOffset(container, 0);
};

// ── Core render ────────────────────────────────────────────────────────────
async function _renderAtOffset(container, offset) {
    container.innerHTML = `
        <div class="heatmap-nav">
            <button class="btn-icon" id="hm-prev" disabled>&#8249;</button>
            <span class="heatmap-nav-title">Loading&#8230;</span>
            <button class="btn-icon" id="hm-next" disabled>&#8250;</button>
        </div>
        <p style="color:var(--text-muted);font-size:0.85rem;padding:8px 0;">Fetching heatmap data&#8230;</p>
    `;

    // Compute date window
    const todayD  = new Date(); todayD.setHours(0,0,0,0);
    const endDate = new Date(todayD);
    endDate.setDate(endDate.getDate() - offset * 7);
    if (endDate > todayD) endDate.setTime(todayD.getTime());

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (HM_WEEKS * 7 - 1));

    const fromStr = _iso(startDate);
    const toStr   = _iso(endDate);

    // Fetch with session cache
    let data;
    try {
        if (window._hmCache && window._hmCache.fromStr === fromStr && window._hmCache.toStr === toStr) {
            data = window._hmCache.data;
        } else {
            const res = await fetch(`/api/attendance/heatmap?from=${fromStr}&to=${toStr}`);
            const js  = await res.json();
            if (js.status !== 'success') throw new Error(js.message || 'API error');
            data = js.data;
            window._hmCache = { data, fromStr, toStr };
        }
    } catch (err) {
        container.innerHTML = `
            <p style="color:var(--accent-red);font-size:0.85rem;">
                Failed to load heatmap.<br>
                <small style="color:var(--text-muted);">${err.message}</small>
            </p>`;
        return;
    }

    // Build date → day-object lookup
    const dayMap = {};
    data.forEach(d => { dayMap[d.date] = d; });

    const todayStr = _iso(todayD);
    const isMobile = window.matchMedia('(max-width: 767px)').matches;

    // Ensure persistent overlay DOM
    _ensureTooltipDOM();
    _ensureSheetDOM();

    // ── Navigation header ──
    container.innerHTML = '';

    const nav = document.createElement('div');
    nav.className = 'heatmap-nav';

    const canBack    = startDate > new Date(todayD.getFullYear() - 2, todayD.getMonth(), todayD.getDate());
    const canForward = offset > 0;

    const prevBtn = _mkBtn('&#8249;', 'Earlier weeks', !canBack,  () => _renderAtOffset(container, offset + HM_SHIFT));
    const nextBtn = _mkBtn('&#8250;', 'Later weeks',   !canForward, () => _renderAtOffset(container, Math.max(0, offset - HM_SHIFT)));

    const navTitle = document.createElement('span');
    navTitle.className = 'heatmap-nav-title';
    navTitle.textContent = _navLabel(startDate, endDate);

    nav.appendChild(prevBtn);
    nav.appendChild(navTitle);
    nav.appendChild(nextBtn);
    container.appendChild(nav);

    // ── Heatmap wrapper ──
    const wrapper = document.createElement('div');
    wrapper.className = 'heatmap-wrapper';
    container.appendChild(wrapper);

    const layout = document.createElement('div');
    layout.className = 'heatmap-layout';
    wrapper.appendChild(layout);

    // Build columns (each column = Mon→Sat of one ISO week)
    const columns = _buildColumns(startDate, endDate, dayMap);

    // ── Month labels ──
    const monthsRow  = document.createElement('div');
    monthsRow.className = 'heatmap-months';
    let lastMonth = -1;
    columns.forEach((col, ci) => {
        const first = col.days.find(d => d !== null);
        if (!first) return;
        const m = new Date(first.date + 'T00:00:00').getMonth();
        if (m !== lastMonth) {
            lastMonth = m;
            const lbl = document.createElement('span');
            lbl.className = 'heatmap-month-label';
            lbl.textContent = HM_MONTHS[m];
            lbl.dataset.colIndex = ci;
            // style.left will be set dynamically
            monthsRow.appendChild(lbl);
        }
    });
    layout.appendChild(monthsRow);

    // ── Body: day-labels + grid ──
    const body = document.createElement('div');
    body.className = 'heatmap-body';
    layout.appendChild(body);

    // Day labels column
    const labelsCol = document.createElement('div');
    labelsCol.className = 'heatmap-day-labels';
    HM_ROW_LABELS.forEach(lbl => {
        const el = document.createElement('div');
        el.className = 'heatmap-day-label' + (lbl ? '' : ' hidden-label');
        el.textContent = lbl || '·';
        labelsCol.appendChild(el);
    });
    body.appendChild(labelsCol);

    // Grid
    const grid = document.createElement('div');
    grid.className = 'heatmap-grid';

    const frag = document.createDocumentFragment();
    columns.forEach(col => {
        col.days.forEach(dayObj => {
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            if (dayObj === null) {
                // Out-of-range filler — invisible spacer to keep grid shape
                cell.dataset.status = 'no_data';
                cell.style.visibility = 'hidden';
                cell.style.pointerEvents = 'none';
            } else {
                cell.dataset.status = dayObj.status;
                cell.dataset.date   = dayObj.date;
                if (dayObj.date === todayStr) cell.dataset.today = 'true';

                if (isMobile) {
                    cell.addEventListener('click', e => { e.stopPropagation(); _showSheet(dayObj); });
                } else {
                    cell.addEventListener('mouseenter', e => _showTip(e, dayObj));
                    cell.addEventListener('mouseleave', _hideTip);
                }
            }
            frag.appendChild(cell);
        });
    });
    grid.appendChild(frag);
    body.appendChild(grid);

    // ── Dynamic sizing ──
    if (container._hmRo) container._hmRo.disconnect();
    container._hmRo = new ResizeObserver(entries => {
        for (let entry of entries) {
            const cw = entry.contentRect.width;
            if (cw <= 0) continue;
            
            const isMobile = window.matchMedia('(max-width: 767px)').matches;
            const labelW = isMobile ? 24 : 28;
            const numCols = columns.length || 1;
            const totalGap = (numCols - 1) * 3;
            
            let cellSize = Math.floor((cw - labelW - totalGap) / numCols);
            cellSize = Math.max(9, Math.min(cellSize, 50)); // Bound size
            
            body.style.setProperty('--hm-cell', `${cellSize}px`);
            
            const stride = cellSize + 3;
            const monthLabels = monthsRow.querySelectorAll('.heatmap-month-label');
            monthLabels.forEach(lbl => {
                const ci = parseInt(lbl.dataset.colIndex, 10);
                lbl.style.left = `${ci * stride}px`;
            });
        }
    });
    container._hmRo.observe(layout);

    // ── Legend ──
    container.appendChild(_buildLegend());

    // Remove scroll-fade if content fits
    requestAnimationFrame(() => {
        if (wrapper.scrollWidth <= wrapper.clientWidth + 2) {
            wrapper.classList.add('no-fade');
        }
    });
}

// ── Column builder ─────────────────────────────────────────────────────────
function _buildColumns(startDate, endDate, dayMap) {
    const columns = [];
    const cur = _mondayOnOrBefore(startDate);

    while (true) {
        const col = [];
        for (let r = 0; r < 6; r++) {   // Mon=0 … Sat=5
            const d = new Date(cur);
            d.setDate(d.getDate() + r);
            const ds = _iso(d);
            if (d < startDate || d > endDate) {
                col.push(null);
            } else {
                col.push(dayMap[ds] || { date: ds, status: 'no_data', subjects: [], attended: 0, total: 0, percentage: null });
            }
        }
        columns.push({ weekStart: new Date(cur), days: col });
        cur.setDate(cur.getDate() + 7);
        const sat = new Date(cur); sat.setDate(sat.getDate() - 1);
        if (sat > endDate) break;
    }
    return columns;
}

// ── Legend ─────────────────────────────────────────────────────────────────
function _buildLegend() {
    const wrap = document.createElement('div');
    wrap.className = 'heatmap-legend';
    const items = [
        { status: 'no_data',  tip: 'No data / future' },
        { status: 'holiday',  tip: 'Holiday / no class' },
        { status: 'low',      tip: '< 50% attendance' },
        { status: 'partial',  tip: '50–74%' },
        { status: 'good',     tip: '75–99%' },
        { status: 'full',     tip: '100% attended' },
    ];

    const lessLbl = document.createElement('span');
    lessLbl.className = 'heatmap-legend-label';
    lessLbl.textContent = 'Less';
    wrap.appendChild(lessLbl);

    items.forEach(({ status, tip }) => {
        const c = document.createElement('div');
        c.className = 'heatmap-legend-cell';
        c.dataset.status = status;
        c.title = tip;
        wrap.appendChild(c);
    });

    const moreLbl = document.createElement('span');
    moreLbl.className = 'heatmap-legend-label';
    moreLbl.textContent = 'More';
    wrap.appendChild(moreLbl);

    const sep = document.createElement('div');
    sep.className = 'heatmap-legend-sep';
    wrap.appendChild(sep);

    const absentCell = document.createElement('div');
    absentCell.className = 'heatmap-legend-cell';
    absentCell.dataset.status = 'absent';
    absentCell.title = '0% — all missed';
    wrap.appendChild(absentCell);

    const absentLbl = document.createElement('span');
    absentLbl.className = 'heatmap-legend-label';
    absentLbl.textContent = '= missed';
    wrap.appendChild(absentLbl);

    return wrap;
}

// ── Tooltip ────────────────────────────────────────────────────────────────
function _ensureTooltipDOM() {
    if (document.getElementById('hm-tooltip')) return;
    const el = document.createElement('div');
    el.id = 'hm-tooltip';
    el.className = 'heatmap-tooltip';
    document.body.appendChild(el);
}

function _showTip(e, dayObj) {
    const tip = document.getElementById('hm-tooltip');
    if (!tip) return;
    tip.innerHTML = _dayHTML(dayObj, 'heatmap-tooltip');
    tip.classList.add('visible');
    _posTip(e, tip);
}
function _hideTip() {
    const tip = document.getElementById('hm-tooltip');
    if (tip) tip.classList.remove('visible');
}
function _posTip(e, tip) {
    const margin = 12;
    const vw = window.innerWidth, vh = window.innerHeight;
    let x = e.clientX + margin;
    let y = e.clientY - (tip.offsetHeight / 2);
    if (x + tip.offsetWidth  > vw - margin) x = e.clientX - tip.offsetWidth - margin;
    if (y < margin)                          y = margin;
    if (y + tip.offsetHeight > vh - margin)  y = vh - tip.offsetHeight - margin;
    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
}

// ── Bottom sheet ───────────────────────────────────────────────────────────
function _ensureSheetDOM() {
    if (document.getElementById('hm-sheet-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'hm-sheet-overlay';
    overlay.className = 'heatmap-sheet-overlay';
    overlay.addEventListener('click', _hideSheet);

    const sheet = document.createElement('div');
    sheet.id = 'hm-sheet';
    sheet.className = 'heatmap-sheet';
    sheet.innerHTML = '<div class="heatmap-sheet-handle"></div><div id="hm-sheet-body"></div>';

    document.body.appendChild(overlay);
    document.body.appendChild(sheet);
}

function _showSheet(dayObj) {
    const overlay = document.getElementById('hm-sheet-overlay');
    const sheet   = document.getElementById('hm-sheet');
    const body    = document.getElementById('hm-sheet-body');
    if (!overlay || !sheet || !body) return;
    body.innerHTML = _dayHTML(dayObj, 'heatmap-sheet');
    overlay.classList.add('active');
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('active')));
}

function _hideSheet() {
    const overlay = document.getElementById('hm-sheet-overlay');
    const sheet   = document.getElementById('hm-sheet');
    if (!overlay || !sheet) return;
    sheet.classList.remove('active');
    overlay.classList.remove('active');
}

// ── Shared day detail HTML ──────────────────────────────────────────────────
function _dayHTML(dayObj, pfx) {
    const dateStr = _fmtDate(dayObj.date);
    let html = `<div class="${pfx}-date">${dateStr}</div>`;

    let summary = '';
    const s = dayObj.status;
    if (s === 'holiday') {
        summary = dayObj.note || 'No classes scheduled';
    } else if (s === 'no_data') {
        summary = 'No data recorded yet';
    } else {
        const pctStr = dayObj.percentage !== null ? `${dayObj.percentage}%` : '—';
        summary = `Attended: ${dayObj.attended} / ${dayObj.total} classes (${pctStr})`;
    }
    html += `<div class="${pfx}-summary">${summary}</div>`;

    if (dayObj.subjects && dayObj.subjects.length > 0) {
        dayObj.subjects.forEach(sub => {
            const cls  = sub.status === 'attended' ? 'attended' : sub.status === 'missed' ? 'missed' : 'unmarked';
            const icon = sub.status === 'attended' ? '&#10003;' : sub.status === 'missed' ? '&#10007;' : '&#183;';
            html += `<div class="${pfx}-subject ${cls}">${icon} ${_esc(sub.name)}</div>`;
        });
    }
    return html;
}

// ── Utility ────────────────────────────────────────────────────────────────
function _iso(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function _mondayOnOrBefore(d) {
    const day = new Date(d);
    const dow = day.getDay();               // 0=Sun … 6=Sat
    const diff = dow === 0 ? -6 : 1 - dow; // Monday = diff 0
    day.setDate(day.getDate() + diff);
    return day;
}

function _navLabel(from, to) {
    const opts = { month: 'short', day: 'numeric', year: 'numeric' };
    return `${from.toLocaleDateString('en-US', opts)} — ${to.toLocaleDateString('en-US', opts)}`;
}

function _fmtDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function _esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _mkBtn(html, label, disabled, onClick) {
    const btn = document.createElement('button');
    btn.className = 'btn-icon';
    btn.setAttribute('aria-label', label);
    btn.innerHTML = html;
    if (disabled) btn.disabled = true;
    else btn.addEventListener('click', onClick);
    return btn;
}
