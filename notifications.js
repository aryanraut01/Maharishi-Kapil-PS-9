const express = require('express');
const router = express.Router();
const Token = require('../models/Token');
const { doctorMiddleware } = require('../middleware/auth');

// Send notification to specific patient
router.post('/:tokenId/:type', doctorMiddleware, async (req, res) => {
    try {
        const { tokenId, type } = req.params;
        
        const token = await Token.findById(tokenId);
        
        if (!token) {
            return res.status(404).json({
                success: false,
                message: 'Token not found'
            });
        }

        let message = '';
        let notificationType = '';

        switch (type) {
            case 'called':
                message = `Token #${token.tokenNumber}: Your turn is coming up. Please proceed to the doctor's chamber.`;
                notificationType = 'call_notification';
                break;
                
            case 'delay':
                const delayMinutes = req.body.delayMinutes || 15;
                message = `Token #${token.tokenNumber}: Your appointment is delayed by ${delayMinutes} minutes. We apologize for the inconvenience.`;
                notificationType = 'delay_notification';
                break;
                
            case 'served':
                message = `Token #${token.tokenNumber}: Thank you for visiting. Hope you feel better soon!`;
                notificationType = 'served_notification';
                break;
                
            case 'cancelled':
                const reason = req.body.reason || 'by doctor';
                message = `Token #${token.tokenNumber}: Your appointment has been cancelled. Reason: ${reason}.`;
                notificationType = 'cancellation_notification';
                break;
                
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid notification type'
                });
        }

        // Send notifications based on patient preferences
        const sentNotifications = await sendNotification(token, message, notificationType);

        res.json({
            success: true,
            message: 'Notification sent successfully',
            sentNotifications,
            notification: {
                type: notificationType,
                message,
                timestamp: new Date()
            }
        });

    } catch (error) {
        console.error('Send notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Notify all patients of delay
router.post('/delay-all', doctorMiddleware, async (req, res) => {
    try {
        const { delayMinutes = 15 } = req.body;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const waitingTokens = await Token.find({
            bookingDate: { $gte: today },
            status: 'waiting'
        });

        let sentCount = 0;
        let failedCount = 0;

        for (const token of waitingTokens) {
            try {
                const message = `Token #${token.tokenNumber}: Your appointment is delayed by ${delayMinutes} minutes. New estimated time: ${token.estimatedTime}.`;
                
                await sendNotification(token, message, 'delay_notification');
                sentCount++;
                
            } catch (error) {
                console.error(`Failed to notify token #${token.tokenNumber}:`, error);
                failedCount++;
            }
        }

        res.json({
            success: true,
            message: `Delay notifications sent to ${sentCount} patients`,
            stats: {
                total: waitingTokens.length,
                sent: sentCount,
                failed: failedCount
            }
        });

    } catch (error) {
        console.error('Delay all notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Notify session end
router.post('/session-end', doctorMiddleware, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const waitingTokens = await Token.find({
            bookingDate: { $gte: today },
            status: 'waiting'
        });

        let sentCount = 0;

        for (const token of waitingTokens) {
            const message = `Token #${token.tokenNumber}: Today's OPD session has ended. Your appointment is cancelled. Please book for another day.`;
            
            // Update token status
            token.status = 'cancelled';
            token.cancellationReason = 'Session ended';
            token.cancelledAt = new Date();
            await token.save();

            // Send notification
            await sendNotification(token, message, 'session_end_notification');
            sentCount++;
        }

        res.json({
            success: true,
            message: `Session end notifications sent to ${sentCount} patients`,
            cancelledCount: sentCount
        });

    } catch (error) {
        console.error('Session end notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Send test notification
router.post('/test', doctorMiddleware, async (req, res) => {
    try {
        const { phone, message } = req.body;

        if (!phone || !message) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and message are required'
            });
        }

        // Simulate sending notification
        console.log(`Test notification to ${phone}: ${message}`);

        // In production, you would integrate with Twilio or other SMS service
        const twilioIntegration = process.env.TWILIO_ENABLED === 'true';
        
        if (twilioIntegration) {
            // const twilio = require('twilio');
            // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            
            // await client.messages.create({
            //     body: message,
            //     to: `+91${phone}`,
            //     from: process.env.TWILIO_PHONE_NUMBER
            // });
            
            console.log(`SMS would be sent to ${phone} via Twilio`);
        }

        res.json({
            success: true,
            message: 'Test notification simulated',
            details: {
                phone,
                message,
                timestamp: new Date(),
                method: twilioIntegration ? 'Twilio SMS' : 'Simulated'
            }
        });

    } catch (error) {
        console.error('Test notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Get notification history
router.get('/history', doctorMiddleware, async (req, res) => {
    try {
        const { limit = 50 } = req.query;

        // In a real application, you would have a Notification model
        // For demo, we'll return sample data
        const sampleHistory = [
            {
                id: 1,
                type: 'booking_confirmation',
                phone: '9876543210',
                message: 'Token #5 confirmed for today. Estimated time: 10:30 AM',
                status: 'sent',
                timestamp: new Date(Date.now() - 3600000)
            },
            {
                id: 2,
                type: 'delay_notification',
                phone: '9876543211',
                message: 'Token #6 delayed by 15 minutes',
                status: 'sent',
                timestamp: new Date(Date.now() - 1800000)
            },
            {
                id: 3,
                type: 'called_notification',
                phone: '9876543212',
                message: 'Token #7: Your turn is coming up',
                status: 'sent',
                timestamp: new Date(Date.now() - 900000)
            }
        ];

        res.json({
            success: true,
            count: sampleHistory.length,
            history: sampleHistory.slice(0, limit)
        });

    } catch (error) {
        console.error('Notification history error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Helper function to send notifications
async function sendNotification(token, message, type) {
    const sentMethods = [];

    // Log notification
    console.log(`[${type}] To: ${token.patientPhone}, Message: ${message}`);

    // SMS notification
    if (token.notifications?.sms) {
        try {
            // In production: await sendSMS(token.patientPhone, message);
            console.log(`SMS sent to ${token.patientPhone}`);
            sentMethods.push('sms');
        } catch (error) {
            console.error(`SMS failed for ${token.patientPhone}:`, error);
        }
    }

    // WhatsApp notification
    if (token.notifications?.whatsapp) {
        try {
            // In production: await sendWhatsApp(token.patientPhone, message);
            console.log(`WhatsApp sent to ${token.patientPhone}`);
            sentMethods.push('whatsapp');
        } catch (error) {
            console.error(`WhatsApp failed for ${token.patientPhone}:`, error);
        }
    }

    // Voice call notification (for emergency)
    if (type === 'emergency_notification') {
        try {
            // In production: await makeVoiceCall(token.patientPhone, message);
            console.log(`Voice call to ${token.patientPhone}`);
            sentMethods.push('call');
        } catch (error) {
            console.error(`Voice call failed for ${token.patientPhone}:`, error);
        }
    }

    return {
        methods: sentMethods,
        count: sentMethods.length,
        timestamp: new Date()
    };
}

// Simulated SMS sending
async function sendSMS(phone, message) {
    // This is a simulation
    // In production, integrate with Twilio, MSG91, etc.
    
    if (process.env.TWILIO_ENABLED === 'true') {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
        
        // const client = require('twilio')(accountSid, authToken);
        
        // return client.messages.create({
        //     body: message,
        //     to: `+91${phone}`,
        //     from: twilioPhone
        // });
        
        return Promise.resolve({ sid: 'simulated_sms_id' });
    }
    
    // Fallback to console log
    console.log(`[SMS SIMULATION] To: ${phone}, Message: ${message}`);
    return Promise.resolve({ simulated: true });
}

// Simulated WhatsApp sending
async function sendWhatsApp(phone, message) {
    if (process.env.TWILIO_WHATSAPP_ENABLED === 'true') {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const twilioWhatsApp = process.env.TWILIO_WHATSAPP_NUMBER;
        
        // const client = require('twilio')(accountSid, authToken);
        
        // return client.messages.create({
        //     body: message,
        //     to: `whatsapp:+91${phone}`,
        //     from: `whatsapp:${twilioWhatsApp}`
        // });
        
        return Promise.resolve({ sid: 'simulated_whatsapp_id' });
    }
    
    console.log(`[WHATSAPP SIMULATION] To: ${phone}, Message: ${message}`);
    return Promise.resolve({ simulated: true });
}

module.exports = router;