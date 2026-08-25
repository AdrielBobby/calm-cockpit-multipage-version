/* ─────────────────────────────────────────────────────────────────
   projects-modal.js
   Handles the Projects modal with a list → detail drill-down flow.

   States:
     List view   — shows all project cards + Add Project form.
     Detail view — full-width panel for a single project (logs, status).
   
   Data is cached in window.projectsListData to avoid re-fetching
   when the user navigates back from the detail view.
   ───────────────────────────────────────────────────────────────── */

// ── Status helpers ────────────────────────────────────────────────
const STATUS_COLORS = {
    'in_progress': 'var(--accent-teal)',
    'planned':     'var(--accent-purple)',
    'paused':      'var(--accent-yellow)',
    'done':        'var(--text-muted)'
};

const STATUS_BG = {
    'in_progress': 'rgba(6, 214, 160, 0.12)',
    'planned':     'rgba(167, 139, 250, 0.12)',
    'paused':      'rgba(245, 158, 11, 0.12)',
    'done':        'rgba(148, 163, 184, 0.08)'
};

const STATUS_LABELS = {
    'in_progress': 'In Progress',
    'planned':     'Planned',
    'paused':      'Paused',
    'done':        'Done'
};

// ── Main loader (fetches, caches, renders list) ───────────────────
window.loadProjectsModal = async function(modalBody) {
    modalBody.innerHTML = '<p style="color: var(--text-muted);">Fetching projects...</p>';
    try {
        const response = await fetch('/api/projects-data');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        if (result.status !== 'success' || !Array.isArray(result.data)) {
            throw new Error(result.message || "Invalid data received from server");
        }
        window.projectsListData = result.data;
        renderProjectsList(modalBody, result.data);
    } catch (error) {
        console.error(error);
        modalBody.innerHTML = `<p style="color: var(--accent-red);">Error loading projects: ${error.message}</p>`;
    }
};

// ── List view renderer ────────────────────────────────────────────
function renderProjectsList(modalBody, projects) {
    let html = '<div style="display: flex; gap: 24px; flex-direction: column;">';

    // Add Project form
    html += `
        <div style="background: rgba(255,255,255,0.02); padding: 16px; border-radius: 12px; border: 1px solid var(--card-border);">
            <div style="display: flex; gap: 12px; align-items: flex-end;">
                <div style="flex: 1;">
                    <label style="display:block; font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">Project Name</label>
                    <input type="text" id="new-proj-name" placeholder="e.g. My Awesome App" style="width: 100%; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 8px; border-radius: 6px;">
                </div>
                <div style="width: 120px;">
                    <label style="display:block; font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">Status</label>
                    <select id="new-proj-status" style="width: 100%; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 8px; border-radius: 6px;">
                        <option value="planned">Planned</option>
                        <option value="in_progress">In Progress</option>
                        <option value="paused">Paused</option>
                        <option value="done">Done</option>
                    </select>
                </div>
                <button onclick="addNewProject()" style="background: var(--accent-purple); color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer;">Add Project</button>
            </div>
        </div>
    `;

    // Project cards grid
    html += `<div id="projects-list-container" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">`;

    if (projects.length === 0) {
        html += `<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center; padding: 32px;">No projects yet — add one above to get started.</p>`;
    } else {
        projects.forEach(proj => {
            const color = STATUS_COLORS[proj.status] || 'var(--text-muted)';
            const bg    = STATUS_BG[proj.status]    || 'rgba(148, 163, 184, 0.08)';
            const label = STATUS_LABELS[proj.status] || proj.status;

            html += `
                <div class="project-card"
                     data-id="${proj.id}"
                     onclick="renderProjectDetail(${proj.id})"
                     style="background: rgba(255,255,255,0.02); padding: 16px; border-radius: 12px; border: 1px solid var(--card-border); display: flex; flex-direction: column; gap: 12px; cursor: pointer; transition: border-color 0.2s, background 0.2s;"
                     onmouseenter="this.style.borderColor='rgba(255,255,255,0.12)'; this.style.background='rgba(255,255,255,0.035)';"
                     onmouseleave="this.style.borderColor='var(--card-border)'; this.style.background='rgba(255,255,255,0.02)';">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                        <strong style="font-size: 1rem; line-height: 1.3;">${proj.name}</strong>
                        <button onclick="deleteProject(${proj.id}, event)" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem; flex-shrink: 0; min-width: 32px; min-height: 32px; display:flex; align-items:center; justify-content:center; border-radius: 6px; transition: color 0.2s, background 0.2s;"
                                onmouseenter="this.style.color='var(--accent-red)'; this.style.background='rgba(239,68,68,0.1)';"
                                onmouseleave="this.style.color='var(--text-muted)'; this.style.background='transparent';">&times;</button>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="project-status-badge" style="background: ${bg}; color: ${color}; border: 1px solid ${color}30;">${label}</span>
                        <span style="font-size: 0.72rem; color: var(--text-muted);">Updated ${new Date(proj.last_updated).toLocaleDateString()}</span>
                    </div>
                    <div style="font-size: 0.78rem; color: var(--text-muted); display:flex; align-items:center; gap:4px;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        Click to view logs &amp; details
                    </div>
                </div>
            `;
        });
    }

    html += '</div></div>';
    modalBody.innerHTML = html;
}

