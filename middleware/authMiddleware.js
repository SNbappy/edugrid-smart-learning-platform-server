const admin = require('firebase-admin');

// Initialize Firebase Admin SDK (only once)
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }),
        });
        console.log('✅ Firebase Admin initialized successfully');
    } catch (error) {
        console.error('❌ Firebase Admin initialization error:', error);
    }
}

// Main authentication middleware - verifies Firebase JWT token
const verifyToken = async (req, res, next) => {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
                message: 'No token provided. Please login to access this resource.'
            });
        }

        // Extract token (remove 'Bearer ' prefix)
        const token = authHeader.split(' ')[1];

        // Verify token with Firebase Admin
        const decodedToken = await admin.auth().verifyIdToken(token);

        // Attach user info to request object
        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            emailVerified: decodedToken.email_verified,
            name: decodedToken.name || null
        };

        console.log(`✅ Authenticated: ${req.user.email}`);
        next();

    } catch (error) {
        console.error('❌ Token verification failed:', error.message);

        if (error.code === 'auth/id-token-expired') {
            return res.status(401).json({
                success: false,
                error: 'Token expired',
                message: 'Your session has expired. Please login again.'
            });
        }

        return res.status(403).json({
            success: false,
            error: 'Invalid token',
            message: 'Authentication failed. Please login again.'
        });
    }
};

// Middleware to check if user is the classroom teacher
const verifyTeacher = async (req, res, next) => {
    try {
        const userEmail = req.user?.email;
        const classroomId = req.params.id || req.params.classroomId;

        if (!classroomId) {
            return res.status(400).json({
                success: false,
                error: 'Classroom ID is required'
            });
        }

        const { getDB } = require('../database');
        const { ObjectId } = require('mongodb');

        if (!ObjectId.isValid(classroomId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid classroom ID'
            });
        }

        const db = getDB();
        const classroom = await db.collection('classrooms').findOne({
            _id: new ObjectId(classroomId)
        });

        if (!classroom) {
            return res.status(404).json({
                success: false,
                error: 'Classroom not found'
            });
        }

        // Check if user is the teacher
        if (classroom.teacherEmail !== userEmail) {
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'Only the classroom teacher can perform this action.'
            });
        }

        // Attach classroom to request for use in controller
        req.classroom = classroom;
        req.userRole = 'teacher';
        next();

    } catch (error) {
        console.error('Teacher verification error:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error during authorization'
        });
    }
};

// Middleware to check if user is enrolled (teacher OR student)
const verifyEnrolled = async (req, res, next) => {
    try {
        const userEmail = req.user?.email;
        const classroomId = req.params.id || req.params.classroomId;

        if (!classroomId) {
            return res.status(400).json({
                success: false,
                error: 'Classroom ID is required'
            });
        }

        const { getDB } = require('../database');
        const { ObjectId } = require('mongodb');

        if (!ObjectId.isValid(classroomId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid classroom ID'
            });
        }

        const db = getDB();
        const classroom = await db.collection('classrooms').findOne({
            _id: new ObjectId(classroomId)
        });

        if (!classroom) {
            return res.status(404).json({
                success: false,
                error: 'Classroom not found'
            });
        }

        // Check if user is teacher or student
        const isTeacher = classroom.teacherEmail === userEmail;
        const isStudent = classroom.students?.some(s => s.email === userEmail);

        if (!isTeacher && !isStudent) {
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'You are not enrolled in this classroom.'
            });
        }

        // Attach data to request
        req.classroom = classroom;
        req.userRole = isTeacher ? 'teacher' : 'student';
        next();

    } catch (error) {
        console.error('Enrollment verification error:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error during authorization'
        });
    }
};

module.exports = {
    verifyToken,
    verifyTeacher,
    verifyEnrolled
};
