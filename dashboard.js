// Doctor Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Initialize dashboard
    initializeDashboard();
    setupDashboardEventListeners();
    loadDashboardData();
    
    // Session timer
    startSessionTimer();
    
    // Socket for real-time updates
    initializeDashboardSocket();
});

// Initialize Dashboard
function initializeDashboard() {
    // Set today's date in date inputs
    const today = new Date().toISOString().split('T')[0];
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => {
        if (!input.value) {
            input.value = today;
            input.min = today;
        }
    });
    
    // Initialize calendar
    initializeLeaveCalendar();
    
    // Load queue data
    loadQueueData();
}

// Setup Event Listeners
function setupDashboardEventListeners() {
    // Serve button
    document.getElementById('serve-btn').addEventListener('click', serveCurrentPatient);
    
    // Skip button
    document.getElementById('skip-btn').addEventListener('click', skipCurrentPatient);
    
    // Call next button
    document.getElementById('call-next-btn').addEventListener('click', callNextPatient);
    
    // Delay button
    document.getElementById('delay-btn').addEventListener('click', addDelay);
    
    // Apply delay button
    document.getElementById('apply-delay').addEventListener('click', applyDelay);
    
    // Session control buttons
    document.getElementById('start-session').addEventListener('click', startSession);
    document.getElementById('pause-session').addEventListener('click', pauseSession);
    document.getElementById('end-session').addEventListener('click', endSession);
    
    // Leave management buttons
    document.getElementById('add-planned-leave').addEventListener('click', showAddLeaveModal);
    document.getElementById('emergency-leave').addEventListener('click', showEmergencyLeaveModal);
    document.getElementById('confirm-emergency').addEventListener('click', activateEmergencyLeave);
    
    // Search functionality
    document.getElementById('search-queue').addEventListener('input', filterQueue);
    document.getElementById('refresh-queue').addEventListener('click', loadQueueData);
    
    // Modal close buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            this.closest('.modal').classList.add('hidden');
        });
    });
    
    // Planned leave form submission
    document.getElementById('planned-leave-form').addEventListener('submit', addPlannedLeave);
    
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            // Remove active class from all items
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            // Add active class to clicked item
            this.classList.add('active');
            
            // Show corresponding section
            const targetId = this.getAttribute('href').substring(1);
            showSection(targetId);
        });
    });
    
    // Logout
    document.getElementById('logout-btn').addEventListener('click', logout);
}

// Initialize Dashboard Socket
function initializeDashboardSocket() {
    const socket = io('http://localhost:3000/dashboard');
    
    socket.on('connect', () => {
        console.log('Dashboard connected to server');
    });
    
    socket.on('queueUpdate', (data) => {
        updateQueueTable(data);
        updateCurrentPatient(data.currentPatient);
    });
    
    socket.on('newBooking', (booking) => {
        showNewBookingNotification(booking);
        loadQueueData(); // Refresh queue
    });
    
    socket.on('patientCancelled', (data) => {
        showNotification('Patient Cancelled', `Token #${data.tokenNumber} cancelled by patient.`);
        loadQueueData(); // Refresh queue
    });
}

