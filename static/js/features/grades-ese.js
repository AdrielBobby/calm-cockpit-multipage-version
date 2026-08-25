/* ─────────────────────────────────────────────────────────────────
   grades-ese.js
   Handles the Grades & ESE Calculator modal.

   Arrow-nav:  Two "calculator" tabs cycle via ‹ › buttons and swipe.
               - Index 0 = "internals"
               - Index 1 = "ese"
               Semester History is NOT part of the arrow cycle.
   Swipe:      Attached once to #grades-tab-content (passive, 50px threshold).
   ───────────────────────────────────────────────────────────────── */

// ── Tab ordering for the arrow-nav cycle ──────────────────────────
const GRADES_CALC_TABS = ['internals', 'ese'];
const GRADES_CALC_LABELS = { internals: 'Internal Grades', ese: 'ESE Calculator' };
let gradesCurrentCalcIndex = 0;   // tracks position within the cycle
let gradesSwipeAttached = false;  // guard: attach swipe only once per modal open

// ── Main loader ───────────────────────────────────────────────────
window.loadGradesModal = async function(modalBody) {
    modalBody.innerHTML = '<p style="color: var(--text-muted);">Fetching grades...</p>';
    gradesCurrentCalcIndex = 0;

    try {
        const historyResponse = await fetch('/api/grades/history');
        const historyResult = await historyResponse.json();
        const data = historyResult.data;

        let html = `
            <div class="grades-tab-row" style="display: flex; gap: 16px; border-bottom: 1px solid var(--card-border); padding-bottom: 8px; margin-bottom: 24px;">
                <button class="modal-tab grades-tab-btn active" id="tab-history" onclick="switchGradesTab('history', this)" style="background:transparent; border:none; color:var(--text-main); font-weight:bold; cursor:pointer; padding: 8px 16px;">Semester History</button>
                <button class="modal-tab grades-tab-btn" id="tab-internals" onclick="switchGradesTab('internals', this)" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding: 8px 16px;">Internal Grades</button>
                <button class="modal-tab grades-tab-btn" id="tab-ese" onclick="switchGradesTab('ese', this)" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding: 8px 16px;">ESE Calculator</button>
            </div>

            <div id="grades-tab-content">
                ${renderHistoryTab(data)}
            </div>
        `;

        modalBody.innerHTML = html;
        window.gradesHistoryData = data;

        // Register swipe once on #grades-tab-content — navigates the two calculator views.
        if (!gradesSwipeAttached) {
            window.initSwipe(
                document.getElementById('grades-tab-content'),
                () => window.switchGradesTab('ese',       document.getElementById('tab-ese')),       // swipe left  → ESE
                () => window.switchGradesTab('internals', document.getElementById('tab-internals'))  // swipe right → Internal
            );
            gradesSwipeAttached = true;
        }

    } catch (error) {
        modalBody.innerHTML = `<p style="color: var(--accent-red);">Error loading grades history.</p>`;
    }
};

// ── Tab switcher ──────────────────────────────────────────────────
window.switchGradesTab = async function(tab, btn) {
    const container = document.getElementById('grades-tab-content');
    const tabs = document.querySelectorAll('.modal-tab');
    tabs.forEach(t => {
        t.style.color = 'var(--text-muted)';
        t.style.fontWeight = 'normal';
    });
    if (btn) {
        btn.style.color = 'var(--text-main)';
        btn.style.fontWeight = 'bold';
    }

    if (tab === 'history') {
        container.innerHTML = renderHistoryTab(window.gradesHistoryData);
        // History is outside the arrow cycle — no nav row needed
    } else if (tab === 'internals') {
        gradesCurrentCalcIndex = 0;
        await window.renderInternalsTab(container);
    } else if (tab === 'ese') {
        gradesCurrentCalcIndex = 1;
        window.renderEseTab(container);
    }
};

// ── Navigate via arrows ───────────────────────────────────────────
function _gradesNavTo(newIndex) {
    if (newIndex < 0 || newIndex >= GRADES_CALC_TABS.length) return;
    const tabId = GRADES_CALC_TABS[newIndex];
    const btn = document.getElementById(`tab-${tabId}`);
    window.switchGradesTab(tabId, btn);
}

