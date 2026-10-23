/* assignments.js - Assignments page: add/edit assignments, track status, due dates feed the overview calendar. */
(function () {
    const STATUSES = ['not_started', 'in_progress', 'submitted'];
    const STATUS_LABELS = { not_started: 'Not started', in_progress: 'In progress', submitted: 'Submitted' };
    const state = { items: [], subjects: [], editingId: null, lastFocus: null };
    const $ = (id) => document.getElementById(id);

    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    let statusTimer = null;
    function setStatus(msg, isError) {
        const el = $('asg-status');
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

    /* ── Dates ─────────────────────────────────────────────────── */
    function todayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function daysUntil(dateStr) {
        const toUtc = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
        return Math.round((toUtc(dateStr) - toUtc(todayStr())) / 86400000);
    }
    function dueHint(item) {
        const n = daysUntil(item.due_date);
        if (item.status === 'submitted') return { text: '', tone: '' };
        if (n < 0) return { text: n === -1 ? 'overdue by 1 day' : `overdue by ${-n} days`, tone: 'is-overdue' };
        if (n === 0) return { text: 'due today', tone: 'is-soon' };
        if (n === 1) return { text: 'due tomorrow', tone: 'is-soon' };
        return { text: `due in ${n} days`, tone: n <= 3 ? 'is-soon' : '' };
    }

    /* ── Rendering ─────────────────────────────────────────────── */
    function renderCard(a) {
        const hint = dueHint(a);
        const subject = a.subject_short || a.subject_name;
        const due = window.formatDate(a.due_date, { weekday: 'short', month: 'short', day: 'numeric' });
        return `
            <li class="asg-card ${hint.tone}" data-id="${a.id}">
                <button type="button" class="asg-card-main" data-edit="${a.id}" aria-label="Edit ${esc(a.title)}">
                    <span class="asg-card-title">${esc(a.title)}</span>
                    <span class="asg-card-meta">
                        ${subject ? `<span class="asg-chip" title="${esc(a.subject_name || '')}">${esc(subject)}</span>` : ''}
                        <span class="asg-due">${esc(due)}</span>
                        ${hint.text ? `<span class="asg-hint">${hint.text}</span>` : ''}
                    </span>
                    ${a.notes ? `<span class="asg-notes">${esc(a.notes)}</span>` : ''}
                </button>
                <div class="asg-card-actions">
                    <select class="acad-input asg-status-select" data-status-for="${a.id}" aria-label="Status of ${esc(a.title)}">
                        ${STATUSES.map((s) => `<option value="${s}"${s === a.status ? ' selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}
                    </select>
                    <button type="button" class="acad-icon-btn" data-delete="${a.id}" aria-label="Delete ${esc(a.title)}">${window.icon('x', { size: 16 })}</button>
                </div>
            </li>`;
    }

    function render() {
        const filter = $('asg-filter').value;
        STATUSES.forEach((s) => {
            const items = state.items.filter((a) => a.status === s);
            const col = document.querySelector(`[data-col="${s}"]`);
            col.hidden = filter !== 'all' && filter !== s;
            document.querySelector(`[data-count="${s}"]`).textContent = items.length ? `(${items.length})` : '';
            // Submitted reads most-recent first; open work reads soonest-due first.
            if (s === 'submitted') items.reverse();
            document.querySelector(`[data-list="${s}"]`).innerHTML = items.length
                ? items.map(renderCard).join('')
                : `<li class="asg-empty">${s === 'submitted' ? 'Nothing submitted yet.' : 'Nothing here.'}</li>`;
        });
        $('asg-board').classList.toggle('is-single', filter !== 'all');
    }

    async function load() {
        const res = await api('/api/assignments');
        state.items = res.data;
        render();
    }

    async function loadSubjects() {
        try {
            const res = await api('/api/subjects');
            state.subjects = res.data;
        } catch (e) { state.subjects = []; }
        $('asg-subject').innerHTML = '<option value="">No subject</option>' +
            state.subjects.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    }

    /* ── Modal ─────────────────────────────────────────────────── */
    function openModal(item) {
        state.editingId = item ? item.id : null;
        state.lastFocus = document.activeElement;
        $('asg-modal-title').textContent = item ? 'Edit assignment' : 'Add assignment';
        $('asg-id').value = item ? item.id : '';
        $('asg-id').readOnly = !!item;
        if (!item) window.prefillNextId('assignments', 'asg-id');
        $('asg-title').value = item ? item.title : '';
        $('asg-subject').value = item && item.subject_id != null ? String(item.subject_id) : '';
        $('asg-due').value = item ? item.due_date : '';
        $('asg-status-input').value = item ? item.status : 'not_started';
        $('asg-notes').value = item ? item.notes : '';
        $('asg-delete').hidden = !item;
        $('asg-modal-error').textContent = '';
        $('asg-modal').classList.add('active');
        $('asg-title').focus();
    }
    function closeModal() {
        $('asg-modal').classList.remove('active');
        if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
    }

    async function saveModal(e) {
        e.preventDefault();
        const payload = {
            title: $('asg-title').value.trim(),
            subject_id: $('asg-subject').value || null,
            due_date: $('asg-due').value,
            status: $('asg-status-input').value,
            notes: $('asg-notes').value,
        };
        if (!payload.title) { $('asg-modal-error').textContent = 'Give it a title.'; $('asg-title').focus(); return; }
        if (!payload.due_date) { $('asg-modal-error').textContent = 'Pick a due date.'; $('asg-due').focus(); return; }
        $('asg-save').disabled = true;
        try {
            if (state.editingId) await api('/api/assignments/' + state.editingId, 'PATCH', payload);
            else await api('/api/assignments', 'POST', { ...payload, id: $('asg-id').value.trim() || undefined });
            closeModal();
            await load();
            setStatus('Saved.');
        } catch (err) {
            $('asg-modal-error').textContent = err.message;
        } finally {
            $('asg-save').disabled = false;
        }
    }

    async function deleteAssignment(id) {
        const item = state.items.find((a) => a.id === id);
        if (!confirm(`Delete "${item ? item.title : 'this assignment'}"?`)) return false;
        try {
            await api('/api/assignments/' + id, 'DELETE');
            await load();
            setStatus('Deleted.');
            return true;
        } catch (err) { setStatus(err.message, true); return false; }
    }

    /* ── Wiring ────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', () => {
        $('asg-add-btn').addEventListener('click', () => openModal(null));
        $('asg-filter').addEventListener('change', render);
        $('asg-form').addEventListener('submit', saveModal);
        $('asg-modal-close').addEventListener('click', closeModal);
        $('asg-cancel').addEventListener('click', closeModal);
        $('asg-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && $('asg-modal').classList.contains('active')) closeModal();
        });
        $('asg-delete').addEventListener('click', async () => {
            if (state.editingId && await deleteAssignment(state.editingId)) closeModal();
        });

        const board = $('asg-board');
        board.addEventListener('click', (e) => {
            const edit = e.target.closest('[data-edit]');
            if (edit) { openModal(state.items.find((a) => a.id === edit.dataset.edit)); return; }
            const del = e.target.closest('[data-delete]');
            if (del) deleteAssignment(del.dataset.delete);
        });
        board.addEventListener('change', async (e) => {
            const sel = e.target.closest('[data-status-for]');
            if (!sel) return;
            try {
                await api('/api/assignments/' + sel.dataset.statusFor, 'PATCH', { status: sel.value });
                await load();
                setStatus('Marked ' + STATUS_LABELS[sel.value].toLowerCase() + '.');
            } catch (err) { setStatus(err.message, true); load(); }
        });

        loadSubjects();
        load().catch((e) => setStatus(e.message, true));
    });
})();
