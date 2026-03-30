window.loadGradesModal = async function(modalBody) {
    modalBody.innerHTML = '<p style="color: var(--text-muted);">Fetching grades...</p>';
    try {
        const historyResponse = await fetch('/api/grades/history');
        const historyResult = await historyResponse.json();
        const data = historyResult.data;
        
        let html = `
            <div style="display: flex; gap: 16px; border-bottom: 1px solid var(--card-border); padding-bottom: 8px; margin-bottom: 24px;">
                <button class="modal-tab active" id="tab-history" onclick="switchGradesTab('history', this)" style="background:transparent; border:none; color:var(--text-main); font-weight:bold; cursor:pointer; padding: 8px 16px;">Semester History</button>
                <button class="modal-tab" id="tab-internals" onclick="switchGradesTab('internals', this)" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding: 8px 16px;">Internal Grades</button>
                <button class="modal-tab" id="tab-ese" onclick="switchGradesTab('ese', this)" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding: 8px 16px;">ESE Calculator</button>
            </div>
            
            <div id="grades-tab-content">
                ${renderHistoryTab(data)}
            </div>
        `;
        
        modalBody.innerHTML = html;
        window.gradesHistoryData = data;

    } catch (error) {
        modalBody.innerHTML = `<p style="color: var(--accent-red);">Error loading grades history.</p>`;
    }
};

function renderHistoryTab(data) {
    let html = `
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px;">
            <div>
                <h3 style="color: var(--text-muted); font-size: 0.9rem; text-transform: uppercase;">Overall Cumulative</h3>
                <div style="font-size: 3rem; font-weight: 800; color: var(--accent-purple); line-height: 1;">${data.cgpa}</div>
            </div>
            <div style="display: flex; gap: 12px; align-items: flex-end;">
                <div>
                    <label style="display:block; font-size: 0.7rem; color: var(--text-muted);">Sem #</label>
                    <input type="number" id="new-sem-num" placeholder="1" style="width: 60px; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 8px; border-radius: 6px;">
                </div>
                <div>
                    <label style="display:block; font-size: 0.7rem; color: var(--text-muted);">SGPA</label>
                    <input type="number" step="0.01" id="new-sem-sgpa" placeholder="0.00" style="width: 80px; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 8px; border-radius: 6px;">
                </div>
                <button onclick="addSemesterRecord()" style="background: var(--accent-purple); color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Add</button>
                <button onclick="clearData('grades-history')" style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--accent-red); color: var(--accent-red); padding: 10px; border-radius: 8px; cursor: pointer;">Clear All</button>
            </div>
        </div>

        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="text-align: left; color: var(--text-muted); border-bottom: 1px solid var(--card-border);">
                    <th style="padding: 12px 8px;">Semester</th>
                    <th style="padding: 12px 8px;">SGPA</th>
                    <th style="padding: 12px 8px;">Status</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.history.forEach(sem => {
        html += `
            <tr style="border-bottom: 1px solid var(--card-border);">
                <td style="padding: 16px 8px; font-weight: 600;">Semester ${sem.number}</td>
                <td style="padding: 16px 8px; color: var(--accent-teal); font-weight: bold;">${sem.sgpa}</td>
                <td style="padding: 16px 8px;"><span style="background: rgba(6, 214, 160, 0.1); color: var(--accent-teal); padding: 4px 12px; border-radius: 20px; font-size: 0.75rem;">Completed</span></td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    return html;
}

