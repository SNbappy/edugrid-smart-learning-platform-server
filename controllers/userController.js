const { getDB } = require('../database');

const userController = {
    // Create User (Sign Up) - Fixed default role
    createUser: async (req, res) => {
        try {
            console.log('🎯 Creating user:', req.body);

            const db = getDB();
            const usersCollection = db.collection('users');

            const { name, email, photoURL, loginMethod } = req.body;

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

            // Create new user with "user" as default role
            const newUser = {
                name: name,
                email: email,
                photoURL: '',  // Keep blank for now
                coverPhotoURL: '', // Add cover photo field
                loginMethod: loginMethod || 'email_password',
                role: 'user',  // ✅ Changed from 'teacher' to 'user'
                createdAt: new Date(),
                lastLogin: new Date(),
                isActive: true,
                profile: {
                    bio: '',
                    institution: '',
                    country: '',
                    district: '',
                    city: '',
                    facebook: '',
                    linkedin: '',
                    mailLink: ''
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

    // Update User Profile - FIXED to include coverPhotoURL
    updateUserProfile: async (req, res) => {
        try {
            const email = req.params.email;
            const updateData = req.body;

            console.log('📝 Updating user profile:', email);
            console.log('📝 Update data:', updateData);

            const db = getDB();
            const usersCollection = db.collection('users');

            // Separate root-level fields from profile fields
            const rootFields = {};
            const profileFields = {};

            // Root level fields that can be updated (removed role)
            if (updateData.name) rootFields.name = updateData.name;
            if (updateData.email) rootFields.email = updateData.email;
            if (updateData.photoURL !== undefined) rootFields.photoURL = updateData.photoURL;
            if (updateData.coverPhotoURL !== undefined) rootFields.coverPhotoURL = updateData.coverPhotoURL; // ✅ FIXED: Added this line

            // Profile fields
            if (updateData.bio !== undefined) profileFields['profile.bio'] = updateData.bio;
            if (updateData.country !== undefined) profileFields['profile.country'] = updateData.country;
            if (updateData.district !== undefined) profileFields['profile.district'] = updateData.district;
            if (updateData.city !== undefined) profileFields['profile.city'] = updateData.city;
            if (updateData.institution !== undefined) profileFields['profile.institution'] = updateData.institution;
            if (updateData.facebook !== undefined) profileFields['profile.facebook'] = updateData.facebook;
            if (updateData.linkedin !== undefined) profileFields['profile.linkedin'] = updateData.linkedin;
            if (updateData.mailLink !== undefined) profileFields['profile.mailLink'] = updateData.mailLink;

            // Combine all fields for update (excluding role)
            const updateFields = {
                ...rootFields,
                ...profileFields,
                updatedAt: new Date()
            };

            console.log('📝 Final update fields:', updateFields);

            const result = await usersCollection.updateOne(
                { email: email },
                { $set: updateFields }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            console.log('✅ User profile updated successfully');

            // Get updated user to return
            const updatedUser = await usersCollection.findOne({ email: email });

            res.json({
                success: true,
                message: 'User profile updated successfully',
                user: updatedUser
            });

        } catch (error) {
            console.error('❌ Error updating user profile:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update user profile',
                error: error.message
            });
        }
    },

    // Get User By Email - Updated to include coverPhotoURL migration
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

            // Migrate old schema if needed
            let needsMigration = false;
            const updates = {};

            // Check for missing profile fields
            if (!user.profile.hasOwnProperty('district') || !user.profile.hasOwnProperty('city')) {
                console.log('🔄 Migrating profile schema for:', email);
                updates['profile.district'] = user.profile.district || '';
                updates['profile.city'] = user.profile.city || '';
                needsMigration = true;
            }

            // Check for missing coverPhotoURL field
            if (!user.hasOwnProperty('coverPhotoURL')) {
                console.log('🔄 Adding coverPhotoURL field for:', email);
                updates['coverPhotoURL'] = '';
                needsMigration = true;
            }

            // Apply migrations if needed
            if (needsMigration) {
                await usersCollection.updateOne(
                    { email: email },
                    { $set: updates }
                );

                // Update the user object
                if (updates['profile.district'] !== undefined) user.profile.district = updates['profile.district'];
                if (updates['profile.city'] !== undefined) user.profile.city = updates['profile.city'];
                if (updates['coverPhotoURL'] !== undefined) user.coverPhotoURL = updates['coverPhotoURL'];
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
    }
};

module.exports = userController;