// ── Stable arrow-nav row ──────────────────────────────────────────
// Injected once at the top of each calculator tab's content.
// On subsequent calls we just update label + button states in-place.
function _renderArrowNav(container) {
    // GUARD: Only inject arrow nav if we are inside the modal body
    if (container.id !== 'grades-tab-content') return;

    const idx = gradesCurrentCalcIndex;
    const label = GRADES_CALC_LABELS[GRADES_CALC_TABS[idx]];
    const atFirst = idx === 0;
    const atLast  = idx === GRADES_CALC_TABS.length - 1;

    // Check if nav row already exists in this container
    let navRow = container.querySelector('.view-nav-row');
    if (!navRow) {
        navRow = document.createElement('div');
        navRow.className = 'view-nav-row';
        navRow.innerHTML = `
            <button class="view-nav-btn" id="grades-nav-prev" aria-label="Previous view" onclick="_gradesNavTo(gradesCurrentCalcIndex - 1)">&#8249;</button>
            <span class="view-nav-label" id="grades-nav-label"></span>
            <button class="view-nav-btn" id="grades-nav-next" aria-label="Next view" onclick="_gradesNavTo(gradesCurrentCalcIndex + 1)">&#8250;</button>
        `;
        container.prepend(navRow);
    }

    // Update state without re-injecting
    navRow.querySelector('#grades-nav-label').textContent = label;
    const prevBtn = navRow.querySelector('#grades-nav-prev');
    const nextBtn = navRow.querySelector('#grades-nav-next');
    prevBtn.disabled = atFirst;
    nextBtn.disabled = atLast;
    prevBtn.setAttribute('aria-disabled', String(atFirst));
    nextBtn.setAttribute('aria-disabled', String(atLast));
}