// ── Detail view renderer ──────────────────────────────────────────
window.renderProjectDetail = async function(id) {
    const modalBody = document.getElementById('modal-body');
    const proj = (window.projectsListData || []).find(p => p.id === id);
    if (!proj) return;

    const color = STATUS_COLORS[proj.status] || 'var(--text-muted)';
    const bg    = STATUS_BG[proj.status]    || 'rgba(148, 163, 184, 0.08)';
    const label = STATUS_LABELS[proj.status] || proj.status;

    modalBody.innerHTML = `
        <button class="back-btn" onclick="backToProjectList()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            Back to Projects
        </button>

        <div style="margin-bottom: 24px;">
            <h2 style="font-size: 1.4rem; font-weight: 700; margin-bottom: 12px;">${proj.name}</h2>
            <div class="project-detail-meta">
                <span class="project-status-badge" style="background: ${bg}; color: ${color}; border: 1px solid ${color}30;">${label}</span>
                <span style="font-size: 0.78rem; color: var(--text-muted);">Last updated: ${new Date(proj.last_updated).toLocaleDateString()}</span>
            </div>

            <p class="project-description" style="font-size: 0.9rem; line-height: 1.5; margin-bottom: 20px;">
                ${proj.description || ''}
            </p>

            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <label style="font-size: 0.75rem; color: var(--text-muted);">Change status:</label>
                <select onchange="updateProjectStatus(${proj.id}, this.value)"
                        style="background: var(--bg-color); border: 1px solid var(--card-border); color: ${color}; font-weight: 600; font-size: 0.8rem; padding: 6px 10px; border-radius: 6px; cursor: pointer;">
                    <option value="planned"     ${proj.status === 'planned'     ? 'selected' : ''}>Planned</option>
                    <option value="in_progress" ${proj.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                    <option value="paused"      ${proj.status === 'paused'      ? 'selected' : ''}>Paused</option>
                    <option value="done"        ${proj.status === 'done'        ? 'selected' : ''}>Done</option>
                </select>
            </div>
        </div>

        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 12px; padding: 20px;">
            <h3 style="margin-bottom: 16px; font-size: 1rem;">Project Log</h3>

            <div style="display: flex; gap: 8px; margin-bottom: 20px;">
                <input type="text" id="detail-log-note-${proj.id}"
                       placeholder="What did you work on?"
                       style="flex: 1; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 8px 12px; border-radius: 8px; font-size: 0.88rem;">
                <button onclick="addProjectLogFromDetail(${proj.id})"
                        style="background: var(--accent-teal); color: var(--bg-color); border: none; padding: 8px 16px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 0.85rem; white-space: nowrap;">
                    Add Log
                </button>
            </div>

            <div id="detail-logs-list-${proj.id}" style="display: flex; flex-direction: column; gap: 10px;">
                <p style="color: var(--text-muted); font-size: 0.85rem;">Loading logs...</p>
            </div>
        </div>
    `;

    _loadDetailLogs(proj.id);
    // Store the currently open detail project id
    window._openDetailProjectId = id;

    // Wire up Enter key for the log input
    const logInputEl = document.getElementById(`detail-log-note-${id}`);
    if (logInputEl) {
        logInputEl.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.addProjectLogFromDetail(id);
            }
        });
    }
};

