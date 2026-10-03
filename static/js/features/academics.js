/* academics.js - Academics page: SGPA chart, semesters, per-semester marks, ESE calculator. */
(function () {
    const COMPONENTS = ['internal', 'sessional', 'end_sem'];
    const state = { semesters: [], marksSemId: null, chart: null };
    const $ = (id) => document.getElementById(id);

    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    let statusTimer = null;
    function setStatus(msg, isError) {
        const el = $('acad-status');
        el.textContent = msg || '';
        el.classList.toggle('is-error', !!isError);
        clearTimeout(statusTimer);
        if (msg) statusTimer = setTimeout(() => { el.textContent = ''; }, 3500);
    }

    async function api(url, method, body) {
        const opts = { method: method || 'GET', headers: {} };
        if (body !== undefined) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        const resp = await fetch(url, opts);
        let json = {};
        try { json = await resp.json(); } catch (e) { /* non-JSON error body */ }
        if (!resp.ok || json.status === 'error') throw new Error(json.message || 'Request failed (' + resp.status + ')');
        return json;
    }

    /* ── Semesters + chart ─────────────────────────────────────── */
    async function loadSemesters() {
        const res = await api('/api/academics/semesters');
        state.semesters = res.data.semesters;
        const hasScore = state.semesters.some((s) => s.sgpa != null);
        $('acad-cgpa').textContent = hasScore ? res.data.cgpa.toFixed(2) : '—';
        renderSemesterTable();
        renderChart();
        renderSemesterSelect();
        const next = state.semesters.length ? Math.max(...state.semesters.map((s) => s.number)) + 1 : 1;
        $('acad-new-sem-num').placeholder = String(next);
    }

    function renderSemesterTable() {
        const body = $('acad-sem-body');
        if (!state.semesters.length) {
            body.innerHTML = '<tr><td colspan="3" class="acad-empty-cell">No semesters yet.</td></tr>';
            return;
        }
        body.innerHTML = state.semesters.map((s) => `
            <tr>
                <td>Semester ${s.number}</td>
                <td><input class="acad-input acad-input-sm" type="number" min="0" max="10" step="0.01"
                           value="${s.sgpa ?? ''}" data-sem-number="${s.number}" aria-label="SGPA for semester ${s.number}"></td>
                <td class="acad-col-action"><button type="button" class="acad-icon-btn" data-delete-sem="${s.id}"
                           aria-label="Delete semester ${s.number}">${window.icon('x', { size: 16 })}</button></td>
            </tr>`).join('');
    }

    function renderChart() {
        const canvas = $('acad-sgpa-chart');
        const empty = $('acad-chart-empty');
        const has = state.semesters.length > 0;
        empty.hidden = has;
        canvas.hidden = !has;
        if (!has) {
            if (state.chart) { state.chart.destroy(); state.chart = null; }
            return;
        }
        if (typeof Chart === 'undefined') {
            empty.hidden = false;
            empty.textContent = 'Chart library failed to load.';
            return;
        }
        const css = getComputedStyle(document.documentElement);
        const purple = css.getPropertyValue('--accent-purple').trim();
        const muted = css.getPropertyValue('--text-muted').trim();
        const grid = 'rgba(255,255,255,0.06)';
        const labels = state.semesters.map((s) => 'Sem ' + s.number);
        const values = state.semesters.map((s) => s.sgpa);
        const scored = values.filter((v) => v != null);
        const floor = scored.length ? Math.max(0, Math.floor(Math.min(...scored)) - 1) : 0;

        if (state.chart) state.chart.destroy();
        Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
        state.chart = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'SGPA', data: values, borderColor: purple, backgroundColor: purple,
                    borderWidth: 2, tension: 0.3, pointRadius: 4, pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: muted }, grid: { color: grid } },
                    y: { min: floor, max: 10, ticks: { color: muted }, grid: { color: grid } }
                }
            }
        });
    }

    async function saveSemester(number, sgpa, selectForMarks) {
        try {
            const res = await api('/api/academics/semesters', 'POST', { number, sgpa });
            if (selectForMarks) state.marksSemId = res.id;
            await loadSemesters();
            setStatus('Saved semester ' + number + '.');
            return true;
        } catch (e) {
            setStatus(e.message, true);
            return false;
        }
    }

    function nextSemesterNumber() {
        return state.semesters.length ? Math.max(...state.semesters.map((s) => s.number)) + 1 : 1;
    }

    function toggleMarksSemForm(show) {
        const form = $('acad-marks-sem-form');
        form.hidden = !show;
        $('acad-add-sem-btn').setAttribute('aria-expanded', String(show));
        if (show) {
            $('acad-marks-new-sem-num').value = nextSemesterNumber();
            $('acad-marks-new-sem-sgpa').value = '';
            $('acad-marks-new-sem-sgpa').focus();
        }
    }

    /* ── Marks ─────────────────────────────────────────────────── */
    function renderSemesterSelect() {
        const sel = $('acad-marks-sem');
        const prev = state.marksSemId;
        if (!state.semesters.length) {
            sel.innerHTML = '<option value="">No semesters</option>';
            state.marksSemId = null;
            renderMarks([]);
            return;
        }
        sel.innerHTML = state.semesters.map((s) => `<option value="${s.id}">Semester ${s.number}</option>`).join('');
        const keep = state.semesters.some((s) => s.id === prev);
        state.marksSemId = keep ? prev : state.semesters[state.semesters.length - 1].id;
        sel.value = String(state.marksSemId);
        loadMarks();
    }

    async function loadMarks() {
        if (state.marksSemId == null) return;
        try {
            const res = await api('/api/academics/marks?semester_id=' + state.marksSemId);
            renderMarks(res.data);
        } catch (e) { setStatus(e.message, true); }
    }

    function markCell(name, component, entry) {
        const e = entry || {};
        const mark = e.mark ?? '';
        const max = e.max ?? '';
        return `<td><div class="acad-mark-cell">
            <input class="acad-input acad-input-sm acad-mark" type="number" min="0" step="0.5" value="${mark}" placeholder="—"
                   data-subject="${esc(name)}" data-component="${component}" aria-label="${esc(name)} ${component} mark">
            <span class="acad-slash">/</span>
            <input class="acad-input acad-input-xs acad-max" type="number" min="1" step="1" value="${max}"
                   data-subject="${esc(name)}" data-component="${component}" aria-label="${esc(name)} ${component} max">
        </div></td>`;
    }

    function renderMarks(subjects) {
        const body = $('acad-marks-body');
        if (!subjects.length) {
            body.innerHTML = '<tr><td colspan="5" class="acad-empty-cell">No subjects for this semester yet.</td></tr>';
            return;
        }
        body.innerHTML = subjects.map((s) => `
            <tr>
                <td><input class="acad-input acad-name" type="text" value="${esc(s.name)}" data-old-name="${esc(s.name)}" maxlength="60"
                           aria-label="Subject name"></td>
                ${COMPONENTS.map((c) => markCell(s.name, c, s[c])).join('')}
                <td class="acad-col-action"><button type="button" class="acad-icon-btn" data-delete-subject="${esc(s.name)}"
                           aria-label="Delete ${esc(s.name)}">${window.icon('x', { size: 16 })}</button></td>
            </tr>`).join('');
    }

    const markTimers = {};
    function queueMarkSave(inputEl) {
        const subject = inputEl.dataset.subject;
        const component = inputEl.dataset.component;
        const key = subject + '|' + component;
        const cell = inputEl.closest('.acad-mark-cell');
        clearTimeout(markTimers[key]);
        markTimers[key] = setTimeout(async () => {
            const markEl = cell.querySelector('.acad-mark');
            const maxEl = cell.querySelector('.acad-max');
            try {
                await api('/api/academics/marks', 'PUT', {
                    semester_id: state.marksSemId, subject_name: subject, component,
                    mark: markEl.value === '' ? null : markEl.value, max_mark: maxEl.value
                });
                markEl.classList.remove('is-invalid');
                maxEl.classList.remove('is-invalid');
                setStatus('Saved.');
            } catch (e) {
                markEl.classList.add('is-invalid');
                setStatus(e.message, true);
            }
        }, 500);
    }

    /* ── ESE calculator (ported from the old grades modal) ─────── */
    const gradeThresholds = [
        { grade: 'S',  min: 90, color: 'var(--accent-teal)' },
        { grade: 'A+', min: 85, color: '#10b981' },
        { grade: 'A',  min: 80, color: '#34d399' },
        { grade: 'B+', min: 75, color: 'var(--accent-yellow)' },
        { grade: 'B',  min: 70, color: '#fbbf24' },
        { grade: 'C+', min: 65, color: '#f59e0b' },
        { grade: 'C',  min: 60, color: '#f97316' },
        { grade: 'D',  min: 55, color: 'var(--accent-red)' },
        { grade: 'P',  min: 50, color: '#ef4444' }
    ];
    const PRESETS = { theory: [50, 100], integrated: [150, 100], lab: [75, 75] };
    let eseSubjects = [];

    function setPreset(type, btn) {
        const [sess, ese] = PRESETS[type];
        $('eseMaxSessional').value = sess;
        $('eseMaxESE').value = ese;
        document.querySelectorAll('.ese-preset-btn').forEach((b) => b.classList.toggle('active', b === btn));
    }

    async function fetchEseSubjects() {
        try {
            const result = await api('/api/grades/ese-subjects');
            eseSubjects = result.data.map((row) => ({
                id: row.id, name: row.subject_name, current: row.current_marks,
                maxSess: row.max_sessional, maxESE: row.max_ese
            }));
            renderEse();
        } catch (e) { setStatus('Could not load ESE subjects.', true); }
    }

    async function addEseSubject() {
        const name = $('eseSubjectName').value.trim();
        const current = parseFloat($('eseCurrentMarks').value);
        const maxSess = parseFloat($('eseMaxSessional').value);
        const maxESE = parseFloat($('eseMaxESE').value);
        if (!name || isNaN(current) || isNaN(maxSess) || isNaN(maxESE)) {
            setStatus('Fill in subject, current marks and both maximums.', true);
            return;
        }
        try {
            await api('/api/grades/ese-subjects', 'POST', { name, current, maxSess, maxESE });
            $('eseSubjectName').value = '';
            $('eseCurrentMarks').value = '';
            fetchEseSubjects();
        } catch (e) { setStatus(e.message, true); }
    }

    async function deleteEseSubject(id) {
        if (!confirm('Remove this subject from the calculator?')) return;
        try {
            await api('/api/grades/ese-subjects/' + id, 'DELETE');
            fetchEseSubjects();
        } catch (e) { setStatus(e.message, true); }
    }

    function renderEse() {
        const container = $('eseSubjectsContainer');
        if (!eseSubjects.length) {
            container.innerHTML = '<div class="ese-empty-state">No subjects yet — add one above to get started.</div>';
            return;
        }
        container.innerHTML = eseSubjects.map((subject) => {
            const total = subject.maxSess + subject.maxESE;
            const minESE = Math.ceil(0.4 * subject.maxESE);
            const rows = gradeThresholds.map((g) => {
                const required = Math.ceil((g.min / 100) * total - subject.current);
                const possible = required <= subject.maxESE;
                const display = possible ? Math.max(required, minESE) : '—';
                const note = !possible
                    ? '<span class="acad-note acad-note-bad">impossible</span>'
                    : (required < minESE ? `<span class="acad-note acad-note-warn">min ${minESE}</span>` : '');
                return `<tr><td><span style="color:${g.color};font-weight:700;">${g.grade}</span></td><td>${g.min}%</td><td class="acad-strong">${display} ${note}</td></tr>`;
            }).join('');
            return `<div class="acad-ese-subject">
                <div class="acad-ese-subject-head"><strong>${esc(subject.name)}</strong>
                    <button type="button" class="acad-icon-btn" data-delete-ese="${subject.id}" aria-label="Delete ${esc(subject.name)}">${window.icon('x', { size: 16 })}</button></div>
                <div class="acad-ese-meta"><span>Current: <b>${subject.current}/${subject.maxSess}</b></span><span>Max ESE: <b>${subject.maxESE}</b></span></div>
                <table class="acad-table acad-table-compact"><thead><tr><th>Grade</th><th>Target</th><th>Min ESE</th></tr></thead><tbody>${rows}</tbody></table>
            </div>`;
        }).join('');
    }

    /* ── Wiring ────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', () => {
        $('acad-sem-form').addEventListener('submit', (e) => {
            e.preventDefault();
            saveSemester(parseInt($('acad-new-sem-num').value, 10), parseFloat($('acad-new-sem-sgpa').value));
            e.target.reset();
        });

        $('acad-sem-body').addEventListener('change', (e) => {
            const input = e.target.closest('[data-sem-number]');
            if (input) saveSemester(parseInt(input.dataset.semNumber, 10), parseFloat(input.value));
        });

        $('acad-sem-body').addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-delete-sem]');
            if (!btn) return;
            if (!confirm('Delete this semester and all its marks?')) return;
            try {
                await api('/api/academics/semesters/' + btn.dataset.deleteSem, 'DELETE');
                await loadSemesters();
            } catch (err) { setStatus(err.message, true); }
        });

        $('acad-marks-sem').addEventListener('change', (e) => {
            state.marksSemId = parseInt(e.target.value, 10);
            loadMarks();
        });

        $('acad-add-sem-btn').addEventListener('click', () => toggleMarksSemForm($('acad-marks-sem-form').hidden));
        $('acad-marks-sem-cancel').addEventListener('click', () => toggleMarksSemForm(false));
        $('acad-marks-sem-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const ok = await saveSemester(parseInt($('acad-marks-new-sem-num').value, 10),
                                          $('acad-marks-new-sem-sgpa').value, true);
            if (ok) toggleMarksSemForm(false);
        });

        $('acad-subject-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (state.marksSemId == null) { setStatus('Add a semester first.', true); return; }
            try {
                await api('/api/academics/subjects', 'POST', { semester_id: state.marksSemId, name: $('acad-new-subject').value });
                e.target.reset();
                loadMarks();
            } catch (err) { setStatus(err.message, true); }
        });

        const marksBody = $('acad-marks-body');
        marksBody.addEventListener('input', (e) => {
            if (e.target.matches('.acad-mark, .acad-max')) queueMarkSave(e.target);
        });
        marksBody.addEventListener('change', async (e) => {
            if (!e.target.matches('.acad-name')) return;
            const input = e.target;
            try {
                await api('/api/academics/subjects', 'PATCH', {
                    semester_id: state.marksSemId, old_name: input.dataset.oldName, new_name: input.value
                });
                loadMarks();
            } catch (err) {
                input.value = input.dataset.oldName;
                setStatus(err.message, true);
            }
        });
        marksBody.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-delete-subject]');
            if (!btn || !confirm('Delete this subject and its marks?')) return;
            try {
                await api('/api/academics/marks', 'DELETE', { semester_id: state.marksSemId, subject_name: btn.dataset.deleteSubject });
                loadMarks();
            } catch (err) { setStatus(err.message, true); }
        });

        document.querySelectorAll('.ese-preset-btn').forEach((b) =>
            b.addEventListener('click', () => setPreset(b.dataset.preset, b)));
        $('eseAddSubjectBtn').addEventListener('click', addEseSubject);
        $('eseSubjectsContainer').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-delete-ese]');
            if (btn) deleteEseSubject(btn.dataset.deleteEse);
        });

        loadSemesters().catch((e) => setStatus(e.message, true));
        fetchEseSubjects();
    });
})();
