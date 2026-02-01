const express = require('express');
const router = express.Router();
const Token = require('../models/Token');
const { doctorMiddleware } = require('../middleware/auth');

// Get current queue
router.get('/', doctorMiddleware, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const queue = await Token.find({
            bookingDate: { $gte: today, $lt: tomorrow },
            status: { $in: ['waiting', 'called'] }
        }).sort({ tokenNumber: 1 });

        const currentPatient = await Token.findOne({
            bookingDate: { $gte: today, $lt: tomorrow },
            status: 'called'
        }).sort({ calledAt: -1 });

        // Calculate statistics
        const waitingCount = await Token.countDocuments({
            bookingDate: { $gte: today, $lt: tomorrow },
            status: 'waiting'
        });

        const servedCount = await Token.countDocuments({
            bookingDate: { $gte: today, $lt: tomorrow },
            status: 'served'
        });

        const cancelledCount = await Token.countDocuments({
            bookingDate: { $gte: today, $lt: tomorrow },
            status: 'cancelled'
        });

        // Calculate estimated completion time
        const estimatedCompletion = new Date();
        estimatedCompletion.setMinutes(estimatedCompletion.getMinutes() + (waitingCount * 10));

        res.json({
            success: true,
            queue,
            currentPatient,
            stats: {
                waiting: waitingCount,
                served: servedCount,
                cancelled: cancelledCount,
                total: waitingCount + servedCount + cancelledCount,
                estimatedCompletion: estimatedCompletion.toLocaleTimeString()
            }
        });

    } catch (error) {
        console.error('Get queue error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Serve current patient
router.post('/serve-current', doctorMiddleware, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const currentPatient = await Token.findOne({
            bookingDate: { $gte: today },
            status: 'called'
        }).sort({ calledAt: -1 });

        if (!currentPatient) {
            return res.status(400).json({
                success: false,
                message: 'No patient is currently called'
            });
        }

        currentPatient.status = 'served';
        currentPatient.servedAt = new Date();
        currentPatient.servedBy = req.user.userId;

        // Calculate actual wait time
        const waitTime = Math.floor((currentPatient.servedAt - currentPatient.createdAt) / 60000);
        currentPatient.actualWaitTime = waitTime;

        await currentPatient.save();

        res.json({
            success: true,
            message: `Token #${currentPatient.tokenNumber} marked as served`,
            token: currentPatient
        });

    } catch (error) {
        console.error('Serve current patient error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Call next patient
router.post('/call-next', doctorMiddleware, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Find next waiting patient
        const nextPatient = await Token.findOne({
            bookingDate: { $gte: today },
            status: 'waiting'
        }).sort({ tokenNumber: 1 });

        if (!nextPatient) {
            return res.status(400).json({
                success: false,
                message: 'No more patients in queue'
            });
        }

        // Update current called patient to waiting (if any)
        await Token.updateMany(
            {
                bookingDate: { $gte: today },
                status: 'called'
            },
            { status: 'waiting' }
        );

        // Call next patient
        nextPatient.status = 'called';
        nextPatient.calledAt = new Date();
        await nextPatient.save();

        res.json({
            success: true,
            message: `Called Token #${nextPatient.tokenNumber}`,
            patient: nextPatient
        });

    } catch (error) {
        console.error('Call next patient error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Skip current patient
router.post('/skip-current', doctorMiddleware, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const currentPatient = await Token.findOne({
            bookingDate: { $gte: today },
            status: 'called'
        }).sort({ calledAt: -1 });

        if (!currentPatient) {
            return res.status(400).json({
                success: false,
                message: 'No patient is currently called'
            });
        }

        currentPatient.status = 'skipped';
        currentPatient.calledAt = null;
        await currentPatient.save();

        res.json({
            success: true,
            message: `Token #${currentPatient.tokenNumber} skipped`,
            token: currentPatient
        });

    } catch (error) {
        console.error('Skip patient error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Serve specific patient
router.post('/:id/serve', doctorMiddleware, async (req, res) => {
    try {
        const token = await Token.findById(req.params.id);

        if (!token) {
            return res.status(404).json({
                success: false,
                message: 'Token not found'
            });
        }

        if (token.status !== 'waiting' && token.status !== 'called') {
            return res.status(400).json({
                success: false,
                message: 'Only waiting or called tokens can be served'
            });
        }

        token.status = 'served';
        token.servedAt = new Date();
        token.servedBy = req.user.userId;

        // Calculate actual wait time
        const waitTime = Math.floor((token.servedAt - token.createdAt) / 60000);
        token.actualWaitTime = waitTime;

        await token.save();

        res.json({
            success: true,
            message: `Token #${token.tokenNumber} served`,
            token
        });

    } catch (error) {
        console.error('Serve patient error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Skip specific patient
router.post('/:id/skip', doctorMiddleware, async (req, res) => {
    try {
        const token = await Token.findById(req.params.id);

        if (!token) {
            return res.status(404).json({
                success: false,
                message: 'Token not found'
            });
        }

        if (token.status !== 'waiting' && token.status !== 'called') {
            return res.status(400).json({
                success: false,
                message: 'Only waiting or called tokens can be skipped'
            });
        }

        token.status = 'skipped';
        await token.save();

        res.json({
            success: false,
            message: `Token #${token.tokenNumber} skipped`,
            token
        });

    } catch (error) {
        console.error('Skip patient error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Call specific patient
router.post('/:id/call', doctorMiddleware, async (req, res) => {
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
                message: 'Only waiting tokens can be called'
            });
        }

        // Update any currently called patient to waiting
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        await Token.updateMany(
            {
                bookingDate: { $gte: today },
                status: 'called'
            },
            { status: 'waiting' }
        );

        // Call the specified patient
        token.status = 'called';
        token.calledAt = new Date();
        await token.save();

        res.json({
            success: true,
            message: `Called Token #${token.tokenNumber}`,
            token,
            isCurrent: true
        });

    } catch (error) {
        console.error('Call patient error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router;