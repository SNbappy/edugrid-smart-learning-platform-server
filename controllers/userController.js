const { getDB } = require('../database');

const userController = {
    // Create User (Sign Up)
    createUser: async (req, res) => {
        try {
            console.log('🎯 Creating user:', req.body);

            const db = getDB();
            const usersCollection = db.collection('users');

            const { name, email, photoURL, loginMethod } = req.body;

            // Validation
            if (!email || !name) {
                return res.status(400).json({
                    success: false,
                    message: 'Name and email are required'
                });
            }

            // Check if user exists
            const existingUser = await usersCollection.findOne({ email });
            if (existingUser) {
                console.log('⚠️ User already exists:', email);
                return res.status(400).json({
                    success: false,
                    message: 'User already exists'
                });
            }

            // Create new user
            const newUser = {
                name: name,
                email: email,
                photoURL: photoURL || '',
                loginMethod: loginMethod || 'email_password',
                role: 'teacher',
                createdAt: new Date(),
                lastLogin: new Date(),
                isActive: true,
                profile: {
                    department: '',
                    subject: '',
                    phone: '',
                    address: '',
                    bio: ''
                }
            };

            console.log('💾 Inserting user into database');
            const result = await usersCollection.insertOne(newUser);
            console.log('✅ User created with ID:', result.insertedId);

            res.status(201).json({
                success: true,
                message: 'User created successfully',
                insertedId: result.insertedId,
                acknowledged: true
            });

        } catch (error) {
            console.error('❌ Error creating user:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create user',
                error: error.message
            });
        }
    },

    // Get All Users
    getAllUsers: async (req, res) => {
        try {
            console.log('📋 Getting all users');

            const db = getDB();
            const usersCollection = db.collection('users');
            const users = await usersCollection.find({}).toArray();

            console.log(`✅ Found ${users.length} users`);

            res.json({
                success: true,
                count: users.length,
                users: users
            });

        } catch (error) {
            console.error('❌ Error getting users:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get users',
                error: error.message
            });
        }
    },

    // Get User by Email
    getUserByEmail: async (req, res) => {
        try {
            const email = req.params.email;
            console.log('🔍 Getting user:', email);

            const db = getDB();
            const usersCollection = db.collection('users');
            const user = await usersCollection.findOne({ email: email });

            if (!user) {
                console.log('❌ User not found:', email);
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            console.log('✅ User found:', email);
            res.json({
                success: true,
                user: user
            });

        } catch (error) {
            console.error('❌ Error getting user:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get user',
                error: error.message
            });
        }
    },

    // Update User Profile
    updateUserProfile: async (req, res) => {
        try {
            const email = req.params.email;
            const updateData = req.body;

            console.log('📝 Updating user profile:', email);

            const db = getDB();
            const usersCollection = db.collection('users');

            const result = await usersCollection.updateOne(
                { email: email },
                {
                    $set: {
                        ...updateData,
                        updatedAt: new Date()
                    }
                }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            console.log('✅ User profile updated successfully');
            res.json({
                success: true,
                message: 'User profile updated successfully'
            });

        } catch (error) {
            console.error('❌ Error updating user profile:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update user profile',
                error: error.message
            });
        }
    }
};

module.exports = userController;
