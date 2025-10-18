const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { connectDB } = require('./database');
const logger = require('./middleware/logger');
const userRoutes = require('./routes/userRoutes');
const classroomRoutes = require('./routes/classroomRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(logger);

connectDB();

/* ---------- ADD SUBMISSION ROUTE BEFORE OTHER ROUTES ---------- */
app.get('/api/classrooms/:classroomId/tasks/:taskId/submissions', async (req, res) => {
    try {
        const { classroomId, taskId } = req.params;
        const userEmail = req.headers['user-email'];

        console.log('📋 SUBMISSIONS ROUTE HIT FROM INDEX.JS:', {
            classroomId,
            taskId,
            userEmail
        });

        if (!userEmail) {
            return res.status(401).json({
                success: false,
                message: 'User email is required'
            });
        }

        const { getDB } = require('./database');
        const { ObjectId } = require('mongodb');

        if (!ObjectId.isValid(classroomId) || !ObjectId.isValid(taskId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid classroom ID or task ID'
            });
        }

        const db = getDB();
        const classroom = await db.collection('classrooms').findOne({
            _id: new ObjectId(classroomId)
        });

        if (!classroom) {
            return res.status(404).json({
                success: false,
                message: 'Classroom not found'
            });
        }

        const task = classroom.tasks?.assignments?.find(t =>
            t._id?.toString() === taskId || t.id?.toString() === taskId
        );

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found',
                debug: {
                    taskId,
                    availableTasks: classroom.tasks?.assignments?.map(t => ({
                        id: t._id || t.id,
                        title: t.title
                    })) || []
                }
            });
        }

        const submissions = task.submissions || [];
        const isTeacher = classroom.teacherEmail === userEmail;

        let filteredSubmissions = submissions;
        if (!isTeacher) {
            filteredSubmissions = submissions.filter(sub => sub.studentEmail === userEmail);
        }

        console.log('✅ RETURNING SUBMISSIONS:', filteredSubmissions.length);

        res.json({
            success: true,
            submissions: filteredSubmissions,
            count: filteredSubmissions.length,
            taskTitle: task.title,
            userRole: isTeacher ? 'teacher' : 'student'
        });

    } catch (error) {
        console.error('❌ SUBMISSIONS ERROR:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get submissions',
            error: error.message
        });
    }
});

/* ---------- API Routes ---------- */
app.use('/api/users', userRoutes);
app.use('/api/classrooms', classroomRoutes);

/* ---------- Test Route ---------- */
app.get('/api/test', async (req, res) => {
    try {
        const { getDB } = require('./database');
        const db = getDB();
        const usersCollection = db.collection('users');
        const userCount = await usersCollection.countDocuments();

        res.json({
            success: true,
            message: 'Database connection working',
            userCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Database connection failed',
            error: error.message
        });
    }
});

/* ---------- Root Route ---------- */
app.get('/', (req, res) => {
    res.json({
        message: 'EduGrid Backend Server is running',
        version: '1.0.0',
        endpoints: {
            'POST /api/users': 'Create user',
            'GET  /api/users': 'Get all users',
            'GET  /api/users/:email': 'Get user by email',
            'POST /api/classrooms': 'Create classroom',
            'GET  /api/classrooms': 'Get all classrooms',
            'GET  /api/classrooms/teacher/:email': 'Get classrooms by teacher',
            'GET  /api/classrooms/:id': 'Get single classroom',
            'GET  /api/classrooms/:classroomId/tasks/:taskId/submissions': 'Get task submissions', // ✅ NOW AVAILABLE
            'GET  /api/test': 'Test database'
        }
    });
});

/* ---------- Start Server ---------- */
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Access: http://localhost:${PORT}`);
});