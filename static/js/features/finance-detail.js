window.loadFinanceModal = async function(modalBody) {
    modalBody.innerHTML = '<p style="color: var(--text-muted);">Fetching finance data...</p>';
    try {
        const summaryResponse = await fetch('/api/finance/summary');
        const summaryResult = await summaryResponse.json();
        
        const transResponse = await fetch('/api/finance/transactions');
        const transResult = await transResponse.json();
        
        let html = '<div style="display: flex; gap: 24px; flex-direction: column;">';
        
        // 1. Balance Breakout & Clear All
        html += `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; flex: 1;">
                    <div style="background: rgba(255,255,255,0.02); padding: 16px; border-radius: 12px; border: 1px solid var(--card-border);">
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px;">Net Balance</div>
                        <div style="font-size: 1.5rem; font-weight: 700; color: var(--accent-purple);">₹${summaryResult.data.balance}</div>
                    </div>
        `;
        
        for (const [acc, bal] of Object.entries(summaryResult.data.accounts)) {
            html += `
                <div style="background: rgba(255,255,255,0.02); padding: 16px; border-radius: 12px; border: 1px solid var(--card-border);">
                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px;">${acc}</div>
                    <div style="font-size: 1.2rem; font-weight: 600;">₹${bal}</div>
                </div>
            `;
        }
        html += `
                </div>
                <button onclick="clearData('finance')" style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--accent-red); color: var(--accent-red); padding: 12px 24px; border-radius: 12px; cursor: pointer; font-weight: bold;">Clear History</button>
            </div>
        `;

        // 2. Add Transaction Form
        html += `
            <div style="background: rgba(255,255,255,0.02); padding: 20px; border-radius: 12px; border: 1px solid var(--card-border);">
                <h3 style="margin-bottom: 16px; font-size: 1rem;">Add Transaction</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; align-items: flex-end;">
                    <div>
                        <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Date</label>
                        <input type="date" id="ft-date" value="${new Date().toISOString().split('T')[0]}" style="width: 100%; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 8px; border-radius: 6px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Account</label>
                        <select id="ft-account" style="width: 100%; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 8px; border-radius: 6px;">
                            <option value="Cash">Cash</option>
                            <option value="HDFC">HDFC</option>
                            <option value="Metro Card">Metro Card</option>
                        </select>
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Type</label>
                        <select id="ft-type" style="width: 100%; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 8px; border-radius: 6px;">
                            <option value="expense">Expense</option>
                            <option value="income">Income</option>
                        </select>
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Amount</label>
                        <input type="number" id="ft-amount" placeholder="0" style="width: 100%; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 8px; border-radius: 6px;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Category</label>
                        <input type="text" id="ft-category" placeholder="Food, Travel..." style="width: 100%; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 8px; border-radius: 6px;">
                    </div>
                    <button onclick="addFinanceTransaction()" style="background: var(--accent-purple); color: white; border: none; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer;">Add</button>
                </div>
            </div>
        `;

        // 3. Transaction Log
        html += `
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                    <tr style="border-bottom: 1px solid var(--card-border); color: var(--text-muted); font-size: 0.85rem;">
                        <th style="padding: 12px 8px;">Date</th>
                        <th style="padding: 12px 8px;">Account</th>
                        <th style="padding: 12px 8px;">Category</th>
                        <th style="padding: 12px 8px;">Amount</th>
                        <th style="padding: 12px 8px;"></th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        transResult.data.forEach(t => {
            const isExpense = t.type === 'expense';
            html += `
                <tr style="border-bottom: 1px solid var(--card-border); font-size: 0.9rem;">
                    <td style="padding: 12px 8px;">${t.date}</td>
                    <td style="padding: 12px 8px;">${t.account_name}</td>
                    <td style="padding: 12px 8px;">${t.category || '-'}</td>
                    <td style="padding: 12px 8px; color: ${isExpense ? 'var(--accent-red)' : 'var(--accent-teal)'}; font-weight: 600;">
                        ${isExpense ? '-' : '+'}₹${t.amount}
                    </td>
                    <td style="padding: 12px 8px; text-align: right;">
                        <button onclick="deleteTransaction(${t.id})" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.1rem;">&times;</button>
                    </td>
                </tr>
            `;
        });
        
        html += '</tbody></table></div>';
        modalBody.innerHTML = html;
        
    } catch (error) {
        modalBody.innerHTML = `<p style="color: var(--accent-red);">Error loading finance data.</p>`;
    }
};

window.addFinanceTransaction = async function() {
    const data = {
        date: document.getElementById('ft-date').value,
        account: document.getElementById('ft-account').value,
        type: document.getElementById('ft-type').value,
        amount: parseFloat(document.getElementById('ft-amount').value),
        category: document.getElementById('ft-category').value,
        note: ""
    };
    
    if (!data.amount) return alert("Please enter an amount");

    try {
        const response = await fetch('/api/finance/transaction', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        if (response.ok) {
            window.loadFinanceModal(document.getElementById('modal-body'));
            if (window.refreshFinanceSnapshot) window.refreshFinanceSnapshot();
        }
    } catch (e) {
        alert("Error adding transaction");
    }
};

window.deleteTransaction = async function(id) {
    if (!confirm("Delete this transaction?")) return;
    try {
        const response = await fetch(`/api/finance/transaction/${id}`, { method: 'DELETE' });
        if (response.ok) {
            window.loadFinanceModal(document.getElementById('modal-body'));
            if (window.refreshFinanceSnapshot) window.refreshFinanceSnapshot();
        }
    } catch (e) {
        alert("Error deleting transaction");
    }
};
