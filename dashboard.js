const express = require('express');
const router = express.Router();
const Token = require('../models/Token');
const Session = require('../models/Session');
const { doctorMiddleware } = require('../middleware/auth');

// Get dashboard statistics
router.get('/stats', doctorMiddleware, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Get counts for different statuses
        const [
            totalPatients,
            waitingPatients,
            servedPatients,
            cancelledPatients
        ] = await Promise.all([
            Token.countDocuments({ bookingDate: { $gte: today, $lt: tomorrow } }),
            Token.countDocuments({
                bookingDate: { $gte: today, $lt: tomorrow },
                status: 'waiting'
            }),
            Token.countDocuments({
                bookingDate: { $gte: today, $lt: tomorrow },
                status: 'served'
            }),
            Token.countDocuments({
                bookingDate: { $gte: today, $lt: tomorrow },
                status: 'cancelled'
            })
        ]);

        // Calculate average wait time for served patients
        const servedTokens = await Token.find({
            bookingDate: { $gte: today, $lt: tomorrow },
            status: 'served',
            actualWaitTime: { $gt: 0 }
        });

        let totalWaitTime = 0;
        let avgWaitTime = 0;

        if (servedTokens.length > 0) {
            servedTokens.forEach(token => {
                totalWaitTime += token.actualWaitTime || 0;
            });
            avgWaitTime = Math.round(totalWaitTime / servedTokens.length);
        }

        // Get today's session
        const session = await Session.findOne({
            date: { $gte: today, $lt: tomorrow },
            doctorId: req.user.userId
        }).sort({ startTime: -1 });

        // Calculate completion percentage
        const completionPercentage = totalPatients > 0 
            ? Math.round((servedPatients / totalPatients) * 100)
            : 0;

        // Get recent patients
        const recentPatients = await Token.find({
            bookingDate: { $gte: today, $lt: tomorrow }
        })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('tokenNumber patientName patientAge patientGender symptoms status createdAt');

        res.json({
            success: true,
            stats: {
                totalPatients,
                waitingPatients,
                servedPatients,
                cancelledPatients,
                avgWaitTime,
                completionPercentage
            },
            session: session || null,
            recentPatients
        });

    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Get today's summary
router.get('/today-summary', doctorMiddleware, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const [
            totalPatients,
            waitingPatients,
            servedPatients,
            cancelledPatients
        ] = await Promise.all([
            Token.countDocuments({ bookingDate: { $gte: today, $lt: tomorrow } }),
            Token.countDocuments({
                bookingDate: { $gte: today, $lt: tomorrow },
                status: 'waiting'
            }),
            Token.countDocuments({
                bookingDate: { $gte: today, $lt: tomorrow },
                status: 'served'
            }),
            Token.countDocuments({
                bookingDate: { $gte: today, $lt: tomorrow },
                status: 'cancelled'
            })
        ]);

        // Calculate average consultation time from served patients
        const servedTokens = await Token.find({
            bookingDate: { $gte: today, $lt: tomorrow },
            status: 'served',
            servedAt: { $exists: true },
            createdAt: { $exists: true }
        });

        let totalConsultationTime = 0;
        let avgConsultationTime = 10; // default

        if (servedTokens.length > 0) {
            servedTokens.forEach(token => {
                if (token.servedAt && token.createdAt) {
                    const consultationTime = (token.servedAt - token.createdAt) / 60000;
                    totalConsultationTime += consultationTime;
                }
            });
            avgConsultationTime = Math.round(totalConsultationTime / servedTokens.length);
        }

        // Calculate estimated completion time
        const estimatedCompletionMinutes = waitingPatients * avgConsultationTime;
        const estimatedCompletion = new Date();
        estimatedCompletion.setMinutes(estimatedCompletion.getMinutes() + estimatedCompletionMinutes);

        res.json({
            success: true,
            totalPatients,
            waitingPatients,
            servedPatients,
            cancelledPatients,
            avgConsultationTime,
            estimatedCompletion: estimatedCompletion.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

    } catch (error) {
        console.error('Today summary error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Start session
router.post('/session/start', doctorMiddleware, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check if session already exists
        let session = await Session.findOne({
            date: { $gte: today },
            doctorId: req.user.userId,
            status: { $in: ['scheduled', 'active', 'paused'] }
        });

        if (session) {
            // Resume existing session
            session.status = 'active';
            session.startTime = new Date();
            session.pausedAt = null;
        } else {
            // Create new session
            session = new Session({
                doctorId: req.user.userId,
                date: today,
                type: getSessionType(),
                startTime: new Date(),
                status: 'active'
            });
        }

        await session.save();

        res.json({
            success: true,
            message: 'Session started successfully',
            session
        });

    } catch (error) {
        console.error('Start session error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Pause session
router.post('/session/pause', doctorMiddleware, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const session = await Session.findOne({
            date: { $gte: today },
            doctorId: req.user.userId,
            status: 'active'
        });

        if (!session) {
            return res.status(400).json({
                success: false,
                message: 'No active session found'
            });
        }

        session.status = 'paused';
        session.pausedAt = new Date();
        await session.save();

        res.json({
            success: true,
            message: 'Session paused',
            session
        });

    } catch (error) {
        console.error('Pause session error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// End session
router.post('/session/end', doctorMiddleware, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const session = await Session.findOne({
            date: { $gte: today },
            doctorId: req.user.userId,
            status: { $in: ['active', 'paused'] }
        });

        if (!session) {
            return res.status(400).json({
                success: false,
                message: 'No active session found'
            });
        }

        // Update session statistics
        const stats = await getSessionStats(today);
        
        session.status = 'ended';
        session.endTime = new Date();
        session.totalPatients = stats.total;
        session.servedPatients = stats.served;
        session.cancelledPatients = stats.cancelled;
        session.skippedPatients = stats.skipped;
        session.avgWaitTime = stats.avgWaitTime;

        await session.save();

        res.json({
            success: true,
            message: 'Session ended successfully',
            session
        });

    } catch (error) {
        console.error('End session error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Add delay to session
router.post('/session/delay', doctorMiddleware, async (req, res) => {
    try {
        const { delayMinutes } = req.body;

        if (!delayMinutes || delayMinutes <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide valid delay minutes'
            });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const session = await Session.findOneAndUpdate(
            {
                date: { $gte: today },
                doctorId: req.user.userId,
                status: { $in: ['active', 'paused'] }
            },
            {
                $inc: { delayMinutes },
                lastDelayAdded: new Date()
            },
            { new: true, upsert: true }
        );

        // Update estimated times for all waiting patients
        await updateEstimatedTimes(delayMinutes);

        res.json({
            success: true,
            message: `Delay of ${delayMinutes} minutes added`,
            session
        });

    } catch (error) {
        console.error('Add delay error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Get patient history
router.get('/patient-history', doctorMiddleware, async (req, res) => {
    try {
        const { phone, days = 30 } = req.query;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - days);

        const history = await Token.find({
            patientPhone: phone,
            createdAt: { $gte: dateLimit }
        })
        .sort({ createdAt: -1 })
        .select('tokenNumber bookingDate symptoms status servedAt doctorNotes');

        res.json({
            success: true,
            count: history.length,
            history
        });

    } catch (error) {
        console.error('Patient history error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Helper functions
function getSessionType() {
    const hour = new Date().getHours();
    if (hour < 13) return 'morning';
    return 'evening';
}

async function getSessionStats(date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const [
        total,
        served,
        cancelled,
        skipped
    ] = await Promise.all([
        Token.countDocuments({ bookingDate: { $gte: startOfDay, $lte: endOfDay } }),
        Token.countDocuments({ 
            bookingDate: { $gte: startOfDay, $lte: endOfDay },
            status: 'served'
        }),
        Token.countDocuments({ 
            bookingDate: { $gte: startOfDay, $lte: endOfDay },
            status: 'cancelled'
        }),
        Token.countDocuments({ 
            bookingDate: { $gte: startOfDay, $lte: endOfDay },
            status: 'skipped'
        })
    ]);

    // Calculate average wait time for served patients
    const servedTokens = await Token.find({
        bookingDate: { $gte: startOfDay, $lte: endOfDay },
        status: 'served',
        actualWaitTime: { $gt: 0 }
    });

    let totalWaitTime = 0;
    let avgWaitTime = 0;

    if (servedTokens.length > 0) {
        servedTokens.forEach(token => {
            totalWaitTime += token.actualWaitTime;
        });
        avgWaitTime = Math.round(totalWaitTime / servedTokens.length);
    }

    return {
        total,
        served,
        cancelled,
        skipped,
        avgWaitTime
    };
}

async function updateEstimatedTimes(delayMinutes) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const waitingTokens = await Token.find({
        bookingDate: { $gte: today },
        status: 'waiting'
    });

    const updatePromises = waitingTokens.map(async (token) => {
        // Recalculate estimated time with delay
        const waitingAhead = await Token.countDocuments({
            bookingDate: { $gte: token.bookingDate },
            status: 'waiting',
            tokenNumber: { $lt: token.tokenNumber }
        });

        const estimatedMinutes = (waitingAhead * 10) + delayMinutes;
        const estimatedTime = new Date(Date.now() + estimatedMinutes * 60000);
        
        token.estimatedTime = estimatedTime.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        return token.save();
    });

    await Promise.all(updatePromises);
}

module.exports = router;