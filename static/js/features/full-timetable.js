window.loadTimetableModal = async function(modalBody) {
    modalBody.innerHTML = '<p style="color: var(--text-muted);">Fetching timetable...</p>';
    try {
        const response = await fetch('/api/timetable/week');
        const result = await response.json();
        
        let html = '<div style="display: flex; gap: 16px; flex-direction: column;">';
        
        // Tabs
        html += `
            <div style="display: flex; gap: 16px; border-bottom: 1px solid var(--card-border); padding-bottom: 8px; margin-bottom: 16px;">
                <button class="tt-tab active" onclick="switchTimetableTab('week', this)" style="background:transparent; border:none; color:var(--text-main); font-weight:bold; cursor:pointer; padding: 8px 16px;">This Week</button>
                <button class="tt-tab" onclick="switchTimetableTab('all', this)" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding: 8px 16px;">All Weeks</button>
            </div>
            
            <div id="tt-tab-content">
                ${renderWeeklyTimetable(result.data)}
            </div>
        `;
        
        html += '</div>';
        modalBody.innerHTML = html;
        window.timetableData = result.data; // Store for switching tabs
        
    } catch (error) {
        console.error(error);
        modalBody.innerHTML = `<p style="color: var(--accent-red);">Error loading timetable.</p>`;
    }
};

function renderWeeklyTimetable(data, hideControls = false) {
    let html = '';
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const todayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());

    days.forEach(day => {
        const dayData = data[day];
        if (!dayData) return;
        
        const classes = dayData.classes || dayData; // Handle both structures
        const date = dayData.date;
        const isHoliday = dayData.is_holiday;

        if (!classes || classes.length === 0) return;

        const isToday = day === todayName;
        
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; margin-bottom: 8px;">
                <h3 style="color: ${isToday ? 'var(--accent-teal)' : 'var(--accent-purple)'};">
                    ${day} ${isToday ? '(Today)' : ''} 
                    <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal; margin-left: 8px;">${date || ''}</span>
                </h3>
                ${!hideControls && date ? `
                    <button onclick="toggleHoliday('${date}', ${isHoliday}, this)" 
                            style="background: ${isHoliday ? 'var(--accent-red)' : 'rgba(239, 68, 68, 0.1)'}; 
                                   border: 1px solid var(--accent-red); 
                                   color: ${isHoliday ? 'white' : 'var(--accent-red)'}; 
                                   padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 600;">
                        ${isHoliday ? 'Remove Holiday' : 'Mark Holiday'}
                    </button>
                ` : ''}
            </div>
        `;

        if (isHoliday && !hideControls) {
            html += `<div style="background: rgba(239, 68, 68, 0.05); border: 1px dashed var(--accent-red); padding: 16px; border-radius: 8px; text-align: center; color: var(--accent-red); font-weight: 500;">Closed for Holiday</div>`;
        } else {
            html += `<div style="display: grid; gap: 8px;">`;
            classes.forEach(c => {
                const isAttended = c.status === 'attended';
                const isMissed = c.status === 'missed';

                html += `
                    <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <span style="color: var(--text-muted); font-size: 0.9rem; margin-right: 12px;">${c.time}</span>
                            <strong>${c.subject}</strong>
                        </div>
                        ${!hideControls ? `
                        <div style="display: flex; gap: 8px;">
                            <button 
                                onclick="markAttendance(${c.id}, 'attended', this)" 
                                style="background: ${isAttended ? 'var(--accent-teal)' : 'transparent'}; border: 1px solid var(--accent-teal); color: ${isAttended ? 'var(--bg-color)' : 'var(--accent-teal)'}; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.8rem; transition: all 0.2s;">
                                Present
                            </button>
                            <button 
                                onclick="markAttendance(${c.id}, 'missed', this)" 
                                style="background: ${isMissed ? 'var(--accent-red)' : 'transparent'}; border: 1px solid var(--accent-red); color: ${isMissed ? 'var(--text-main)' : 'var(--accent-red)'}; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.8rem; transition: all 0.2s;">
                                Absent
                            </button>
                        </div>
                        ` : ''}
                    </div>
                `;
            });
            html += `</div>`;
        }
    });
    return html;
}

window.toggleHoliday = async function(date, currentIsHoliday, btn) {
    const method = currentIsHoliday ? 'DELETE' : 'POST';
    try {
        const response = await fetch('/api/attendance/holiday', {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: date })
        });
        if (response.ok) {
            // Re-load to show state change
            const modalBody = document.getElementById('modal-body');
            window.loadTimetableModal(modalBody);
            if (window.refreshAttendanceSnapshot) window.refreshAttendanceSnapshot();
        }
    } catch (e) {
        alert("Error toggling holiday");
    }
};

window.switchTimetableTab = function(tab, btn) {
    const container = document.getElementById('tt-tab-content');
    const tabs = document.querySelectorAll('.tt-tab');
    tabs.forEach(t => {
        t.style.color = 'var(--text-muted)';
        t.style.fontWeight = 'normal';
    });
    btn.style.color = 'var(--text-main)';
    btn.style.fontWeight = 'bold';
    
    if (tab === 'all') {
        container.innerHTML = renderWeeklyTimetable(window.timetableData, true);
    } else {
        container.innerHTML = renderWeeklyTimetable(window.timetableData, false);
    }
};

window.markAttendance = async function(timetableId, status, btn) {
    try {
        const response = await fetch('/api/attendance/mark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timetable_id: timetableId, status: status })
        });
        
        if (response.ok) {
            const parent = btn.parentElement;
            const buttons = parent.querySelectorAll('button');
            buttons.forEach(b => {
                const isPresentBtn = b.textContent.trim() === 'Present';
                const isMarkingPresent = status === 'attended';
                if (isPresentBtn) {
                    b.style.background = isMarkingPresent ? 'var(--accent-teal)' : 'transparent';
                    b.style.color = isMarkingPresent ? 'var(--bg-color)' : 'var(--accent-teal)';
                } else {
                    b.style.background = !isMarkingPresent ? 'var(--accent-red)' : 'transparent';
                    b.style.color = !isMarkingPresent ? 'var(--text-main)' : 'var(--accent-red)';
                }
            });
            if (window.refreshAttendanceSnapshot) window.refreshAttendanceSnapshot();
        }
    } catch (error) {
        alert("Failed to mark attendance");
    }
};
