const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { connectDB } = require('./database');
const logger = require('./middleware/logger');
const userRoutes = require('./routes/userRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(logger);

connectDB();

app.use('/api/users', userRoutes);

app.get('/api/test', async (req, res) => {
    try {
        const { getDB } = require('./database');
        const db = getDB();
        const usersCollection = db.collection('users');
        const userCount = await usersCollection.countDocuments();

        res.json({
            success: true,
            message: 'Database connection working',
            userCount: userCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Database connection failed',
            error: error.message
        });
    }
});

app.get('/', (req, res) => {
    res.json({
        message: 'EduGrid Backend Server is running',
        version: '1.0.0',
        endpoints: {
            'POST /api/users': 'Create user',
            'GET /api/users': 'Get all users',
            'GET /api/users/:email': 'Get user by email',
            'GET /api/test': 'Test database'
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access: http://localhost:${PORT}`);
});