// ── Internals tab renderer ────────────────────────────────────────
window.renderInternalsTab = async function(container) {
    container.innerHTML = '<p style="color: var(--text-muted);">Fetching internal marks...</p>';
    try {
        const [subjResp, marksResp] = await Promise.all([
            fetch('/api/grades/subjects'),
            fetch('/api/grades/internals')
        ]);
        const subjResult  = await subjResp.json();
        const marksResult = await marksResp.json();

        // marksResult.data is now a flat dict: { "SubjectName": { "mark": 45.0 } }
        // Legacy internal_number=2 records are surfaced here if no =1 row exists
        // (handled by the backend prefer-1-fallback-2 logic).
        const marksMap = marksResult.data || {};

        let html = `
            <div style="display: flex; flex-direction: column; gap: 24px;">
                <div style="background: rgba(255,255,255,0.02); padding: 16px; border-radius: 12px; border: 1px solid var(--card-border); display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end;">
                    <div style="flex: 1 1 200px;">
                        <label style="display:block; font-size: 0.7rem; color: var(--text-muted); margin-bottom: 4px;">New Subject Name</label>
                        <input type="text" id="new-subj-name" placeholder="e.g. Operating Systems" style="width: 100%; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 8px; border-radius: 6px;">
                    </div>
                    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                        <button onclick="addGradeSubject()" style="background: var(--accent-teal); color: var(--bg-color); border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; white-space: nowrap;">Add Subject</button>
                        <button onclick="clearData('grades-internals')" style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--accent-red); color: var(--accent-red); padding: 10px; border-radius: 8px; cursor: pointer; white-space: nowrap;">Clear All</button>
                    </div>
                </div>

                <div style="background: rgba(255,255,255,0.02); padding: 16px; border-radius: 12px; border: 1px solid var(--card-border);">
                    <h3 style="margin-bottom: 4px; font-size: 1.1rem;">Internal Marks Breakdown</h3>
                    <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 20px;">
                        One internal exam. Changes are saved automatically on blur.
                    </p>
                    <table style="width: 100%; border-collapse: collapse; text-align: left;">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--card-border); color: var(--text-muted);">
                                <th style="padding: 12px 8px;">Subject</th>
                                <th style="padding: 12px 8px;">Internal Marks</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        if (!subjResult.data || subjResult.data.length === 0) {
            html += `<tr><td colspan="2" style="padding: 16px 8px; color: var(--text-muted); font-style: italic;">No subjects added yet.</td></tr>`;
        } else {
            subjResult.data.forEach(subj => {
                const entry = marksMap[subj.name] || {};
                const mark  = entry.mark !== undefined && entry.mark !== null ? entry.mark : '';
                html += `
                    <tr style="border-bottom: 1px solid var(--card-border);">
                        <td style="padding: 12px 8px; font-weight: 600;">
                            <input type="text" value="${subj.name}"
                                   onchange="updateGradeSubjectName(${subj.subject_index}, this.value)"
                                   style="width: 100%; background: transparent; border: 1px solid transparent; color: var(--text-main); font-weight: 600; padding: 4px;">
                        </td>
                        <td style="padding: 12px 8px;">
                            <input type="number" value="${mark}"
                                   oninput="updateInternalMark(${subj.subject_index}, this)"
                                   data-subj-idx="${subj.subject_index}"
                                   placeholder="—"
                                   min="0" max="100" step="0.5"
                                   id="mark-input-${subj.subject_index}"
                                   style="width: 70px; background: transparent; border: 1px solid transparent; color: var(--accent-teal); font-weight: bold; padding: 4px; border-radius: 4px; transition: border-color 0.3s;">
                            <span id="mark-status-${subj.subject_index}" style="font-size:0.7rem; margin-left:4px;"></span>
                        </td>
                    </tr>
                `;
            });
        }

        html += `</tbody></table></div></div>`;
        container.innerHTML = html;
        _renderArrowNav(container);
    } catch (e) {
        container.innerHTML = `<p style="color: var(--accent-red);">Error loading internal marks.</p>`;
    }
}

// ── ESE tab renderer ──────────────────────────────────────────────
window.renderEseTab = function(container) {
    container.innerHTML = `
        <div class="ese-quick-view">
            <h3 style="font-size: 1.1rem;">ESE Requirement Calculator</h3>
            <div class="ese-input-grid">
                <input type="text" id="eseSubjectName" placeholder="Subject Name">
                <input type="number" id="eseCurrentMarks" placeholder="Current Marks">
                <input type="number" id="eseMaxSessional" placeholder="Max Sessional" value="50">
                <input type="number" id="eseMaxESE" placeholder="Max ESE" value="100">
            </div>
            <div class="ese-type-row">
                <button class="ese-preset-btn type-btn" onclick="eseSetPreset('theory', this)">Theory</button>
                <button class="ese-preset-btn type-btn" onclick="eseSetPreset('integrated', this)">Integrated</button>
                <button class="ese-preset-btn type-btn" onclick="eseSetPreset('lab', this)">Lab</button>
                <button id="eseAddSubjectBtn" class="add-subject-btn" onclick="eseAddSubject()">Add Subject</button>
            </div>
            <div id="eseSubjectsContainer" class="ese-subjects-container">
                <p class="ese-empty-state">Loading subjects...</p>
            </div>
        </div>
    `;
    _renderArrowNav(container);
    window.fetchEseSubjects();
}

// ── History tab renderer ──────────────────────────────────────────
function renderHistoryTab(data) {
    let html = `
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
            <div style="min-width: fit-content;">
                <h3 style="color: var(--text-muted); font-size: 0.9rem; text-transform: uppercase;">Overall Cumulative</h3>
                <div style="font-size: 3rem; font-weight: 800; color: var(--accent-purple); line-height: 1;">${data.cgpa}</div>
            </div>
            <div class="grades-add-row" style="display: flex; gap: 12px; align-items: flex-end;">
                <div>
                    <label style="display:block; font-size: 0.7rem; color: var(--text-muted);">Sem #</label>
                    <input type="number" id="new-sem-num" placeholder="1" style="width: 60px; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 8px; border-radius: 6px;">
                </div>
                <div>
                    <label style="display:block; font-size: 0.7rem; color: var(--text-muted);">SGPA</label>
                    <input type="number" step="0.01" id="new-sem-sgpa" placeholder="0.00" style="width: 80px; background: var(--bg-color); border: 1px solid var(--card-border); color: white; padding: 8px; border-radius: 6px;">
                </div>
                <button class="btn-primary" onclick="addSemesterRecord()" style="background: var(--accent-purple); color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Add</button>
                <button class="btn-danger" onclick="clearData('grades-history')" style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--accent-red); color: var(--accent-red); padding: 10px; border-radius: 8px; cursor: pointer;">Clear All</button>
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

/* ── ESE Calculator logic ─────────────────────────────────────────*/
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

    document.querySelectorAll('.ese-preset-btn').forEach(b => {
        b.style.background = 'rgba(255,255,255,0.05)';
        b.style.borderColor = 'var(--card-border)';
        b.style.color = 'white';
    });
    if (btn) {
        btn.style.background = 'var(--accent-teal)';
        btn.style.borderColor = 'var(--accent-teal)';
        btn.style.color = 'var(--bg-color)';
    }
};

