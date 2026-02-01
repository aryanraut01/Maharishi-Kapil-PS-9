const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['planned', 'emergency'],
        default: 'planned'
    },
    notes: {
        type: String
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Leave', leaveSchema);