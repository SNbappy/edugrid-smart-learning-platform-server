const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
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

/* ---------- EMAIL CONFIGURATION ---------- */
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Function to send verification email
const sendVerificationEmail = async (email, code, userName) => {
    const mailOptions = {
        from: `"EduGrid" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'OTP for EduGrid - Smart Learning Platform Login',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f0f2f5; }
                    .email-wrapper { padding: 15px; }
                    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
                    .logo { padding: 15px 20px; text-align: left; background-color: #f8f9fa; }
                    .logo-text { font-size: 18px; font-weight: 600; color: #1a202c; }
                    .date { float: right; font-size: 12px; color: #718096; margin-top: 2px; }
                    .content { padding: 25px 30px; }
                    .title { font-size: 26px; font-weight: 700; color: #1a365d; text-align: center; margin-bottom: 20px; }
                    .greeting { font-size: 14px; color: #2d3748; margin-bottom: 12px; }
                    .greeting strong { font-weight: 600; }
                    .message { font-size: 14px; color: #4a5568; line-height: 1.5; margin-bottom: 20px; }
                    .code-box { background-color: #ffffff; border: 2px solid #e2e8f0; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
                    .code { font-size: 38px; font-weight: 700; color: #2d3748; letter-spacing: 10px; font-family: 'Courier New', monospace; }
                    .note { font-size: 13px; color: #718096; margin: 15px 0; line-height: 1.5; }
                    .thank-you { font-size: 14px; color: #2d3748; margin-top: 20px; }
                    .footer { background-color: #f8f9fa; padding: 20px 30px; border-top: 1px solid #e2e8f0; }
                    .signature { font-size: 13px; color: #2d3748; margin-bottom: 15px; line-height: 1.5; }
                    .social-links { text-align: center; margin: 15px 0; }
                    .social-links a { display: inline-block; margin: 0 8px; }
                    .social-links img { width: 28px; height: 28px; vertical-align: middle; }
                    .social-links span { font-size: 13px; color: #457B9D; text-decoration: none; }
                    .contact-info { text-align: center; font-size: 11px; color: #718096; margin: 12px 0 0 0; line-height: 1.5; }
                    .contact-info a { color: #457B9D; text-decoration: none; }
                </style>
            </head>
            <body>
                <div class="email-wrapper">
                    <div class="container">
                        <div class="logo">
                            <span class="logo-text">🎓 EduGrid</span>
                            <span class="date">${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </div>
                        
                        <div class="content">
                            <h1 class="title">Your One-Time Password</h1>
                            
                            <div class="greeting">
                                Dear <strong>${userName || 'User'}</strong>,
                            </div>
                            
                            <div class="message">
                                Here is your One-Time Password to securely complete your registration on EduGrid:
                            </div>
                            
                            <div class="code-box">
                                <div class="code">${code}</div>
                            </div>
                            
                            <div class="note">
                                <strong>Note:</strong> This OTP is valid for 5 minutes.
                            </div>
                            
                            <div class="note">
                                If you did not request this OTP, please disregard this email or contact our support team.
                            </div>
                            
                            <div class="thank-you">
                                Thank you for choosing EduGrid!
                            </div>
                        </div>
                        
                        <div class="footer">
                            <div class="signature">
                                Best regards,<br>
                                <strong>Md. Sabbir Hossain Bappy</strong><br>
                                Full Stack Developer | Creator of EduGrid
                            </div>
                            
                            <div class="social-links">
                                <a href="https://www.linkedin.com/in/snbappy" target="_blank" title="LinkedIn">
                                    <img src="https://upload.wikimedia.org/wikipedia/commons/c/ca/LinkedIn_logo_initials.png" alt="LinkedIn">
                                </a>
                                <a href="https://github.com/SNbappy" target="_blank" title="GitHub">
                                    <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" alt="GitHub">
                                </a>
                                <a href="https://codeforces.com/profile/Depressed_C0der" target="_blank" title="Codeforces">
                                    <span>🏆 Codeforces</span>
                                </a>
                            </div>
                            
                            <div class="contact-info">
                                Website: <a href="https://edugrid-smart-learning.web.app/">edugrid-smart-learning.web.app</a><br>
                                © 2025 EduGrid - Smart Learning Platform
                            </div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    return transporter.sendMail(mailOptions);
};

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

/* ---------- EMAIL VERIFICATION ROUTES ---------- */

// Route 1: Send verification code
app.post('/api/send-verification-code', async (req, res) => {
    try {
        const { email, userName } = req.body; // Accept userName from frontend
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const { getDB } = require('./database');
        const db = getDB();

        // If userName not provided, try to get from database
        let name = userName;
        if (!name) {
            const usersCollection = db.collection('users');
            const user = await usersCollection.findOne({ email: email });
            name = user ? user.name : 'User';
        }

        const verificationCollection = db.collection('verificationCodes');

        await verificationCollection.deleteMany({ email: email });
        await verificationCollection.insertOne({
            email: email,
            code: verificationCode,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
            verified: false
        });

        try {
            await sendVerificationEmail(email, verificationCode, name);
            console.log(`✅ Email sent to ${email} (${name}) with code: ${verificationCode}`);
        } catch (emailError) {
            console.error('❌ Email failed:', emailError.message);
        }

        res.json({ success: true, message: 'Verification code sent', code: verificationCode });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, message: 'Failed to send code' });
    }
});


// Route 2: Verify code
app.post('/api/verify-code', async (req, res) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            return res.status(400).json({
                success: false,
                message: 'Email and code are required'
            });
        }

        console.log('🔍 Verifying code for:', email, 'Code:', code);

        const { getDB } = require('./database');
        const db = getDB();
        const verificationCollection = db.collection('verificationCodes');

        // Find valid code
        const record = await verificationCollection.findOne({
            email: email,
            code: code,
            verified: false,
            expiresAt: { $gt: new Date() }
        });

        if (!record) {
            console.log('❌ Invalid or expired code');
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired code. Please request a new one.'
            });
        }

        // Mark code as verified
        await verificationCollection.updateOne(
            { _id: record._id },
            { $set: { verified: true, verifiedAt: new Date() } }
        );

        // Update user as verified
        const usersCollection = db.collection('users');
        const updateResult = await usersCollection.updateOne(
            { email: email },
            { $set: { emailVerified: true, verifiedAt: new Date() } }
        );

        console.log('✅ Email verified successfully for:', email);
        console.log('User update result:', updateResult);

        res.json({
            success: true,
            message: 'Email verified successfully'
        });

    } catch (error) {
        console.error('❌ Error verifying code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify code',
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
            'GET  /api/classrooms/:classroomId/tasks/:taskId/submissions': 'Get task submissions',
            'POST /api/send-verification-code': 'Send email verification code',
            'POST /api/verify-code': 'Verify email code',
            'GET  /api/test': 'Test database'
        }
    });
});

/* ---------- Start Server ---------- */
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Access: http://localhost:${PORT}`);
});
