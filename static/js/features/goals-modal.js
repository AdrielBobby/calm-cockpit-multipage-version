window.loadGoalsModal = async function(modalBody) {
    modalBody.innerHTML = '<p style="color: var(--text-muted);">Fetching goals...</p>';
    try {
        const response = await fetch('/api/goals/all');
        const result = await response.json();
        
        let html = '<div style="display: flex; gap: 24px; flex-direction: column;">';
        
        // 1. Add Goal Form & Clear All
        html += `
            <div style="background: rgba(255,255,255,0.02); padding: 16px; border-radius: 12px; border: 1px solid var(--card-border); display: flex; flex-direction: column; gap: 16px;">
                <div style="display: flex; gap: 12px;">
                    <input type="text" id="new-goal-text" placeholder="Add a new goal..." style="flex: 1; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 10px; border-radius: 8px;">
                    <button onclick="addNewGoal()" style="background: var(--accent-purple); color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer;">Add</button>
                </div>
                <button onclick="clearData('goals')" style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--accent-red); color: var(--accent-red); padding: 10px; border-radius: 8px; cursor: pointer; font-weight: 600; align-self: flex-end;">Clear All Goals</button>
            </div>
        `;

        // 2. Goals List
        html += `<div style="display: flex; flex-direction: column; gap: 12px;">`;
        result.data.forEach(goal => {
            html += `
                <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02); padding: 12px 16px; border-radius: 12px; border: 1px solid var(--card-border);">
                    <div style="display: flex; align-items: center; gap: 12px; cursor: pointer;" onclick="toggleGoalStatus(${goal.id}, ${!goal.completed})">
                        <div style="width: 20px; height: 20px; border: 2px solid ${goal.completed ? 'var(--accent-teal)' : 'var(--card-border)'}; border-radius: 4px; background: ${goal.completed ? 'var(--accent-teal)' : 'transparent'}; display: flex; align-items: center; justify-content: center;">
                            ${goal.completed ? window.icon('check', { size: 14, strokeWidth: 4 }) : ''}
                        </div>
                        <span style="${goal.completed ? 'color: var(--text-muted); text-decoration: line-through;' : 'font-weight: 500;'}">${goal.text}</span>
                    </div>
                    <button onclick="deleteGoal(${goal.id})" aria-label="Delete goal" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem;">${window.icon('x', { size: 16 })}</button>
                </div>
            `;
        });
        html += '</div></div>';
        modalBody.innerHTML = html;

        // Wire up Enter key on the input — press Enter to add a goal
        const inputEl = document.getElementById('new-goal-text');
        if (inputEl) {
            inputEl.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    window.addNewGoal();
                }
            });
        }
        
    } catch (error) {
        modalBody.innerHTML = `<p style="color: var(--accent-red);">Error loading goals.</p>`;
    }
};

window.addNewGoal = async function() {
    const text = document.getElementById('new-goal-text').value;
    if (!text) return;
    try {
        const response = await fetch('/api/goals', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text: text })
        });
        if (response.ok) {
            await window.loadGoalsModal(document.getElementById('modal-body'));
            if (window.refreshGoalsSnapshot) window.refreshGoalsSnapshot();
            // Restore focus so the user can keep typing without clicking
            const inputEl = document.getElementById('new-goal-text');
            if (inputEl) inputEl.focus();
        }
    } catch (e) { alert("Error adding goal"); }
};

window.toggleGoalStatus = async function(id, completed) {
    try {
        const response = await fetch(`/api/goals/${id}`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ completed: completed ? 1 : 0 })
        });
        if (response.ok) {
            window.loadGoalsModal(document.getElementById('modal-body'));
            if (window.refreshGoalsSnapshot) window.refreshGoalsSnapshot();
        }
    } catch (e) { alert("Error updating goal"); }
};

window.deleteGoal = async function(id) {
    if (!confirm("Delete this goal?")) return;
    try {
        const response = await fetch(`/api/goals/${id}`, { method: 'DELETE' });
        if (response.ok) {
            window.loadGoalsModal(document.getElementById('modal-body'));
            if (window.refreshGoalsSnapshot) window.refreshGoalsSnapshot();
        }
    } catch (e) { alert("Error deleting goal"); }
};
