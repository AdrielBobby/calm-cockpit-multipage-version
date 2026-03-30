window.loadProjectsModal = async function(modalBody) {
    modalBody.innerHTML = '<p style="color: var(--text-muted);">Fetching projects...</p>';
    try {
        const response = await fetch('/api/projects-data');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        
        if (result.status !== 'success' || !Array.isArray(result.data)) {
            throw new Error(result.message || "Invalid data received from server");
        }
        
        let html = '<div style="display: flex; gap: 24px; flex-direction: column;">';
        
        // 1. Add Project Form
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

        // 2. Projects List
        html += `<div id="projects-list-container" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">`;
        result.data.forEach(proj => {
            const statusColors = {
                'in_progress': 'var(--accent-teal)',
                'planned': 'var(--accent-purple)',
                'paused': 'var(--accent-yellow)',
                'done': 'var(--text-muted)'
            };
            const color = statusColors[proj.status] || 'var(--text-muted)';
            
            html += `
                <div class="project-card" data-id="${proj.id}" style="background: rgba(255,255,255,0.02); padding: 16px; border-radius: 12px; border: 1px solid var(--card-border); display: flex; flex-direction: column; gap: 12px; cursor: pointer; transition: transform 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <strong style="font-size: 1.1rem;" onclick="toggleProjectLogs(${proj.id}, event)">${proj.name}</strong>
                        <button onclick="deleteProject(${proj.id}, event)" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem;">&times;</button>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <select onchange="updateProjectStatus(${proj.id}, this.value)" onclick="event.stopPropagation()" style="background: var(--bg-color); border: 1px solid var(--card-border); color: ${color}; font-weight: 600; font-size: 0.8rem; padding: 4px 8px; border-radius: 6px;">
                            <option value="planned" ${proj.status === 'planned' ? 'selected' : ''}>Planned</option>
                            <option value="in_progress" ${proj.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                            <option value="paused" ${proj.status === 'paused' ? 'selected' : ''}>Paused</option>
                            <option value="done" ${proj.status === 'done' ? 'selected' : ''}>Done</option>
                        </select>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Last updated: ${new Date(proj.last_updated).toLocaleDateString()}</span>
                    </div>
                    <div id="logs-${proj.id}" style="display: none; border-top: 1px solid var(--card-border); padding-top: 12px; margin-top: 8px;">
                        <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                            <input type="text" id="log-note-${proj.id}" placeholder="What did you do?" onclick="event.stopPropagation()" style="flex: 1; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 6px 10px; border-radius: 6px; font-size: 0.8rem;">
                            <button onclick="addProjectLog(${proj.id}, event)" style="background: var(--accent-teal); color: var(--bg-color); border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 0.8rem;">Log</button>
                        </div>
                        <div id="logs-list-${proj.id}" style="display: flex; flex-direction: column; gap: 8px; max-height: 200px; overflow-y: auto;">
                            <!-- Logs will be loaded here -->
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div></div>';
        modalBody.innerHTML = html;
        
    } catch (error) {
        console.error(error);
        modalBody.innerHTML = `<p style="color: var(--accent-red);">Error loading projects: ${error.message}</p>`;
    }
};

window.toggleProjectLogs = async function(id, event) {
    if (event) event.stopPropagation();
    const logsDiv = document.getElementById(`logs-${id}`);
    if (logsDiv.style.display === 'none') {
        logsDiv.style.display = 'block';
        loadLogsForProject(id);
    } else {
        logsDiv.style.display = 'none';
    }
};

async function loadLogsForProject(id) {
    const listDiv = document.getElementById(`logs-list-${id}`);
    listDiv.innerHTML = '<p style="color: var(--text-muted); font-size: 0.75rem;">Loading logs...</p>';
    try {
        const response = await fetch(`/api/projects/${id}/logs`);
        const result = await response.json();
        if (result.status === 'success') {
            if (result.data.length === 0) {
                listDiv.innerHTML = '<p style="color: var(--text-muted); font-size: 0.75rem;">No logs yet.</p>';
            } else {
                listDiv.innerHTML = result.data.map(log => `
                    <div style="font-size: 0.8rem; background: rgba(255,255,255,0.01); padding: 8px; border-radius: 6px; border-left: 2px solid var(--accent-purple);">
                        <div style="color: var(--text-muted); font-size: 0.7rem; margin-bottom: 2px;">${new Date(log.date).toLocaleString()}</div>
                        <div>${log.note}</div>
                    </div>
                `).join('');
            }
        }
    } catch (e) {
        listDiv.innerHTML = '<p style="color: var(--accent-red); font-size: 0.75rem;">Error loading logs.</p>';
    }
}

window.addProjectLog = async function(id, event) {
    if (event) event.stopPropagation();
    const noteInput = document.getElementById(`log-note-${id}`);
    const note = noteInput.value;
    if (!note) return;
    try {
        const response = await fetch(`/api/projects/${id}/logs`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ note: note })
        });
        if (response.ok) {
            noteInput.value = '';
            loadLogsForProject(id);
            if (window.refreshProjectsSnapshot) window.refreshProjectsSnapshot();
        }
    } catch (e) { alert("Error adding log"); }
};

window.addNewProject = async function() {
    const name = document.getElementById('new-proj-name').value;
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
            // Keep the logs visible if they were open
            const wasOpen = document.getElementById(`logs-${id}`).style.display === 'block';
            await window.loadProjectsModal(document.getElementById('modal-body'));
            if (wasOpen) {
                document.getElementById(`logs-${id}`).style.display = 'block';
                loadLogsForProject(id);
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
