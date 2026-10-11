/* focus.js - Focus page: import a pasted Pomodoro plan, run it, track progress.
   Parsing lives in focus-parser.js and the phase rules in focus-timer.js. */
(function () {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const T = window.FocusTimer;
    const LAST_PLAN_KEY = 'focus:lastPlan';
    const BASE_TITLE = document.title;

    const state = {
        plans: [], plan: null, sessions: [], timer: T.blank(),
        editingId: null, parsed: null, nameDirty: false, busy: false, lastFocus: null,
    };

    let statusTimer = null;
    function setStatus(msg, isError) {
        const el = $('focus-status');
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

    function rememberPlan(id) {
        try { localStorage.setItem(LAST_PLAN_KEY, String(id)); } catch (e) { /* storage unavailable */ }
    }
    function rememberedPlan() {
        try { return Number(localStorage.getItem(LAST_PLAN_KEY)) || null; } catch (e) { return null; }
    }

    /* ── Modals ────────────────────────────────────────────────── */
    const MODALS = ['focus-import-modal', 'focus-settings-modal'];
    function openModal(id) {
        state.lastFocus = document.activeElement;
        $(id).classList.add('active');
    }
    function closeModal(id) {
        $(id).classList.remove('active');
        if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
    }
    const anyModalOpen = () => MODALS.some((id) => $(id).classList.contains('active'));

    /* ── Sound + notifications ─────────────────────────────────── */
    let audioCtx = null;
    function unlockAudio() {
        // Browsers only allow audio after a user gesture, so this runs on Start clicks.
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
        } catch (e) { audioCtx = null; }
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {});
        }
    }

    function chime() {
        if (!audioCtx) return;
        const t0 = audioCtx.currentTime;
        [0, 0.28, 0.56].forEach((offset, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = i === 2 ? 1046.5 : 784;
            gain.gain.setValueAtTime(0.0001, t0 + offset);
            gain.gain.exponentialRampToValueAtTime(0.25, t0 + offset + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.25);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(t0 + offset);
            osc.stop(t0 + offset + 0.26);
        });
    }

    function notify(title, body) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        try { new Notification(title, { body, tag: 'focus-timer' }); } catch (e) { /* unsupported context */ }
    }

    /* ── Derived state ─────────────────────────────────────────── */
    const pending = () => state.sessions.filter((s) => s.status === 'pending');
    const sessionById = (id) => state.sessions.find((s) => s.id === id) || null;

    /* The session being worked on, or the one that will start next. */
    function targetSession() {
        if (state.timer.phase === 'focus') return sessionById(state.timer.current_session_id);
        return pending()[0] || null;
    }

    function minutesLabel(sec) {
        const m = Math.round(sec / 60);
        if (m < 60) return m + 'm';
        return Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
    }

    /* ── Loading ───────────────────────────────────────────────── */
    async function loadPlans(selectId) {
        const res = await api('/api/focus/plans');
        state.plans = res.data;
        const hasPlans = state.plans.length > 0;
        $('focus-empty').hidden = hasPlans;
        $('focus-main').hidden = !hasPlans;
        $('focus-plan-field').hidden = !hasPlans;
        $('focus-settings-btn').hidden = !hasPlans;
        if (!hasPlans) {
            state.plan = null;
            document.title = BASE_TITLE;
            return;
        }
        const wanted = [selectId, state.plan && state.plan.id, rememberedPlan()]
            .find((id) => id && state.plans.some((p) => p.id === id)) || state.plans[0].id;
        renderPlanSelect(wanted);
        await loadPlan(wanted);
    }

    function renderPlanSelect(selectedId) {
        $('focus-plan-select').innerHTML = state.plans.map((p) =>
            `<option value="${p.id}"${p.id === selectedId ? ' selected' : ''}>${esc(p.name)} (${p.completed}/${p.total})</option>`
        ).join('');
    }

    async function loadPlan(id) {
        const res = await api('/api/focus/plans/' + id);
        state.plan = res.data.plan;
        state.sessions = res.data.sessions;
        state.timer = { ...T.blank(), ...res.data.timer };
        state.editingId = null;
        rememberPlan(id);

        // The focus session may have been deleted or changed since the timer was saved.
        const cur = sessionById(state.timer.current_session_id);
        if (state.timer.phase === 'focus' && (!cur || cur.status !== 'pending')) {
            state.timer = { ...T.blank(), focus_count_since_long: state.timer.focus_count_since_long };
            await saveTimer();
        }
        // A phase that ran out while the page was closed: finish it quietly.
        if (T.isExpired(state.timer, Date.now())) await endPhase(true);
        render();
    }

    async function refreshPlanSummary() {
        const res = await api('/api/focus/plans');
        state.plans = res.data;
        const fresh = state.plans.find((p) => p.id === state.plan.id);
        if (fresh) state.plan = fresh;
        renderPlanSelect(state.plan.id);
    }

    async function saveTimer() {
        if (!state.plan) return;
        try { await api('/api/focus/plans/' + state.plan.id + '/timer', 'PUT', state.timer); }
        catch (e) { setStatus('Could not save timer: ' + e.message, true); }
    }

    async function setSessionStatus(session, status) {
        await api('/api/focus/sessions/' + session.id, 'PATCH', { status });
        session.status = status;
    }

    /* ── Timer actions ─────────────────────────────────────────── */
    async function commit(nextTimer) {
        state.timer = nextTimer;
        render();
        await saveTimer();
    }

    async function startFocus() {
        unlockAudio();
        const next = pending()[0];
        if (!next) return;
        await commit(T.start(state.timer, 'focus', state.plan, Date.now(), next.id));
    }

    async function startBreak() {
        unlockAudio();
        await commit(T.start(state.timer, state.timer.next_phase, state.plan, Date.now(), null));
    }

    async function togglePause() {
        const t = state.timer;
        if (!T.isRunningPhase(t)) return;
        await commit(t.is_paused ? T.resume(t, Date.now()) : T.pause(t, Date.now()));
    }

    /* Ends the current phase: on timeout, "Mark complete" or "End break". */
    async function endPhase(silent) {
        if (state.busy) return;
        state.busy = true;
        try {
            const t = state.timer;
            if (t.phase === 'focus') {
                const session = sessionById(t.current_session_id);
                if (session && session.status === 'pending') await setSessionStatus(session, 'completed');
                const more = pending().length > 0;
                state.timer = T.afterFocus(t, state.plan, more);
                if (!silent) {
                    chime();
                    const brk = more ? T.LABELS[state.timer.next_phase].toLowerCase() : null;
                    notify(more ? 'Pomodoro done' : 'Plan complete',
                           more ? (session ? session.title + ' is done. Time for a ' + brk + '.' : 'Time for a ' + brk + '.')
                                : 'Every session in ' + state.plan.name + ' is done.');
                }
                setStatus(more ? 'Pomodoro complete.' : 'Plan complete. Nice work.');
                await refreshPlanSummary();
            } else if (t.phase === 'short_break' || t.phase === 'long_break') {
                state.timer = pending().length ? T.awaitFocus(t) : T.blank();
                if (!silent) {
                    chime();
                    const next = pending()[0];
                    notify('Break over', next ? 'Next up: ' + next.title : 'No sessions left.');
                }
            }
            await saveTimer();
        } catch (e) {
            setStatus(e.message, true);
        } finally {
            state.busy = false;
            render();
        }
    }

    async function skipSession(session) {
        session = session || targetSession();
        if (!session) return;
        try {
            const wasCurrentFocus = state.timer.phase === 'focus' && state.timer.current_session_id === session.id;
            await setSessionStatus(session, 'skipped');
            if (wasCurrentFocus) state.timer = pending().length ? T.awaitFocus(state.timer) : T.blank();
            else if (!pending().length && !T.isRunningPhase(state.timer)) state.timer = T.blank();
            await saveTimer();
            await refreshPlanSummary();
            setStatus('Skipped "' + session.title + '". It does not count as a Pomodoro.');
        } catch (e) { setStatus(e.message, true); }
        render();
    }

    async function stopFocus() {
        if (!confirm('Stop this Pomodoro? The session stays in the queue and the time is not counted.')) return;
        await commit({ ...T.blank(), focus_count_since_long: state.timer.focus_count_since_long });
    }

    /* ── Rendering ─────────────────────────────────────────────── */
    function render() {
        if (!state.plan) return;
        renderTimer();
        renderStats();
        renderQueue();
    }

    function button(action, label, primary) {
        return `<button type="button" class="acad-btn ${primary ? 'acad-btn-primary' : 'acad-btn-ghost'}" data-action="${action}">${esc(label)}</button>`;
    }

    function renderTimer() {
        const t = state.timer;
        const plan = state.plan;
        const now = Date.now();
        const target = targetSession();
        const upcoming = pending();
        let phaseLabel = T.LABELS[t.phase];
        let clockSec = T.remainingSec(t, now);
        let controls = '';
        let next = '';

        if (t.phase === 'idle') {
            clockSec = T.durationSec('focus', plan);
            if (target) {
                controls = button('start-focus', 'Start focus', true) + button('skip', 'Skip session');
                next = upcoming[1] ? 'Then: ' + upcoming[1].title : '';
            } else {
                phaseLabel = plan.total ? 'Plan complete' : 'No sessions';
                next = plan.total ? 'All ' + plan.total + ' sessions are done or skipped.' : 'Import a plan to add sessions.';
            }
        } else if (t.phase === 'focus') {
            controls = button('pause', t.is_paused ? 'Resume' : 'Pause', true) + button('complete', 'Mark complete')
                + button('skip', 'Skip') + button('stop', 'Stop');
            const after = upcoming.filter((s) => s.id !== t.current_session_id)[0];
            const count = (t.focus_count_since_long || 0) + 1;
            const brk = count >= plan.sessions_before_long ? 'long_break' : 'short_break';
            next = after ? 'Next: ' + T.LABELS[brk].toLowerCase() + ', then ' + after.title : 'Last session of the plan.';
        } else if (t.phase === 'short_break' || t.phase === 'long_break') {
            controls = button('pause', t.is_paused ? 'Resume' : 'Pause', true)
                + (target ? button('skip-break', 'End break, start focus') : button('end-break', 'End break'));
            next = target ? 'Next: ' + target.title : '';
        } else if (t.phase === 'awaiting') {
            if (t.next_phase === 'focus') {
                phaseLabel = 'Ready for the next Pomodoro';
                clockSec = T.durationSec('focus', plan);
                controls = button('start-focus', 'Start next', true) + button('skip', 'Skip session');
                next = upcoming[1] ? 'Then: ' + upcoming[1].title : '';
            } else {
                phaseLabel = 'Pomodoro done · ' + T.LABELS[t.next_phase].toLowerCase() + ' next';
                clockSec = T.durationSec(t.next_phase, plan);
                const mins = Math.round(clockSec / 60);
                controls = button('start-break', 'Start ' + mins + ' min break', true) + button('skip-break', 'Skip break');
                next = target ? 'After the break: ' + target.title : '';
            }
        }

        const phaseEl = $('focus-phase');
        phaseEl.textContent = phaseLabel + (t.is_paused ? ' · paused' : '');
        phaseEl.dataset.phase = t.phase === 'awaiting' ? 'awaiting' : t.phase;
        $('focus-clock').textContent = T.format(clockSec);
        $('focus-clock').classList.toggle('is-paused', !!t.is_paused);

        const showSession = t.phase === 'focus' || t.phase === 'idle' || (t.phase === 'awaiting' && t.next_phase === 'focus');
        const pos = target ? state.sessions.indexOf(target) + 1 : 0;
        $('focus-current-title').textContent = showSession && target ? pos + '. ' + target.title : '';
        $('focus-current-desc').textContent = showSession && target && target.description ? target.description : '';

        // Rebuild buttons only when they change so keyboard focus isn't lost every tick.
        const controlsEl = $('focus-controls');
        if (controlsEl.dataset.html !== controls) {
            const hadFocus = controlsEl.contains(document.activeElement) ? document.activeElement.dataset.action : null;
            controlsEl.innerHTML = controls;
            controlsEl.dataset.html = controls;
            const again = hadFocus && controlsEl.querySelector(`[data-action="${hadFocus}"]`);
            if (again) again.focus();
        }
        $('focus-next').textContent = next;

        document.title = T.isRunningPhase(t)
            ? T.format(clockSec) + ' · ' + T.LABELS[t.phase] + (t.is_paused ? ' (paused)' : '')
            : BASE_TITLE;
    }

    function renderStats() {
        const plan = state.plan;
        const t = state.timer;
        const now = Date.now();
        const left = pending().length;
        let focusLeft = left * plan.focus_min * 60;
        if (t.phase === 'focus') focusLeft -= plan.focus_min * 60 - T.remainingSec(t, now);
        $('focus-stat-done').textContent = plan.completed + ' / ' + plan.total;
        $('focus-stat-left').textContent = left ? minutesLabel(focusLeft) : '0m';
        if (left) {
            const finish = new Date(now + T.remainingPlanSec(t, plan, left, now) * 1000);
            const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
            const days = Math.round((dayStart(finish) - dayStart(new Date(now))) / 86400000);
            $('focus-stat-finish').textContent = finish.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                + (days ? ' +' + days + 'd' : '');
        } else {
            $('focus-stat-finish').textContent = '—';
        }
        $('focus-progress-bar').style.width = (plan.total ? (plan.completed / plan.total) * 100 : 0) + '%';
        $('focus-timing-hint').textContent = `${plan.focus_min} min focus · ${plan.short_break_min} min short break · `
            + `${plan.long_break_min} min long break after every ${plan.sessions_before_long}`
            + (plan.skipped ? ` · ${plan.skipped} skipped` : '');
    }

    function renderQueue() {
        const t = state.timer;
        const target = targetSession();
        const box = $('focus-queue');
        // Keep an in-progress edit (text and focus) when a phase ends and the queue redraws.
        const editing = box.querySelector('.is-editing');
        const draft = editing && Number(editing.dataset.id) === state.editingId ? {
            title: editing.querySelector('[data-field="title"]').value,
            description: editing.querySelector('[data-field="description"]').value,
            focused: editing.contains(document.activeElement) ? document.activeElement.dataset.field : null,
        } : null;
        if (!state.sessions.length) {
            box.innerHTML = '<li class="acad-empty-cell">This plan has no sessions left. Import another plan to continue.</li>';
            return;
        }
        box.innerHTML = state.sessions.map((s, i) => {
            const isCurrent = target && s.id === target.id;
            const chip = s.status === 'completed' ? ['done', 'Done']
                : s.status === 'skipped' ? ['skipped', 'Skipped']
                : isCurrent ? ['current', t.phase === 'focus' ? 'In focus' : 'Up next']
                : ['upcoming', 'Upcoming'];
            if (state.editingId === s.id) {
                return `<li class="focus-row is-editing" data-id="${s.id}">
                    <span class="focus-row-num">${i + 1}</span>
                    <div class="focus-row-edit">
                        <input class="acad-input" type="text" data-field="title" maxlength="200" value="${esc(s.title)}" aria-label="Session title">
                        <textarea class="acad-input" data-field="description" rows="2" maxlength="1000" placeholder="Description (optional)" aria-label="Session description">${esc(s.description || '')}</textarea>
                        <div class="focus-row-edit-actions">
                            <button type="button" class="acad-btn acad-btn-ghost" data-row="cancel">Cancel</button>
                            <button type="button" class="acad-btn acad-btn-primary" data-row="save">Save</button>
                        </div>
                    </div>
                </li>`;
            }
            const toggle = s.status === 'pending'
                ? `<button type="button" class="acad-btn acad-btn-ghost" data-row="skip">Skip</button>`
                : `<button type="button" class="acad-btn acad-btn-ghost" data-row="restore">Restore</button>`;
            return `<li class="focus-row" data-id="${s.id}" data-status="${chip[0]}">
                <span class="focus-row-num">${i + 1}</span>
                <div class="focus-row-main">
                    <div class="focus-row-title">${esc(s.title)}</div>
                    ${s.description ? `<div class="focus-row-desc">${esc(s.description)}</div>` : ''}
                </div>
                <span class="focus-chip" data-chip="${chip[0]}">${chip[1]}</span>
                <div class="focus-row-actions">
                    <button type="button" class="acad-btn acad-btn-ghost" data-row="extend" title="Topic needs another Pomodoro" aria-label="Add another Pomodoro for ${esc(s.title)}">+1</button>
                    <button type="button" class="acad-btn acad-btn-ghost" data-row="edit">Edit</button>
                    ${toggle}
                    <button type="button" class="acad-icon-btn" data-row="delete" aria-label="Delete session ${esc(s.title)}">${window.icon('x', { size: 16 })}</button>
                </div>
            </li>`;
        }).join('');
        const editRow = draft && box.querySelector('.is-editing');
        if (editRow) {
            editRow.querySelector('[data-field="title"]').value = draft.title;
            editRow.querySelector('[data-field="description"]').value = draft.description;
            if (draft.focused) editRow.querySelector(`[data-field="${draft.focused}"]`).focus();
        }
    }

    /* ── Queue row actions ─────────────────────────────────────── */
    async function saveRowEdit(li) {
        const id = parseInt(li.dataset.id, 10);
        const title = li.querySelector('[data-field="title"]').value.trim();
        const description = li.querySelector('[data-field="description"]').value.trim();
        if (!title) { setStatus('A session needs a title.', true); return; }
        try {
            await api('/api/focus/sessions/' + id, 'PATCH', { title, description });
            Object.assign(sessionById(id), { title, description: description || null });
            state.editingId = null;
            render();
        } catch (e) { setStatus(e.message, true); }
    }

    async function onQueueClick(e) {
        const btn = e.target.closest('[data-row]');
        if (!btn) return;
        const li = btn.closest('.focus-row');
        const session = sessionById(parseInt(li.dataset.id, 10));
        if (!session) return;
        const action = btn.dataset.row;

        if (action === 'edit') {
            state.editingId = session.id;
            renderQueue();
            const input = $('focus-queue').querySelector('.is-editing [data-field="title"]');
            input.focus();
            input.select();
        } else if (action === 'cancel') {
            state.editingId = null;
            renderQueue();
        } else if (action === 'save') {
            await saveRowEdit(li);
        } else if (action === 'skip') {
            await skipSession(session);
        } else if (action === 'extend') {
            try {
                await api('/api/focus/sessions/' + session.id + '/extend', 'POST');
                await loadPlan(state.plan.id);
                await refreshPlanSummary();
                render();
                setStatus('Added another Pomodoro for "' + session.title.replace(/\s*\(\d+\/\d+\)$/, '') + '".');
            } catch (err) { setStatus(err.message, true); }
        } else if (action === 'restore') {
            try {
                await setSessionStatus(session, 'pending');
                await refreshPlanSummary();
                render();
            } catch (err) { setStatus(err.message, true); }
        } else if (action === 'delete') {
            if (!confirm('Delete "' + session.title + '" from this plan?')) return;
            try {
                await api('/api/focus/sessions/' + session.id, 'DELETE');
                state.sessions = state.sessions.filter((s) => s !== session);
                if (state.timer.phase === 'focus' && state.timer.current_session_id === session.id) {
                    state.timer = { ...T.blank(), focus_count_since_long: state.timer.focus_count_since_long };
                    await saveTimer();
                }
                await refreshPlanSummary();
                render();
            } catch (err) { setStatus(err.message, true); }
        }
    }

    /* ── Import ────────────────────────────────────────────────── */
    function openImport() {
        $('focus-import-name').value = '';
        $('focus-import-text').value = '';
        $('focus-import-error').textContent = '';
        state.nameDirty = false;
        state.parsed = null;
        renderPreview();
        openModal('focus-import-modal');
        $('focus-import-text').focus();
    }

    function renderPreview() {
        const text = $('focus-import-text').value;
        const parsed = text.trim() ? window.parseFocusPlan(text) : null;
        state.parsed = parsed;
        const sessions = parsed ? parsed.sessions : [];
        if (parsed && !state.nameDirty) $('focus-import-name').value = parsed.name.slice(0, 80);

        const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
        $('focus-import-count').textContent = !sessions.length ? ''
            : parsed.topicCount !== sessions.length
                ? `(${plural(sessions.length, 'Pomodoro')} from ${plural(parsed.topicCount, 'topic')})`
                : `(${plural(sessions.length, 'Pomodoro')})`;
        $('focus-import-preview').innerHTML = sessions.map((s) => `<li>
            <span class="focus-preview-title">${esc(s.title)}</span>
            ${s.description ? `<span class="focus-preview-desc">${esc(s.description)}</span>` : ''}
        </li>`).join('');
        $('focus-import-warnings').innerHTML = (parsed ? parsed.warnings : []).map((w) => `<li>${esc(w)}</li>`).join('');
        $('focus-import-error').textContent = parsed && !sessions.length
            ? 'No sessions found. Put each one on its own line, like "Pomodoro 1 — Title", "1. Title" or "Session 1: Title".'
            : '';
        $('focus-import-save').disabled = !sessions.length;
    }

    async function saveImport() {
        const sessions = state.parsed ? state.parsed.sessions : [];
        if (!sessions.length) return;
        try {
            const res = await api('/api/focus/plans', 'POST', {
                name: $('focus-import-name').value.trim() || 'Study plan',
                sessions: sessions.map((s) => ({ title: s.title, description: s.description })),
            });
            closeModal('focus-import-modal');
            await loadPlans(res.id);
            setStatus('Imported ' + sessions.length + ' sessions. Press Start focus when ready.');
        } catch (e) { $('focus-import-error').textContent = e.message; }
    }

    /* ── Settings ──────────────────────────────────────────────── */
    function openSettings() {
        const p = state.plan;
        $('focus-set-name').value = p.name;
        $('focus-set-focus').value = p.focus_min;
        $('focus-set-short').value = p.short_break_min;
        $('focus-set-long').value = p.long_break_min;
        $('focus-set-every').value = p.sessions_before_long;
        $('focus-settings-error').textContent = '';
        openModal('focus-settings-modal');
        $('focus-set-focus').focus();
    }

    async function saveSettings() {
        try {
            await api('/api/focus/plans/' + state.plan.id, 'PATCH', {
                name: $('focus-set-name').value,
                settings: {
                    focus_min: $('focus-set-focus').value,
                    short_break_min: $('focus-set-short').value,
                    long_break_min: $('focus-set-long').value,
                    sessions_before_long: $('focus-set-every').value,
                },
            });
            closeModal('focus-settings-modal');
            await refreshPlanSummary();
            render();
            setStatus('Settings saved.');
        } catch (e) { $('focus-settings-error').textContent = e.message; }
    }

    async function deletePlan() {
        if (!confirm('Delete the plan "' + state.plan.name + '" and all its progress?')) return;
        try {
            await api('/api/focus/plans/' + state.plan.id, 'DELETE');
            closeModal('focus-settings-modal');
            state.plan = null;
            await loadPlans();
            setStatus('Plan deleted.');
        } catch (e) { $('focus-settings-error').textContent = e.message; }
    }

    /* ── Tick ──────────────────────────────────────────────────── */
    function tick() {
        if (!state.plan) return;
        if (T.isExpired(state.timer, Date.now())) { endPhase(false); return; }
        if (T.isRunningPhase(state.timer) && !state.timer.is_paused) {
            renderTimer();
            renderStats();
        }
    }

    /* ── Wiring ────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', () => {
        $('focus-controls').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn || state.busy) return;
            const actions = {
                'start-focus': startFocus,
                'start-break': startBreak,
                'skip-break': startFocus,
                'end-break': () => endPhase(true),
                pause: togglePause,
                complete: () => endPhase(true),
                skip: () => skipSession(),
                stop: stopFocus,
            };
            if (actions[btn.dataset.action]) actions[btn.dataset.action]();
        });

        $('focus-queue').addEventListener('click', onQueueClick);
        $('focus-queue').addEventListener('keydown', (e) => {
            const li = e.target.closest('.is-editing');
            if (!li) return;
            if (e.key === 'Escape') { e.stopPropagation(); state.editingId = null; renderQueue(); }
            if (e.key === 'Enter' && e.target.matches('[data-field="title"]')) { e.preventDefault(); saveRowEdit(li); }
        });

        $('focus-plan-select').addEventListener('change', (e) => {
            loadPlan(parseInt(e.target.value, 10)).catch((err) => setStatus(err.message, true));
        });

        $('focus-import-btn').addEventListener('click', openImport);
        $('focus-empty-import').addEventListener('click', openImport);
        $('focus-import-close').addEventListener('click', () => closeModal('focus-import-modal'));
        $('focus-import-cancel').addEventListener('click', () => closeModal('focus-import-modal'));
        $('focus-import-save').addEventListener('click', saveImport);
        $('focus-import-text').addEventListener('input', renderPreview);
        $('focus-import-name').addEventListener('input', () => { state.nameDirty = true; });

        $('focus-settings-btn').addEventListener('click', openSettings);
        $('focus-settings-close').addEventListener('click', () => closeModal('focus-settings-modal'));
        $('focus-settings-cancel').addEventListener('click', () => closeModal('focus-settings-modal'));
        $('focus-settings-save').addEventListener('click', saveSettings);
        $('focus-plan-delete').addEventListener('click', deletePlan);

        // Close on overlay click / Esc
        MODALS.forEach((id) => {
            $(id).addEventListener('click', (e) => { if (e.target === $(id)) closeModal(id); });
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                MODALS.forEach((id) => { if ($(id).classList.contains('active')) closeModal(id); });
                return;
            }
            // Space toggles pause, unless typing or a button/field has focus.
            if (e.key === ' ' && !anyModalOpen() && !e.target.closest('input, textarea, select, button, a')) {
                if (T.isRunningPhase(state.timer)) { e.preventDefault(); togglePause(); }
            }
        });

        // Catch phases that end while the tab is in the background.
        document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
        setInterval(tick, 250);

        loadPlans().catch((e) => setStatus(e.message, true));
    });
})();
