const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Doctor = require('../models/Doctor');
const User = require('../models/User');

// Register Doctor
router.post('/register/doctor', async (req, res) => {
    try {
        const { name, email, password, specialization, phone } = req.body;

        // Check if doctor already exists
        let doctor = await Doctor.findOne({ email });
        if (doctor) {
            return res.status(400).json({
                success: false,
                message: 'Doctor already exists'
            });
        }

        // Create new doctor
        doctor = new Doctor({
            name,
            email,
            password,
            specialization,
            phone
        });

        await doctor.save();

        // Create JWT token
        const token = jwt.sign(
            {
                userId: doctor._id,
                email: doctor.email,
                role: doctor.role,
                name: doctor.name
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '8h' }
        );

        res.status(201).json({
            success: true,
            token,
            doctor: {
                id: doctor._id,
                name: doctor.name,
                email: doctor.email,
                specialization: doctor.specialization
            }
        });

    } catch (error) {
        console.error('Doctor registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Login
router.post('/login', async (req, res) => {
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

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Create JWT token
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
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Verify token
router.post('/verify', (req, res) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'No token provided'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        res.json({
            success: true,
            user: decoded
        });
    } catch (error) {
        res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
});

module.exports = router;