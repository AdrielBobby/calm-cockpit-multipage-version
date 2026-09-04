window.loadAttendanceModal = async function(modalBody) {
    modalBody.innerHTML = '<p style="color: var(--text-muted);">Fetching attendance details...</p>';
    try {
        const response = await fetch('/api/attendance/details');
        const result = await response.json();
        
        let html = '<div style="display: flex; gap: 16px; flex-direction: column;">';
        
        // Tabs & Clear All
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--card-border); padding-bottom: 8px; margin-bottom: 16px;">
                <div style="display: flex; gap: 16px;">
                    <button class="att-tab active" onclick="switchAttendanceTab('subject', this)" style="background:transparent; border:none; color:var(--text-main); font-weight:bold; cursor:pointer; padding: 8px 16px;">By Subject</button>
                    <button class="att-tab" onclick="switchAttendanceTab('window', this)" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding: 8px 16px;">Window View</button>
                    <button class="att-tab" onclick="switchAttendanceTab('calendar', this)" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding: 8px 16px;">Calendar View</button>
                    <button class="att-tab" onclick="switchAttendanceTab('skippable', this)" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding: 8px 16px;">Skippable</button>
                </div>
                <button onclick="clearData('attendance')" style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--accent-red); color: var(--accent-red); padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 0.8rem; font-weight: 600;">Clear All History</button>
            </div>
            
            <div id="att-tab-content">
                ${renderBySubjectView(result.data)}
            </div>
        `;
        
        html += '</div>';
        modalBody.innerHTML = html;
        window.attendanceData = result.data;
        
    } catch (error) {
        modalBody.innerHTML = `<p style="color: var(--accent-red);">Error loading attendance.</p>`;
    }
};

function renderBySubjectView(data) {
    let html = `
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
                <tr style="border-bottom: 1px solid var(--card-border); color: var(--text-muted);">
                    <th style="padding: 12px 8px;">Subject</th>
                    <th style="padding: 12px 8px;">Attendance</th>
                    <th style="padding: 12px 8px;">Missed</th>
                    <th style="padding: 12px 8px;">Total Classes</th>
                </tr>
            </thead>
            <tbody>
    `;
    data.forEach((item, index) => {
        const color = window.attendanceColor(item.percentage);
        // Mocking ID based on index for demo, but we should fetch real IDs if available
        // Assuming subjects table has IDs and they are in the result
        const subjId = item.id || (index + 1); 

        html += `
            <tr style="border-bottom: 1px solid var(--card-border);">
                <td style="padding: 12px 8px;">
                    <input type="text" value="${item.subject}" onchange="updateAttendanceSubjectName(${subjId}, this.value)" style="background: transparent; border: 1px solid transparent; color: var(--text-main); font-weight: 500; width: 100%; padding: 4px;">
                </td>
                <td style="padding: 12px 8px; color: ${color}; font-weight: bold;">${item.percentage}%</td>
                <td style="padding: 12px 8px; color: var(--text-muted);">${item.missed} classes</td>
                <td style="padding: 12px 8px; color: var(--text-muted);">${item.total} classes</td>
            </tr>
        `;
    });
    html += `</tbody></table>`;
    return html;
}

function renderSkippableView(data) {
    let html = `
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
                <tr style="border-bottom: 1px solid var(--card-border); color: var(--text-muted);">
                    <th style="padding: 12px 8px;">Subject</th>
                    <th style="padding: 12px 8px;">Attendance</th>
                    <th style="padding: 12px 8px;">Skippable Classes</th>
                </tr>
            </thead>
            <tbody>
    `;
    data.forEach((item) => {
        const color = window.attendanceColor(item.percentage);
        const attended = item.total - item.missed;
        const skippable = Math.max(0, Math.floor(attended / 0.80 - item.total));
        const belowGoal = item.percentage < 80;
        const skipColor = belowGoal ? 'var(--accent-red)' : (skippable > 0 ? 'var(--accent-teal)' : 'var(--text-muted)');
        const skipLabel = belowGoal ? '0 (below goal)' : `${skippable} classes`;

        html += `
            <tr style="border-bottom: 1px solid var(--card-border);">
                <td style="padding: 12px 8px; color: var(--text-main); font-weight: 500;">${item.subject}</td>
                <td style="padding: 12px 8px; color: ${color}; font-weight: bold;">${item.percentage}%</td>
                <td style="padding: 12px 8px; color: ${skipColor}; font-weight: bold;">${skipLabel}</td>
            </tr>
        `;
    });
    html += `</tbody></table>`;
    return html;
}

window.updateAttendanceSubjectName = async function(id, name) {
    try {
        const response = await fetch('/api/subjects/update', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id: id, name: name })
        });
        if (response.ok) {
            if (window.refreshAttendanceSnapshot) window.refreshAttendanceSnapshot();
        }
    } catch (e) { console.error("Failed to update subject name"); }
};

window.switchAttendanceTab = async function(tab, btn) {
    const container = document.getElementById('att-tab-content');
    const tabs = document.querySelectorAll('.att-tab');
    tabs.forEach(t => {
        t.style.color = 'var(--text-muted)';
        t.style.fontWeight = 'normal';
    });
    btn.style.color = 'var(--text-main)';
    btn.style.fontWeight = 'bold';
    
    if (tab === 'subject') {
        container.innerHTML = renderBySubjectView(window.attendanceData);
    } else if (tab === 'window') {
        container.innerHTML = `
            <div style="background: rgba(255,255,255,0.02); padding: 20px; border-radius: 12px; border: 1px solid var(--card-border); margin-bottom: 20px;">
                <h3 style="margin-bottom: 16px; font-size: 1rem;">Select Date Range</h3>
                <div style="display: flex; gap: 16px; align-items: flex-end;">
                    <div style="flex: 1;">
                        <label style="display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;">Start Date</label>
                        <input type="date" id="win-start" style="width: 100%; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 10px; border-radius: 8px;">
                    </div>
                    <div style="flex: 1;">
                        <label style="display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;">End Date</label>
                        <input type="date" id="win-end" style="width: 100%; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 10px; border-radius: 8px;">
                    </div>
                    <button onclick="calculateWindowAttendance()" style="background: var(--accent-teal); color: var(--bg-color); border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer;">Calculate</button>
                </div>
            </div>
            <div id="window-results"></div>
        `;
    } else if (tab === 'calendar') {
        if (window.loadAttendanceHeatmap) {
            window.loadAttendanceHeatmap(container);
        } else {
            container.innerHTML = '<p style="color:var(--text-muted);">Heatmap module not loaded.</p>';
        }

    } else if (tab === 'skippable') {
        container.innerHTML = renderSkippableView(window.attendanceData);
    }
};

window.calculateWindowAttendance = async function() {
    const start = document.getElementById('win-start').value;
    const end = document.getElementById('win-end').value;
    const resultsDiv = document.getElementById('window-results');
    
    if (!start || !end) {
        alert("Please select both dates");
        return;
    }
    
    resultsDiv.innerHTML = '<p style="color: var(--text-muted);">Calculating...</p>';
    try {
        const response = await fetch(`/api/attendance/window?start=${start}&end=${end}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            resultsDiv.innerHTML = renderBySubjectView(result.data);
        } else {
            resultsDiv.innerHTML = `<p style="color: var(--accent-red);">${result.error || "No data found"}</p>`;
        }
    } catch (e) {
        resultsDiv.innerHTML = `<p style="color: var(--accent-red);">Error fetching data</p>`;
    }
};