// Load Dashboard Data
async function loadDashboardData() {
    try {
        // Load today's summary
        const summaryResponse = await fetch('http://localhost:3000/api/dashboard/today-summary');
        const summaryData = await summaryResponse.json();
        
        if (summaryData.success) {
            updateTodaySummary(summaryData);
        }
        
        // Load queue data
        loadQueueData();
        
        // Load upcoming leaves
        loadUpcomingLeaves();
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

// Update Today's Summary
function updateTodaySummary(data) {
    document.getElementById('total-patients').textContent = data.totalPatients || 0;
    document.getElementById('waiting-patients').textContent = data.waitingPatients || 0;
    document.getElementById('served-patients').textContent = data.servedPatients || 0;
    document.getElementById('avg-patient-time').textContent = `${data.avgConsultationTime || 0}m`;
    
    // Update queue summary
    document.getElementById('queue-total').textContent = data.waitingPatients || 0;
    
    // Calculate estimated completion
    if (data.waitingPatients && data.avgConsultationTime) {
        const totalMinutes = data.waitingPatients * data.avgConsultationTime;
        const completionTime = new Date(Date.now() + totalMinutes * 60000);
        const formattedTime = completionTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        document.getElementById('queue-completion').textContent = formattedTime;
    }
}

// Load Queue Data
async function loadQueueData() {
    try {
        const response = await fetch('http://localhost:3000/api/queue');
        const data = await response.json();
        
        if (data.success) {
            updateQueueTable(data);
            updateCurrentPatient(data.currentPatient);
        }
    } catch (error) {
        console.error('Error loading queue:', error);
    }
}

// Update Queue Table
function updateQueueTable(data) {
    const tableBody = document.getElementById('queue-table-body');
    tableBody.innerHTML = '';
    
    if (data.queue && data.queue.length > 0) {
        data.queue.forEach((patient, index) => {
            const row = document.createElement('tr');
            
            // Calculate wait time
            const bookingTime = new Date(patient.createdAt);
            const waitTime = Math.floor((Date.now() - bookingTime) / 60000); // in minutes
            
            row.innerHTML = `
                <td>${patient.tokenNumber}</td>
                <td>
                    <strong>${patient.patientName}</strong>
                    ${patient.symptoms ? `<br><small>${patient.symptoms}</small>` : ''}
                </td>
                <td>${patient.patientAge}</td>
                <td>${patient.patientPhone}</td>
                <td>${waitTime} min</td>
                <td><span class="status-badge ${patient.status}">${patient.status.toUpperCase()}</span></td>
                <td>
                    <div class="queue-actions">
                        <button class="btn-icon" onclick="servePatient('${patient._id}')" title="Serve">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn-icon" onclick="skipPatient('${patient._id}')" title="Skip">
                            <i class="fas fa-forward"></i>
                        </button>
                        <button class="btn-icon" onclick="callPatient('${patient._id}')" title="Call">
                            <i class="fas fa-bullhorn"></i>
                        </button>
                    </div>
                </td>
            `;
            
            tableBody.appendChild(row);
        });
    } else {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">No patients in queue</td>
            </tr>
        `;
    }
}

// Update Current Patient
function updateCurrentPatient(patient) {
    if (patient) {
        document.getElementById('current-token-number').textContent = patient.tokenNumber;
        document.getElementById('current-patient-name').textContent = patient.patientName;
        document.getElementById('current-symptoms').textContent = patient.symptoms || 'No symptoms reported';
        
        // Calculate and update wait time
        const bookingTime = new Date(patient.createdAt);
        const waitTime = Math.floor((Date.now() - bookingTime) / 60000);
        document.querySelector('.patient-meta span:nth-child(3)').innerHTML = 
            `<i class="fas fa-clock"></i> Waiting: ${waitTime} min`;
    }
}

// Serve Current Patient
async function serveCurrentPatient() {
    try {
        const response = await fetch('http://localhost:3000/api/queue/serve-current', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Patient Served', `Token #${data.tokenNumber} marked as served.`);
            loadQueueData(); // Refresh queue
        } else {
            showNotification('Error', data.message || 'Failed to serve patient.');
        }
    } catch (error) {
        console.error('Error serving patient:', error);
        showNotification('Error', 'Failed to serve patient.');
    }
}

// Serve Specific Patient
async function servePatient(patientId) {
    try {
        const response = await fetch(`http://localhost:3000/api/queue/${patientId}/serve`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Patient Served', `Token #${data.tokenNumber} marked as served.`);
            loadQueueData(); // Refresh queue
        } else {
            showNotification('Error', data.message || 'Failed to serve patient.');
        }
    } catch (error) {
        console.error('Error serving patient:', error);
        showNotification('Error', 'Failed to serve patient.');
    }
}

// Skip Current Patient
async function skipCurrentPatient() {
    if (!confirm('Are you sure you want to skip this patient?')) {
        return;
    }
    
    try {
        const response = await fetch('http://localhost:3000/api/queue/skip-current', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Patient Skipped', `Token #${data.tokenNumber} skipped.`);
            loadQueueData(); // Refresh queue
        } else {
            showNotification('Error', data.message || 'Failed to skip patient.');
        }
    } catch (error) {
        console.error('Error skipping patient:', error);
        showNotification('Error', 'Failed to skip patient.');
    }
}

// Skip Specific Patient
async function skipPatient(patientId) {
    if (!confirm('Are you sure you want to skip this patient?')) {
        return;
    }
    
    try {
        const response = await fetch(`http://localhost:3000/api/queue/${patientId}/skip`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Patient Skipped', `Token #${data.tokenNumber} skipped.`);
            loadQueueData(); // Refresh queue
        } else {
            showNotification('Error', data.message || 'Failed to skip patient.');
        }
    } catch (error) {
        console.error('Error skipping patient:', error);
        showNotification('Error', 'Failed to skip patient.');
    }
}

// Call Next Patient
async function callNextPatient() {
    try {
        const response = await fetch('http://localhost:3000/api/queue/call-next', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Next Patient Called', `Called Token #${data.tokenNumber}.`);
            
            // Update current patient display
            updateCurrentPatient(data.patient);
            
            // Send notification to patient
            await sendPatientNotification(data.patient._id, 'called');
            
        } else {
            showNotification('Error', data.message || 'Failed to call next patient.');
        }
    } catch (error) {
        console.error('Error calling next patient:', error);
        showNotification('Error', 'Failed to call next patient.');
    }
}

// Call Specific Patient
async function callPatient(patientId) {
    try {
        const response = await fetch(`http://localhost:3000/api/queue/${patientId}/call`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Patient Called', `Called Token #${data.tokenNumber}.`);
            
            // Update current patient display if this is the next patient
            if (data.isCurrent) {
                updateCurrentPatient(data.patient);
            }
            
            // Send notification to patient
            await sendPatientNotification(patientId, 'called');
            
        } else {
            showNotification('Error', data.message || 'Failed to call patient.');
        }
    } catch (error) {
        console.error('Error calling patient:', error);
        showNotification('Error', 'Failed to call patient.');
    }
}

// Add Delay
function addDelay() {
    document.getElementById('delay-minutes').focus();
}

// Apply Delay
async function applyDelay() {
    const delayMinutes = parseInt(document.getElementById('delay-minutes').value) || 0;
    
    if (delayMinutes <= 0) {
        showNotification('Warning', 'Please enter a valid delay time.');
        return;
    }
    
    try {
        const response = await fetch('http://localhost:3000/api/session/delay', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ delayMinutes })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Delay Applied', `${delayMinutes} minute delay applied to all patients.`);
            
            // Update session timer
            updateSessionTimer(delayMinutes * 60000);
            
            // Notify all waiting patients
            await notifyAllPatientsOfDelay(delayMinutes);
            
        } else {
            showNotification('Error', data.message || 'Failed to apply delay.');
        }
    } catch (error) {
        console.error('Error applying delay:', error);
        showNotification('Error', 'Failed to apply delay.');
    }
}

