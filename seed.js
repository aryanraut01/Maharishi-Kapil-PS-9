const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Doctor = require('./models/Doctor');
const User = require('./models/User');
const Clinic = require('./models/Clinic');
require('dotenv').config();

async function seedDatabase() {
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/clinic-token-system');
        console.log('Connected to database for seeding');

        // Clear existing data
        await Doctor.deleteMany({});
        await User.deleteMany({});
        await Clinic.deleteMany({});
        console.log('Cleared existing data');

        // Create default clinic
        const clinic = new Clinic({
            name: 'MediQuick Clinic',
            address: {
                street: '123 Medical Street',
                city: 'Health City',
                state: 'Medical State',
                pincode: '123456'
            },
            contact: {
                phone: '+91-9876543210',
                email: 'info@mediquick.com',
                emergency: '102'
            },
            workingHours: {
                morningStart: '09:00',
                morningEnd: '13:00',
                eveningStart: '17:00',
                eveningEnd: '20:00',
                workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
            },
            facilities: ['OPD', 'Pharmacy', 'Lab', 'Emergency'],
            maxCapacity: 50,
            settings: {
                tokenValidity: 15,
                advanceBookingDays: 7,
                autoCancelNoShow: true,
                noShowMinutes: 30
            }
        });

        await clinic.save();
        console.log('Created default clinic');

        // Create default doctors
        const doctors = [
            {
                name: 'Dr. Smith',
                email: 'doctor@clinic.com',
                password: 'doctor123',
                specialization: 'General Physician',
                phone: '9876543211',
                qualification: 'MBBS, MD',
                experience: 15,
                consultationFee: 500,
                clinicId: clinic._id,
                role: 'doctor'
            },
            {
                name: 'Dr. Johnson',
                email: 'doctor2@clinic.com',
                password: 'doctor123',
                specialization: 'Cardiology',
                phone: '9876543212',
                qualification: 'MBBS, MD, DM',
                experience: 20,
                consultationFee: 800,
                clinicId: clinic._id,
                role: 'doctor'
            }
        ];

        for (const docData of doctors) {
            const doctor = new Doctor(docData);
            await doctor.save();
            console.log(`Created doctor: ${doctor.name}`);
        }

        // Create admin user
        const admin = new User({
            name: 'Admin User',
            email: 'admin@clinic.com',
            password: 'admin123',
            role: 'admin',
            phone: '9876543213',
            clinicId: clinic._id,
            permissions: {
                manageDoctors: true,
                managePatients: true,
                manageAppointments: true,
                viewReports: true,
                systemSettings: true
            }
        });

        await admin.save();
        console.log('Created admin user');

        // Create staff user
        const staff = new User({
            name: 'Reception Staff',
            email: 'staff@clinic.com',
            password: 'staff123',
            role: 'staff',
            phone: '9876543214',
            clinicId: clinic._id,
            permissions: {
                manageDoctors: false,
                managePatients: true,
                manageAppointments: true,
                viewReports: false,
                systemSettings: false
            }
        });

        await staff.save();
        console.log('Created staff user');

        console.log('\nDatabase seeded successfully!');
        console.log('\n=== Login Credentials ===');
        console.log('Doctor Login:');
        console.log('  Email: doctor@clinic.com');
        console.log('  Password: doctor123');
        console.log('\nAdmin Login:');
        console.log('  Email: admin@clinic.com');
        console.log('  Password: admin123');
        console.log('\nStaff Login:');
        console.log('  Email: staff@clinic.com');
        console.log('  Password: staff123');
        console.log('\n=========================');

        process.exit(0);

    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
}

seedDatabase();