// ── Back to list (re-renders from cache, no re-fetch) ─────────────
window.backToProjectList = function() {
    const modalBody = document.getElementById('modal-body');
    if (window.projectsListData) {
        renderProjectsList(modalBody, window.projectsListData);
    } else {
        window.loadProjectsModal(modalBody);
    }
    window._openDetailProjectId = null;
};

// ── Loads logs into the detail view ──────────────────────────────
async function _loadDetailLogs(id) {
    const listDiv = document.getElementById(`detail-logs-list-${id}`);
    if (!listDiv) return;
    try {
        const response = await fetch(`/api/projects/${id}/logs`);
        const result = await response.json();
        if (result.status === 'success') {
            if (result.data.length === 0) {
                listDiv.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 24px 0;">No logs yet — add your first entry above!</p>';
            } else {
                listDiv.innerHTML = result.data.map(log => `
                    <div style="background: rgba(255,255,255,0.015); border: 1px solid var(--card-border); border-left: 3px solid var(--accent-purple); padding: 12px 14px; border-radius: 8px;">
                        <div style="color: var(--text-muted); font-size: 0.72rem; margin-bottom: 6px;">${new Date(log.date).toLocaleString()}</div>
                        <div style="font-size: 0.88rem; line-height: 1.5;">${log.note}</div>
                    </div>
                `).join('');
            }
        }
    } catch (e) {
        if (listDiv) listDiv.innerHTML = '<p style="color: var(--accent-red); font-size: 0.85rem;">Error loading logs.</p>';
    }
}

// ── Add log from detail view ──────────────────────────────────────
window.addProjectLogFromDetail = async function(id) {
    const noteInput = document.getElementById(`detail-log-note-${id}`);
    const note = noteInput?.value?.trim();
    if (!note) return;
    try {
        const response = await fetch(`/api/projects/${id}/logs`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ note: note })
        });
        if (response.ok) {
            noteInput.value = '';
            _loadDetailLogs(id);
            if (window.refreshProjectsSnapshot) window.refreshProjectsSnapshot();
            noteInput.focus();
        }
    } catch (e) { alert("Error adding log"); }
};

// ── Project CRUD ──────────────────────────────────────────────────
window.addNewProject = async function() {
    const name   = document.getElementById('new-proj-name').value;
    const status = document.getElementById('new-proj-status').value;
    if (!name) return;
    try {
        const response = await fetch('/api/projects/add', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name: name, status: status })
        });
        if (response.ok) {
            window.loadProjectsModal(document.getElementById('modal-body'));
            if (window.refreshProjectsSnapshot) window.refreshProjectsSnapshot();
        }
    } catch (e) { alert("Error adding project"); }
};

window.updateProjectStatus = async function(id, status) {
    try {
        const response = await fetch(`/api/projects/${id}/status`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ status: status })
        });
        if (response.ok) {
            // Update local cache
            if (window.projectsListData) {
                const p = window.projectsListData.find(p => p.id === id);
                if (p) p.status = status;
            }
            // If on detail view, refresh it; otherwise refresh list
            if (window._openDetailProjectId === id) {
                window.renderProjectDetail(id);
            } else {
                window.loadProjectsModal(document.getElementById('modal-body'));
            }
            if (window.refreshProjectsSnapshot) window.refreshProjectsSnapshot();
        }
    } catch (e) { alert("Error updating status"); }
};

window.deleteProject = async function(id, event) {
    if (event) event.stopPropagation();
    if (!confirm("Delete this project and all its logs?")) return;
    try {
        const response = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
        if (response.ok) {
            window.loadProjectsModal(document.getElementById('modal-body'));
            if (window.refreshProjectsSnapshot) window.refreshProjectsSnapshot();
        }
    } catch (e) { alert("Error deleting project"); }
};
