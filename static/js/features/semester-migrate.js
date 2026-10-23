/* semester-migrate.js - "Migrate to next sem": enter next sem's subjects, wipe the finished semester's data. */
(function () {
    const state = { lastFocus: null };
    const $ = (id) => document.getElementById(id);

    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    function addRow(name, shortName) {
        const row = document.createElement('div');
        row.className = 'sem-row';
        row.innerHTML = `
            <input class="acad-input" type="text" data-field="name" maxlength="80" placeholder="e.g. Computer Networks" value="${esc(name || '')}">
            <input class="acad-input" type="text" data-field="short_name" maxlength="12" placeholder="CN" value="${esc(shortName || '')}">
            <input class="acad-input" type="text" data-field="id" maxlength="40" aria-label="Subject ID" autocomplete="off" value="subj_${$('sem-rows').children.length + 1}">
            <button type="button" class="btn-close" data-remove aria-label="Remove subject"><span>&times;</span></button>`;
        $('sem-rows').appendChild(row);
        return row;
    }

    function setError(msg) { $('sem-modal-error').textContent = msg || ''; }

    function open() {
        state.lastFocus = document.activeElement;
        $('sem-rows').innerHTML = '';
        for (let i = 0; i < 3; i++) addRow();
        setError('');
        $('sem-modal').classList.add('active');
        $('sem-rows').querySelector('input').focus();
    }

    function close() {
        $('sem-modal').classList.remove('active');
        if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
    }

    async function submit(e) {
        e.preventDefault();
        const subjects = [...$('sem-rows').querySelectorAll('.sem-row')]
            .map((r) => ({
                name: r.querySelector('[data-field="name"]').value.trim(),
                short_name: r.querySelector('[data-field="short_name"]').value.trim(),
                id: r.querySelector('[data-field="id"]').value.trim(),
            }))
            .filter((s) => s.name || s.short_name);

        if (!subjects.length) return setError('Add at least one subject');
        if (subjects.some((s) => !s.name)) return setError('Every subject needs a name');
        if (!confirm('Delete this semester\'s attendance, holidays and timetable and start the next sem?')) return;

        const btn = $('sem-save');
        btn.disabled = true;
        try {
            const resp = await fetch('/api/semester/migrate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subjects }),
            });
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok || json.status === 'error') throw new Error(json.message || 'Migration failed');
            close();
            const body = $('modal-body');
            if (body && window.loadTimetableModal) window.loadTimetableModal(body);
            if (window.refreshTimetableSnapshot) window.refreshTimetableSnapshot();
            if (window.refreshAttendanceSnapshot) window.refreshAttendanceSnapshot();
            if (window.invalidateHeatmapCache) window.invalidateHeatmapCache();
        } catch (err) {
            setError(err.message);
        } finally {
            btn.disabled = false;
        }
    }

    window.openSemesterMigrate = open;

    document.addEventListener('DOMContentLoaded', () => {
        const modal = $('sem-modal');
        if (!modal) return;
        $('sem-form').addEventListener('submit', submit);
        $('sem-add-row').addEventListener('click', () => addRow().querySelector('input').focus());
        $('sem-rows').addEventListener('click', (e) => {
            const rm = e.target.closest('[data-remove]');
            if (rm) rm.closest('.sem-row').remove();
        });
        $('sem-modal-close').addEventListener('click', close);
        $('sem-cancel').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                e.stopImmediatePropagation();
                close();
            }
        }, true);
    });
})();
