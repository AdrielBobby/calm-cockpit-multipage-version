window.loadCalendarModal = async function(modalBody) {
    modalBody.innerHTML = '<p style="color: var(--text-muted);">Fetching calendar...</p>';
    try {
        const response = await fetch('/api/calendar/events');
        const result = await response.json();
        
        const now = new Date();
        if (window.targetCalendarDate) {
            const [y, m, d] = window.targetCalendarDate.split('-').map(Number);
            window.calCurrentYear = y;
            window.calCurrentMonth = m - 1;
        } else if (window.calCurrentYear === undefined) {
            window.calCurrentYear = now.getFullYear();
            window.calCurrentMonth = now.getMonth();
        }

        renderCompactCalendarUI(modalBody, result.data);
        
        if (window.targetCalendarDate) {
            selectDay(window.targetCalendarDate, result.data);
            window.targetCalendarDate = null;
        } else if (now.getFullYear() === window.calCurrentYear && now.getMonth() === window.calCurrentMonth) {
            selectDay(now.toISOString().split('T')[0], result.data);
        }
        
    } catch (error) {
        modalBody.innerHTML = `<p style="color: var(--accent-red);">Error loading calendar.</p>`;
    }
};

function renderCompactCalendarUI(container, events) {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthLabel = `${monthNames[window.calCurrentMonth]} ${window.calCurrentYear}`;
    
    let html = `
        <div style="display: flex; flex-direction: column; gap: 24px; max-width: 450px; margin: 0 auto;">
            <!-- Header & Navigation -->
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3 style="font-size: 1.1rem; font-weight: 700;">${monthLabel}</h3>
                <div style="display: flex; gap: 8px;">
                    <button onclick="navMonth(-1)" style="background: rgba(255,255,255,0.05); border: 1px solid var(--card-border); color: white; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">&lt;</button>
                    <button onclick="navMonth(1)" style="background: rgba(255,255,255,0.05); border: 1px solid var(--card-border); color: white; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">&gt;</button>
                </div>
            </div>

            <!-- Calendar Grid -->
            <div class="cal-grid">
                ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="cal-day-name">${d}</div>`).join('')}
                ${generateCompactGrid(window.calCurrentYear, window.calCurrentMonth, events)}
            </div>

            <!-- Agenda View -->
            <div id="agenda-section" style="border-top: 1px solid var(--card-border); padding-top: 20px;">
                <h4 id="agenda-date" style="margin-bottom: 12px; font-size: 0.9rem; color: var(--accent-purple);">Agenda</h4>
                <div id="agenda-events" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px;">
                    <p style="color: var(--text-muted); font-size: 0.8rem;">Select a date to see events.</p>
                </div>

                <!-- Add Event Compact Form -->
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 12px; padding: 16px;">
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <input type="text" id="ev-title" placeholder="Event Title" style="background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 10px; border-radius: 8px; font-size: 0.85rem;">
                        <div style="display: flex; gap: 10px;">
                            <input type="date" id="ev-date" style="flex: 1; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 10px; border-radius: 8px; font-size: 0.85rem;">
                            <select id="ev-label" style="flex: 1; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 10px; border-radius: 8px; font-size: 0.85rem;">
                                <option value="Personal">Personal</option>
                                <option value="Exam">Exam</option>
                                <option value="Project">Project</option>
                                <option value="Study">Study</option>
                                <option value="Clg">Clg</option>
                            </select>
                        </div>
                        <select id="ev-status" style="background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 10px; border-radius: 8px; font-size: 0.85rem;">
                            <option value="planned">Planned</option>
                            <option value="in_progress">In Progress</option>
                            <option value="done">Done</option>
                        </select>
                        <button onclick="addCalEvent()" style="background: var(--accent-purple); color: white; border: none; padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 0.85rem;">Add Event</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    container.innerHTML = html;
}

