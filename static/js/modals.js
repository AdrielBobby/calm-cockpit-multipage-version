// modals.js - Handles the central modal system

document.addEventListener('DOMContentLoaded', () => {
    const modalOverlay = document.getElementById('global-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const btnClose = document.getElementById('modal-close');
    
    const actionButtons = document.querySelectorAll('.btn-action');

    window.openCalendarAtDate = function(dateStr) {
        openModal('modal-calendar');
        // We'll let calendar-modal.js handle the specific date once it loads
        window.targetCalendarDate = dateStr;
    };

    function openModal(modalId) {
        modalOverlay.classList.add('active');
        const modalContent = document.querySelector('.modal-content');
        
        // Reset compact class
        modalContent.classList.remove('compact-modal');

        switch (modalId) {
            case 'modal-timetable':
                modalTitle.textContent = 'Full Timetable';
                if (window.loadTimetableModal) {
                    window.loadTimetableModal(modalBody);
                } else {
                    modalBody.innerHTML = '<p>Timetable module not loaded.</p>';
                }
                break;
            case 'modal-attendance':
                modalTitle.textContent = 'Full Attendance';
                if (window.loadAttendanceModal) {
                    window.loadAttendanceModal(modalBody);
                } else {
                    modalBody.innerHTML = '<p>Attendance module not loaded.</p>';
                }
                break;
            case 'modal-grades':
                modalTitle.textContent = 'Grades & ESE Calculator';
                if (window.loadGradesModal) {
                    window.loadGradesModal(modalBody);
                } else {
                    modalBody.innerHTML = '<p>Grades module not loaded.</p>';
                }
                break;
            case 'modal-finance':
                modalTitle.textContent = 'Finance Details';
                if (window.loadFinanceModal) {
                    window.loadFinanceModal(modalBody);
                } else {
                    modalBody.innerHTML = '<p>Finance module not loaded.</p>';
                }
                break;
            case 'modal-goals':
                modalTitle.textContent = 'Weekly Goals';
                if (window.loadGoalsModal) {
                    window.loadGoalsModal(modalBody);
                } else {
                    modalBody.innerHTML = '<p>Goals module not loaded.</p>';
                }
                break;
            case 'modal-projects':
                modalTitle.textContent = 'Projects Log';
                if (window.loadProjectsModal) {
                    window.loadProjectsModal(modalBody);
                } else {
                    modalBody.innerHTML = '<p>Projects module not loaded.</p>';
                }
                break;
            case 'modal-calendar':
                modalTitle.textContent = 'Calendar';
                modalContent.classList.add('compact-modal'); // Make it compact!
                if (window.loadCalendarModal) {
                    window.loadCalendarModal(modalBody);
                } else {
                    modalBody.innerHTML = '<p>Calendar module not loaded.</p>';
                }
                break;
            default:
                modalTitle.textContent = 'Details';
                modalBody.innerHTML = '<p>No content available.</p>';
        }
    }

    function closeModal() {
        modalOverlay.classList.remove('active');
        setTimeout(() => {
            modalBody.innerHTML = '';
            modalTitle.textContent = '';
        }, 200);
    }

    actionButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.target.getAttribute('data-modal');
            if (modalId) {
                openModal(modalId);
            }
        });
    });

    btnClose.addEventListener('click', closeModal);

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
            closeModal();
        }
    });

    // ── Tile → Project detail shortcut ───────────────────────────────
    // Called by project tile cards to open the modal directly into the
    // detail view for a given project id, skipping the list view.
    // Uses the same modal + renderProjectDetail infrastructure.
    window.openProjectFromTile = function(id) {
        // Open the modal overlay and set the title
        modalOverlay.classList.add('active');
        document.querySelector('.modal-content').classList.remove('compact-modal');
        modalTitle.textContent = 'Projects Log';

        // Populate the body — fetch project list first if not cached,
        // then jump straight into the detail view.
        if (window.projectsListData && window.projectsListData.find(p => p.id === id)) {
            window.renderProjectDetail(id);
        } else {
            // Data not cached yet — load the full list first (which caches it),
            // then replace the list render with the detail view.
            modalBody.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:24px;">Loading…</p>';
            fetch('/api/projects-data')
                .then(r => r.json())
                .then(result => {
                    if (result.status === 'success') {
                        window.projectsListData = result.data;
                        window.renderProjectDetail(id);
                    } else {
                        if (window.loadProjectsModal) window.loadProjectsModal(modalBody);
                    }
                })
                .catch(() => {
                    if (window.loadProjectsModal) window.loadProjectsModal(modalBody);
                });
        }
    };
});