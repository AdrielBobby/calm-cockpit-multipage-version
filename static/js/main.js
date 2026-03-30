// main.js - Handles global dashboard functions like the clock

function updateClock() {
    const timeDisplay = document.getElementById('current-time');
    if (!timeDisplay) return;

    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    minutes = minutes < 10 ? '0' + minutes : minutes;
    
    const strTime = hours + ':' + minutes + ' ' + ampm;
    timeDisplay.textContent = strTime;
}

// Update clock immediately and then every minute
updateClock();
setInterval(updateClock, 60000);

// Global Refresh Functions
window.refreshAttendanceSnapshot = async function() {
    const container = document.getElementById('attendance-snapshot-container');
    if (!container) return;

    try {
        const response = await fetch('/api/attendance/snapshot');
        const result = await response.json();
        
        if (result.status === 'success') {
            let html = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">';
            result.data.forEach(item => {
                const color = item.percentage >= 80 ? 'var(--accent-teal)' : (item.percentage >= 60 ? 'var(--accent-yellow)' : 'var(--accent-red)');
                html += `
                    <div class="snapshot-item" data-subject="${item.subject}" style="text-align: center; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; border: 1px solid var(--card-border);">
                        <div class="percentage-value" style="font-size: 1.2rem; font-weight: bold; color: ${color};">
                            ${item.percentage}%
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">${item.subject}</div>
                    </div>
                `;
            });
            html += '</div>';
            container.innerHTML = html;
        }
    } catch (error) {
        console.error("Failed to refresh attendance snapshot", error);
    }
};

window.refreshFinanceSnapshot = async function() {
    const container = document.getElementById('finance-snapshot-container');
    if (!container) return;
    try {
        const response = await fetch('/api/finance/summary');
        const result = await response.json();
        if (result.status === 'success') {
            const f = result.data;
            container.innerHTML = `
                <div style="margin-bottom: 16px;">
                    <div style="font-size: 1.5rem; font-weight: 700;">₹${f.balance}</div>
                    <div style="color: var(--text-muted); font-size: 0.8rem;">Net Balance</div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <div style="flex: 1; background: rgba(6, 214, 160, 0.1); border: 1px solid rgba(6, 214, 160, 0.2); padding: 8px; border-radius: 8px;">
                        <div style="font-size: 0.7rem; color: var(--accent-teal); text-transform: uppercase;">Income</div>
                        <div style="font-weight: 600;">₹${f.income}</div>
                    </div>
                    <div style="flex: 1; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); padding: 8px; border-radius: 8px;">
                        <div style="font-size: 0.7rem; color: var(--accent-red); text-transform: uppercase;">Expense</div>
                        <div style="font-weight: 600;">₹${f.expense}</div>
                    </div>
                </div>
            `;
        }
    } catch (e) { console.error(e); }
};

window.refreshGoalsSnapshot = async function() {
    const container = document.getElementById('goals-snapshot-container');
    if (!container) return;
    try {
        const response = await fetch('/api/goals/all');
        const result = await response.json();
        if (result.status === 'success') {
            const goals = result.data.slice(0, 5); // Max 5
            let html = '<ul style="list-style: none; padding: 0;">';
            goals.forEach(goal => {
                html += `
                    <li style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px; font-size: 0.95rem; ${goal.completed ? 'color: var(--text-muted); text-decoration: line-through;' : ''}">
                        <div style="width: 18px; height: 18px; border: 2px solid ${goal.completed ? 'var(--accent-teal)' : 'var(--card-border)'}; border-radius: 4px; background: ${goal.completed ? 'var(--accent-teal)' : 'transparent'}; display: flex; align-items: center; justify-content: center;">
                            ${goal.completed ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                        </div>
                        ${goal.text}
                    </li>
                `;
            });
            html += '</ul>';
            container.innerHTML = html;
        }
    } catch (e) { console.error(e); }
};

// Global Clear Data Function
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
            // Refresh currently open modal content
            const modalBody = document.getElementById('modal-body');
            if (type.startsWith('grades') && window.loadGradesModal) window.loadGradesModal(modalBody);
            if (type === 'attendance' && window.loadAttendanceModal) window.loadAttendanceModal(modalBody);
            if (type === 'finance' && window.loadFinanceModal) window.loadFinanceModal(modalBody);
            if (type === 'goals' && window.loadGoalsModal) window.loadGoalsModal(modalBody);
            
            // Refresh dashboard snapshots
            if (window.refreshAttendanceSnapshot) window.refreshAttendanceSnapshot();
            if (window.refreshFinanceSnapshot) window.refreshFinanceSnapshot();
            if (window.refreshGoalsSnapshot) window.refreshGoalsSnapshot();
        }
    } catch (e) { alert("Error clearing data"); }
};
