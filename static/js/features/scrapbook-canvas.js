/* scrapbook-canvas.js - A node's pinboard: notes, images and pins that can be
   dragged around, joined with sagging strings. Exposes window.ScrapCanvas. */
(function () {
    const { $, api, setStatus, createViewport, startDrag } = window.Scrap;
    const NOTE_COLOURS = ['yellow', 'pink', 'blue', 'green'];
    const STRING_COLOURS = [
        { value: '#ef4444', label: 'Red' }, { value: '#f8fafc', label: 'White' },
        { value: '#06d6a0', label: 'Teal' }, { value: '#f59e0b', label: 'Amber' }, { value: '#60a5fa', label: 'Blue' },
    ];
    const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
    const HINTS = {
        idle: 'Double-click a note to edit · drop or paste images · Delete removes the selection',
        first: 'String: click the first item to tie it to (Esc to stop)',
        second: 'String: now click the item to connect it to',
    };

    const state = {
        node: null, items: [], links: [],
        selected: null,              // { kind: 'item' | 'link', id }
        stringMode: false, pendingFrom: null, stringColour: STRING_COLOURS[0].value,
        editingId: null,
    };
    let view = null;
    let opts = {};
    let linkDeleteBtn = null;

    const itemsEl = () => $('scrap-canvas-items');
    const itemById = (id) => state.items.find((i) => i.id === id);
    const itemNode = (id) => itemsEl().querySelector(`[data-item="${id}"]`);
    const isOpen = () => !!state.node;

    /* ── Open / close ──────────────────────────────────────────── */
    async function open(node) {
        state.node = node;
        state.selected = null;
        state.editingId = null;
        setStringMode(false);
        $('scrap-canvas-title').textContent = node.title;
        itemsEl().innerHTML = '';
        $('scrap-canvas-strings').innerHTML = '';
        try {
            const res = await api(`/api/scrapbook/nodes/${node.id}/canvas`);
            if (state.node !== node) return;   // user navigated away meanwhile
            state.items = res.items;
            state.links = res.links;
            renderItems();
            fitItems();
        } catch (ex) {
            setStatus(ex.message, true);
        }
    }

    function close() {
        commitEditing();
        setStringMode(false);
        state.node = null;
        state.items = [];
        state.links = [];
    }

    /* ── Rendering ─────────────────────────────────────────────── */
    function controlsHtml(item) {
        const colour = item.type === 'note'
            ? '<button type="button" class="scrap-item-btn" data-colour-item aria-label="Change note colour" title="Colour"><span class="scrap-colour-dot"></span></button>'
            : '';
        const resize = item.type === 'pin' ? '' : '<span class="scrap-resize" data-resize aria-hidden="true"></span>';
        return `<span class="scrap-item-controls">${colour}<button type="button" class="scrap-item-btn" data-delete-item aria-label="Delete" title="Delete">${window.icon('x', { size: 14 })}</button></span>${resize}`;
    }

    function buildItem(item) {
        const el = document.createElement('div');
        el.className = `scrap-item scrap-${item.type}`;
        el.dataset.item = item.id;
        if (item.type === 'note') {
            el.dataset.colour = item.colour;
            el.innerHTML = '<span class="scrap-pinhead" aria-hidden="true"></span><div class="scrap-note-text"></div>' + controlsHtml(item);
            const text = el.querySelector('.scrap-note-text');
            text.textContent = item.content;
            text.dataset.placeholder = 'Double-click to write';
        } else if (item.type === 'image') {
            el.innerHTML = '<span class="scrap-pinhead" aria-hidden="true"></span>' + controlsHtml(item);
            const img = document.createElement('img');
            img.alt = '';
            img.draggable = false;
            el.insertBefore(img, el.children[1]);
            img.addEventListener('load', () => renderStrings());
            img.addEventListener('error', () => el.classList.add('is-broken'));
            img.src = '/scrapbook-files/' + encodeURIComponent(item.image_path);
        } else {
            el.innerHTML = '<span class="scrap-pin-shape" aria-hidden="true"></span>' + controlsHtml(item);
            el.setAttribute('aria-label', 'Pin');
        }
        placeItem(el, item);
        return el;
    }

    function placeItem(el, item) {
        el.style.left = item.x + 'px';
        el.style.top = item.y + 'px';
        el.style.zIndex = item.z;
        if (item.type !== 'pin') el.style.width = item.w + 'px';
        if (item.type === 'note') el.style.minHeight = item.h ? item.h + 'px' : '';
        el.classList.toggle('is-selected', !!(state.selected && state.selected.kind === 'item' && state.selected.id === item.id));
        el.classList.toggle('is-string-source', state.pendingFrom === item.id);
    }

    function renderItems() {
        const box = itemsEl();
        box.innerHTML = '';
        state.items.forEach((item) => box.appendChild(buildItem(item)));
        renderStrings();
    }

    function refreshItemClasses() {
        state.items.forEach((item) => {
            const el = itemNode(item.id);
            if (el) placeItem(el, item);
        });
    }

    /* Where a string attaches: the pin head at the item's top centre. */
    function anchor(item) {
        const el = itemNode(item.id);
        if (item.type === 'pin') return { x: item.x + 14, y: item.y + 10 };
        const w = el ? el.offsetWidth : item.w;
        return { x: item.x + w / 2, y: item.y + 7 };
    }

    function stringGeometry(a, b) {
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + Math.min(140, dist * 0.18) + 12 };
        return { d: `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`, mid: { x: (a.x + 2 * c.x + b.x) / 4, y: (a.y + 2 * c.y + b.y) / 4 } };
    }

    function renderStrings(cursor) {
        let selectedMid = null;
        const hits = [];
        const parts = state.links.map((link) => {
            const a = itemById(link.from_item), b = itemById(link.to_item);
            if (!a || !b) return '';
            const g = stringGeometry(anchor(a), anchor(b));
            const isSel = state.selected && state.selected.kind === 'link' && state.selected.id === link.id;
            if (isSel) selectedMid = g.mid;
            hits.push(`<path class="scrap-string-hit" data-link="${link.id}" d="${g.d}"></path>`);
            return `<path class="scrap-string${isSel ? ' is-selected' : ''}" d="${g.d}" style="stroke:${link.colour}"></path>`;
        });
        $('scrap-canvas-string-hits').innerHTML = hits.join('');
        if (state.pendingFrom && cursor) {
            const from = itemById(state.pendingFrom);
            if (from) {
                parts.push(`<path class="scrap-string is-pending" d="${stringGeometry(anchor(from), cursor).d}" style="stroke:${state.stringColour}"></path>`);
            }
        }
        $('scrap-canvas-strings').innerHTML = parts.join('');
        linkDeleteBtn.hidden = !selectedMid;
        if (selectedMid) {
            linkDeleteBtn.style.left = selectedMid.x + 'px';
            linkDeleteBtn.style.top = selectedMid.y + 'px';
        }
    }

    function fitItems() {
        if (!state.items.length) {
            view.fit({ minX: -400, maxX: 400, minY: -250, maxY: 250 }, 1);
            return;
        }
        const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        state.items.forEach((item) => {
            const el = itemNode(item.id);
            const w = el ? el.offsetWidth : item.w, h = el ? el.offsetHeight : 160;
            box.minX = Math.min(box.minX, item.x);
            box.minY = Math.min(box.minY, item.y);
            box.maxX = Math.max(box.maxX, item.x + w);
            box.maxY = Math.max(box.maxY, item.y + h);
        });
        view.fit(box, 1);
    }

    /* ── Selection ─────────────────────────────────────────────── */
    function select(sel) {
        state.selected = sel;
        refreshItemClasses();
        renderStrings();
    }

    async function deleteSelected() {
        const sel = state.selected;
        if (!sel) return;
        if (sel.kind === 'item') await deleteItem(sel.id);
        else await deleteLink(sel.id);
    }

    /* ── Items ─────────────────────────────────────────────────── */
    const maxZ = () => state.items.reduce((m, i) => Math.max(m, i.z), 0);

    /* Top-left for a new w x h item: the view centre, or the nearest free
       spot spiralling out from it so new items don't land on old ones. */
    function spawnPoint(w, h) {
        const c = view.center();
        const rects = state.items.map((item) => {
            const el = itemNode(item.id);
            return { x: item.x, y: item.y, w: el ? el.offsetWidth : item.w, h: el ? el.offsetHeight : 120 };
        });
        const free = (x, y) => rects.every((r) =>
            x + w + 16 < r.x || r.x + r.w + 16 < x || y + h + 16 < r.y || r.y + r.h + 16 < y);
        for (let ring = 0; ring < 12; ring++) {
            const steps = ring === 0 ? 1 : ring * 8;
            for (let s = 0; s < steps; s++) {
                const a = (s / steps) * Math.PI * 2;
                const x = Math.round(c.x - w / 2 + Math.cos(a) * ring * 70);
                const y = Math.round(c.y - h / 2 + Math.sin(a) * ring * 50);
                if (free(x, y)) return { x, y };
            }
        }
        return { x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2) };
    }

    async function createItem(payload) {
        try {
            const res = await api(`/api/scrapbook/nodes/${state.node.id}/items`, 'POST', payload);
            state.items.push(res.item);
            itemsEl().appendChild(buildItem(res.item));
            select({ kind: 'item', id: res.item.id });
            return res.item;
        } catch (ex) {
            setStatus(ex.message, true);
            return null;
        }
    }

    async function saveItem(item, fields) {
        try {
            await api(`/api/scrapbook/items/${item.id}`, 'PATCH', fields);
        } catch (ex) {
            setStatus('Could not save: ' + ex.message, true);
        }
    }

    async function addNote() {
        const item = await createItem({ type: 'note', ...spawnPoint(200, 120), w: 200, colour: 'yellow', content: '' });
        if (item) startEditing(item.id);
    }

    function addPin() {
        createItem({ type: 'pin', ...spawnPoint(28, 28) });
    }

    async function deleteItem(id) {
        const item = itemById(id);
        if (!item) return;
        const hasContent = item.type === 'image' || (item.type === 'note' && item.content.trim());
        if (hasContent && !confirm(item.type === 'image' ? 'Delete this image?' : 'Delete this note?')) return;
        try {
            await api(`/api/scrapbook/items/${id}`, 'DELETE');
            state.items = state.items.filter((i) => i.id !== id);
            state.links = state.links.filter((l) => l.from_item !== id && l.to_item !== id);
            const el = itemNode(id);
            if (el) el.remove();
            if (state.pendingFrom === id) state.pendingFrom = null;
            select(null);
        } catch (ex) {
            setStatus(ex.message, true);
        }
    }

    function cycleColour(item) {
        item.colour = NOTE_COLOURS[(NOTE_COLOURS.indexOf(item.colour) + 1) % NOTE_COLOURS.length];
        itemNode(item.id).dataset.colour = item.colour;
        saveItem(item, { colour: item.colour });
    }

    /* Note text: read-only until double-clicked so a press always drags. */
    function startEditing(id) {
        commitEditing();
        const el = itemNode(id);
        const text = el && el.querySelector('.scrap-note-text');
        if (!text) return;
        state.editingId = id;
        try { text.contentEditable = 'plaintext-only'; } catch (e) { text.contentEditable = 'true'; }
        el.classList.add('is-editing');
        text.focus();
        const range = document.createRange();
        range.selectNodeContents(text);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function commitEditing() {
        const id = state.editingId;
        if (id == null) return;
        state.editingId = null;
        const item = itemById(id);
        const el = itemNode(id);
        if (!item || !el) return;
        const text = el.querySelector('.scrap-note-text');
        text.contentEditable = 'false';
        el.classList.remove('is-editing');
        const content = text.innerText.replace(/\n$/, '').slice(0, 4000);
        if (content !== item.content) {
            item.content = content;
            saveItem(item, { content });
        }
    }

    function dragItem(e, el, item) {
        const start = { x: item.x, y: item.y };
        startDrag(e, el, view, {
            onStart: () => {
                item.z = maxZ() + 1;
                el.style.zIndex = item.z;
                el.classList.add('is-dragging');
            },
            onMove: (dx, dy) => {
                item.x = Math.round(start.x + dx);
                item.y = Math.round(start.y + dy);
                el.style.left = item.x + 'px';
                el.style.top = item.y + 'px';
                renderStrings();
            },
            onEnd: (moved) => {
                el.classList.remove('is-dragging');
                if (moved) saveItem(item, { x: item.x, y: item.y, z: item.z });
            },
        });
    }

    function resizeItem(e, handle, el, item) {
        const start = { w: el.offsetWidth, h: el.offsetHeight };
        startDrag(e, handle, view, {
            onMove: (dx, dy) => {
                item.w = Math.round(Math.min(1600, Math.max(item.type === 'image' ? 80 : 120, start.w + dx)));
                el.style.width = item.w + 'px';
                if (item.type === 'note') {
                    item.h = Math.round(Math.min(1600, Math.max(60, start.h + dy)));
                    el.style.minHeight = item.h + 'px';
                }
                renderStrings();
            },
            onEnd: (moved) => {
                if (moved) saveItem(item, item.type === 'note' ? { w: item.w, h: item.h } : { w: item.w });
            },
        });
    }

    function onItemsPointerDown(e) {
        const el = e.target.closest('.scrap-item');
        if (!el || e.button !== 0) return;
        const item = itemById(Number(el.dataset.item));
        if (!item) return;
        if (state.editingId === item.id && e.target.closest('.scrap-note-text')) return;
        if (e.target.closest('.scrap-item-btn')) return;
        if (state.stringMode) {
            e.preventDefault();
            e.stopPropagation();
            pickStringEnd(item);
            return;
        }
        if (state.editingId !== item.id) commitEditing();
        select({ kind: 'item', id: item.id });
        const handle = e.target.closest('[data-resize]');
        if (handle) resizeItem(e, handle, el, item);
        else dragItem(e, el, item);
    }

    /* ── Images ────────────────────────────────────────────────── */
    async function uploadImages(files, at) {
        const images = Array.from(files).filter((f) => IMAGE_EXT[f.type]);
        if (!images.length) {
            setStatus('Only png, jpg, gif or webp images can be added.', true);
            return;
        }
        for (let i = 0; i < images.length; i++) {
            let file = images[i];
            if (!/\.[a-z0-9]+$/i.test(file.name)) file = new File([file], 'pasted.' + IMAGE_EXT[file.type], { type: file.type });
            const form = new FormData();
            form.append('file', file);
            setStatus('Uploading image…');
            try {
                const up = await api('/api/scrapbook/upload', 'POST', form);
                const pos = at ? { x: Math.round(at.x - 120 + i * 30), y: Math.round(at.y - 90 + i * 30) } : spawnPoint(240, 180);
                await createItem({ type: 'image', image_path: up.image_path, w: 240, ...pos });
                setStatus('');
            } catch (ex) {
                setStatus(ex.message, true);
            }
        }
    }

    /* ── Strings ───────────────────────────────────────────────── */
    function setStringMode(on) {
        state.stringMode = on;
        state.pendingFrom = null;
        const btn = $('scrap-string-mode');
        btn.setAttribute('aria-pressed', String(on));
        btn.classList.toggle('is-active', on);
        $('scrap-canvas-stage').classList.toggle('is-stringing', on);
        $('scrap-canvas-hint').textContent = on ? HINTS.first : HINTS.idle;
        if (state.node) {
            refreshItemClasses();
            renderStrings();
        }
    }

    async function pickStringEnd(item) {
        if (!state.pendingFrom || state.pendingFrom === item.id) {
            state.pendingFrom = state.pendingFrom === item.id ? null : item.id;
            $('scrap-canvas-hint').textContent = state.pendingFrom ? HINTS.second : HINTS.first;
            refreshItemClasses();
            renderStrings();
            return;
        }
        const from = state.pendingFrom;
        state.pendingFrom = null;
        $('scrap-canvas-hint').textContent = HINTS.first;
        refreshItemClasses();
        try {
            const res = await api(`/api/scrapbook/nodes/${state.node.id}/links`, 'POST',
                { from_item: from, to_item: item.id, colour: state.stringColour });
            state.links.push(res.link);
        } catch (ex) {
            setStatus(ex.message, true);
        }
        renderStrings();
    }

    async function deleteLink(id) {
        try {
            await api(`/api/scrapbook/links/${id}`, 'DELETE');
            state.links = state.links.filter((l) => l.id !== id);
            select(null);
        } catch (ex) {
            setStatus(ex.message, true);
        }
    }

    function renderSwatches() {
        $('scrap-string-colours').innerHTML = STRING_COLOURS.map((c) =>
            `<button type="button" class="scrap-swatch${c.value === state.stringColour ? ' is-active' : ''}" role="radio"
                aria-checked="${c.value === state.stringColour}" aria-label="${c.label} string" data-swatch="${c.value}"
                style="--swatch:${c.value}"></button>`).join('');
    }

    /* ── Wiring ────────────────────────────────────────────────── */
    function typingInField(target) {
        return target.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]');
    }

    function init(options) {
        opts = options || {};
        const stage = $('scrap-canvas-stage');
        view = createViewport(stage, $('scrap-canvas-world'), {
            onBackgroundDown: () => {
                commitEditing();
                if (state.pendingFrom) {
                    state.pendingFrom = null;
                    $('scrap-canvas-hint').textContent = HINTS.first;
                    refreshItemClasses();
                }
                select(null);
            },
        });

        linkDeleteBtn = document.createElement('button');
        linkDeleteBtn.type = 'button';
        linkDeleteBtn.className = 'scrap-link-delete scrap-ui';
        linkDeleteBtn.setAttribute('aria-label', 'Delete string');
        linkDeleteBtn.innerHTML = window.icon('x', { size: 14 });
        linkDeleteBtn.hidden = true;
        linkDeleteBtn.addEventListener('click', () => {
            if (state.selected && state.selected.kind === 'link') deleteLink(state.selected.id);
        });
        $('scrap-canvas-world').appendChild(linkDeleteBtn);

        const items = itemsEl();
        items.addEventListener('pointerdown', onItemsPointerDown);
        items.addEventListener('dblclick', (e) => {
            const el = e.target.closest('.scrap-note');
            if (el && !state.stringMode) startEditing(Number(el.dataset.item));
        });
        items.addEventListener('click', (e) => {
            const el = e.target.closest('.scrap-item');
            if (!el) return;
            const item = itemById(Number(el.dataset.item));
            if (e.target.closest('[data-delete-item]')) deleteItem(item.id);
            else if (e.target.closest('[data-colour-item]')) cycleColour(item);
        });
        items.addEventListener('focusout', (e) => {
            if (e.target.classList.contains('scrap-note-text')) commitEditing();
        });
        items.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && e.target.classList.contains('scrap-note-text')) {
                e.stopPropagation();
                e.target.blur();
            }
        });

        $('scrap-canvas-string-hits').addEventListener('pointerdown', (e) => {
            const hit = e.target.closest('[data-link]');
            if (!hit || state.stringMode) return;
            e.stopPropagation();
            commitEditing();
            select({ kind: 'link', id: Number(hit.dataset.link) });
        });

        stage.addEventListener('pointermove', (e) => {
            if (state.pendingFrom) renderStrings(view.toWorld(e.clientX, e.clientY));
        });
        stage.addEventListener('dragover', (e) => {
            if (!state.node || !e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            stage.classList.add('is-dropping');
        });
        stage.addEventListener('dragleave', (e) => {
            if (!stage.contains(e.relatedTarget)) stage.classList.remove('is-dropping');
        });
        stage.addEventListener('drop', (e) => {
            if (!state.node) return;
            e.preventDefault();
            stage.classList.remove('is-dropping');
            if (e.dataTransfer.files.length) uploadImages(e.dataTransfer.files, view.toWorld(e.clientX, e.clientY));
        });
        document.addEventListener('paste', (e) => {
            if (!state.node || typingInField(e.target) || (opts.isBlocked && opts.isBlocked())) return;
            const files = Array.from(e.clipboardData.files || []);
            if (files.length) {
                e.preventDefault();
                uploadImages(files);
            }
        });
        document.addEventListener('keydown', (e) => {
            if (!state.node || typingInField(e.target) || (opts.isBlocked && opts.isBlocked())) return;
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (state.selected) {
                    e.preventDefault();
                    deleteSelected();
                }
            } else if (e.key === 'Escape') {
                if (state.stringMode) setStringMode(false);
                else select(null);
            }
        });

        $('scrap-back').addEventListener('click', () => {
            close();
            if (opts.onBack) opts.onBack();
        });
        $('scrap-add-note').addEventListener('click', addNote);
        $('scrap-add-pin').addEventListener('click', addPin);
        $('scrap-add-image').addEventListener('click', () => $('scrap-image-input').click());
        $('scrap-image-input').addEventListener('change', (e) => {
            if (e.target.files.length) uploadImages(e.target.files);
            e.target.value = '';
        });
        $('scrap-string-mode').addEventListener('click', () => setStringMode(!state.stringMode));
        $('scrap-string-colours').addEventListener('click', (e) => {
            const sw = e.target.closest('[data-swatch]');
            if (!sw) return;
            state.stringColour = sw.dataset.swatch;
            renderSwatches();
        });
        renderSwatches();

        stage.querySelectorAll('[data-zoom]').forEach((btn) => btn.addEventListener('click', () => {
            const z = btn.dataset.zoom;
            if (z === 'fit') fitItems(); else view.zoomBy(z === 'in' ? 1.25 : 0.8);
        }));
    }

    window.ScrapCanvas = { init, open, close, isOpen };
})();
