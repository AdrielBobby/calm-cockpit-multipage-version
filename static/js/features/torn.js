/* torn.js - Torn page: live view of the player's Torn account via /api/torn/user.
   The server caches Torn for 30s; between polls a 1s tick runs bar regen and timers locally. */
(function () {
    const $ = (id) => document.getElementById(id);
    const esc = window.esc;
    const POLL_MS = 30000;

    const BARS = [
        ['energy', 'Energy', 'teal'],
        ['nerve', 'Nerve', 'red'],
        ['happy', 'Happy', 'yellow'],
        ['life', 'Life', 'blue'],
    ];

    const state = { data: null, fetchedAt: 0, stale: false, pollTimer: null };

    async function api(url) {
        const resp = await fetch(url);
        let json = {};
        try { json = await resp.json(); } catch (e) { /* non-JSON error body */ }
        if (!resp.ok || json.status === 'error') {
            const err = new Error(json.message || 'Request failed (' + resp.status + ')');
            err.code = json.code;
            throw err;
        }
        return json;
    }

    function setStatus(msg, isError) {
        const el = $('torn-status');
        el.textContent = msg || '';
        el.classList.toggle('is-error', !!isError);
    }

    /* ── Formatting ────────────────────────────────────────────── */
    const age = () => Math.max(0, Date.now() / 1000 - state.fetchedAt);
    const tornNow = () => (state.data.server_time || state.fetchedAt) + age();
    const num = (n) => Number(n || 0).toLocaleString();
    const money = (n) => '$' + num(n);

    function dur(sec) {
        sec = Math.max(0, Math.round(sec));
        const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600);
        const m = Math.floor(sec % 3600 / 60), s = sec % 60;
        const pad = (v) => String(v).padStart(2, '0');
        if (d) return `${d}d ${h}h ${pad(m)}m`;
        if (h) return `${h}h ${pad(m)}m ${pad(s)}s`;
        return `${m}m ${pad(s)}s`;
    }

    function ago(ts) {
        const s = Math.max(0, tornNow() - ts);
        if (s < 60) return 'just now';
        if (s < 3600) return Math.floor(s / 60) + 'm ago';
        if (s < 86400) return Math.floor(s / 3600) + 'h ago';
        return Math.floor(s / 86400) + 'd ago';
    }

    // Torn event text is HTML with its own links; keep only the words.
    const plain = (html) => new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent;

    const rows = (pairs) => pairs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    const noAccess = (sel) => `<p class="acad-hint">Your key can't read <code>${esc(sel)}</code>. Add it to the key in Torn to see this.</p>`;

    /* ── Bars: regen locally from the tick fields Torn sends ──── */
    function barNow(bar) {
        const { current = 0, maximum = 0, increment = 0, interval = 0, ticktime = 0, fulltime = 0 } = bar;
        const t = age();
        let value = current;
        if (current < maximum && interval > 0 && t >= ticktime) {
            value = Math.min(maximum, current + increment * (1 + Math.floor((t - ticktime) / interval)));
        }
        return { value, maximum, fullIn: Math.max(0, fulltime - t) };
    }

    function renderBars(d) {
        const html = BARS.filter(([k]) => d[k]).map(([k, label, tone]) => {
            const b = barNow(d[k]);
            const pct = b.maximum ? Math.min(100, b.value / b.maximum * 100) : 0;
            const note = b.value >= b.maximum ? 'Full' : 'Full in ' + dur(b.fullIn);
            return `<div class="torn-bar torn-bar-${tone}">
                <div class="torn-bar-head"><span>${label}</span><span class="torn-num">${num(b.value)} / ${num(b.maximum)}</span></div>
                <div class="torn-bar-track"><div class="torn-bar-fill" style="width:${pct}%"></div></div>
                <div class="torn-bar-note">${note}</div>
            </div>`;
        });
        const c = d.chain;
        if (c && c.current) {
            const left = Math.max(0, (c.timeout || 0) - age());
            html.push(`<div class="torn-bar-head torn-chain"><span>Chain</span><span class="torn-num">${num(c.current)} / ${num(c.maximum)}${c.timeout ? ' &middot; ' + dur(left) : ''}</span></div>`);
        }
        $('torn-bars').innerHTML = html.join('');
    }

    function renderStatus(d) {
        const st = d.status || {};
        const el = $('torn-state');
        el.textContent = st.state || 'Unknown';
        el.dataset.color = st.color || '';
        $('torn-state-desc').textContent = plain(st.description && st.description !== st.state ? st.description : '');
        const left = st.until ? st.until - tornNow() : 0;
        $('torn-state-timer').textContent = left > 0 ? 'Ends in ' + dur(left) : '';
        const la = d.last_action;
        $('torn-last-action').textContent = la ? 'Last action: ' + (la.relative || la.status || '') : '';
    }

    function renderTimers(d) {
        const cd = d.cooldowns || {};
        const t = age();
        $('torn-cooldowns').innerHTML = rows(['drug', 'booster', 'medical'].map((k) => {
            const left = (cd[k] || 0) - t;
            return [k[0].toUpperCase() + k.slice(1), left > 0 ? dur(left) : 'Ready'];
        }));

        const tr = d.travel || {};
        const left = tr.timestamp ? tr.timestamp - tornNow() : 0;
        $('torn-travel').innerHTML = left > 0
            ? `<div class="torn-travel"><strong>Flying to ${esc(tr.destination)}</strong><span class="torn-num">Lands in ${dur(left)}</span></div>`
            : '';
    }

    function renderMoney(d) {
        if (d.missing.includes('money')) { $('torn-money').innerHTML = noAccess('money'); return; }
        const pairs = [['Cash', money(d.money_onhand)], ['Points', num(d.points)]];
        if (d.city_bank && d.city_bank.amount) pairs.push(['City bank', money(d.city_bank.amount)]);
        if (d.vault_amount) pairs.push(['Vault', money(d.vault_amount)]);
        if (d.cayman_bank) pairs.push(['Cayman', money(d.cayman_bank)]);
        if (d.daily_networth) pairs.push(['Networth', money(d.daily_networth)]);
        $('torn-money').innerHTML = rows(pairs);
    }

    function renderBattle(d) {
        if (d.missing.includes('battlestats')) { $('torn-battle').innerHTML = noAccess('battlestats'); return; }
        const keys = ['strength', 'defense', 'speed', 'dexterity'];
        const total = d.total || keys.reduce((s, k) => s + Number(d[k] || 0), 0);
        $('torn-battle').innerHTML = rows(keys.map((k) => [k[0].toUpperCase() + k.slice(1), num(d[k])])
            .concat([['Total', num(total)]]));
    }

    function renderEvents(d) {
        const n = d.notifications || {};
        $('torn-badges').innerHTML = [['events', 'events'], ['messages', 'messages'], ['awards', 'awards']]
            .filter(([k]) => n[k]).map(([k, label]) => `<span class="torn-badge">${num(n[k])} ${label}</span>`).join('');

        if (d.events === null) { $('torn-events').innerHTML = `<li>${noAccess('events')}</li>`; return; }
        if (!d.events.length) { $('torn-events').innerHTML = '<li class="acad-hint">No recent events.</li>'; return; }
        $('torn-events').innerHTML = d.events.map((e) => `
            <li class="torn-event${e.seen ? '' : ' is-new'}">
                <span class="torn-event-time">${esc(ago(e.timestamp))}</span>
                <span>${esc(plain(e.text))}</span>
            </li>`).join('');
    }

    function renderLive() {
        const d = state.data;
        if (!d) return;
        renderStatus(d);
        renderBars(d);
        renderTimers(d);
        const s = Math.round(age());
        $('torn-updated').textContent = (state.stale ? 'Offline, showing data from ' : 'Updated ') + (s < 2 ? 'just now' : s + 's ago');
    }

    function renderAll() {
        const d = state.data;
        $('torn-ident').textContent = `${d.name || ''} [${d.player_id || ''}] · Level ${d.level || '?'}${d.rank ? ' · ' + d.rank : ''}`;
        renderMoney(d);
        renderBattle(d);
        renderEvents(d);
        renderLive();
    }

    /* ── Polling ───────────────────────────────────────────────── */
    async function refresh() {
        clearTimeout(state.pollTimer);
        try {
            const json = await api('/api/torn/user');
            state.data = json.data;
            state.fetchedAt = json.fetched_at;
            state.stale = json.stale;
            $('torn-setup').hidden = true;
            $('torn-main').hidden = false;
            setStatus(json.stale ? "Can't reach Torn right now; showing the last data." : '', json.stale);
            renderAll();
        } catch (e) {
            if (e.code === 'no_key') {
                $('torn-setup').hidden = false;
                $('torn-main').hidden = true;
                setStatus('');
                return; // nothing to poll until the server restarts with a key
            }
            setStatus(e.message, true);
        }
        if (!document.hidden) state.pollTimer = setTimeout(refresh, POLL_MS);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) clearTimeout(state.pollTimer);
        else refresh();
    });

    setInterval(renderLive, 1000);
    refresh();
})();
