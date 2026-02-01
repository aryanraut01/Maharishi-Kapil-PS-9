// DOM Elements
const bookTokenBtn = document.getElementById('book-token-btn');
const tokenDisplay = document.getElementById('token-display');
const startVoiceBtn = document.getElementById('start-voice-btn');
const stopVoiceBtn = document.getElementById('stop-voice-btn');
const voiceStatus = document.getElementById('voice-status');
const voiceOutput = document.getElementById('voice-output');
const voiceText = document.getElementById('voice-text');
const confirmVoiceBtn = document.getElementById('confirm-voice-booking');
const checkStatusBtn = document.getElementById('check-status-btn');
const statusResult = document.getElementById('status-result');
const cancelTokenBtn = document.getElementById('cancel-token');
const shareTokenBtn = document.getElementById('share-token');
const modal = document.getElementById('notification-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalOk = document.getElementById('modal-ok');
const closeModalBtns = document.querySelectorAll('.close-modal');

// State Variables
let recognition;
let currentToken = null;
let socket = null;
let voiceData = {
    name: '',
    phone: '',
    age: '',
    symptoms: ''
};

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('booking-date').min = today;
    document.getElementById('booking-date').value = today;
    
    // Initialize Socket.io connection
    initializeSocket();
    
    // Load initial data
    loadDashboardStats();
    loadLiveQueue();
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize QR Code if library is available
    if (typeof QRCode !== 'undefined') {
        // QR Code will be generated when token is created
    }
});

// Initialize Socket.io
function initializeSocket() {
    socket = io('http://localhost:3000');
    
    socket.on('connect', () => {
        console.log('Connected to server');
        showNotification('Connected', 'You are now connected to the clinic system.');
    });
    
    socket.on('queueUpdate', (data) => {
        updateLiveQueue(data);
        updateDashboardStats(data);
    });
    
    socket.on('tokenUpdate', (data) => {
        if (currentToken && currentToken.tokenNumber === data.tokenNumber) {
            updateTokenStatus(data);
        }
    });
    
    socket.on('notification', (data) => {
        showNotification(data.title, data.message);
    });
    
    socket.on('emergencyLeave', (data) => {
        showEmergencyNotification(data);
    });
}

// Setup Event Listeners
function setupEventListeners() {
    // Book Token Button
    bookTokenBtn.addEventListener('click', bookToken);
    
    // Voice Booking
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        
        recognition.onstart = () => {
            voiceStatus.innerHTML = '<p><i class="fas fa-microphone"></i> Listening... Speak now</p>';
            startVoiceBtn.disabled = true;
            stopVoiceBtn.disabled = false;
        };
        
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            voiceText.textContent = transcript;
            processVoiceCommand(transcript);
            voiceOutput.classList.remove('hidden');
        };
        
        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            voiceStatus.innerHTML = '<p>Error: ' + event.error + '</p>';
            resetVoiceControls();
        };
        
        recognition.onend = () => {
            resetVoiceControls();
        };
        
        startVoiceBtn.addEventListener('click', () => {
            recognition.start();
        });
        
        stopVoiceBtn.addEventListener('click', () => {
            recognition.stop();
        });
    } else {
        startVoiceBtn.disabled = true;
        voiceStatus.innerHTML = '<p>Speech recognition not supported in your browser. Try Chrome or Edge.</p>';
    }
    
    // Confirm Voice Booking
    confirmVoiceBtn.addEventListener('click', confirmVoiceBooking);
    
    // Check Status Button
    checkStatusBtn.addEventListener('click', checkTokenStatus);
    
    // Token Actions
    cancelTokenBtn.addEventListener('click', cancelToken);
    shareTokenBtn.addEventListener('click', shareToken);
    
    // Modal
    modalOk.addEventListener('click', () => {
        modal.classList.add('hidden');
    });
    
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    });
    
    // Form Submission
    document.getElementById('booking-date').addEventListener('change', checkAvailability);
}