window.fetchEseSubjects = async function() {
    try {
        const response = await fetch('/api/grades/ese-subjects');
        const result = await response.json();
        if (result.status === 'success') {
            window.eseSubjects = result.data.map(row => ({
                id: row.id,
                name: row.subject_name,
                current: row.current_marks,
                maxSess: row.max_sessional,
                maxESE: row.max_ese
            }));
            eseRenderSubjects();
        }
    } catch (e) { console.error("Error fetching ESE subjects", e); }
};

window.eseAddSubject = async function() {
    const name = document.getElementById('eseSubjectName').value.trim();
    const current = parseFloat(document.getElementById('eseCurrentMarks').value);
    const maxSess = parseFloat(document.getElementById('eseMaxSessional').value);
    const maxESE = parseFloat(document.getElementById('eseMaxESE').value);
    if (!name || isNaN(current) || isNaN(maxSess) || isNaN(maxESE)) return alert('Fill in all fields');

    try {
        const response = await fetch('/api/grades/ese-subjects', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name, current, maxSess, maxESE })
        });
        if (response.ok) {
            document.getElementById('eseSubjectName').value = '';
            document.getElementById('eseCurrentMarks').value = '';
            window.fetchEseSubjects();
        }
    } catch (e) { console.error("Failed to add subject", e); }
};

window.eseDeleteSubject = async function(id) {
    if (!confirm("Remove this subject from calculator?")) return;
    try {
        const response = await fetch(`/api/grades/ese-subjects/${id}`, { method: 'DELETE' });
        if (response.ok) window.fetchEseSubjects();
    } catch (e) { console.error("Failed to delete subject", e); }
};

function eseRenderSubjects() {
    const elContainer = document.getElementById('eseSubjectsContainer');
    if (!elContainer) return;
    if (window.eseSubjects.length === 0) {
        elContainer.innerHTML = '<div class="ese-empty-state" style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">No subjects yet — add one above to get started.</div>';
        return;
    }
    elContainer.innerHTML = '';
    window.eseSubjects.forEach((subject) => {
        const totalMarks = subject.maxSess + subject.maxESE;
        const minESEThreshold = 0.4 * subject.maxESE;
        let rowsHTML = '';
        gradeThresholds.forEach(grade => {
            const targetTotal = (grade.min / 100) * totalMarks;
            const requiredESE = Math.ceil(targetTotal - subject.current);
            const possible = requiredESE <= subject.maxESE;
            const display = possible ? Math.max(requiredESE, Math.ceil(minESEThreshold)) : '—';
            const statusNote = !possible
                ? '<span style="color:var(--accent-red);font-size:0.7rem;margin-left:4px;">impossible</span>'
                : (requiredESE < minESEThreshold
                    ? `<span style="color:var(--accent-yellow);font-size:0.7rem;margin-left:4px;">min ${Math.ceil(minESEThreshold)}</span>`
                    : '');
            rowsHTML += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.02);"><td style="padding: 8px 4px;"><span style="color:${grade.color};font-weight:bold;">${grade.grade}</span></td><td style="padding: 8px 4px;">${grade.min}%</td><td style="padding: 8px 4px; font-weight:bold;">${display} ${statusNote}</td></tr>`;
        });
        const card = document.createElement('div');
        card.style = "background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 12px; padding: 16px;";
        card.innerHTML = `<div style="display:flex; justify-content:space-between; margin-bottom:12px;"><strong>${subject.name}</strong><button onclick="eseDeleteSubject(${subject.id})" aria-label="Delete subject" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:1.2rem;">${window.icon('x', { size: 16 })}</button></div><div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px; display:flex; gap:12px;"><span>Current: <b>${subject.current}/${subject.maxSess}</b></span><span>Max ESE: <b>${subject.maxESE}</b></span></div><table style="width:100%; font-size:0.85rem; border-collapse:collapse;"><thead><tr style="text-align:left; color:var(--text-muted); border-bottom:1px solid var(--card-border);"><th style="padding:4px;">Grade</th><th style="padding:4px;">Target</th><th style="padding:4px;">Min ESE</th></tr></thead><tbody>${rowsHTML}</tbody></table>`;
        elContainer.appendChild(card);
    });
}