// Start Session
async function startSession() {
    try {
        const response = await fetch('http://localhost:3000/api/session/start', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Session Started', 'OPD session started successfully.');
            
            // Update UI
            document.querySelector('.session-badge').textContent = 'OPD Session Active';
            document.querySelector('.session-badge').classList.add('active');
            
            // Start session timer
            startSessionTimer();
            
        } else {
            showNotification('Error', data.message || 'Failed to start session.');
        }
    } catch (error) {
        console.error('Error starting session:', error);
        showNotification('Error', 'Failed to start session.');
    }
}

// Pause Session
async function pauseSession() {
    try {
        const response = await fetch('http://localhost:3000/api/session/pause', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Session Paused', 'OPD session paused.');
            
            // Update UI
            document.querySelector('.session-badge').textContent = 'Session Paused';
            document.querySelector('.session-badge').classList.remove('active');
            document.querySelector('.session-badge').classList.add('warning');
            
        } else {
            showNotification('Error', data.message || 'Failed to pause session.');
        }
    } catch (error) {
        console.error('Error pausing session:', error);
        showNotification('Error', 'Failed to pause session.');
    }
}

// End Session
async function endSession() {
    if (!confirm('Are you sure you want to end the session? All waiting patients will be notified.')) {
        return;
    }
    
    try {
        const response = await fetch('http://localhost:3000/api/session/end', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Session Ended', 'OPD session ended successfully.');
            
            // Update UI
            document.querySelector('.session-badge').textContent = 'Session Ended';
            document.querySelector('.session-badge').classList.remove('active');
            document.querySelector('.session-badge').classList.add('danger');
            
            // Clear session timer
            clearInterval(window.sessionTimerInterval);
            
            // Notify remaining patients
            await notifySessionEnd();
            
        } else {
            showNotification('Error', data.message || 'Failed to end session.');
        }
    } catch (error) {
        console.error('Error ending session:', error);
        showNotification('Error', 'Failed to end session.');
    }
}

