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

    const LOG_CAT_KEY = 'torn.logCat';
    const state = { data: null, fetchedAt: 0, stale: false, pollTimer: null, logCat: '', logLoaded: false, polls: 0, upkeep: null };
    try { state.logCat = localStorage.getItem(LOG_CAT_KEY) || ''; } catch (e) { /* storage unavailable */ }

    async function api(url) {
        const resp = await fetch(url);
        let json = {};
        try { json = await resp.json(); } catch (e) { /* non-JSON error body */ }
        if (!resp.ok || json.status === 'error') {
            const err = new Error(json.message || 'Request failed (' + resp.status + ')');
            err.code = json.code;
            err.body = json;
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

    const rows = (pairs) => pairs.map(([k, v, cls]) => `<dt>${esc(k)}</dt><dd${cls ? ` class="${cls}"` : ''}>${esc(v)}</dd>`).join('');
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

    function renderCompany(d) {
        const c = d.company;
        if (!c) {
            $('torn-company').innerHTML = d.job && d.job.job ? rows([['Job', d.job.job + (d.job.position ? ' · ' + d.job.position : '')]])
                : (d.missing.includes('company') ? noAccess('company') : '<p class="acad-hint">No job right now.</p>');
            return;
        }
        const jp = (d.jobpoints && d.jobpoints.companies && d.jobpoints.companies[c.type]) || null;
        const pairs = [['Company', c.name || '?'], ['Position', c.position || '?']];
        if (jp) pairs.push(['Job points', num(jp.jobpoints)]);
        if (c.effectiveness != null) pairs.push(['Effectiveness', num(c.effectiveness)]);
        if (c.days_in_company != null) pairs.push(['Days in company', num(c.days_in_company)]);
        if (c.rating != null) pairs.push(['Rating', c.rating + ' / 10']);
        if (c.capacity) pairs.push(['Employees', num(c.hired) + ' / ' + num(c.capacity)]);
        if (c.daily_income != null) pairs.push(['Daily income', money(c.daily_income)]);
        if (c.weekly_income != null) pairs.push(['Weekly income', money(c.weekly_income)]);
        $('torn-company').innerHTML = rows(pairs);
    }

    /* Torn's API has no "upkeep owed" figure, so it is estimated from the last
       payment in the Upkeep log (Full Access keys only) and the daily rate. */
    const UPKEEP_LOG_CAT = 139;
    const UPKEEP_EVERY_POLLS = 10; // about every 5 minutes

    async function loadUpkeep() {
        try {
            const json = await api('/api/torn/log?cat=' + UPKEEP_LOG_CAT);
            fillCategories(json.categories);
            const last = json.entries[0];
            state.upkeep = last ? { lastPaid: last.timestamp, amount: Object.entries(last.data)
                .filter(([k, v]) => typeof v === 'number' && MONEY_KEYS.test(k)).map(([, v]) => v)[0] } : { lastPaid: 0 };
        } catch (e) {
            state.upkeep = { error: e.code === 16 ? 'nokey' : 'failed' };
        }
        if (state.data) renderProperty(state.data);
    }

    function upkeepRows(daily) {
        const u = state.upkeep;
        if (!u) return [['Upkeep due', 'Checking…']];
        if (u.error === 'nokey') return [['Upkeep due', 'Needs a Full Access key']];
        if (u.error) return [['Upkeep due', 'Unavailable']];
        if (!u.lastPaid) return [['Upkeep due', 'No payments logged']];
        const days = Math.floor((tornNow() - u.lastPaid) / 86400);
        return [
            ['Upkeep due', days > 0 ? `≈ ${money(days * daily)} (${days}d)` : 'Paid up', days >= 3 ? 'is-warn' : ''],
            ['Last paid', ago(u.lastPaid) + (u.amount ? ' · ' + money(u.amount) : '')],
        ];
    }

    function renderProperty(d) {
        const p = d.property;
        if (!p) { $('torn-property').innerHTML = noAccess('property'); return; }
        const upkeep = p.upkeep || {};
        const daily = Number(upkeep.property || 0) + Number(upkeep.staff || 0);
        const pairs = [['Property', (p.property && p.property.name) || '?']].concat(upkeepRows(daily));
        pairs.push(['Upkeep per day', money(daily) + (upkeep.staff ? ` (${money(upkeep.staff)} staff)` : '')]);
        if (p.status === 'rented') {
            const left = p.rental_period_remaining;
            pairs.push(['Rent days left', left != null ? `${num(left)} of ${num(p.rental_period)}` : '?', left <= 3 ? 'is-warn' : '']);
            if (p.cost_per_day) pairs.push(['Rent per day', money(p.cost_per_day)]);
            if (p.rented_by) pairs.push(['Rented by', p.rented_by.name]);
            if (p.owner) pairs.push(['Owner', p.owner.name]);
        } else if (p.status) {
            pairs.push(['Status', p.status[0].toUpperCase() + p.status.slice(1)]);
        }
        if (p.happy) pairs.push(['Max happy', num(p.happy)]);
        $('torn-property').innerHTML = rows(pairs);
    }

    function renderMessages(d) {
        if (d.messages === null) { $('torn-messages').innerHTML = `<li>${noAccess('messages')}</li>`; return; }
        if (!d.messages.length) { $('torn-messages').innerHTML = '<li class="acad-hint">No messages.</li>'; return; }
        $('torn-messages').innerHTML = d.messages.map((m) => `
            <li class="torn-event${m.read ? '' : ' is-new'}">
                <span class="torn-event-time">${esc(ago(m.timestamp))}</span>
                <span><strong>${esc(m.title || '(no subject)')}</strong>
                    <span class="torn-meta">${esc(m.from)}${m.type ? ' · ' + esc(m.type) : ''}</span></span>
            </li>`).join('');
    }

    /* ── Log: fetched per category on demand ──────────────────── */
    const MONEY_KEYS = /cost|money|price|value|worth|amount|total|fee|withdrawn|deposited/;

    function logDetail(data, names) {
        const itemName = (id) => names[String(id)] || 'Item #' + id;
        return Object.entries(data).map(([k, v]) => {
            const label = k.replace(/_/g, ' ');
            if (k === 'item') return itemName(v);
            if (k === 'items') {
                const list = Array.isArray(v) ? v.map((i) => [i.id, i.qty || i.quantity || 1])
                    : Object.entries(v || {}).map(([id, q]) => [id, typeof q === 'number' ? q : 1]);
                return list.map(([id, q]) => `${itemName(id)} ×${num(q)}`).join(', ');
            }
            if (v === null || typeof v === 'object') return null;
            if (typeof v === 'number') return `${label}: ${MONEY_KEYS.test(k) ? money(v) : num(v)}`;
            return `${label}: ${plain(v)}`;
        }).filter(Boolean).join(' · ');
    }

    function fillCategories(cats) {
        const sel = $('torn-log-cat');
        if (!cats || !cats.length || sel.options.length > 1) return;
        sel.insertAdjacentHTML('beforeend', cats.slice().sort((a, b) => a.title.localeCompare(b.title))
            .map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join(''));
        sel.value = state.logCat;
    }

    async function loadLog() {
        const cat = state.logCat;
        const list = $('torn-log');
        list.innerHTML = '<li class="acad-hint">Loading…</li>';
        try {
            const json = await api('/api/torn/log' + (cat ? '?cat=' + encodeURIComponent(cat) : ''));
            fillCategories(json.categories);
            if (cat !== state.logCat) return; // filter changed while loading
            list.innerHTML = json.entries.length ? json.entries.map((e) => {
                const detail = logDetail(e.data, json.item_names || {});
                return `<li class="torn-event">
                    <span class="torn-event-time">${esc(ago(e.timestamp))}</span>
                    <span><strong>${esc(e.title)}</strong>${detail ? `<span class="torn-meta">${esc(detail)}</span>` : ''}</span>
                </li>`;
            }).join('') : '<li class="acad-hint">Nothing logged in this category.</li>';
        } catch (e) {
            fillCategories(e.body && e.body.categories);
            list.innerHTML = e.code === 16
                ? '<li class="acad-hint">The log needs a <strong>Full Access</strong> API key. Create one in Torn under Settings &rarr; API Keys and put it in <code>TORN_API_KEY</code>.</li>'
                : `<li class="acad-hint">${esc(e.message)}</li>`;
        }
    }

    $('torn-log-cat').addEventListener('change', () => {
        state.logCat = $('torn-log-cat').value;
        try { localStorage.setItem(LOG_CAT_KEY, state.logCat); } catch (e) { /* storage unavailable */ }
        loadLog();
    });
    $('torn-log-refresh').addEventListener('click', loadLog);

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
        renderCompany(d);
        renderProperty(d);
        renderMessages(d);
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
            if (!state.logLoaded) {
                state.logLoaded = true;
                loadLog();
            }
            if (state.polls++ % UPKEEP_EVERY_POLLS === 0) loadUpkeep();
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
