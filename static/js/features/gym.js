/* gym.js - Gym page: day logging, workout presets, PRs and summary counts. */
(function () {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const weekdayIndex = (dateStr) => (new Date(dateStr + 'T00:00:00').getDay() + 6) % 7; // Mon=0 .. Sun=6

    const state = { presets: [], bestByExercise: {}, day: null, editingPresetId: null, lastFocus: null };

    let statusTimer = null;
    function setStatus(msg, isError) {
        const el = $('gym-status');
        el.textContent = msg || '';
        el.classList.toggle('is-error', !!isError);
        clearTimeout(statusTimer);
        if (msg) statusTimer = setTimeout(() => { el.textContent = ''; }, 5000);
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

    /* ── Modals ────────────────────────────────────────────────── */
    function openModal(id) {
        state.lastFocus = document.activeElement;
        $(id).classList.add('active');
    }
    function closeModal(id) {
        $(id).classList.remove('active');
        if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
    }

    /* ── Presets list ──────────────────────────────────────────── */
    async function loadPresets() {
        const res = await api('/api/gym/presets');
        state.presets = res.data;
        renderPresets();
    }

    function renderPresets() {
        const box = $('gym-presets');
        if (!state.presets.length) {
            box.innerHTML = '<p class="acad-empty-cell">No presets yet. Create one like "Chest + Triceps" to prefill your workouts.</p>';
            return;
        }
        box.innerHTML = state.presets.map((p) => `
            <div class="gym-preset">
                <div class="gym-preset-main">
                    <strong>${esc(p.name)}</strong>
                    ${p.weekday != null ? `<span class="gym-badge">${WEEKDAYS[p.weekday].slice(0, 3)}</span>` : ''}
                    <div class="gym-preset-ex">${p.exercises.length ? esc(p.exercises.join(', ')) : 'No exercises yet'}</div>
                </div>
                <div class="gym-preset-actions">
                    <button type="button" class="acad-btn acad-btn-ghost" data-edit-preset="${p.id}">Edit</button>
                    <button type="button" class="acad-icon-btn" data-delete-preset="${p.id}" aria-label="Delete preset ${esc(p.name)}">${window.icon('x', { size: 16 })}</button>
                </div>
            </div>`).join('');
    }

    function presetExerciseRow(name) {
        return `<div class="gym-preset-ex-row">
            <input class="acad-input" type="text" list="gym-exercise-list" maxlength="60" value="${esc(name || '')}" placeholder="Exercise name" aria-label="Exercise name">
            <button type="button" class="acad-icon-btn" data-remove-row aria-label="Remove exercise">${window.icon('x', { size: 16 })}</button>
        </div>`;
    }

    function openPresetEditor(id) {
        const preset = id == null ? null : state.presets.find((p) => p.id === id);
        state.editingPresetId = preset ? preset.id : null;
        $('gym-preset-title').textContent = preset ? 'Edit preset' : 'New preset';
        $('gym-preset-name').value = preset ? preset.name : '';
        $('gym-preset-weekday').value = preset && preset.weekday != null ? String(preset.weekday) : '';
        const names = preset && preset.exercises.length ? preset.exercises : [''];
        $('gym-preset-exercises').innerHTML = names.map(presetExerciseRow).join('');
        $('gym-preset-error').textContent = '';
        openModal('gym-preset-modal');
        $('gym-preset-name').focus();
    }

    async function savePreset() {
        const names = [...$('gym-preset-exercises').querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);
        const body = { name: $('gym-preset-name').value, weekday: $('gym-preset-weekday').value, exercises: names };
        try {
            if (state.editingPresetId == null) await api('/api/gym/presets', 'POST', body);
            else await api('/api/gym/presets/' + state.editingPresetId, 'PUT', body);
            closeModal('gym-preset-modal');
            await Promise.all([loadPresets(), loadExerciseNames()]);
            setStatus('Preset saved.');
        } catch (e) { $('gym-preset-error').textContent = e.message; }
    }

    async function deletePreset(id) {
        const preset = state.presets.find((p) => p.id === id);
        if (!preset || !confirm('Delete preset "' + preset.name + '"? Logged workouts are not affected.')) return;
        try {
            await api('/api/gym/presets/' + id, 'DELETE');
            await loadPresets();
        } catch (e) { setStatus(e.message, true); }
    }

    /* ── PRs, exercise names, summary counts ───────────────────── */
    async function loadPRs() {
        const res = await api('/api/gym/prs');
        state.bestByExercise = {};
        res.data.forEach((p) => { state.bestByExercise[p.exercise.toLowerCase()] = p; });
        const box = $('gym-prs');
        if (!res.data.length) {
            box.innerHTML = '<p class="acad-empty-cell">Log exercises with a weight to start tracking personal records.</p>';
            return;
        }
        box.innerHTML = `<table class="acad-table"><thead><tr><th>Exercise</th><th>Best</th><th>Reps</th><th>Date</th></tr></thead><tbody>${
            res.data.map((p) => `<tr>
                <td>${esc(p.exercise)}</td>
                <td class="acad-strong">${p.weight_kg} kg</td>
                <td>${p.reps ?? '—'}</td>
                <td>${esc(window.formatDate(p.date, { month: 'short', day: 'numeric', year: 'numeric' }))}</td>
            </tr>`).join('')}</tbody></table>`;
    }

    async function loadExerciseNames() {
        const res = await api('/api/gym/exercises');
        $('gym-exercise-list').innerHTML = res.data.map((n) => `<option value="${esc(n)}"></option>`).join('');
    }

    async function loadStats() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - ((today.getDay() + 6) % 7));
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const from = weekStart < monthStart ? weekStart : monthStart;
        const res = await api(`/api/gym/heatmap?from=${iso(from)}&to=${iso(today)}`);
        $('gym-stat-week').textContent = res.data.filter((d) => d.date >= iso(weekStart)).length;
        $('gym-stat-month').textContent = res.data.filter((d) => d.date >= iso(monthStart)).length;
    }

    async function refreshAfterLogChange() {
        await Promise.all([window.reloadGymHeatmap(), loadStats(), loadPRs(), loadExerciseNames()]);
    }

    /* ── Day log modal ─────────────────────────────────────────── */
    function exerciseRow(r) {
        const best = state.bestByExercise[(r.exercise || '').toLowerCase()];
        return `<div class="gym-ex-row">
            <div class="gym-ex-name">
                <input class="acad-input" data-field="exercise" type="text" list="gym-exercise-list" maxlength="60" value="${esc(r.exercise || '')}" placeholder="Exercise" aria-label="Exercise name">
                <span class="gym-ex-meta">${r.is_pr ? '<span class="gym-pr-badge">PR</span>' : ''}${best ? `Best ${best.weight_kg} kg` : ''}</span>
            </div>
            ${[0, 1, 2].map((i) => `<input class="acad-input" data-field="set" type="number" min="1" max="999" step="1" value="${(r.set_reps || [])[i] ?? ''}" aria-label="Reps in set ${i + 1}">`).join('')}
            <input class="acad-input" data-field="weight_kg" type="number" min="0" max="1000" step="0.5" value="${r.weight_kg ?? ''}" placeholder="kg" aria-label="Weight in kilograms">
            <button type="button" class="acad-icon-btn" data-remove-row aria-label="Remove exercise">${window.icon('x', { size: 16 })}</button>
        </div>`;
    }

    function renderExerciseRows(rows) {
        $('gym-exercise-rows').innerHTML = (rows.length ? rows : [{}]).map(exerciseRow).join('');
    }

    function readExerciseRows() {
        return [...$('gym-exercise-rows').querySelectorAll('.gym-ex-row')].map((row) => {
            const get = (f) => row.querySelector(`[data-field="${f}"]`).value;
            const set_reps = [...row.querySelectorAll('[data-field="set"]')].map((i) => i.value);
            return { exercise: get('exercise').trim(), set_reps, weight_kg: get('weight_kg') };
        }).filter((r) => r.exercise || r.set_reps.some(Boolean) || r.weight_kg);
    }

    function renderChips() {
        const suggested = state.day ? weekdayIndex(state.day.date) : null;
        const box = $('gym-preset-chips');
        if (!state.presets.length) {
            box.innerHTML = '<span class="gym-hint">No presets yet. Create one in "Workout Presets" below, or just add exercises.</span>';
            return;
        }
        box.innerHTML = state.presets.map((p) => `
            <button type="button" class="gym-chip${state.day.presetName === p.name ? ' is-active' : ''}" data-preset-id="${p.id}" aria-pressed="${state.day.presetName === p.name}">
                ${esc(p.name)}${p.weekday === suggested ? '<span class="gym-chip-hint">Suggested</span>' : ''}
            </button>`).join('');
    }

    async function openDay(dateStr) {
        let day;
        try {
            day = (await api('/api/gym/log/' + dateStr)).data;
        } catch (e) { setStatus(e.message, true); return; }
        state.day = { date: dateStr, presetName: day.preset_name || null, exists: day.exists };
        $('gym-day-title').textContent = window.formatDate(dateStr, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        renderChips();
        renderExerciseRows(day.exercises);
        $('gym-cardio').checked = day.cardio;
        $('gym-steps').checked = day.steps_10k;
        $('gym-notes').value = day.notes || '';
        $('gym-day-error').textContent = '';
        $('gym-day-delete').hidden = !day.exists;
        openModal('gym-day-modal');
        const first = $('gym-exercise-rows').querySelector('input');
        if (first) first.focus();
    }

    function applyPreset(presetId) {
        const preset = state.presets.find((p) => p.id === presetId);
        if (!preset) return;
        if (state.day.presetName === preset.name) { // toggle off, keep rows
            state.day.presetName = null;
            renderChips();
            return;
        }
        const existing = readExerciseRows();
        if (existing.length && !confirm('Replace the exercises below with "' + preset.name + '"?')) return;
        state.day.presetName = preset.name;
        renderExerciseRows(preset.exercises.map((name) => ({ exercise: name })));
        renderChips();
    }

    async function saveDay() {
        const rows = readExerciseRows();
        if (rows.some((r) => !r.exercise)) {
            $('gym-day-error').textContent = 'Every exercise row needs a name.';
            return;
        }
        try {
            const res = await api('/api/gym/log/' + state.day.date, 'PUT', {
                preset_name: state.day.presetName,
                notes: $('gym-notes').value,
                cardio: $('gym-cardio').checked,
                steps_10k: $('gym-steps').checked,
                exercises: rows
            });
            closeModal('gym-day-modal');
            await refreshAfterLogChange();
            const prs = res.new_prs.map((p) => `${p.exercise} ${p.weight_kg} kg`);
            setStatus(prs.length ? 'Saved. New PR: ' + prs.join(', ') + '!' : 'Workout saved.');
        } catch (e) { $('gym-day-error').textContent = e.message; }
    }

    async function deleteDay() {
        if (!confirm('Delete the workout logged on this day?')) return;
        try {
            await api('/api/gym/log/' + state.day.date, 'DELETE');
            closeModal('gym-day-modal');
            await refreshAfterLogChange();
            setStatus('Workout deleted.');
        } catch (e) { $('gym-day-error').textContent = e.message; }
    }

    /* ── Wiring ────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', () => {
        const todayStr = iso(new Date());
        $('gym-day-input').max = todayStr;
        $('gym-day-input').value = todayStr;

        $('gym-log-today').addEventListener('click', () => openDay(todayStr));
        $('gym-day-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const v = $('gym-day-input').value;
            if (v && v <= todayStr) openDay(v);
        });

        // Day modal
        $('gym-day-close').addEventListener('click', () => closeModal('gym-day-modal'));
        $('gym-day-cancel').addEventListener('click', () => closeModal('gym-day-modal'));
        $('gym-day-save').addEventListener('click', saveDay);
        $('gym-day-delete').addEventListener('click', deleteDay);
        $('gym-add-exercise').addEventListener('click', () => {
            $('gym-exercise-rows').insertAdjacentHTML('beforeend', exerciseRow({}));
            const rows = $('gym-exercise-rows').querySelectorAll('.gym-ex-row');
            rows[rows.length - 1].querySelector('input').focus();
        });
        $('gym-preset-chips').addEventListener('click', (e) => {
            const chip = e.target.closest('[data-preset-id]');
            if (chip) applyPreset(parseInt(chip.dataset.presetId, 10));
        });
        const rowsBox = $('gym-exercise-rows');
        rowsBox.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-remove-row]');
            if (!btn) return;
            btn.closest('.gym-ex-row').remove();
            if (!rowsBox.children.length) renderExerciseRows([]);
        });
        rowsBox.addEventListener('input', (e) => {
            if (e.target.matches('[data-field="weight_kg"]')) {
                const badge = e.target.closest('.gym-ex-row').querySelector('.gym-pr-badge');
                if (badge) badge.remove(); // the saved PR flag no longer matches what's typed
            }
        });

        // Preset modal + list
        $('gym-new-preset').addEventListener('click', () => openPresetEditor(null));
        $('gym-preset-close').addEventListener('click', () => closeModal('gym-preset-modal'));
        $('gym-preset-cancel').addEventListener('click', () => closeModal('gym-preset-modal'));
        $('gym-preset-save').addEventListener('click', savePreset);
        $('gym-preset-add-ex').addEventListener('click', () => {
            $('gym-preset-exercises').insertAdjacentHTML('beforeend', presetExerciseRow(''));
            const inputs = $('gym-preset-exercises').querySelectorAll('input');
            inputs[inputs.length - 1].focus();
        });
        $('gym-preset-exercises').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-remove-row]');
            if (!btn) return;
            btn.closest('.gym-preset-ex-row').remove();
            if (!$('gym-preset-exercises').children.length) $('gym-preset-exercises').innerHTML = presetExerciseRow('');
        });
        $('gym-presets').addEventListener('click', (e) => {
            const edit = e.target.closest('[data-edit-preset]');
            const del = e.target.closest('[data-delete-preset]');
            if (edit) openPresetEditor(parseInt(edit.dataset.editPreset, 10));
            if (del) deletePreset(parseInt(del.dataset.deletePreset, 10));
        });

        // Close on overlay click / Esc
        ['gym-day-modal', 'gym-preset-modal'].forEach((id) => {
            $(id).addEventListener('click', (e) => { if (e.target === $(id)) closeModal(id); });
        });
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            ['gym-day-modal', 'gym-preset-modal'].forEach((id) => { if ($(id).classList.contains('active')) closeModal(id); });
        });

        // Initial load: presets and PRs first so the modal can show suggestions and "Best" hints
        Promise.all([loadPresets(), loadPRs(), loadExerciseNames(), loadStats()])
            .catch((e) => setStatus(e.message, true));
        window.loadGymHeatmap($('gym-heatmap'), { onDayClick: openDay });
    });
})();
