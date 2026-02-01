const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
    tokenNumber: {
        type: Number,
        required: true
    },
    patientName: {
        type: String,
        required: true
    },
    patientPhone: {
        type: String,
        required: true
    },
    patientAge: {
        type: Number,
        required: true
    },
    patientGender: {
        type: String,
        enum: ['male', 'female', 'other'],
        default: 'male'
    },
    bookingDate: {
        type: Date,
        required: true
    },
    symptoms: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['waiting', 'called', 'served', 'skipped', 'cancelled'],
        default: 'waiting'
    },
    estimatedTime: {
        type: String,
        default: ''
    },
    notifications: {
        sms: {
            type: Boolean,
            default: false
        },
        whatsapp: {
            type: Boolean,
            default: false
        }
    },
    servedAt: {
        type: Date
    },
    calledAt: {
        type: Date
    },
    cancelledAt: {
        type: Date
    },
    cancellationReason: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt field on save
tokenSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Token', tokenSchema);