// Book Token Function
async function bookToken() {
    const patientName = document.getElementById('patient-name').value.trim();
    const patientPhone = document.getElementById('patient-phone').value.trim();
    const patientAge = document.getElementById('patient-age').value;
    const patientGender = document.getElementById('patient-gender').value;
    const bookingDate = document.getElementById('booking-date').value;
    const symptoms = document.getElementById('symptoms').value.trim();
    const whatsappUpdates = document.getElementById('whatsapp-updates').checked;
    const smsUpdates = document.getElementById('sms-updates').checked;
    
    // Validation
    if (!patientName || !patientPhone || !patientAge || !bookingDate) {
        showNotification('Error', 'Please fill all required fields.');
        return;
    }
    
    if (!/^\d{10}$/.test(patientPhone)) {
        showNotification('Error', 'Please enter a valid 10-digit phone number.');
        return;
    }
    
    try {
        const response = await fetch('http://localhost:3000/api/tokens/book', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                patientName,
                patientPhone,
                patientAge: parseInt(patientAge),
                patientGender,
                bookingDate,
                symptoms,
                notifications: {
                    whatsapp: whatsappUpdates,
                    sms: smsUpdates
                }
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentToken = data.token;
            displayToken(data.token);
            showNotification('Success', `Token #${data.token.tokenNumber} booked successfully!`);
            
            // Send notifications
            if (whatsappUpdates || smsUpdates) {
                sendBookingConfirmation(data.token);
            }
        } else {
            showNotification('Error', data.message || 'Failed to book token.');
        }
    } catch (error) {
        console.error('Error booking token:', error);
        showNotification('Error', 'Failed to connect to server. Please try again.');
    }
}

// Display Token
function displayToken(token) {
    document.getElementById('token-no').textContent = token.tokenNumber;
    document.getElementById('token-name').textContent = token.patientName;
    document.getElementById('token-estimated-time').textContent = token.estimatedTime;
    document.getElementById('current-serving').textContent = token.currentServing || '--';
    document.getElementById('wait-ahead').textContent = `${token.waitAhead} patients`;
    
    // Generate QR Code
    const qrElement = document.getElementById('qrcode');
    qrElement.innerHTML = '';
    QRCode.toCanvas(qrElement, JSON.stringify({
        tokenId: token._id,
        tokenNumber: token.tokenNumber,
        patientName: token.patientName
    }), function(error) {
        if (error) console.error('QR Code error:', error);
    });
    
    tokenDisplay.classList.remove('hidden');
    
    // Scroll to token display
    tokenDisplay.scrollIntoView({ behavior: 'smooth' });
}

// Process Voice Command
function processVoiceCommand(transcript) {
    const lowerTranscript = transcript.toLowerCase();
    
    // Extract name
    const nameMatch = lowerTranscript.match(/book appointment for ([a-zA-Z ]+)/i) ||
                     lowerTranscript.match(/my name is ([a-zA-Z ]+)/i);
    if (nameMatch) {
        voiceData.name = nameMatch[1].trim();
    }
    
    // Extract phone
    const phoneMatch = lowerTranscript.match(/phone number is (\d{10})/i) ||
                      lowerTranscript.match(/\b(\d{10})\b/);
    if (phoneMatch) {
        voiceData.phone = phoneMatch[1];
    }
    
    // Extract age
    const ageMatch = lowerTranscript.match(/i am (\d+) years old/i) ||
                    lowerTranscript.match(/age (\d+)/i);
    if (ageMatch) {
        voiceData.age = ageMatch[1];
    }
    
    // Extract symptoms
    const symptomsMatch = lowerTranscript.match(/symptoms are ([^.]+)/i) ||
                         lowerTranscript.match(/i have ([^.]+)/i);
    if (symptomsMatch) {
        voiceData.symptoms = symptomsMatch[1].trim();
    }
    
    // Update form fields
    if (voiceData.name) document.getElementById('patient-name').value = voiceData.name;
    if (voiceData.phone) document.getElementById('patient-phone').value = voiceData.phone;
    if (voiceData.age) document.getElementById('patient-age').value = voiceData.age;
    if (voiceData.symptoms) document.getElementById('symptoms').value = voiceData.symptoms;
}

// Confirm Voice Booking
function confirmVoiceBooking() {
    // Fill missing fields if any
    if (!voiceData.name) {
        showNotification('Error', 'Please provide your name.');
        return;
    }
    
    if (!voiceData.phone) {
        showNotification('Error', 'Please provide your phone number.');
        return;
    }
    
    // Book the token
    bookToken();
    voiceOutput.classList.add('hidden');
    resetVoiceData();
}

// Reset Voice Data
function resetVoiceData() {
    voiceData = {
        name: '',
        phone: '',
        age: '',
        symptoms: ''
    };
}

// Reset Voice Controls
function resetVoiceControls() {
    startVoiceBtn.disabled = false;
    stopVoiceBtn.disabled = true;
    voiceStatus.innerHTML = '<p>Click "Start Voice Booking" and speak your details</p>';
}