window.switchGradesTab = async function(tab, btn) {
    const container = document.getElementById('grades-tab-content');
    const tabs = document.querySelectorAll('.modal-tab');
    tabs.forEach(t => {
        t.style.color = 'var(--text-muted)';
        t.style.fontWeight = 'normal';
    });
    btn.style.color = 'var(--text-main)';
    btn.style.fontWeight = 'bold';
    
    if (tab === 'history') {
        container.innerHTML = renderHistoryTab(window.gradesHistoryData);
    } else if (tab === 'internals') {
        container.innerHTML = '<p style="color: var(--text-muted);">Fetching internal marks...</p>';
        try {
            const subjResp = await fetch('/api/grades/subjects');
            const subjResult = await subjResp.json();
            const marksResp = await fetch('/api/grades/internals');
            const marksResult = await marksResp.json();
            
            let html = `
                <div style="display: flex; flex-direction: column; gap: 24px;">
                    <div style="background: rgba(255,255,255,0.02); padding: 16px; border-radius: 12px; border: 1px solid var(--card-border); display: flex; gap: 12px; align-items: flex-end;">
                        <div style="flex: 1;">
                            <label style="display:block; font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">New Subject Name</label>
                            <input type="text" id="new-subj-name" placeholder="e.g. Operating Systems" style="width: 100%; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 8px; border-radius: 6px;">
                        </div>
                        <button onclick="addGradeSubject()" style="background: var(--accent-teal); color: var(--bg-color); border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer;">Add Subject</button>
                        <button onclick="clearData('grades-internals')" style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--accent-red); color: var(--accent-red); padding: 10px; border-radius: 8px; cursor: pointer;">Clear All</button>
                    </div>

                    <div style="background: rgba(255,255,255,0.02); padding: 24px; border-radius: 12px; border: 1px solid var(--card-border);">
                        <h3 style="margin-bottom: 20px;">Internal Marks Breakdown</h3>
                        <table style="width: 100%; border-collapse: collapse; text-align: left;">
                            <thead>
                                <tr style="border-bottom: 1px solid var(--card-border); color: var(--text-muted);">
                                    <th style="padding: 12px 8px;">Subject</th>
                                    <th style="padding: 12px 8px;">Internal 1</th>
                                    <th style="padding: 12px 8px;">Internal 2</th>
                                </tr>
                            </thead>
                            <tbody>
            `;
            subjResult.data.forEach(subj => {
                const subjectMarks = marksResult.data[subj.name] || [];
                const i1 = subjectMarks.find(m => m.internal === 1)?.mark || 0;
                const i2 = subjectMarks.find(m => m.internal === 2)?.mark || 0;
                html += `
                    <tr style="border-bottom: 1px solid var(--card-border);">
                        <td style="padding: 12px 8px; font-weight: 600;">
                            <input type="text" value="${subj.name}" onchange="updateGradeSubjectName(${subj.subject_index}, this.value)" style="width: 100%; background: transparent; border: 1px solid transparent; color: var(--text-main); font-weight: 600; padding: 4px;">
                        </td>
                        <td style="padding: 12px 8px;"><input type="number" value="${i1}" onchange="updateInternalMark(${subj.subject_index}, 1, this.value)" style="width: 60px; background: transparent; border: 1px solid transparent; color: var(--accent-teal); font-weight: bold; padding: 4px;"></td>
                        <td style="padding: 12px 8px;"><input type="number" value="${i2}" onchange="updateInternalMark(${subj.subject_index}, 2, this.value)" style="width: 60px; background: transparent; border: 1px solid transparent; color: var(--accent-teal); font-weight: bold; padding: 4px;"></td>
                    </tr>
                `;
            });
            html += `</tbody></table><p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 12px;">* Changes are saved automatically when you change the value.</p></div></div>`;
            container.innerHTML = html;
        } catch (e) { container.innerHTML = `<p style="color: var(--accent-red);">Error loading internal marks.</p>`; }
    } else if (tab === 'ese') {
        container.innerHTML = `
            <div style="background: rgba(255,255,255,0.02); padding: 24px; border-radius: 12px; border: 1px solid var(--card-border);">
                <h3 style="margin-bottom: 16px;">ESE Requirement Calculator</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 24px;">
                    <input type="text" id="eseSubjectName" placeholder="Subject Name" style="background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 10px; border-radius: 8px;">
                    <input type="number" id="eseCurrentMarks" placeholder="Current Marks" style="background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 10px; border-radius: 8px;">
                    <input type="number" id="eseMaxSessional" placeholder="Max Sessional" value="50" style="background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 10px; border-radius: 8px;">
                    <input type="number" id="eseMaxESE" placeholder="Max ESE" value="100" style="background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 10px; border-radius: 8px;">
                </div>
                <div style="display: flex; gap: 8px; margin-bottom: 24px;">
                    <button class="ese-preset-btn" onclick="eseSetPreset('theory')" style="background: rgba(255,255,255,0.05); border: 1px solid var(--card-border); color: white; padding: 8px 16px; border-radius: 8px; cursor: pointer;">Theory</button>
                    <button class="ese-preset-btn" onclick="eseSetPreset('integrated')" style="background: rgba(255,255,255,0.05); border: 1px solid var(--card-border); color: white; padding: 8px 16px; border-radius: 8px; cursor: pointer;">Integrated</button>
                    <button class="ese-preset-btn" onclick="eseSetPreset('lab')" style="background: rgba(255,255,255,0.05); border: 1px solid var(--card-border); color: white; padding: 8px 16px; border-radius: 8px; cursor: pointer;">Lab</button>
                    <button id="eseAddSubjectBtn" onclick="eseAddSubject()" style="background: var(--accent-purple); color: white; border: none; padding: 8px 24px; border-radius: 8px; font-weight: bold; cursor: pointer; margin-left: auto;">Add Subject</button>
                </div>
                <div id="eseSubjectsContainer" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px;">
                    <div class="ese-empty-state" style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">No subjects yet — add one above to get started.</div>
                </div>
            </div>
        `;
        window.eseSubjects = window.eseSubjects || [];
        eseRenderSubjects();
    }
};