window.addSemesterRecord = async function() {
    const num  = document.getElementById('new-sem-num').value;
    const sgpa = document.getElementById('new-sem-sgpa').value;
    if (!num || !sgpa) return alert("Fill all fields");
    try {
        const response = await fetch('/api/grades/add', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ number: parseInt(num), sgpa: parseFloat(sgpa) })
        });
        if (response.ok) window.loadGradesModal(document.getElementById('modal-body'));
    } catch (e) { alert("Error"); }
};

window.addGradeSubject = async function() {
    const name = document.getElementById('new-subj-name').value;
    if (!name) return;
    try {
        const response = await fetch('/api/grades/subjects/add', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name: name })
        });
        if (response.ok) switchGradesTab('internals', document.getElementById('tab-internals'));
    } catch (e) { alert("Error adding subject"); }
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

// ── Internal marks debounce timers ───────────────────────────────
const _internalMarkTimers = {};

window.updateInternalMark = async function(subjIdx, inputEl) {
    /**
     * Save the single internal mark for a subject.
     * Always writes to internal_number = 1 (canonical under the new model).
     * The backend also hardcodes internal_number = 1 as a safety net.
     *
     * Uses oninput + 500ms debounce so the request fires on every keystroke
     * change (including after Enter key) without spamming the API.
     * Shows inline visual feedback: green border + checkmark on success,
     * red border + error message on failure.
     */
    const mark = parseFloat(typeof inputEl === 'object' ? inputEl.value : inputEl);
    const el   = typeof inputEl === 'object' ? inputEl
                 : document.getElementById(`mark-input-${subjIdx}`);
    const statusEl = document.getElementById(`mark-status-${subjIdx}`);

    // Clear any pending timer for this subject
    if (_internalMarkTimers[subjIdx]) {
        clearTimeout(_internalMarkTimers[subjIdx]);
    }

    // Show pending state
    if (el) el.style.borderColor = 'var(--card-border)';
    if (statusEl) statusEl.textContent = '';

    _internalMarkTimers[subjIdx] = setTimeout(async () => {
        try {
            const resp = await fetch('/api/grades/internals/update', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ subject_index: subjIdx, mark: isNaN(mark) ? null : mark })
            });
            const result = await resp.json();
            if (result.status === 'success') {
                // Green flash: success
                if (el) {
                    el.style.borderColor = 'var(--accent-teal)';
                    setTimeout(() => { if (el) el.style.borderColor = 'transparent'; }, 1500);
                }
                if (statusEl) {
                    statusEl.style.color = 'var(--accent-teal)';
                    statusEl.textContent = '\u2713';
                    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 1500);
                }
            } else {
                throw new Error(result.message || 'Save failed');
            }
        } catch (e) {
            // Red error: failure
            if (el) {
                el.style.borderColor = 'var(--accent-red)';
                setTimeout(() => { if (el) el.style.borderColor = 'transparent'; }, 3000);
            }
            if (statusEl) {
                statusEl.style.color = 'var(--accent-red)';
                statusEl.textContent = 'Error';
                setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
            }
            console.error('Failed to update internal mark:', e);
        }
    }, 500);
};

// Expose nav function globally (called from onclick attributes)
window._gradesNavTo = _gradesNavTo;