// Check Token Status
async function checkTokenStatus() {
    const searchInput = document.getElementById('token-search').value.trim();
    
    if (!searchInput) {
        showNotification('Error', 'Please enter token number or phone number.');
        return;
    }
    
    try {
        const response = await fetch(`http://localhost:3000/api/tokens/status?search=${encodeURIComponent(searchInput)}`);
        const data = await response.json();
        
        if (data.success) {
            displayTokenStatus(data.token);
        } else {
            statusResult.innerHTML = `
                <div class="status-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${data.message}</p>
                </div>
            `;
            statusResult.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error checking status:', error);
        showNotification('Error', 'Failed to check status. Please try again.');
    }
}

// Display Token Status
function displayTokenStatus(token) {
    const statusClass = token.status === 'served' ? 'served' : 
                       token.status === 'cancelled' ? 'cancelled' : 'active';
    
    statusResult.innerHTML = `
        <div class="status-card ${statusClass}">
            <div class="status-header">
                <h3>Token #${token.tokenNumber}</h3>
                <span class="status-badge">${token.status.toUpperCase()}</span>
            </div>
            <div class="status-info">
                <p><strong>Patient:</strong> ${token.patientName}</p>
                <p><strong>Phone:</strong> ${token.patientPhone}</p>
                <p><strong>Status:</strong> ${token.status}</p>
                <p><strong>Estimated Time:</strong> ${token.estimatedTime || 'Not available'}</p>
                <p><strong>Wait Ahead:</strong> ${token.waitAhead || 0} patients</p>
                <p><strong>Current Token:</strong> ${token.currentServing || '--'}</p>
            </div>
            ${token.status === 'waiting' ? `
                <div class="status-actions">
                    <button class="btn-danger" onclick="cancelTokenById('${token._id}')">
                        <i class="fas fa-times"></i> Cancel Token
                    </button>
                </div>
            ` : ''}
        </div>
    `;
    statusResult.classList.remove('hidden');
}

// Cancel Token
async function cancelToken() {
    if (!currentToken) {
        showNotification('Error', 'No active token to cancel.');
        return;
    }
    
    if (!confirm('Are you sure you want to cancel this token?')) {
        return;
    }
    
    try {
        const response = await fetch(`http://localhost:3000/api/tokens/${currentToken._id}/cancel`, {
            method: 'PUT'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Success', 'Token cancelled successfully.');
            tokenDisplay.classList.add('hidden');
            currentToken = null;
        } else {
            showNotification('Error', data.message || 'Failed to cancel token.');
        }
    } catch (error) {
        console.error('Error cancelling token:', error);
        showNotification('Error', 'Failed to cancel token. Please try again.');
    }
}

// Cancel Token by ID
async function cancelTokenById(tokenId) {
    try {
        const response = await fetch(`http://localhost:3000/api/tokens/${tokenId}/cancel`, {
            method: 'PUT'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Success', 'Token cancelled successfully.');
            // Refresh status
            checkTokenStatus();
        } else {
            showNotification('Error', data.message || 'Failed to cancel token.');
        }
    } catch (error) {
        console.error('Error cancelling token:', error);
        showNotification('Error', 'Failed to cancel token. Please try again.');
    }
}

// Share Token
function shareToken() {
    if (!currentToken) {
        showNotification('Error', 'No token to share.');
        return;
    }
    
    const shareData = {
        title: `My Clinic Token #${currentToken.tokenNumber}`,
        text: `Token #${currentToken.tokenNumber} for ${currentToken.patientName}. Estimated time: ${currentToken.estimatedTime}`,
        url: window.location.href
    };
    
    if (navigator.share) {
        navigator.share(shareData)
            .then(() => console.log('Shared successfully'))
            .catch(error => console.log('Error sharing:', error));
    } else {
        // Fallback: Copy to clipboard
        const textToCopy = `Token #${currentToken.tokenNumber}\nPatient: ${currentToken.patientName}\nEstimated Time: ${currentToken.estimatedTime}\nCurrent Token: ${currentToken.currentServing || '--'}\nWait Ahead: ${currentToken.waitAhead} patients`;
        
        navigator.clipboard.writeText(textToCopy)
            .then(() => showNotification('Success', 'Token details copied to clipboard!'))
            .catch(err => {
                console.error('Failed to copy: ', err);
                showNotification('Error', 'Failed to copy to clipboard.');
            });
    }
}

// Check Availability
async function checkAvailability() {
    const date = document.getElementById('booking-date').value;
    
    if (!date) return;
    
    try {
        const response = await fetch(`http://localhost:3000/api/availability?date=${date}`);
        const data = await response.json();
        
        if (data.available) {
            document.getElementById('tokens-available').textContent = data.availableTokens;
            showNotification('Info', `${data.availableTokens} tokens available for ${date}`);
        } else {
            showNotification('Warning', `No tokens available for ${date}. Please select another date.`);
            document.getElementById('tokens-available').textContent = '0';
        }
    } catch (error) {
        console.error('Error checking availability:', error);
    }
}

// Load Dashboard Stats
async function loadDashboardStats() {
    try {
        const response = await fetch('http://localhost:3000/api/dashboard/stats');
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('patients-today').textContent = data.totalPatients;
            document.getElementById('avg-wait-time').textContent = data.avgWaitTime;
            document.getElementById('tokens-available').textContent = data.availableTokens;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load Live Queue
async function loadLiveQueue() {
    try {
        const response = await fetch('http://localhost:3000/api/queue/live');
        const data = await response.json();
        
        if (data.success) {
            updateLiveQueue(data);
        }
    } catch (error) {
        console.error('Error loading queue:', error);
    }
}

// Update Live Queue
function updateLiveQueue(data) {
    // Update current token
    if (data.currentToken) {
        document.getElementById('live-current-token').textContent = data.currentToken.tokenNumber;
        document.getElementById('live-patient-name').textContent = data.currentToken.patientName;
    }
    
    // Update upcoming tokens
    const upcomingList = document.getElementById('upcoming-tokens-list');
    upcomingList.innerHTML = '';
    
    if (data.upcomingTokens && data.upcomingTokens.length > 0) {
        data.upcomingTokens.forEach(token => {
            const tokenElement = document.createElement('div');
            tokenElement.className = 'token';
            tokenElement.textContent = token.tokenNumber;
            upcomingList.appendChild(tokenElement);
        });
    }
    
    // Update estimated wait time
    if (data.estimatedWaitTime) {
        document.getElementById('estimated-wait').textContent = data.estimatedWaitTime;
    }
}

// Update Dashboard Stats
function updateDashboardStats(data) {
    if (data.stats) {
        document.getElementById('patients-today').textContent = data.stats.totalPatients || 0;
        document.getElementById('avg-wait-time').textContent = data.stats.avgWaitTime || 15;
        document.getElementById('tokens-available').textContent = data.stats.availableTokens || 0;
    }
}

// Update Token Status
function updateTokenStatus(data) {
    if (currentToken && currentToken._id === data._id) {
        currentToken = { ...currentToken, ...data };
        
        if (data.status === 'served') {
            showNotification('Info', `Token #${data.tokenNumber} has been served.`);
            tokenDisplay.classList.add('hidden');
        } else if (data.status === 'cancelled') {
            showNotification('Info', `Token #${data.tokenNumber} has been cancelled.`);
            tokenDisplay.classList.add('hidden');
        } else {
            displayToken(currentToken);
        }
    }
}

// Send Booking Confirmation
async function sendBookingConfirmation(token) {
    try {
        const response = await fetch('http://localhost:3000/api/notifications/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                tokenId: token._id,
                type: 'booking_confirmation',
                phone: token.patientPhone
            })
        });
        
        const data = await response.json();
        if (data.success) {
            console.log('Notifications sent successfully');
        }
    } catch (error) {
        console.error('Error sending notifications:', error);
    }
}

// Show Notification
function showNotification(title, message) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modal.classList.remove('hidden');
}

// Show Emergency Notification
function showEmergencyNotification(data) {
    const notification = document.createElement('div');
    notification.className = 'emergency-notification';
    notification.innerHTML = `
        <div class="emergency-alert">
            <i class="fas fa-exclamation-triangle"></i>
            <div>
                <h4>EMERGENCY LEAVE NOTICE</h4>
                <p>${data.reason}</p>
                <p>All appointments for today have been cancelled.</p>
                ${data.rescheduleDate ? `<p>Please reschedule for: ${data.rescheduleDate}</p>` : ''}
            </div>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 30 seconds
    setTimeout(() => {
        notification.remove();
    }, 30000);
}

// Mobile Menu Toggle
document.querySelector('.menu-toggle').addEventListener('click', function() {
    const navLinks = document.querySelector('.nav-links');
    navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
});

// Update for responsive menu
window.addEventListener('resize', function() {
    const navLinks = document.querySelector('.nav-links');
    if (window.innerWidth > 768) {
        navLinks.style.display = 'flex';
    } else {
        navLinks.style.display = 'none';
    }
});