// Start Session Timer
function startSessionTimer() {
    const timerElement = document.getElementById('session-timer');
    let totalSeconds = 3 * 60 * 60; // 3 hours in seconds
    
    window.sessionTimerInterval = setInterval(() => {
        if (totalSeconds <= 0) {
            clearInterval(window.sessionTimerInterval);
            timerElement.textContent = '00:00:00';
            return;
        }
        
        totalSeconds--;
        
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        timerElement.textContent = 
            `${hours.toString().padStart(2, '0')}:` +
            `${minutes.toString().padStart(2, '0')}:` +
            `${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

// Update Session Timer (add delay)
function updateSessionTimer(delayMs) {
    if (window.sessionTimerInterval) {
        clearInterval(window.sessionTimerInterval);
        startSessionTimer(); // Restart timer with new duration
    }
}

// Initialize Leave Calendar
function initializeLeaveCalendar() {
    const calendarElement = document.getElementById('leave-calendar');
    
    // Simple calendar display for current month
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Create calendar HTML
    let calendarHTML = `
        <div class="calendar-header">
            <button class="calendar-nav" onclick="changeCalendarMonth(-1)"><i class="fas fa-chevron-left"></i></button>
            <h4>${today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h4>
            <button class="calendar-nav" onclick="changeCalendarMonth(1)"><i class="fas fa-chevron-right"></i></button>
        </div>
        <div class="calendar-grid">
            <div class="calendar-weekday">Sun</div>
            <div class="calendar-weekday">Mon</div>
            <div class="calendar-weekday">Tue</div>
            <div class="calendar-weekday">Wed</div>
            <div class="calendar-weekday">Thu</div>
            <div class="calendar-weekday">Fri</div>
            <div class="calendar-weekday">Sat</div>
    `;
    
    // Get first day of month
    const firstDay = new Date(currentYear, currentMonth, 1);
    const startingDay = firstDay.getDay();
    
    // Add empty cells for days before first day of month
    for (let i = 0; i < startingDay; i++) {
        calendarHTML += `<div class="calendar-day empty"></div>`;
    }
    
    // Get days in month
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    // Add days of month
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentYear, currentMonth, day);
        const dateString = date.toISOString().split('T')[0];
        const isToday = date.toDateString() === today.toDateString();
        const isLeaveDay = isLeaveDate(dateString);
        
        let dayClass = 'calendar-day';
        if (isToday) dayClass += ' today';
        if (isLeaveDay) dayClass += ' leave-day';
        if (date < today) dayClass += ' past-day';
        
        calendarHTML += `
            <div class="${dayClass}" data-date="${dateString}">
                ${day}
                ${isLeaveDay ? '<span class="leave-indicator"></span>' : ''}
            </div>
        `;
    }
    
    calendarHTML += '</div>';
    calendarElement.innerHTML = calendarHTML;
    
    // Add click event to days
    document.querySelectorAll('.calendar-day:not(.empty):not(.past-day)').forEach(day => {
        day.addEventListener('click', function() {
            const date = this.getAttribute('data-date');
            showAddLeaveModal(date);
        });
    });
}

// Check if date is a leave day
function isLeaveDate(dateString) {
    // This would typically come from the server
    // For demo, we'll use some example dates
    const leaveDates = [
        '2024-12-25',
        '2024-12-31',
        '2025-01-01'
    ];
    return leaveDates.includes(dateString);
}

// Load Upcoming Leaves
async function loadUpcomingLeaves() {
    try {
        const response = await fetch('http://localhost:3000/api/leaves/upcoming');
        const data = await response.json();
        
        if (data.success) {
            displayUpcomingLeaves(data.leaves);
        }
    } catch (error) {
        console.error('Error loading leaves:', error);
    }
}

// Display Upcoming Leaves
function displayUpcomingLeaves(leaves) {
    const leavesContainer = document.getElementById('upcoming-leaves');
    
    if (!leaves || leaves.length === 0) {
        leavesContainer.innerHTML = '<p class="no-leaves">No upcoming leaves scheduled.</p>';
        return;
    }
    
    let leavesHTML = '';
    
    leaves.forEach(leave => {
        const leaveDate = new Date(leave.date);
        const formattedDate = leaveDate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
        
        leavesHTML += `
            <div class="leave-item">
                <div class="leave-date">${formattedDate}</div>
                <div class="leave-reason">${leave.reason}</div>
                <div class="leave-actions">
                    <button class="btn-icon" onclick="cancelLeave('${leave._id}')" title="Cancel Leave">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    leavesContainer.innerHTML = leavesHTML;
}

// Show Add Leave Modal
function showAddLeaveModal(prefilledDate = '') {
    const modal = document.getElementById('planned-leave-modal');
    const dateInput = document.getElementById('leave-date');
    
    if (prefilledDate) {
        dateInput.value = prefilledDate;
    } else {
        // Set minimum date to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateInput.min = tomorrow.toISOString().split('T')[0];
        dateInput.value = '';
    }
    
    modal.classList.remove('hidden');
}

// Add Planned Leave
async function addPlannedLeave(event) {
    event.preventDefault();
    
    const leaveDate = document.getElementById('leave-date').value;
    const reason = document.getElementById('leave-reason').value;
    const notes = document.getElementById('leave-notes').value;
    const notifySMS = document.getElementById('leave-notify-sms').checked;
    const notifyWhatsapp = document.getElementById('leave-notify-whatsapp').checked;
    
    try {
        const response = await fetch('http://localhost:3000/api/leaves', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                date: leaveDate,
                reason,
                notes,
                notifications: {
                    sms: notifySMS,
                    whatsapp: notifyWhatsapp
                }
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Leave Added', `Leave scheduled for ${leaveDate}.`);
            
            // Close modal
            document.getElementById('planned-leave-modal').classList.add('hidden');
            
            // Reset form
            event.target.reset();
            
            // Refresh leaves list
            loadUpcomingLeaves();
            initializeLeaveCalendar();
            
        } else {
            showNotification('Error', data.message || 'Failed to add leave.');
        }
    } catch (error) {
        console.error('Error adding leave:', error);
        showNotification('Error', 'Failed to add leave.');
    }
}

// Cancel Leave
async function cancelLeave(leaveId) {
    if (!confirm('Are you sure you want to cancel this leave?')) {
        return;
    }
    
    try {
        const response = await fetch(`http://localhost:3000/api/leaves/${leaveId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Leave Cancelled', 'Leave has been cancelled.');
            loadUpcomingLeaves();
            initializeLeaveCalendar();
        } else {
            showNotification('Error', data.message || 'Failed to cancel leave.');
        }
    } catch (error) {
        console.error('Error cancelling leave:', error);
        showNotification('Error', 'Failed to cancel leave.');
    }
}

// Show Emergency Leave Modal
function showEmergencyLeaveModal() {
    if (!confirm('Emergency leave will cancel all today\'s appointments. Are you sure?')) {
        return;
    }
    
    // Focus on reason textarea
    document.getElementById('emergency-reason').focus();
}

// Activate Emergency Leave
async function activateEmergencyLeave() {
    const reason = document.getElementById('emergency-reason').value.trim();
    const notifySMS = document.getElementById('notify-sms').checked;
    const notifyWhatsapp = document.getElementById('notify-whatsapp').checked;
    const notifyCall = document.getElementById('notify-call').checked;
    
    if (!reason) {
        showNotification('Error', 'Please provide a reason for emergency leave.');
        return;
    }
    
    if (!confirm('This will cancel ALL appointments for today and notify patients. Confirm?')) {
        return;
    }
    
    try {
        const response = await fetch('http://localhost:3000/api/leaves/emergency', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                reason,
                notifications: {
                    sms: notifySMS,
                    whatsapp: notifyWhatsapp,
                    call: notifyCall
                }
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Emergency Leave Activated', 'All appointments for today have been cancelled.');
            
            // Clear emergency form
            document.getElementById('emergency-reason').value = '';
            
            // Update UI
            document.querySelector('.session-badge').textContent = 'Emergency Leave';
            document.querySelector('.session-badge').classList.remove('active');
            document.querySelector('.session-badge').classList.add('danger');
            
            // Clear session timer
            clearInterval(window.sessionTimerInterval);
            document.getElementById('session-timer').textContent = '--:--:--';
            
            // Clear queue
            updateQueueTable({ queue: [] });
            updateCurrentPatient(null);
            
        } else {
            showNotification('Error', data.message || 'Failed to activate emergency leave.');
        }
    } catch (error) {
        console.error('Error activating emergency leave:', error);
        showNotification('Error', 'Failed to activate emergency leave.');
    }
}

// Filter Queue
function filterQueue() {
    const searchTerm = document.getElementById('search-queue').value.toLowerCase();
    const rows = document.querySelectorAll('#queue-table-body tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

// Send Patient Notification
async function sendPatientNotification(patientId, type) {
    try {
        await fetch(`http://localhost:3000/api/notifications/${patientId}/${type}`, {
            method: 'POST'
        });
    } catch (error) {
        console.error('Error sending notification:', error);
    }
}

// Notify All Patients of Delay
async function notifyAllPatientsOfDelay(delayMinutes) {
    try {
        await fetch('http://localhost:3000/api/notifications/delay-all', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ delayMinutes })
        });
    } catch (error) {
        console.error('Error notifying patients:', error);
    }
}

