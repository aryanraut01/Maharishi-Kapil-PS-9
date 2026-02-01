const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
        required: true
    },
    date: {
        type: Date,
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['morning', 'evening', 'full-day'],
        default: 'morning'
    },
    startTime: {
        type: Date,
        required: true
    },
    endTime: {
        type: Date
    },
    status: {
        type: String,
        enum: ['scheduled', 'active', 'paused', 'ended', 'cancelled'],
        default: 'scheduled'
    },
    delayMinutes: {
        type: Number,
        default: 0
    },
    totalPatients: {
        type: Number,
        default: 0
    },
    servedPatients: {
        type: Number,
        default: 0
    },
    skippedPatients: {
        type: Number,
        default: 0
    },
    cancelledPatients: {
        type: Number,
        default: 0
    },
    avgWaitTime: {
        type: Number, // in minutes
        default: 0
    },
    notes: {
        type: String,
        default: ''
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

sessionSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Index for date queries
sessionSchema.index({ doctorId: 1, date: 1, status: 1 });

const Session = mongoose.model('Session', sessionSchema);
module.exports = Session;