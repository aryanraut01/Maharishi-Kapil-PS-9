const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const twilio = require('twilio');
require('dotenv').config();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/clinic-token-system', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// MongoDB Models
const Token = require('./models/Token');
const Doctor = require('./models/Doctor');
const Clinic = require('./models/Clinic');
const Leave = require('./models/Leave');
const Session = require('./models/Session');
const User = require('./models/User');

// Twilio Configuration (for SMS/WhatsApp)
const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Access token required' });
    
    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Socket.io connections
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    // Join room based on user type
    socket.on('joinRoom', (room) => {
        socket.join(room);
        console.log(`Socket ${socket.id} joined room: ${room}`);
    });
    
    // Handle token booking
    socket.on('bookToken', async (data) => {
        try {
            const token = await createToken(data);
            io.to('doctor').emit('newBooking', token);
            io.to('public').emit('queueUpdate', await getQueueStatus());
            socket.emit('bookingConfirmed', token);
        } catch (error) {
            socket.emit('bookingError', error.message);
        }
    });
    
    // Handle token cancellation
    socket.on('cancelToken', async (tokenId) => {
        try {
            const token = await Token.findByIdAndUpdate(
                tokenId,
                { status: 'cancelled' },
                { new: true }
            );
            io.to('doctor').emit('patientCancelled', token);
            io.to('public').emit('queueUpdate', await getQueueStatus());
        } catch (error) {
            console.error('Error cancelling token:', error);
        }
    });
    
    // Handle token served
    socket.on('serveToken', async (tokenId) => {
        try {
            const token = await Token.findByIdAndUpdate(
                tokenId,
                { 
                    status: 'served',
                    servedAt: new Date()
                },
                { new: true }
            );
            io.to('public').emit('tokenUpdate', token);
            io.to('public').emit('queueUpdate', await getQueueStatus());
        } catch (error) {
            console.error('Error serving token:', error);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// API Routes

// Token Booking
app.post('/api/tokens/book', async (req, res) => {
    try {
        const {
            patientName,
            patientPhone,
            patientAge,
            patientGender,
            bookingDate,
            symptoms,
            notifications
        } = req.body;
        
        // Check if clinic is open
        const isClinicOpen = await checkClinicAvailability(bookingDate);
        if (!isClinicOpen) {
            return res.status(400).json({
                success: false,
                message: 'Clinic is closed on this date'
            });
        }
        
        // Check daily token limit
        const dailyCount = await Token.countDocuments({
            bookingDate: new Date(bookingDate),
            status: { $in: ['waiting', 'served'] }
        });
        
        const MAX_TOKENS_PER_DAY = 30;
        if (dailyCount >= MAX_TOKENS_PER_DAY) {
            return res.status(400).json({
                success: false,
                message: 'Daily token limit reached'
            });
        }
        
        // Generate token number
        const tokenNumber = await generateTokenNumber(bookingDate);
        
        // Create token
        const token = new Token({
            tokenNumber,
            patientName,
            patientPhone,
            patientAge,
            patientGender,
            bookingDate: new Date(bookingDate),
            symptoms,
            status: 'waiting',
            notifications
        });
        
        await token.save();
        
        // Calculate estimated time
        const estimatedTime = await calculateEstimatedTime(token._id);
        token.estimatedTime = estimatedTime;
        await token.save();
        
        // Send confirmation notifications
        if (notifications.sms || notifications.whatsapp) {
            await sendBookingConfirmation(token);
        }
        
        // Broadcast update
        io.to('public').emit('queueUpdate', await getQueueStatus());
        io.to('doctor').emit('newBooking', token);
        
        res.json({
            success: true,
            token: {
                _id: token._id,
                tokenNumber: token.tokenNumber,
                patientName: token.patientName,
                patientPhone: token.patientPhone,
                estimatedTime: token.estimatedTime,
                waitAhead: await calculateWaitAhead(token._id),
                currentServing: await getCurrentServingToken()
            }
        });
        
    } catch (error) {
        console.error('Error booking token:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get Token Status
app.get('/api/tokens/status', async (req, res) => {
    try {
        const { search } = req.query;
        
        let token;
        if (/^\d+$/.test(search)) {
            // Search by token number
            token = await Token.findOne({ tokenNumber: parseInt(search) });
        } else if (/^\d{10}$/.test(search)) {
            // Search by phone number
            token = await Token.findOne({ 
                patientPhone: search,
                bookingDate: { $gte: new Date().setHours(0,0,0,0) }
            }).sort({ createdAt: -1 });
        }
        
        if (!token) {
            return res.json({
                success: false,
                message: 'Token not found'
            });
        }
        
        // Calculate additional info
        const waitAhead = await calculateWaitAhead(token._id);
        const currentServing = await getCurrentServingToken();
        
        res.json({
            success: true,
            token: {
                ...token.toObject(),
                waitAhead,
                currentServing
            }
        });
        
    } catch (error) {
        console.error('Error fetching token status:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Cancel Token
app.put('/api/tokens/:id/cancel', async (req, res) => {
    try {
        const token = await Token.findByIdAndUpdate(
            req.params.id,
            { 
                status: 'cancelled',
                cancelledAt: new Date()
            },
            { new: true }
        );
        
        if (!token) {
            return res.status(404).json({ success: false, message: 'Token not found' });
        }
        
        // Send cancellation notification
        await sendCancellationNotification(token);
        
        // Broadcast update
        io.to('public').emit('queueUpdate', await getQueueStatus());
        io.to('doctor').emit('patientCancelled', token);
        
        res.json({ success: true, token });
        
    } catch (error) {
        console.error('Error cancelling token:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Queue Management
app.get('/api/queue', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const queue = await Token.find({
            bookingDate: { $gte: today },
            status: 'waiting'
        }).sort({ tokenNumber: 1 });
        
        const currentPatient = await Token.findOne({
            bookingDate: { $gte: today },
            status: 'served'
        }).sort({ servedAt: -1 });
        
        res.json({
            success: true,
            queue,
            currentPatient
        });
        
    } catch (error) {
        console.error('Error fetching queue:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Serve Token
app.post('/api/queue/:id/serve', async (req, res) => {
    try {
        const token = await Token.findByIdAndUpdate(
            req.params.id,
            { 
                status: 'served',
                servedAt: new Date()
            },
            { new: true }
        );
        
        // Send notification to patient
        await sendTokenServedNotification(token);
        
        // Broadcast update
        io.to('public').emit('queueUpdate', await getQueueStatus());
        
        res.json({ 
            success: true, 
            token,
            isCurrent: true 
        });
        
    } catch (error) {
        console.error('Error serving token:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Skip Token
app.post('/api/queue/:id/skip', async (req, res) => {
    try {
        const token = await Token.findByIdAndUpdate(
            req.params.id,
            { status: 'skipped' },
            { new: true }
        );
        
        // Broadcast update
        io.to('public').emit('queueUpdate', await getQueueStatus());
        
        res.json({ success: true, token });
        
    } catch (error) {
        console.error('Error skipping token:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Call Next Patient
app.post('/api/queue/call-next', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const nextToken = await Token.findOne({
            bookingDate: { $gte: today },
            status: 'waiting'
        }).sort({ tokenNumber: 1 });
        
        if (!nextToken) {
            return res.json({ 
                success: false, 
                message: 'No more patients in queue' 
            });
        }
        
        // Update token as "called"
        nextToken.status = 'called';
        nextToken.calledAt = new Date();
        await nextToken.save();
        
        // Broadcast update
        io.to('public').emit('queueUpdate', await getQueueStatus());
        
        res.json({ 
            success: true, 
            token: nextToken,
            patient: nextToken 
        });
        
    } catch (error) {
        console.error('Error calling next patient:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Dashboard Statistics
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const [
            totalPatients,
            waitingPatients,
            servedPatients,
            cancelledPatients
        ] = await Promise.all([
            Token.countDocuments({ bookingDate: { $gte: today } }),
            Token.countDocuments({ 
                bookingDate: { $gte: today },
                status: 'waiting'
            }),
            Token.countDocuments({ 
                bookingDate: { $gte: today },
                status: 'served'
            }),
            Token.countDocuments({ 
                bookingDate: { $gte: today },
                status: 'cancelled'
            })
        ]);
        
        // Calculate average wait time
        const servedTokens = await Token.find({
            bookingDate: { $gte: today },
            status: 'served',
            servedAt: { $exists: true },
            createdAt: { $exists: true }
        });
        
        let totalWaitTime = 0;
        servedTokens.forEach(token => {
            const waitTime = token.servedAt - token.createdAt;
            totalWaitTime += waitTime;
        });
        
        const avgWaitTime = servedTokens.length > 0 
            ? Math.round((totalWaitTime / servedTokens.length) / 60000) // Convert to minutes
            : 15; // Default
        
        // Calculate available tokens
        const MAX_TOKENS_PER_DAY = 30;
        const availableTokens = Math.max(0, MAX_TOKENS_PER_DAY - totalPatients);
        
        res.json({
            success: true,
            totalPatients,
            waitingPatients,
            servedPatients,
            cancelledPatients,
            avgWaitTime,
            availableTokens
        });
        
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Live Queue Status
app.get('/api/queue/live', async (req, res) => {
    try {
        const queueStatus = await getQueueStatus();
        res.json({ success: true, ...queueStatus });
    } catch (error) {
        console.error('Error fetching live queue:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Check Availability
app.get('/api/availability', async (req, res) => {
    try {
        const { date } = req.query;
        
        // Check if clinic is open
        const isClinicOpen = await checkClinicAvailability(date);
        if (!isClinicOpen) {
            return res.json({
                available: false,
                message: 'Clinic is closed on this date'
            });
        }
        
        // Check daily token limit
        const queryDate = new Date(date);
        queryDate.setHours(0, 0, 0, 0);
        
        const nextDay = new Date(queryDate);
        nextDay.setDate(nextDay.getDate() + 1);
        
        const bookedTokens = await Token.countDocuments({
            bookingDate: { $gte: queryDate, $lt: nextDay },
            status: { $in: ['waiting', 'served'] }
        });
        
        const MAX_TOKENS_PER_DAY = 30;
        const availableTokens = MAX_TOKENS_PER_DAY - bookedTokens;
        
        res.json({
            available: availableTokens > 0,
            availableTokens,
            bookedTokens,
            maxTokens: MAX_TOKENS_PER_DAY
        });
        
    } catch (error) {
        console.error('Error checking availability:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Leave Management
app.post('/api/leaves', authenticateToken, async (req, res) => {
    try {
        const { date, reason, notes, notifications } = req.body;
        
        // Check if leave already exists for this date
        const existingLeave = await Leave.findOne({ date: new Date(date) });
        if (existingLeave) {
            return res.status(400).json({
                success: false,
                message: 'Leave already scheduled for this date'
            });
        }
        
        const leave = new Leave({
            date: new Date(date),
            reason,
            notes,
            type: 'planned',
            createdBy: req.user.userId
        });
        
        await leave.save();
        
        // Notify booked patients if requested
        if (notifications.sms || notifications.whatsapp) {
            await notifyPatientsOfLeave(leave, notifications);
        }
        
        res.json({ success: true, leave });
        
    } catch (error) {
        console.error('Error adding leave:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Emergency Leave
app.post('/api/leaves/emergency', authenticateToken, async (req, res) => {
    try {
        const { reason, notifications } = req.body;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Cancel all today's appointments
        const cancelledTokens = await Token.updateMany(
            {
                bookingDate: { $gte: today },
                status: 'waiting'
            },
            {
                status: 'cancelled',
                cancelledAt: new Date(),
                cancellationReason: 'Emergency leave'
            }
        );
        
        // Create emergency leave record
        const leave = new Leave({
            date: today,
            reason,
            type: 'emergency',
            createdBy: req.user.userId
        });
        
        await leave.save();
        
        // Notify all affected patients
        await notifyEmergencyLeave(leave, notifications, cancelledTokens);
        
        // Broadcast emergency leave
        io.to('public').emit('emergencyLeave', {
            reason,
            cancelledCount: cancelledTokens.nModified,
            date: today.toISOString().split('T')[0]
        });
        
        res.json({
            success: true,
            leave,
            cancelledCount: cancelledTokens.nModified
        });
        
    } catch (error) {
        console.error('Error activating emergency leave:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Session Management
app.post('/api/session/start', authenticateToken, async (req, res) => {
    try {
        // Check if session already exists for today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let session = await Session.findOne({ date: today });
        
        if (!session) {
            session = new Session({
                date: today,
                startTime: new Date(),
                status: 'active',
                createdBy: req.user.userId
            });
        } else {
            session.startTime = new Date();
            session.status = 'active';
            session.pausedAt = null;
        }
        
        await session.save();
        
        res.json({ success: true, session });
        
    } catch (error) {
        console.error('Error starting session:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Add Session Delay
app.post('/api/session/delay', authenticateToken, async (req, res) => {
    try {
        const { delayMinutes } = req.body;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const session = await Session.findOneAndUpdate(
            { date: today },
            { 
                $inc: { delayMinutes },
                lastDelayAdded: new Date()
            },
            { new: true, upsert: true }
        );
        
        // Update estimated times for waiting patients
        await updateAllEstimatedTimes(delayMinutes);
        
        res.json({ success: true, session });
        
    } catch (error) {
        console.error('Error adding delay:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Authentication Routes
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        
        let user;
        if (role === 'doctor') {
            user = await Doctor.findOne({ email });
        } else if (role === 'admin') {
            user = await User.findOne({ email, role: 'admin' });
        } else {
            user = await User.findOne({ email });
        }
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
        
        // Compare password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
        
        // Generate JWT token
        const token = jwt.sign(
            {
                userId: user._id,
                email: user.email,
                role: user.role || role,
                name: user.name
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '8h' }
        );
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role || role
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Helper Functions

// Generate token number
async function generateTokenNumber(date) {
    const queryDate = new Date(date);
    queryDate.setHours(0, 0, 0, 0);
    
    const nextDay = new Date(queryDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    const lastToken = await Token.findOne({
        bookingDate: { $gte: queryDate, $lt: nextDay }
    }).sort({ tokenNumber: -1 });
    
    return lastToken ? lastToken.tokenNumber + 1 : 1;
}

// Calculate estimated time
async function calculateEstimatedTime(tokenId) {
    const token = await Token.findById(tokenId);
    const waitingTokens = await Token.countDocuments({
        bookingDate: { $gte: token.bookingDate },
        status: 'waiting',
        tokenNumber: { $lt: token.tokenNumber }
    });
    
    // Assume 10 minutes per patient
    const estimatedMinutes = waitingTokens * 10;
    const estimatedTime = new Date(Date.now() + estimatedMinutes * 60000);
    
    return estimatedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Calculate wait ahead
async function calculateWaitAhead(tokenId) {
    const token = await Token.findById(tokenId);
    const waitingTokens = await Token.countDocuments({
        bookingDate: { $gte: token.bookingDate },
        status: 'waiting',
        tokenNumber: { $lt: token.tokenNumber }
    });
    
    return waitingTokens;
}

// Get current serving token
async function getCurrentServingToken() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const currentToken = await Token.findOne({
        bookingDate: { $gte: today },
        status: 'served'
    }).sort({ servedAt: -1 });
    
    return currentToken ? currentToken.tokenNumber : null;
}

// Get queue status
async function getQueueStatus() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [currentToken, waitingTokens, servedCount] = await Promise.all([
        Token.findOne({
            bookingDate: { $gte: today },
            status: 'served'
        }).sort({ servedAt: -1 }),
        Token.find({
            bookingDate: { $gte: today },
            status: 'waiting'
        }).sort({ tokenNumber: 1 }).limit(10),
        Token.countDocuments({
            bookingDate: { $gte: today },
            status: 'waiting'
        })
    ]);
    
    // Calculate estimated wait time
    const estimatedWait = servedCount * 10; // 10 minutes per patient
    
    return {
        currentToken: currentToken ? {
            tokenNumber: currentToken.tokenNumber,
            patientName: currentToken.patientName
        } : null,
        upcomingTokens: waitingTokens.map(t => ({
            tokenNumber: t.tokenNumber,
            patientName: t.patientName
        })),
        estimatedWaitTime: `${estimatedWait}-${estimatedWait + 10} minutes`,
        stats: {
            totalPatients: servedCount + (currentToken ? 1 : 0),
            waitingPatients: servedCount
        }
    };
}

// Check clinic availability
async function checkClinicAvailability(date) {
    const queryDate = new Date(date);
    
    // Check if it's a weekend
    const day = queryDate.getDay();
    if (day === 0 || day === 6) { // Sunday or Saturday
        return false;
    }
    
    // Check for planned leaves
    const leave = await Leave.findOne({
        date: queryDate,
        type: 'planned'
    });
    
    if (leave) {
        return false;
    }
    
    // Check clinic hours
    const hours = queryDate.getHours();
    return (hours >= 9 && hours < 13) || (hours >= 17 && hours < 20);
}

// Send booking confirmation
async function sendBookingConfirmation(token) {
    try {
        const message = `Your token #${token.tokenNumber} is confirmed for ${token.bookingDate.toLocaleDateString()}. Estimated time: ${token.estimatedTime}. Current token: ${await getCurrentServingToken() || '--'}. Wait ahead: ${await calculateWaitAhead(token._id)} patients.`;
        
        // Send SMS
        if (token.notifications?.sms) {
            await twilioClient.messages.create({
                body: message,
                to: `+91${token.patientPhone}`,
                from: process.env.TWILIO_PHONE_NUMBER
            });
        }
        
        // Send WhatsApp
        if (token.notifications?.whatsapp) {
            await twilioClient.messages.create({
                body: message,
                to: `whatsapp:+91${token.patientPhone}`,
                from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`
            });
        }
        
    } catch (error) {
        console.error('Error sending confirmation:', error);
    }
}

// Send cancellation notification
async function sendCancellationNotification(token) {
    try {
        const message = `Your token #${token.tokenNumber} has been cancelled.`;
        
        if (token.notifications?.sms) {
            await twilioClient.messages.create({
                body: message,
                to: `+91${token.patientPhone}`,
                from: process.env.TWILIO_PHONE_NUMBER
            });
        }
        
    } catch (error) {
        console.error('Error sending cancellation notification:', error);
    }
}

// Send token served notification
async function sendTokenServedNotification(token) {
    try {
        const message = `Token #${token.tokenNumber} has been served. Thank you for visiting.`;
        
        if (token.notifications?.sms) {
            await twilioClient.messages.create({
                body: message,
                to: `+91${token.patientPhone}`,
                from: process.env.TWILIO_PHONE_NUMBER
            });
        }
        
    } catch (error) {
        console.error('Error sending served notification:', error);
    }
}

// Notify patients of leave
async function notifyPatientsOfLeave(leave, notifications) {
    try {
        const tokens = await Token.find({
            bookingDate: leave.date,
            status: 'waiting'
        });
        
        for (const token of tokens) {
            const message = `Clinic will be closed on ${leave.date.toLocaleDateString()} due to ${leave.reason}. Your appointment has been cancelled. Please reschedule.`;
            
            if (notifications.sms && token.notifications?.sms) {
                await twilioClient.messages.create({
                    body: message,
                    to: `+91${token.patientPhone}`,
                    from: process.env.TWILIO_PHONE_NUMBER
                });
            }
        }
        
    } catch (error) {
        console.error('Error notifying patients of leave:', error);
    }
}

// Notify emergency leave
async function notifyEmergencyLeave(leave, notifications, cancelledTokens) {
    try {
        const tokens = await Token.find({
            bookingDate: { $gte: leave.date },
            status: 'cancelled',
            cancellationReason: 'Emergency leave'
        });
        
        for (const token of tokens) {
            const message = `Emergency clinic closure today due to ${leave.reason}. Your appointment has been cancelled. We apologize for the inconvenience.`;
            
            if (notifications.sms && token.notifications?.sms) {
                await twilioClient.messages.create({
                    body: message,
                    to: `+91${token.patientPhone}`,
                    from: process.env.TWILIO_PHONE_NUMBER
                });
            }
            
            if (notifications.whatsapp && token.notifications?.whatsapp) {
                await twilioClient.messages.create({
                    body: message,
                    to: `whatsapp:+91${token.patientPhone}`,
                    from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`
                });
            }
        }
        
    } catch (error) {
        console.error('Error notifying emergency leave:', error);
    }
}

// Update all estimated times
async function updateAllEstimatedTimes(delayMinutes) {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const waitingTokens = await Token.find({
            bookingDate: { $gte: today },
            status: 'waiting'
        });
        
        for (const token of waitingTokens) {
            // Add delay to estimated time
            const newEstimatedTime = new Date(token.estimatedTime);
            newEstimatedTime.setMinutes(newEstimatedTime.getMinutes() + delayMinutes);
            
            token.estimatedTime = newEstimatedTime.toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            await token.save();
            
            // Notify patient of delay
            await notifyPatientOfDelay(token, delayMinutes);
        }
        
    } catch (error) {
        console.error('Error updating estimated times:', error);
    }
}

// Notify patient of delay
async function notifyPatientOfDelay(token, delayMinutes) {
    try {
        const message = `Your appointment is delayed by ${delayMinutes} minutes. New estimated time: ${token.estimatedTime}.`;
        
        if (token.notifications?.sms) {
            await twilioClient.messages.create({
                body: message,
                to: `+91${token.patientPhone}`,
                from: process.env.TWILIO_PHONE_NUMBER
            });
        }
        
    } catch (error) {
        console.error('Error notifying patient of delay:', error);
    }
}

// Create token (for socket)
async function createToken(data) {
    const tokenNumber = await generateTokenNumber(data.bookingDate);
    
    const token = new Token({
        tokenNumber,
        ...data,
        status: 'waiting'
    });
    
    await token.save();
    
    // Calculate estimated time
    token.estimatedTime = await calculateEstimatedTime(token._id);
    await token.save();
    
    return token;
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});