// Notify Session End
async function notifySessionEnd() {
    try {
        await fetch('http://localhost:3000/api/notifications/session-end', {
            method: 'POST'
        });
    } catch (error) {
        console.error('Error notifying session end:', error);
    }
}

// Show New Booking Notification
function showNewBookingNotification(booking) {
    const notification = document.createElement('div');
    notification.className = 'floating-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-user-plus"></i>
            <div>
                <strong>New Booking</strong>
                <p>Token #${booking.tokenNumber} for ${booking.patientName}</p>
            </div>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

// Show Notification
function showNotification(title, message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'floating-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-info-circle"></i>
            <div>
                <strong>${title}</strong>
                <p>${message}</p>
            </div>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

// Show Section
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.admin-section').forEach(section => {
        section.classList.add('hidden');
    });
    
    // Show target section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.remove('hidden');
    }
}

// Logout
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        // Clear any stored session data
        localStorage.removeItem('doctorToken');
        sessionStorage.removeItem('doctorSession');
        
        // Redirect to login page
        window.location.href = 'index.html';
    }
}

// Calendar navigation
function changeCalendarMonth(direction) {
    // This would update the calendar view to show next/previous month
    // For now, we'll just reload the current month
    initializeLeaveCalendar();
}

// Export functions for onclick handlers
window.servePatient = servePatient;
window.skipPatient = skipPatient;
window.callPatient = callPatient;
window.cancelLeave = cancelLeave;