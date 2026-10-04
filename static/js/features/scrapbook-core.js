/* scrapbook-core.js - Shared helpers for the Scrapbook page: API calls, modals,
   status line, pan/zoom viewport and pointer dragging. Exposes window.Scrap. */
(function () {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    async function api(url, method, body) {
        const opts = { method: method || 'GET', headers: {} };
        if (body instanceof FormData) {
            opts.body = body;
        } else if (body !== undefined) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        const resp = await fetch(url, opts);
        let json = {};
        try { json = await resp.json(); } catch (e) { /* non-JSON error body */ }
        if (!resp.ok || json.status === 'error') throw new Error(json.message || 'Request failed (' + resp.status + ')');
        return json;
    }

    let statusTimer = null;
    function setStatus(msg, isError) {
        const el = $('scrap-status');
        el.textContent = msg || '';
        el.classList.toggle('is-error', !!isError);
        clearTimeout(statusTimer);
        if (msg) statusTimer = setTimeout(() => { el.textContent = ''; }, 5000);
    }

    /* ── Modals ────────────────────────────────────────────────── */
    let lastFocus = null;
    function openModal(id) {
        lastFocus = document.activeElement;
        $(id).classList.add('active');
        const first = $(id).querySelector('input:not([type=hidden]), select, textarea');
        if (first) first.focus();
    }
    function closeModal(id) {
        $(id).classList.remove('active');
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    const anyModalOpen = () => !!document.querySelector('.modal-overlay.active');

    /* Elements that handle their own pointer events (pan never starts on them). */
    const INTERACTIVE = '.scrap-node, .scrap-item, .scrap-ui, .scrap-string-hit, button, input, select, textarea';

    /* ── Pan / zoom viewport ───────────────────────────────────────
       The world element holds everything in world coordinates; the
       stage clips it. We only ever change the world's CSS transform. */
    function createViewport(stage, world, opts) {
        const options = opts || {};
        const v = { x: 0, y: 0, k: 1 };
        const MIN = 0.2, MAX = 2.5;

        function apply() {
            world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
            const grid = 24 * v.k;
            stage.style.backgroundSize = `${grid}px ${grid}px`;
            stage.style.backgroundPosition = `${v.x}px ${v.y}px`;
            if (options.onChange) options.onChange(v);
        }

        function toWorld(clientX, clientY) {
            const r = stage.getBoundingClientRect();
            return { x: (clientX - r.left - v.x) / v.k, y: (clientY - r.top - v.y) / v.k };
        }

        function center() {
            const r = stage.getBoundingClientRect();
            return toWorld(r.left + r.width / 2, r.top + r.height / 2);
        }

        function zoomAt(clientX, clientY, factor) {
            const r = stage.getBoundingClientRect();
            const k = Math.min(MAX, Math.max(MIN, v.k * factor));
            const px = clientX - r.left, py = clientY - r.top;
            v.x = px - (px - v.x) * (k / v.k);
            v.y = py - (py - v.y) * (k / v.k);
            v.k = k;
            apply();
        }

        function zoomBy(factor) {
            const r = stage.getBoundingClientRect();
            zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
        }

        /* Fit a world-space box {minX, minY, maxX, maxY} into the stage. */
        function fit(box, maxZoom) {
            const r = stage.getBoundingClientRect();
            if (!r.width || !r.height) return;
            const pad = 60;
            const w = Math.max(1, box.maxX - box.minX), h = Math.max(1, box.maxY - box.minY);
            v.k = Math.min(maxZoom || 1, Math.max(MIN, Math.min((r.width - pad * 2) / w, (r.height - pad * 2) / h)));
            v.x = r.width / 2 - ((box.minX + box.maxX) / 2) * v.k;
            v.y = r.height / 2 - ((box.minY + box.maxY) / 2) * v.k;
            apply();
        }

        stage.addEventListener('wheel', (e) => {
            e.preventDefault();
            zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
        }, { passive: false });

        stage.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || e.target.closest(INTERACTIVE)) return;
            if (options.onBackgroundDown) options.onBackgroundDown(e);
            const start = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y };
            stage.setPointerCapture(e.pointerId);
            stage.classList.add('is-panning');
            const move = (ev) => {
                v.x = start.vx + ev.clientX - start.x;
                v.y = start.vy + ev.clientY - start.y;
                apply();
            };
            const up = () => {
                stage.classList.remove('is-panning');
                stage.removeEventListener('pointermove', move);
                stage.removeEventListener('pointerup', up);
                stage.removeEventListener('pointercancel', up);
            };
            stage.addEventListener('pointermove', move);
            stage.addEventListener('pointerup', up);
            stage.addEventListener('pointercancel', up);
        });

        apply();
        return { state: v, apply, toWorld, center, zoomBy, fit };
    }

    /* ── Dragging ──────────────────────────────────────────────────
       Calls onMove(dx, dy) in world units and onEnd(moved). A press that
       never passes the threshold counts as a click (onEnd(false)). */
    function startDrag(e, el, viewport, handlers) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const sx = e.clientX, sy = e.clientY;
        let moved = false;
        el.setPointerCapture(e.pointerId);
        const move = (ev) => {
            const dx = ev.clientX - sx, dy = ev.clientY - sy;
            if (!moved && Math.hypot(dx, dy) < 4) return;
            if (!moved && handlers.onStart) handlers.onStart();
            moved = true;
            handlers.onMove(dx / viewport.state.k, dy / viewport.state.k, ev);
        };
        const up = () => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', up);
            if (handlers.onEnd) handlers.onEnd(moved);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
    }

    window.Scrap = { $, esc, api, setStatus, openModal, closeModal, anyModalOpen, createViewport, startDrag };
})();