window.updateGradeSubjectName = async function(subjIdx, name) {
    try {
        await fetch('/api/grades/subjects/update', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ subject_index: subjIdx, name: name })
        });
    } catch (e) { console.error("Failed to update subject name"); }
};

/* ── Rest of calculator logic unchanged ── */
window.eseSubjects = [];
const gradeThresholds = [
    { grade: 'S',  point: 10,  min: 90, color: 'var(--accent-teal)' },
    { grade: 'A+', point: 9.0, min: 85, color: '#10b981' },
    { grade: 'A',  point: 8.5, min: 80, color: '#34d399' },
    { grade: 'B+', point: 8.0, min: 75, color: 'var(--accent-yellow)' },
    { grade: 'B',  point: 7.5, min: 70, color: '#fbbf24' },
    { grade: 'C+', point: 7.0, min: 65, color: '#f59e0b' },
    { grade: 'C',  point: 6.5, min: 60, color: '#f97316' },
    { grade: 'D',  point: 6.0, min: 55, color: 'var(--accent-red)' },
    { grade: 'P',  point: 5.5, min: 50, color: '#ef4444' }
];

window.eseSetPreset = function(type, btn) {
    const elMaxSess = document.getElementById('eseMaxSessional');
    const elMaxESE = document.getElementById('eseMaxESE');
    if (type === 'theory')     { elMaxSess.value = 50;  elMaxESE.value = 100; }
    if (type === 'integrated') { elMaxSess.value = 150; elMaxESE.value = 100; }
    if (type === 'lab')        { elMaxSess.value = 75;  elMaxESE.value = 75;  }

    // Reset all preset buttons
    const buttons = document.querySelectorAll('.ese-preset-btn');
    buttons.forEach(b => {
        b.style.background = 'rgba(255,255,255,0.05)';
        b.style.borderColor = 'var(--card-border)';
        b.style.color = 'white';
    });

    // Highlight clicked button
    if (btn) {
        btn.style.background = 'var(--accent-teal)';
        btn.style.borderColor = 'var(--accent-teal)';
        btn.style.color = 'var(--bg-color)';
    }
};

window.eseAddSubject = function() {
    const name = document.getElementById('eseSubjectName').value.trim();
    const current = parseFloat(document.getElementById('eseCurrentMarks').value);
    const maxSess = parseFloat(document.getElementById('eseMaxSessional').value);
    const maxESE = parseFloat(document.getElementById('eseMaxESE').value);
    if (!name || isNaN(current) || isNaN(maxSess) || isNaN(maxESE)) return alert('Fill in all fields');
    window.eseSubjects.push({ name, current, maxSess, maxESE });
    document.getElementById('eseSubjectName').value = '';
    document.getElementById('eseCurrentMarks').value = '';
    eseRenderSubjects();
};

window.eseDeleteSubject = function(idx) {
    window.eseSubjects.splice(idx, 1);
    eseRenderSubjects();
};

