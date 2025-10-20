const express = require('express');
const nodemailer = require('nodemailer');
const router = express.Router();

// Email configuration (you can also pass this as a parameter)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Function to send verification email
const sendVerificationEmail = async (email, code) => {
    const mailOptions = {
        from: `"EduGrid" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Verify Your Email - EduGrid',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
                    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px; }
                    .header { background: linear-gradient(135deg, #457B9D 0%, #3a6b8a 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .header h1 { color: #ffffff; margin: 0; font-size: 28px; }
                    .content { padding: 30px; text-align: center; }
                    .code-box { background-color: #DCE8F5; padding: 20px; border-radius: 10px; margin: 20px 0; }
                    .code { font-size: 36px; font-weight: bold; color: #457B9D; letter-spacing: 8px; }
                    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>📧 Email Verification</h1>
                    </div>
                    <div class="content">
                        <h2 style="color: #333;">Welcome to EduGrid!</h2>
                        <p style="color: #666; font-size: 16px;">Please use the verification code below to complete your registration:</p>
                        
                        <div class="code-box">
                            <div class="code">${code}</div>
                        </div>
                        
                        <p style="color: #666; font-size: 14px;">This code will expire in <strong>5 minutes</strong>.</p>
                        <p style="color: #666; font-size: 14px;">If you didn't request this verification, please ignore this email.</p>
                    </div>
                    <div class="footer">
                        <p>© 2025 EduGrid - Smart Learning Platform</p>
                        <p>This is an automated message, please do not reply.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    return transporter.sendMail(mailOptions);
};

module.exports = (db) => {
    // Route 1: Send verification code
    router.post('/send-verification-code', async (req, res) => {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({ success: false, message: 'Email is required' });
            }

            console.log('📧 Sending verification code to:', email);

            // Generate 6-digit code
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

            // Store code in database with 5-minute expiration
            const verificationCollection = db.collection('verificationCodes');

            // Delete any existing codes for this email
            await verificationCollection.deleteMany({ email: email });

            // Insert new code
            await verificationCollection.insertOne({
                email: email,
                code: verificationCode,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
                verified: false
            });

            // ✅ SEND EMAIL
            try {
                await sendVerificationEmail(email, verificationCode);
                console.log(`✅ Verification email sent to ${email}`);
            } catch (emailError) {
                console.error('❌ Failed to send email:', emailError);
                // Continue anyway - code is still valid
            }

            console.log(`✅ Verification code generated: ${verificationCode}`);

            res.json({
                success: true,
                message: 'Verification code sent to your email',
                // ⚠️ REMOVE THIS IN PRODUCTION - only for testing
                code: verificationCode
            });

        } catch (error) {
            console.error('❌ Error sending verification code:', error);
            res.status(500).json({ success: false, message: 'Failed to send verification code' });
        }
    });

    // Route 2: Verify code
    router.post('/verify-code', async (req, res) => {
        try {
            const { email, code } = req.body;

            if (!email || !code) {
                return res.status(400).json({
                    success: false,
                    message: 'Email and code are required'
                });
            }

            console.log('🔍 Verifying code for:', email, 'Code:', code);

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
            await usersCollection.updateOne(
                { email: email },
                { $set: { emailVerified: true, verifiedAt: new Date() } }
            );

            console.log('✅ Email verified successfully for:', email);

            res.json({
                success: true,
                message: 'Email verified successfully'
            });

        } catch (error) {
            console.error('❌ Error verifying code:', error);
            res.status(500).json({ success: false, message: 'Failed to verify code' });
        }
    });

    return router;
};
