const express = require('express');
const router = express.Router();
const Token = require('../models/Token');
const Leave = require('../models/Leave');
const { authMiddleware } = require('../middleware/auth');

// Book a new token
router.post('/book', async (req, res) => {
    try {
        const {
            patientName,
            patientPhone,
            patientAge,
            patientGender,
            bookingDate,
            symptoms,
            notifications = {}
        } = req.body;

        // Validate required fields
        if (!patientName || !patientPhone || !patientAge || !bookingDate) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields'
            });
        }

        // Validate phone number
        if (!/^\d{10}$/.test(patientPhone)) {
            return res.status(400).json({
                success: false,
                message: 'Phone number must be 10 digits'
            });
        }

        // Check clinic availability
        const isAvailable = await checkAvailability(bookingDate);
        if (!isAvailable.available) {
            return res.status(400).json({
                success: false,
                message: isAvailable.message
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
            symptoms: symptoms || '',
            notifications: {
                sms: notifications.sms || false,
                whatsapp: notifications.whatsapp || false
            }
        });

        await token.save();

        // Calculate estimated time
        const estimatedTime = await calculateEstimatedTime(token._id);
        token.estimatedTime = estimatedTime;
        await token.save();

        // Calculate wait ahead
        const waitAhead = await calculateWaitAhead(token._id);

        res.status(201).json({
            success: true,
            message: 'Token booked successfully',
            token: {
                _id: token._id,
                tokenNumber: token.tokenNumber,
                patientName: token.patientName,
                patientPhone: token.patientPhone,
                patientAge: token.patientAge,
                patientGender: token.patientGender,
                bookingDate: token.bookingDate,
                estimatedTime: token.estimatedTime,
                waitAhead,
                status: token.status
            }
        });

    } catch (error) {
        console.error('Token booking error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Get token status
router.get('/status', async (req, res) => {
    try {
        const { search } = req.query;

        if (!search) {
            return res.status(400).json({
                success: false,
                message: 'Please provide token number or phone number'
            });
        }

        let token;
        if (/^\d+$/.test(search)) {
            // Search by token number
            token = await Token.findOne({ tokenNumber: parseInt(search) });
        } else if (/^\d{10}$/.test(search)) {
            // Search by phone number
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            token = await Token.findOne({
                patientPhone: search,
                bookingDate: { $gte: today }
            }).sort({ createdAt: -1 });
        }

        if (!token) {
            return res.status(404).json({
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
        console.error('Token status error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Cancel token
router.put('/:id/cancel', async (req, res) => {
    try {
        const token = await Token.findById(req.params.id);

        if (!token) {
            return res.status(404).json({
                success: false,
                message: 'Token not found'
            });
        }

        if (token.status !== 'waiting') {
            return res.status(400).json({
                success: false,
                message: 'Only waiting tokens can be cancelled'
            });
        }

        token.status = 'cancelled';
        token.cancelledAt = new Date();
        await token.save();

        res.json({
            success: true,
            message: 'Token cancelled successfully',
            token
        });

    } catch (error) {
        console.error('Token cancellation error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Get today's tokens
router.get('/today', authMiddleware, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const tokens = await Token.find({
            bookingDate: { $gte: today, $lt: tomorrow }
        }).sort({ tokenNumber: 1 });

        res.json({
            success: true,
            count: tokens.length,
            tokens
        });

    } catch (error) {
        console.error('Get today tokens error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Helper functions
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

async function calculateEstimatedTime(tokenId) {
    const token = await Token.findById(tokenId);
    const waitingTokens = await Token.countDocuments({
        bookingDate: { $gte: token.bookingDate },
        status: 'waiting',
        tokenNumber: { $lt: token.tokenNumber }
    });

    const estimatedMinutes = waitingTokens * 10;
    const estimatedTime = new Date(Date.now() + estimatedMinutes * 60000);

    return estimatedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function calculateWaitAhead(tokenId) {
    const token = await Token.findById(tokenId);
    const waitingTokens = await Token.countDocuments({
        bookingDate: { $gte: token.bookingDate },
        status: 'waiting',
        tokenNumber: { $lt: token.tokenNumber }
    });

    return waitingTokens;
}

async function getCurrentServingToken() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const currentToken = await Token.findOne({
        bookingDate: { $gte: today },
        status: 'served'
    }).sort({ servedAt: -1 });

    return currentToken ? currentToken.tokenNumber : null;
}

async function checkAvailability(date) {
    const queryDate = new Date(date);
    
    // Check if date is in past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (queryDate < today) {
        return {
            available: false,
            message: 'Cannot book for past dates'
        };
    }

    // Check if it's a weekend (for demo)
    const day = queryDate.getDay();
    if (day === 0 || day === 6) {
        return {
            available: false,
            message: 'Clinic is closed on weekends'
        };
    }

    // Check for leaves
    const leave = await Leave.findOne({
        date: queryDate,
        status: 'approved'
    });

    if (leave) {
        return {
            available: false,
            message: 'Doctor is on leave on this date'
        };
    }

    // Check daily token limit
    const queryDateStart = new Date(queryDate);
    queryDateStart.setHours(0, 0, 0, 0);
    
    const queryDateEnd = new Date(queryDateStart);
    queryDateEnd.setDate(queryDateEnd.getDate() + 1);

    const bookedCount = await Token.countDocuments({
        bookingDate: { $gte: queryDateStart, $lt: queryDateEnd },
        status: { $in: ['waiting', 'served'] }
    });

    const MAX_TOKENS_PER_DAY = 30;
    if (bookedCount >= MAX_TOKENS_PER_DAY) {
        return {
            available: false,
            message: 'All tokens for this date are booked'
        };
    }

    return {
        available: true,
        availableTokens: MAX_TOKENS_PER_DAY - bookedCount
    };
}

module.exports = router;