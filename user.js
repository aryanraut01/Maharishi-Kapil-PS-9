const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['admin', 'staff', 'receptionist'],
        default: 'staff'
    },
    phone: {
        type: String,
        validate: {
            validator: function(v) {
                return !v || /^\d{10}$/.test(v);
            },
            message: 'Phone number must be 10 digits'
        }
    },
    clinicId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Clinic'
    },
    permissions: {
        manageDoctors: { type: Boolean, default: false },
        managePatients: { type: Boolean, default: true },
        manageAppointments: { type: Boolean, default: true },
        viewReports: { type: Boolean, default: false },
        systemSettings: { type: Boolean, default: false }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User;