function generateCompactGrid(year, month, events) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; 
    
    let html = '';
    for (let i = 0; i < startDow; i++) {
        html += `<div class="cal-day-cell cal-day-empty" style="opacity: 0.1;"></div>`;
    }
    
    const todayStr = new Date().toISOString().split('T')[0];

    for (let d = 1; d <= lastDay.getDate(); d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = dateStr === todayStr;
        const dayEvents = events.filter(e => e.date === dateStr);

        html += `
            <div onclick='selectDay("${dateStr}", ${JSON.stringify(events).replace(/"/g, '&quot;')})'
                 class="cal-day-cell ${isToday ? 'cal-today' : ''}"
                 data-date="${dateStr}">
                <span class="cal-day-num">${d}</span>
                <div class="cal-dots">
                    ${dayEvents.slice(0, 3).map(e => `<span class="cal-dot" style="background: ${window.LABEL_COLORS[e.label] || 'var(--accent-teal)'};"></span>`).join('')}
                    ${dayEvents.length > 3 ? `<span class="cal-dot-more">+${dayEvents.length - 3}</span>` : ''}
                </div>
            </div>
        `;
    }
    return html;
}

window.navMonth = function(dir) {
    window.calCurrentMonth += dir;
    if (window.calCurrentMonth > 11) { window.calCurrentMonth = 0; window.calCurrentYear++; }
    if (window.calCurrentMonth < 0) { window.calCurrentMonth = 11; window.calCurrentYear--; }
    window.loadCalendarModal(document.getElementById('modal-body'));
};

window.selectDay = function(dateStr, events) {
    const dayEvents = events.filter(e => e.date === dateStr);
    const agendaDate = document.getElementById('agenda-date');
    const agendaEvents = document.getElementById('agenda-events');
    const evDateInput = document.getElementById('ev-date');
    
    document.querySelectorAll('.cal-day-cell').forEach(cell => {
        if (cell.dataset.date === dateStr) {
            cell.style.borderColor = 'var(--accent-teal)';
            cell.style.background = 'rgba(6, 214, 160, 0.05)';
        } else {
            cell.style.borderColor = ''; 
            cell.style.background = '';
        }
    });

    if (!agendaDate || !agendaEvents) return;
    
    const displayDate = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    agendaDate.textContent = displayDate;
    evDateInput.value = dateStr;
    
    if (dayEvents.length === 0) {
        agendaEvents.innerHTML = '<p class="cal-no-events">Nothing planned.</p>';
    } else {
        const STATUS_BADGE = { planned: 'var(--text-muted)', in_progress: 'var(--accent-yellow)', done: 'var(--accent-teal)' };

        agendaEvents.innerHTML = dayEvents.map(e => `
            <div class="cal-event-item" id="event-item-${e.id}">
                <span class="cal-event-dot" style="background:${window.LABEL_COLORS[e.label] || '#888'}"></span>
                <div class="cal-event-info">
                    <div style="display:flex; justify-content:space-between; align-items: center;">
                        <strong id="event-title-${e.id}">${e.title}</strong>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <span style="font-size: 0.7rem; color: ${STATUS_BADGE[e.status] || 'white'}; text-transform: uppercase; font-weight: bold;">${e.status?.replace('_', ' ') || 'planned'}</span>
                            <button onclick='startEditEvent(${JSON.stringify(e).replace(/"/g, '&quot;')}, "${dateStr}")' style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.9rem;">✎</button>
                            <button onclick="deleteCalEvent(${e.id}, '${dateStr}')" aria-label="Delete event" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 1rem;">${window.icon('x', { size: 14 })}</button>
                        </div>
                    </div>
                    <span class="cal-label-badge" style="background:${window.LABEL_COLORS[e.label] || '#888'}22;color:${window.LABEL_COLORS[e.label] || '#888'}">${e.label || 'Personal'}</span>
                </div>
            </div>
        `).join('');
    }
};