function eseRenderSubjects() {
    const elContainer = document.getElementById('eseSubjectsContainer');
    if (!elContainer) return;
    if (window.eseSubjects.length === 0) {
        elContainer.innerHTML = '<div class="ese-empty-state" style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">No subjects yet.</div>';
        return;
    }
    elContainer.innerHTML = '';
    window.eseSubjects.forEach((subject, index) => {
        const totalMarks = subject.maxSess + subject.maxESE;
        const currentPct = ((subject.current / totalMarks) * 100).toFixed(1);
        const minESEThreshold = 0.4 * subject.maxESE;
        let rowsHTML = '';
        gradeThresholds.forEach(grade => {
            const targetTotal = (grade.min / 100) * totalMarks;
            const requiredESE = Math.ceil(targetTotal - subject.current);
            const possible = requiredESE <= subject.maxESE;
            const display = possible ? Math.max(requiredESE, Math.ceil(minESEThreshold)) : '—';
            const statusNote = !possible ? '<span style="color:var(--accent-red);font-size:0.7rem;margin-left:4px;">impossible</span>' : (requiredESE < minESEThreshold ? '<span style="color:var(--accent-yellow);font-size:0.7rem;margin-left:4px;">min '+Math.ceil(minESEThreshold)+'</span>' : '');
            rowsHTML += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.02);"><td style="padding: 8px 4px;"><span style="color:${grade.color};font-weight:bold;">${grade.grade}</span></td><td style="padding: 8px 4px;">${grade.min}%</td><td style="padding: 8px 4px; font-weight:bold;">${display} ${statusNote}</td></tr>`;
        });
        const card = document.createElement('div');
        card.style = "background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 12px; padding: 16px;";
        card.innerHTML = `<div style="display:flex; justify-content:space-between; margin-bottom:12px;"><strong>${subject.name}</strong><button onclick="eseDeleteSubject(${index})" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer;">&times;</button></div><div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px; display:flex; gap:12px;"><span>Current: <b>${subject.current}/${subject.maxSess}</b></span><span>Max ESE: <b>${subject.maxESE}</b></span></div><table style="width:100%; font-size:0.85rem; border-collapse:collapse;"><thead><tr style="text-align:left; color:var(--text-muted); border-bottom:1px solid var(--card-border);"><th style="padding:4px;">Grade</th><th style="padding:4px;">Target</th><th style="padding:4px;">Min ESE</th></tr></thead><tbody>${rowsHTML}</tbody></table>`;
        elContainer.appendChild(card);
    });
}

window.clearData = async function(type) {
    if (!confirm(`Are you sure you want to clear all ${type} data? This cannot be undone.`)) return;
    let url = '';
    if (type === 'grades-history') url = '/api/grades/clear/history';
    if (type === 'grades-internals') url = '/api/grades/clear/internals';
    if (type === 'attendance') url = '/api/attendance/clear';
    if (type === 'finance') url = '/api/finance/clear';
    if (type === 'goals') url = '/api/goals/clear';
    try {
        const response = await fetch(url, { method: 'DELETE' });
        if (response.ok) {
            const modalBody = document.getElementById('modal-body');
            if (type.startsWith('grades')) window.loadGradesModal(modalBody);
            if (type === 'attendance') window.loadAttendanceModal(modalBody);
            if (type === 'finance') window.loadFinanceModal(modalBody);
            if (type === 'goals') window.loadGoalsModal(modalBody);
            if (window.refreshAttendanceSnapshot) window.refreshAttendanceSnapshot();
            if (window.refreshFinanceSnapshot) window.refreshFinanceSnapshot();
            if (window.refreshGoalsSnapshot) window.refreshGoalsSnapshot();
        }
    } catch (e) { alert("Error clearing data"); }
};

window.addSemesterRecord = async function() {
    const num = document.getElementById('new-sem-num').value;
    const sgpa = document.getElementById('new-sem-sgpa').value;
    if (!num || !sgpa) return alert("Fill all fields");
    try {
        const response = await fetch('/api/grades/add', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ number: parseInt(num), sgpa: parseFloat(sgpa) }) });
        if (response.ok) window.loadGradesModal(document.getElementById('modal-body'));
    } catch (e) { alert("Error"); }
};

window.addGradeSubject = async function() {
    const name = document.getElementById('new-subj-name').value;
    if (!name) return;
    try {
        const response = await fetch('/api/grades/subjects/add', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name: name }) });
        if (response.ok) switchGradesTab('internals', document.getElementById('tab-internals'));
    } catch (e) { alert("Error adding subject"); }
};

window.updateInternalMark = async function(subjIdx, intNum, mark) {
    try { await fetch('/api/grades/internals/update', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ subject_index: subjIdx, internal_number: intNum, mark: parseFloat(mark) }) }); } catch (e) { console.error("Failed to update mark"); }
};
