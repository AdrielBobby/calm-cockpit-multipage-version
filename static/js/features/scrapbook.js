/* scrapbook.js - Scrapbook page: boards, the graph view and node-to-project links.
   Clicking a graph node hands over to scrapbook-canvas.js. */
(function () {
    const { $, esc, api, setStatus, openModal, closeModal, anyModalOpen, createViewport, startDrag } = window.Scrap;
    const LAST_BOARD_KEY = 'scrapbook.lastBoard';
    const NEW_CATEGORY = '__new__';
    // Same colours and labels as the Projects modal
    const PROJECT_STATUS = {
        in_progress: { label: 'In progress', colour: 'var(--accent-teal)' },
        planned:     { label: 'Planned',     colour: 'var(--accent-purple)' },
        paused:      { label: 'Paused',      colour: 'var(--accent-yellow)' },
        done:        { label: 'Done',        colour: 'var(--text-muted)' },
    };

    const state = {
        boards: [], categories: [], projects: [],
        board: null, nodes: [],
        editingBoard: null,          // board being edited in the board modal (null = new)
        editingNode: null,           // node being edited in the node modal (null = new)
        deletingCategory: null,      // id of the category whose "move nodes to" row is showing
        view: 'graph',
    };
    let graphView = null;

    const nodeById = (id) => state.nodes.find((n) => n.id === id);
    const rootNode = () => state.nodes.find((n) => n.parent_id == null);
    const categoryColour = (name) => {
        const c = state.categories.find((x) => x.name === name);
        return c ? c.colour : 'var(--text-muted)';
    };

    function storeLastBoard(id) {
        try { localStorage.setItem(LAST_BOARD_KEY, String(id)); } catch (e) { /* storage unavailable */ }
    }
    function readLastBoard() {
        try { return Number(localStorage.getItem(LAST_BOARD_KEY)) || null; } catch (e) { return null; }
    }

    /* ── Loading ───────────────────────────────────────────────── */
    async function loadBoards(selectId) {
        const res = await api('/api/scrapbook/boards');
        state.boards = res.data;
        const has = state.boards.length > 0;
        $('scrap-empty').hidden = has;
        $('scrap-board-bar').hidden = !has;
        if (!has) {
            state.board = null;
            showView('none');
            return;
        }
        const wanted = selectId || (state.board && state.board.id) || readLastBoard();
        const board = state.boards.find((b) => b.id === wanted) || state.boards[0];
        $('scrap-board-select').innerHTML = state.boards.map((b) =>
            `<option value="${b.id}">${esc(b.name)}</option>`).join('');
        await selectBoard(board.id);
    }

    async function selectBoard(id) {
        const changed = !state.board || state.board.id !== id;
        state.board = state.boards.find((b) => b.id === id);
        $('scrap-board-select').value = String(id);
        $('scrap-project-tag').textContent = state.board.project_name ? 'Project: ' + state.board.project_name : '';
        $('scrap-project-tag').hidden = !state.board.project_name;
        storeLastBoard(id);
        await loadNodes();
        if (window.ScrapCanvas.isOpen()) window.ScrapCanvas.close();
        showView('graph');
        if (changed) fitGraph();
    }

    async function loadNodes() {
        const res = await api(`/api/scrapbook/boards/${state.board.id}/nodes`);
        state.nodes = res.data;
        renderGraph();
    }

    async function loadCategories() {
        state.categories = (await api('/api/scrapbook/categories')).data;
    }

    function showView(view) {
        state.view = view;
        $('scrap-graph-stage').hidden = view !== 'graph';
        $('scrap-canvas-stage').hidden = view !== 'canvas';
    }

    /* ── Graph rendering ───────────────────────────────────────── */
    function edgePath(a, b) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const cx = mx + (b.y - a.y) * 0.12, cy = my - (b.x - a.x) * 0.12;
        return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
    }

    function renderEdges() {
        $('scrap-graph-edges').innerHTML = state.nodes.filter((n) => n.parent_id != null).map((n) => {
            const p = nodeById(n.parent_id);
            return p ? `<path class="scrap-edge" d="${edgePath(p, n)}" style="stroke:${esc(categoryColour(n.category))}"></path>` : '';
        }).join('');
    }

    function nodeHtml(n) {
        const isRoot = n.parent_id == null;
        const colour = isRoot ? 'var(--accent-purple)' : categoryColour(n.category);
        const count = n.item_count ? `${n.item_count} item${n.item_count === 1 ? '' : 's'}` : 'Empty';
        const status = PROJECT_STATUS[n.project_status];
        const project = n.project_name
            ? `<span class="scrap-node-project" style="--status:${status ? status.colour : 'var(--text-muted)'}"
                     title="Linked project: ${esc(n.project_name)}${status ? ' (' + status.label + ')' : ''}">
                   <span class="scrap-node-project-dot" aria-hidden="true"></span>${esc(n.project_name)}${status ? ' &middot; ' + status.label : ''}
               </span>`
            : '';
        return `<div class="scrap-node${isRoot ? ' is-root' : ''}" data-node="${n.id}" tabindex="0" role="button"
                    aria-label="Open ${esc(n.title)}" style="left:${n.x}px; top:${n.y}px; --cat:${esc(colour)}">
            <span class="scrap-node-cat">${isRoot ? 'Main' : esc(n.category)}</span>
            <strong class="scrap-node-title">${esc(n.title)}</strong>
            ${project}
            <span class="scrap-node-count">${count}</span>
            <span class="scrap-node-actions">
                <button type="button" class="scrap-node-act" data-add-child="${n.id}" aria-label="Add a node branching from ${esc(n.title)}" title="Add branch">+</button>
                <button type="button" class="scrap-node-act" data-edit-node="${n.id}" aria-label="Edit ${esc(n.title)}" title="Edit">&hellip;</button>
            </span>
        </div>`;
    }

    function renderGraph() {
        $('scrap-graph-nodes').innerHTML = state.nodes.map(nodeHtml).join('');
        renderEdges();
    }

    function fitGraph() {
        if (!state.nodes.length) return;
        const xs = state.nodes.map((n) => n.x), ys = state.nodes.map((n) => n.y);
        graphView.fit({
            minX: Math.min(...xs) - 90, maxX: Math.max(...xs) + 90,
            minY: Math.min(...ys) - 50, maxY: Math.max(...ys) + 50,
        }, 1);
    }

    function onNodePointerDown(e) {
        const el = e.target.closest('.scrap-node');
        if (!el || e.target.closest('.scrap-node-act')) return;
        const node = nodeById(Number(el.dataset.node));
        const start = { x: node.x, y: node.y };
        startDrag(e, el, graphView, {
            onStart: () => el.classList.add('is-dragging'),
            onMove: (dx, dy) => {
                node.x = Math.round(start.x + dx);
                node.y = Math.round(start.y + dy);
                el.style.left = node.x + 'px';
                el.style.top = node.y + 'px';
                renderEdges();
            },
            onEnd: async (moved) => {
                el.classList.remove('is-dragging');
                if (!moved) { openCanvas(node); return; }
                try {
                    await api(`/api/scrapbook/nodes/${node.id}`, 'PATCH', { x: node.x, y: node.y });
                } catch (err) {
                    setStatus(err.message, true);
                }
            },
        });
    }

    function openCanvas(node) {
        showView('canvas');
        window.ScrapCanvas.open(node);
    }

    /* ── Auto-placement ────────────────────────────────────────────
       Fan new nodes out around their parent, pointing away from the
       grandparent, and pick the least crowded spot. No physics. */
    function placeNear(parent) {
        const grand = parent.parent_id != null ? nodeById(parent.parent_id) : null;
        const outward = grand ? Math.atan2(parent.y - grand.y, parent.x - grand.x) : -Math.PI / 2;
        const spread = grand ? [0, 1, -1, 2, -2, 3, -3] : [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6];
        const step = grand ? Math.PI / 7 : Math.PI / 6;
        const clearance = (x, y) => state.nodes.reduce((min, n) => Math.min(min, Math.hypot((n.x - x) / 1.6, n.y - y)), Infinity);
        let best = null;
        for (const radius of [200, 280, 360]) {
            for (const s of spread) {
                const a = outward + s * step;
                const x = Math.round(parent.x + Math.cos(a) * radius * 1.3);
                const y = Math.round(parent.y + Math.sin(a) * radius);
                const score = clearance(x, y);
                if (score >= 110) return { x, y };
                if (!best || score > best.score) best = { x, y, score };
            }
        }
        return { x: best.x, y: best.y };
    }

    /* ── Node modal ────────────────────────────────────────────── */
    function fillCategorySelect(selected) {
        $('scrap-node-category').innerHTML = state.categories.map((c) =>
            `<option value="${esc(c.name)}"${c.name === selected ? ' selected' : ''}>${esc(c.name)}</option>`).join('')
            + `<option value="${NEW_CATEGORY}">+ New category&hellip;</option>`;
        $('scrap-node-newcat-field').hidden = true;
    }

    function openNodeModal(node, parentId) {
        state.editingNode = node || null;
        const isRoot = node && node.parent_id == null;
        $('scrap-node-title').textContent = node ? 'Edit node' : 'Add node';
        $('scrap-node-name').value = node ? node.title : '';
        $('scrap-node-name').maxLength = isRoot ? 60 : 40;
        fillCategorySelect(node ? node.category : state.categories[0] && state.categories[0].name);
        $('scrap-node-category-field').hidden = !!isRoot;
        $('scrap-node-parent-field').hidden = !!node;
        if (!node) {
            const parent = parentId || rootNode().id;
            $('scrap-node-parent').innerHTML = state.nodes.map((n) =>
                `<option value="${n.id}"${n.id === parent ? ' selected' : ''}>${esc(n.title)}</option>`).join('');
        }
        $('scrap-node-delete').hidden = !node || isRoot;
        $('scrap-node-newcat').value = '';
        $('scrap-node-error').textContent = '';
        openModal('scrap-node-modal');
        fillProjectSelect(node);
    }

    /* Projects linked to other nodes are disabled: one node per project across all boards. */
    async function fillProjectSelect(node) {
        const select = $('scrap-node-project');
        const current = node ? node.project_id : null;
        select.innerHTML = '<option value="">No project</option>';
        select.disabled = true;
        let links = [];
        try {
            [state.projects, links] = await Promise.all([
                api('/api/projects-data').then((r) => r.data),
                api('/api/scrapbook/project-links').then((r) => r.data),
            ]);
        } catch (ex) {
            state.projects = [];
            $('scrap-node-error').textContent = 'Could not load projects: ' + ex.message;
        }
        if (state.editingNode !== (node || null)) return;    // modal was reopened meanwhile
        const taken = new Map(links.filter((l) => !node || l.node_id !== node.id).map((l) => [l.project_id, l]));
        select.innerHTML = '<option value="">No project</option>' + state.projects.map((p) => {
            const owner = taken.get(p.id);
            const where = owner ? ` (linked to ${esc(owner.title)} on ${esc(owner.board)})` : '';
            return `<option value="${p.id}"${owner ? ' disabled' : ''}${p.id === current ? ' selected' : ''}>${esc(p.name)}${where}</option>`;
        }).join('');
        select.disabled = false;
    }

    async function resolveCategory() {
        const picked = $('scrap-node-category').value;
        if (picked !== NEW_CATEGORY) return picked;
        const name = $('scrap-node-newcat').value.trim();
        if (!name) throw new Error('Give the new category a name.');
        const res = await api('/api/scrapbook/categories', 'POST', { name });
        await loadCategories();
        return res.name;
    }

    async function saveNode(e) {
        e.preventDefault();
        const title = $('scrap-node-name').value.trim();
        const err = $('scrap-node-error');
        if (!title) { err.textContent = 'Give the node a title.'; return; }
        const projectSelect = $('scrap-node-project');
        try {
            const node = state.editingNode;
            // While projects are still loading, leave the link as it was.
            const link = projectSelect.disabled ? {}
                : { project_id: projectSelect.value ? Number(projectSelect.value) : null };
            if (node && node.parent_id == null) {
                // The main node's title is the board name (up to 60 characters), saved on the board.
                if ('project_id' in link) await api(`/api/scrapbook/nodes/${node.id}`, 'PATCH', link);
                await api(`/api/scrapbook/boards/${state.board.id}`, 'PATCH', { name: title });
                closeModal('scrap-node-modal');
                await loadBoards(state.board.id);
                return;
            }
            const category = await resolveCategory();
            if (node) {
                await api(`/api/scrapbook/nodes/${node.id}`, 'PATCH', { title, category, ...link });
            } else {
                const parent = nodeById(Number($('scrap-node-parent').value));
                const pos = placeNear(parent);
                await api(`/api/scrapbook/boards/${state.board.id}/nodes`, 'POST',
                    { title, category, parent_id: parent.id, x: pos.x, y: pos.y, ...link });
            }
            closeModal('scrap-node-modal');
            await loadNodes();
        } catch (ex) {
            err.textContent = ex.message;
        }
    }

    async function deleteNode() {
        const node = state.editingNode;
        if (!node) return;
        const below = countDescendants(node.id);
        const extra = below ? ` and the ${below} node${below === 1 ? '' : 's'} branching from it` : '';
        if (!confirm(`Delete "${node.title}"${extra}? Everything pinned on ${below ? 'them' : 'it'} is deleted too.`)) return;
        try {
            await api(`/api/scrapbook/nodes/${node.id}`, 'DELETE');
            closeModal('scrap-node-modal');
            await loadNodes();
            setStatus('Node deleted.');
        } catch (ex) {
            $('scrap-node-error').textContent = ex.message;
        }
    }

    function countDescendants(id) {
        const kids = state.nodes.filter((n) => n.parent_id === id);
        return kids.reduce((sum, k) => sum + 1 + countDescendants(k.id), 0);
    }

    /* ── Categories modal ──────────────────────────────────────────
       Custom categories can be renamed or deleted; built-in ones are
       read-only. Nodes store the category name, so the server renames
       or reassigns them in the same request. */
    const nodeCount = (n) => `${n} node${n === 1 ? '' : 's'}`;

    function categoryRow(c) {
        if (state.deletingCategory === c.id) {
            const others = state.categories.filter((o) => o.id !== c.id);
            return `<div class="scrap-cat-row is-deleting" data-cat="${c.id}" style="--cat:${esc(c.colour)}">
                <span class="scrap-cat-move">Move its ${nodeCount(c.node_count)} to</span>
                <select class="acad-input" data-cat-move aria-label="Category to move ${esc(c.name)}'s nodes to">
                    ${others.map((o) => `<option value="${esc(o.name)}">${esc(o.name)}</option>`).join('')}
                </select>
                <span class="scrap-cat-row-actions">
                    <button type="button" class="acad-btn gym-btn-danger" data-cat-confirm>Delete</button>
                    <button type="button" class="acad-btn acad-btn-ghost" data-cat-cancel>Cancel</button>
                </span>
            </div>`;
        }
        return `<div class="scrap-cat-row" data-cat="${c.id}" style="--cat:${esc(c.colour)}">
            <span class="scrap-cat-dot" aria-hidden="true"></span>
            <input class="acad-input acad-name" type="text" maxlength="24" value="${esc(c.name)}"
                   data-cat-name aria-label="Rename category ${esc(c.name)}">
            <span class="scrap-cat-count">${c.node_count ? nodeCount(c.node_count) : 'Unused'}</span>
            <button type="button" class="acad-icon-btn" data-cat-delete aria-label="Delete category ${esc(c.name)}">${window.icon('x', { size: 16 })}</button>
        </div>`;
    }

    function renderCategories() {
        const custom = state.categories.filter((c) => !c.is_preset);
        $('scrap-cat-list').innerHTML = custom.length
            ? custom.map(categoryRow).join('')
            : '<p class="gym-hint">No custom categories yet. Add one below or from the node dialog.</p>';
        $('scrap-cat-presets').innerHTML = state.categories.filter((c) => c.is_preset).map((c) =>
            `<span class="scrap-cat-chip" style="--cat:${esc(c.colour)}"><span class="scrap-cat-dot" aria-hidden="true"></span>${esc(c.name)}</span>`).join('');
    }

    async function openCategoryModal() {
        state.deletingCategory = null;
        $('scrap-cat-error').textContent = '';
        $('scrap-cat-new').value = '';
        renderCategories();
        openModal('scrap-cat-modal');
        $('scrap-cat-new').focus();
        try {
            await loadCategories();    // refresh node counts
            renderCategories();
        } catch (ex) {
            $('scrap-cat-error').textContent = ex.message;
        }
    }

    /* Reload categories, and the graph too since node labels and colours use them. */
    async function afterCategoryChange() {
        state.deletingCategory = null;
        await loadCategories();
        renderCategories();
        if (state.board) await loadNodes();
    }

    async function categoryAction(fn) {
        $('scrap-cat-error').textContent = '';
        try {
            await fn();
        } catch (ex) {
            $('scrap-cat-error').textContent = ex.message;
        }
    }

    function renameCategory(input) {
        const cat = state.categories.find((c) => c.id === Number(input.closest('[data-cat]').dataset.cat));
        const name = input.value.trim();
        if (!cat || name === cat.name) return;
        if (!name) { input.value = cat.name; return; }
        categoryAction(async () => {
            try {
                await api(`/api/scrapbook/categories/${cat.id}`, 'PATCH', { name });
            } catch (ex) {
                input.value = cat.name;
                throw ex;
            }
            await afterCategoryChange();
            setStatus(`Category renamed to "${name}".`);
        });
    }

    function deleteCategory(id, moveTo) {
        const cat = state.categories.find((c) => c.id === id);
        if (!cat) return;
        if (cat.node_count && moveTo === undefined) {
            state.deletingCategory = id;       // ask where its nodes should go first
            renderCategories();
            const select = $('scrap-cat-list').querySelector('[data-cat-move]');
            if (select) select.focus();
            return;
        }
        if (!cat.node_count && !confirm(`Delete the category "${cat.name}"?`)) return;
        categoryAction(async () => {
            await api(`/api/scrapbook/categories/${id}`, 'DELETE', moveTo ? { move_to: moveTo } : {});
            await afterCategoryChange();
            setStatus(moveTo ? `Category deleted. Its nodes are now "${moveTo}".` : 'Category deleted.');
        });
    }

    function addCategory(e) {
        e.preventDefault();
        const input = $('scrap-cat-new');
        const name = input.value.trim();
        if (!name) { input.focus(); return; }
        categoryAction(async () => {
            await api('/api/scrapbook/categories', 'POST', { name });
            input.value = '';
            await afterCategoryChange();
        });
    }

    function bindCategories() {
        $('scrap-manage-cats').addEventListener('click', openCategoryModal);
        $('scrap-cat-add-form').addEventListener('submit', addCategory);
        const list = $('scrap-cat-list');
        list.addEventListener('change', (e) => {
            if (e.target.matches('[data-cat-name]')) renameCategory(e.target);
        });
        list.addEventListener('keydown', (e) => {
            if (!e.target.matches('[data-cat-name]')) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                e.target.blur();               // blur fires "change", which saves
            } else if (e.key === 'Escape') {
                e.target.value = e.target.defaultValue;   // discard the edit before the modal closes
            }
        });
        list.addEventListener('click', (e) => {
            const row = e.target.closest('[data-cat]');
            if (!row || !e.target.closest('button')) return;
            $('scrap-cat-error').textContent = '';
            const id = Number(row.dataset.cat);
            if (e.target.closest('[data-cat-delete]')) deleteCategory(id);
            if (e.target.closest('[data-cat-confirm]')) deleteCategory(id, row.querySelector('[data-cat-move]').value);
            if (e.target.closest('[data-cat-cancel]')) {
                state.deletingCategory = null;
                renderCategories();
            }
        });
    }

    /* ── Board modal ───────────────────────────────────────────── */
    function openBoardModal(board) {
        state.editingBoard = board || null;
        $('scrap-board-title').textContent = board ? 'Board settings' : 'New board';
        $('scrap-board-name').value = board ? board.name : '';
        $('scrap-board-delete').hidden = !board;
        $('scrap-board-error').textContent = '';
        openModal('scrap-board-modal');
    }

    async function saveBoard(e) {
        e.preventDefault();
        const name = $('scrap-board-name').value.trim();
        const err = $('scrap-board-error');
        if (!name) { err.textContent = 'Give the board a name.'; return; }
        const body = { name };
        try {
            let id;
            if (state.editingBoard) {
                id = state.editingBoard.id;
                await api(`/api/scrapbook/boards/${id}`, 'PATCH', body);
            } else {
                id = (await api('/api/scrapbook/boards', 'POST', body)).id;
            }
            closeModal('scrap-board-modal');
            await loadBoards(id);
            setStatus(state.editingBoard ? 'Board saved.' : 'Board created. Add nodes to branch it out.');
        } catch (ex) {
            err.textContent = ex.message;
        }
    }

    async function deleteBoard() {
        const board = state.editingBoard;
        if (!board || !confirm(`Delete the board "${board.name}" with all its nodes, notes and images? This cannot be undone.`)) return;
        try {
            await api(`/api/scrapbook/boards/${board.id}`, 'DELETE');
            closeModal('scrap-board-modal');
            state.board = null;
            await loadBoards();
            setStatus('Board deleted.');
        } catch (ex) {
            $('scrap-board-error').textContent = ex.message;
        }
    }

    /* ── Wiring ────────────────────────────────────────────────── */
    function bind() {
        graphView = createViewport($('scrap-graph-stage'), $('scrap-graph-world'));

        $('scrap-new-board').addEventListener('click', () => openBoardModal(null));
        $('scrap-empty-new').addEventListener('click', () => openBoardModal(null));
        $('scrap-board-settings').addEventListener('click', () => openBoardModal(state.board));
        $('scrap-board-select').addEventListener('change', (e) => {
            selectBoard(Number(e.target.value)).catch((ex) => setStatus(ex.message, true));
        });
        $('scrap-board-form').addEventListener('submit', saveBoard);
        $('scrap-board-delete').addEventListener('click', deleteBoard);

        $('scrap-add-node').addEventListener('click', () => openNodeModal(null));
        $('scrap-node-form').addEventListener('submit', saveNode);
        $('scrap-node-delete').addEventListener('click', deleteNode);
        $('scrap-node-category').addEventListener('change', (e) => {
            const isNew = e.target.value === NEW_CATEGORY;
            $('scrap-node-newcat-field').hidden = !isNew;
            if (isNew) $('scrap-node-newcat').focus();
        });
        bindCategories();

        const nodesEl = $('scrap-graph-nodes');
        nodesEl.addEventListener('pointerdown', onNodePointerDown);
        nodesEl.addEventListener('click', (e) => {
            const add = e.target.closest('[data-add-child]');
            const edit = e.target.closest('[data-edit-node]');
            if (add) openNodeModal(null, Number(add.dataset.addChild));
            if (edit) openNodeModal(nodeById(Number(edit.dataset.editNode)));
        });
        nodesEl.addEventListener('keydown', (e) => {
            const el = e.target.classList.contains('scrap-node') ? e.target : null;
            if (el && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                openCanvas(nodeById(Number(el.dataset.node)));
            }
        });

        $('scrap-graph-stage').querySelectorAll('[data-zoom]').forEach((btn) => btn.addEventListener('click', () => {
            const z = btn.dataset.zoom;
            if (z === 'fit') fitGraph(); else graphView.zoomBy(z === 'in' ? 1.25 : 0.8);
        }));

        document.querySelectorAll('[data-close-modal]').forEach((btn) => btn.addEventListener('click', () =>
            closeModal(btn.closest('.modal-overlay').id)));
        document.querySelectorAll('.modal-overlay').forEach((overlay) => overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal(overlay.id);
        }));
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const open = document.querySelector('.modal-overlay.active');
            if (open) closeModal(open.id);
        });

        window.ScrapCanvas.init({
            onBack: async () => {
                showView('graph');
                try { await loadNodes(); } catch (ex) { setStatus(ex.message, true); }
            },
            isBlocked: anyModalOpen,
        });
    }

    async function init() {
        bind();
        try {
            await loadCategories();
            await loadBoards();
        } catch (ex) {
            setStatus('Could not load the scrapbook: ' + ex.message, true);
        }
    }

    init();
})();