window.startEditEvent = function(event, dateStr) {
    const item = document.getElementById(`event-item-${event.id}`);
    const originalContent = item.innerHTML;
    
    item.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px; width: 100%; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; border: 1px solid var(--accent-purple);">
            <div style="display: flex; gap: 8px;">
                <input type="date" id="edit-date-${event.id}" value="${event.date}" style="flex: 1; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 6px; border-radius: 4px; font-size: 0.85rem; color-scheme: dark;">
                <input type="text" id="edit-title-${event.id}" value="${event.title}" style="flex: 2; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 6px; border-radius: 4px; font-size: 0.85rem;">
            </div>
            <div style="display: flex; gap: 8px;">
                <select id="edit-label-${event.id}" style="flex: 1; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 6px; border-radius: 4px; font-size: 0.8rem;">
                    <option value="Personal" ${event.label === 'Personal' ? 'selected' : ''}>Personal</option>
                    <option value="Exam" ${event.label === 'Exam' ? 'selected' : ''}>Exam</option>
                    <option value="Project" ${event.label === 'Project' ? 'selected' : ''}>Project</option>
                    <option value="Study" ${event.label === 'Study' ? 'selected' : ''}>Study</option>
                    <option value="Clg" ${event.label === 'Clg' ? 'selected' : ''}>Clg</option>
                </select>
                <select id="edit-status-${event.id}" style="flex: 1; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 6px; border-radius: 4px; font-size: 0.8rem;">
                    <option value="planned" ${event.status === 'planned' ? 'selected' : ''}>Planned</option>
                    <option value="in_progress" ${event.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                    <option value="done" ${event.status === 'done' ? 'selected' : ''}>Done</option>
                </select>
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button onclick="cancelEditEvent(${event.id}, '${dateStr}')" style="background: transparent; border: 1px solid var(--card-border); color: var(--text-muted); padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">Cancel</button>
                <button onclick="saveEditEvent(${event.id}, '${dateStr}')" style="background: var(--accent-purple); border: none; color: white; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-weight: bold;">Save</button>
            </div>
        </div>
    `;
};

window.cancelEditEvent = function(id, dateStr) {
    // Just reload the current state to reset UI
    window.targetCalendarDate = dateStr;
    window.loadCalendarModal(document.getElementById('modal-body'));
};

window.saveEditEvent = async function(id, dateStr) {
    const title = document.getElementById(`edit-title-${id}`).value;
    const date = document.getElementById(`edit-date-${id}`).value;
    const label = document.getElementById(`edit-label-${id}`).value;
    const status = document.getElementById(`edit-status-${id}`).value;
    
    try {
        const response = await fetch(`/api/calendar/event/${id}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, date, label, status })
        });
        if (response.ok) {
            window.targetCalendarDate = dateStr;
            window.loadCalendarModal(document.getElementById('modal-body'));
        }
    } catch (e) {
        alert("Failed to update event");
    }
};

window.addCalEvent = async function() {
    const title = document.getElementById('ev-title').value;
    const date = document.getElementById('ev-date').value;
    const label = document.getElementById('ev-label').value;
    const status = document.getElementById('ev-status').value;
    if (!title || !date) return alert("Fill title and date");
    try {
        const response = await fetch('/api/calendar/event', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ title, date, label, status }) 
        });
        if (response.ok) {
            window.targetCalendarDate = date;
            window.loadCalendarModal(document.getElementById('modal-body'));
        }
    } catch (e) { alert("Error adding event"); }
};

window.deleteCalEvent = async function(id, dateStr) {
    if (!confirm("Delete this event?")) return;
    try {
        const response = await fetch(`/api/calendar/event/${id}`, { method: 'DELETE' });
        if (response.ok) {
            window.targetCalendarDate = dateStr;
            window.loadCalendarModal(document.getElementById('modal-body'));
        }
    } catch (e) { alert("Error deleting event"); }
};
