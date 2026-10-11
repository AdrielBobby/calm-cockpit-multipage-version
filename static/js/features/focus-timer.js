/* focus-timer.js - Pomodoro phase engine. Pure functions over a timer object, no DOM.

   Timer shape (mirrors the focus_timer table):
     { phase: 'idle'|'focus'|'short_break'|'long_break'|'awaiting', next_phase, current_session_id,
       ends_at (epoch ms while running), remaining_sec (while paused), is_paused, focus_count_since_long }
   Running phases store ends_at and the countdown is always recomputed from it, so the time
   stays right in background tabs and across page refreshes. Nothing starts on its own: when a
   phase ends the timer goes to 'awaiting' with next_phase set, and the user starts that phase. */
(function () {
    const RUNNING = ['focus', 'short_break', 'long_break'];
    const LABELS = { idle: 'Ready', focus: 'Focus', short_break: 'Short break', long_break: 'Long break', awaiting: 'Up next' };

    function blank() {
        return { phase: 'idle', next_phase: null, current_session_id: null, ends_at: null,
                 remaining_sec: null, is_paused: false, focus_count_since_long: 0 };
    }

    function durationSec(phase, plan) {
        if (phase === 'focus') return plan.focus_min * 60;
        if (phase === 'short_break') return plan.short_break_min * 60;
        if (phase === 'long_break') return plan.long_break_min * 60;
        return 0;
    }

    const isRunningPhase = (t) => RUNNING.includes(t.phase);

    /* Seconds left in the current phase (0 when not in a timed phase). */
    function remainingSec(t, now) {
        if (!isRunningPhase(t)) return 0;
        if (t.is_paused) return Math.max(0, t.remaining_sec || 0);
        return Math.max(0, Math.ceil(((t.ends_at || 0) - now) / 1000));
    }

    /* True when a running, unpaused phase has reached zero. */
    const isExpired = (t, now) => isRunningPhase(t) && !t.is_paused && (t.ends_at || 0) <= now;

    function start(t, phase, plan, now, sessionId) {
        return { ...t, phase, next_phase: null, ends_at: now + durationSec(phase, plan) * 1000,
                 remaining_sec: null, is_paused: false,
                 current_session_id: sessionId !== undefined ? sessionId : t.current_session_id };
    }

    function pause(t, now) {
        if (!isRunningPhase(t) || t.is_paused) return t;
        return { ...t, is_paused: true, remaining_sec: remainingSec(t, now), ends_at: null };
    }

    function resume(t, now) {
        if (!isRunningPhase(t) || !t.is_paused) return t;
        return { ...t, is_paused: false, ends_at: now + (t.remaining_sec || 0) * 1000, remaining_sec: null };
    }

    /* A focus session was completed (timer ran out or "Mark complete"). Picks the break type.
       hasMore=false means the plan is finished, so no break is queued. */
    function afterFocus(t, plan, hasMore) {
        if (!hasMore) return { ...blank(), focus_count_since_long: 0 };
        const count = (t.focus_count_since_long || 0) + 1;
        const isLong = count >= plan.sessions_before_long;
        return { ...t, phase: 'awaiting', next_phase: isLong ? 'long_break' : 'short_break',
                 focus_count_since_long: isLong ? 0 : count, ends_at: null, remaining_sec: null, is_paused: false };
    }

    /* A break ended or was skipped, or a session was skipped: wait for "Start next". */
    function awaitFocus(t) {
        return { ...t, phase: 'awaiting', next_phase: 'focus', ends_at: null, remaining_sec: null, is_paused: false };
    }

    /* Minutes of focus left plus the breaks between them, for the "est. finish" stat. */
    function remainingPlanSec(t, plan, pendingCount, now) {
        let total = 0;
        let count = t.focus_count_since_long || 0;
        let left = pendingCount;
        const breakAfterFocus = () => {
            count += 1;
            if (count < plan.sessions_before_long) return durationSec('short_break', plan);
            count = 0;
            return durationSec('long_break', plan);
        };
        if (t.phase === 'focus') {
            total += remainingSec(t, now);
            left -= 1;
            if (left > 0) total += breakAfterFocus();
        } else if (t.phase === 'short_break' || t.phase === 'long_break') {
            total += remainingSec(t, now);
        } else if (t.phase === 'awaiting' && t.next_phase && t.next_phase !== 'focus') {
            total += durationSec(t.next_phase, plan);
        }
        for (let i = 0; i < left; i++) {
            total += durationSec('focus', plan);
            if (i < left - 1) total += breakAfterFocus();
        }
        return Math.max(0, total);
    }

    function format(sec) {
        const s = Math.max(0, Math.round(sec));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const ss = String(s % 60).padStart(2, '0');
        return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
    }

    window.FocusTimer = {
        LABELS, blank, durationSec, isRunningPhase, remainingSec, isExpired,
        start, pause, resume, afterFocus, awaitFocus, remainingPlanSec, format,
    };
})();
