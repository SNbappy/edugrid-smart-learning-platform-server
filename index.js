const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { connectDB } = require('./database');
const logger = require('./middleware/logger');
const userRoutes = require('./routes/userRoutes');
const classroomRoutes = require('./routes/classroomRoutes');   // ✅ NEW

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(logger);

connectDB();

/* ---------- API Routes ---------- */
app.use('/api/users', userRoutes);
+app.use('/api/classrooms', classroomRoutes);                  // ✅ NEW

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
            // Users
            'POST /api/users': 'Create user',
            'GET  /api/users': 'Get all users',
            'GET  /api/users/:email': 'Get user by email',
            // Classrooms
            'POST /api/classrooms': 'Create classroom',          // ✅ NEW
            'GET  /api/classrooms': 'Get all classrooms',        // ✅ NEW
            'GET  /api/classrooms/teacher/:email': 'Get classrooms by teacher', // ✅ NEW
            'GET  /api/classrooms/:id': 'Get single classroom',      // ✅ NEW
            // Misc
            'GET  /api/test': 'Test database'
        }
    });
});

/* ---------- Start Server ---------- */
app.listen(PORT, () => {
    console.log(`🚀  Server running on port ${PORT}`);
    console.log(`🌐  Access: http://localhost:${PORT}`);
});
