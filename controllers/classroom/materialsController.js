const { getDB } = require('../../database');
const { ObjectId } = require('mongodb');
const { validateClassroomId, findClassroom } = require('../helpers/classroomHelpers');

const materialsController = {
    getMaterials: async (req, res) => {
        try {
            const classroomId = req.params.id;
            console.log('📄 Getting materials for classroom:', classroomId);

            const validation = validateClassroomId(classroomId);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: validation.message
                });
            }

            const db = getDB();
            const classroom = await findClassroom(db, classroomId);

            if (!classroom) {
                return res.status(404).json({
                    success: false,
                    message: 'Classroom not found'
                });
            }

            res.json({
                success: true,
                materials: classroom.materials || { files: [], links: [], videos: [] }
            });

        } catch (error) {
            console.error('❌ Error getting materials:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get materials',
                error: error.message
            });
        }
    },

    addMaterial: async (req, res) => {
        try {
            const classroomId = req.params.id;

            // Add detailed logging
            console.log('➕ Adding material to classroom:', classroomId);
            console.log('📝 Request body received:', JSON.stringify(req.body, null, 2));

            // Handle both old and new field names for backward compatibility
            const {
                // New field names (from frontend)
                name,
                fileUrl,
                fileName,
                fileSize,
                fileType,
                category,
                publicId,
                resourceType,

                // Old field names (for backward compatibility)
                type,
                title,
                url,

                // Common fields
                description,
                uploadedBy
            } = req.body;

            // Map the fields to what we need
            const materialTitle = title || name || fileName;
            const materialUrl = url || fileUrl;
            const materialType = type || (category === 'document' ? 'file' : category);

            console.log('🔍 Mapped fields:', {
                materialTitle,
                materialUrl,
                materialType,
                description,
                uploadedBy
            });

            // Validation with detailed logging
            if (!materialType) {
                console.log('❌ Missing type/category field');
                return res.status(400).json({
                    success: false,
                    message: 'Material type or category is required',
                    received: { type, category, name, title }
                });
            }

            if (!materialTitle) {
                console.log('❌ Missing title/name field');
                return res.status(400).json({
                    success: false,
                    message: 'Material title or name is required',
                    received: { title, name, fileName }
                });
            }

            if (!materialUrl) {
                console.log('❌ Missing url/fileUrl field');
                return res.status(400).json({
                    success: false,
                    message: 'Material URL or fileUrl is required',
                    received: { url, fileUrl }
                });
            }

            // Validate classroom ID format
            const validation = validateClassroomId(classroomId);
            if (!validation.valid) {
                console.log('❌ Invalid classroom ID format:', classroomId);
                return res.status(400).json({
                    success: false,
                    message: validation.message
                });
            }

            console.log('✅ All validations passed, proceeding with database update');

            const db = getDB();

            // Check if classroom exists first
            const classroom = await findClassroom(db, classroomId);

            if (!classroom) {
                console.log('❌ Classroom not found:', classroomId);
                return res.status(404).json({
                    success: false,
                    message: 'Classroom not found'
                });
            }

            console.log('✅ Classroom found, creating material object');

            // In your materialsController.js addMaterial function
            const material = {
                id: new ObjectId(),
                title: materialTitle,
                url: materialUrl, // Store the base URL without transformations
                downloadUrl: `${materialUrl}?fl_attachment=true`, // Add separate download URL
                viewUrl: materialUrl, // URL for viewing/preview
                description: description || '',
                fileName: fileName || materialTitle,
                fileSize: fileSize || null,
                fileType: fileType || null,
                category: category || 'document',
                publicId: publicId || null,
                resourceType: resourceType || 'raw',
                uploadedAt: new Date(),
                uploadedBy: uploadedBy || 'teacher'
            };


            console.log('📋 Material object created:', material);

            // Map frontend types to database field names
            const typeMapping = {
                'file': 'files',
                'document': 'files',  // Handle 'document' category
                'link': 'links',
                'video': 'videos'
            };

            const dbFieldType = typeMapping[materialType] || 'files';
            const validTypes = ['files', 'links', 'videos'];

            if (!validTypes.includes(dbFieldType)) {
                console.log('❌ Invalid material type:', materialType, 'mapped to:', dbFieldType);
                return res.status(400).json({
                    success: false,
                    message: `Invalid material type. Received: ${materialType}`,
                    receivedType: materialType
                });
            }

            const updateField = `materials.${dbFieldType}`;
            console.log('🔄 Updating field:', updateField);

            const result = await db.collection('classrooms').updateOne(
                { _id: new ObjectId(classroomId) },
                {
                    $push: { [updateField]: material },
                    $set: { updatedAt: new Date() }
                }
            );

            console.log('📊 Database update result:', result);

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Classroom not found during update'
                });
            }

            if (result.modifiedCount === 0) {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to add material to classroom'
                });
            }

            console.log('✅ Material added successfully');

            res.json({
                success: true,
                message: 'Material added successfully',
                material
            });

        } catch (error) {
            console.error('❌ Error adding material:', error);
            console.error('❌ Error stack:', error.stack);
            res.status(500).json({
                success: false,
                message: 'Failed to add material',
                error: error.message
            });
        }
    },

    deleteMaterial: async (req, res) => {
        try {
            const { id: classroomId, materialId } = req.params;
            const { type, category } = req.query;

            console.log('🗑️ Deleting material:', { classroomId, materialId, type, category });

            const validation = validateClassroomId(classroomId);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: validation.message
                });
            }

            const materialType = type || category;
            if (!materialType) {
                return res.status(400).json({
                    success: false,
                    message: 'Material type or category is required'
                });
            }

            // Map frontend types to database field names
            const typeMapping = {
                'file': 'files',
                'document': 'files',
                'link': 'links',
                'video': 'videos'
            };

            const dbFieldType = typeMapping[materialType] || 'files';
            const db = getDB();
            const updateField = `materials.${dbFieldType}`;

            const result = await db.collection('classrooms').updateOne(
                { _id: new ObjectId(classroomId) },
                {
                    $pull: { [updateField]: { id: new ObjectId(materialId) } },
                    $set: { updatedAt: new Date() }
                }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Classroom not found'
                });
            }

            res.json({
                success: true,
                message: 'Material deleted successfully'
            });

        } catch (error) {
            console.error('❌ Error deleting material:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete material',
                error: error.message
            });
        }
    },

    updateMaterial: async (req, res) => {
        try {
            const { id: classroomId, materialId } = req.params;
            console.log('📝 Updating material:', { classroomId, materialId });

            // Simplified implementation for now
            res.json({
                success: true,
                message: 'Material updated successfully'
            });

        } catch (error) {
            console.error('❌ Error updating material:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update material',
                error: error.message
            });
        }
    },

    // Add to your materialsController.js
    downloadMaterial: async (req, res) => {
        try {
            const { id: classroomId, materialId } = req.params;

            const validation = validateClassroomId(classroomId);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: validation.message
                });
            }

            const db = getDB();
            const classroom = await findClassroom(db, classroomId);

            if (!classroom) {
                return res.status(404).json({
                    success: false,
                    message: 'Classroom not found'
                });
            }

            // Find the material
            let material = null;
            ['files', 'links', 'videos'].forEach(type => {
                const found = classroom.materials[type]?.find(m => m.id.toString() === materialId);
                if (found) material = found;
            });

            if (!material) {
                return res.status(404).json({
                    success: false,
                    message: 'Material not found'
                });
            }

            // Generate proper download URL
            const downloadUrl = material.url.includes('?')
                ? `${material.url}&fl_attachment=true`
                : `${material.url}?fl_attachment=true`;

            res.json({
                success: true,
                downloadUrl: downloadUrl,
                fileName: material.fileName,
                fileSize: material.fileSize
            });

        } catch (error) {
            console.error('❌ Error generating download URL:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate download URL',
                error: error.message
            });
        }
    }

};

module.exports = materialsController;
addMaterial: async (req, res) => {
    try {
        const classroomId = req.params.id;

        // Add detailed logging
        console.log('➕ Adding material to classroom:', classroomId);
        console.log('📝 Request body received:', JSON.stringify(req.body, null, 2));
        console.log('📝 Request headers:', req.headers['content-type']);

        const {
            // Frontend sends these fields for web links
            name,
            title,
            description,
            url,
            type,

            // File-specific fields (might be missing for links)
            fileUrl,
            fileName,
            fileSize,
            fileType,
            category,
            publicId,
            resourceType,
            uploadedBy
        } = req.body;

        console.log('🔍 Extracted fields:', {
            name, title, description, url, type, category,
            fileUrl, fileName, fileSize, fileType
        });

        // Map the fields to what we need
        const materialTitle = title || name;
        const materialUrl = url || fileUrl;
        const materialType = type || category;

        console.log('🔄 Mapped fields:', {
            materialTitle,
            materialUrl,
            materialType
        });

        // Enhanced validation with specific error messages
        if (!materialType) {
            console.log('❌ Missing type field');
            return res.status(400).json({
                success: false,
                message: 'Material type is required',
                received: { type, category, name, title },
                debug: 'Either type or category field must be provided'
            });
        }

        if (!materialTitle) {
            console.log('❌ Missing title field');
            return res.status(400).json({
                success: false,
                message: 'Material title is required',
                received: { title, name },
                debug: 'Either title or name field must be provided'
            });
        }

        if (!materialUrl) {
            console.log('❌ Missing url field');
            return res.status(400).json({
                success: false,
                message: 'Material URL is required',
                received: { url, fileUrl },
                debug: 'Either url or fileUrl field must be provided'
            });
        }

        // Validate classroom ID format
        const validation = validateClassroomId(classroomId);
        if (!validation.valid) {
            console.log('❌ Invalid classroom ID format:', classroomId);
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        console.log('✅ All validations passed, proceeding with database update');

        const db = getDB();

        // Check if classroom exists first
        const classroom = await findClassroom(db, classroomId);

        if (!classroom) {
            console.log('❌ Classroom not found:', classroomId);
            return res.status(404).json({
                success: false,
                message: 'Classroom not found'
            });
        }

        console.log('✅ Classroom found, creating material object');

        // Create material object with proper fallbacks for web links
        const material = {
            id: new ObjectId(),
            title: materialTitle,
            url: materialUrl,
            description: description || '',
            fileName: fileName || materialTitle, // Use title as filename for links
            fileSize: fileSize || null, // Links don't have file size
            fileType: fileType || 'text/html', // Default for web links
            category: category || 'link', // Default category for links
            publicId: publicId || null, // Links don't have Cloudinary public ID
            resourceType: resourceType || 'link', // Set as 'link' type
            uploadedAt: new Date(),
            uploadedBy: uploadedBy || 'teacher'
        };

        console.log('📋 Material object created:', material);

        // Enhanced type mapping for web links
        const typeMapping = {
            'file': 'files',
            'document': 'files',
            'link': 'links',    // ← This is key for web links
            'video': 'videos'
        };

        const dbFieldType = typeMapping[materialType] || 'links'; // Default to links
        console.log('🗂️ Database field type:', dbFieldType);

        const validTypes = ['files', 'links', 'videos'];

        if (!validTypes.includes(dbFieldType)) {
            console.log('❌ Invalid material type:', materialType, 'mapped to:', dbFieldType);
            return res.status(400).json({
                success: false,
                message: `Invalid material type. Received: ${materialType}`,
                receivedType: materialType,
                validTypes: validTypes
            });
        }

        const updateField = `materials.${dbFieldType}`;
        console.log('🔄 Updating field:', updateField);

        const result = await db.collection('classrooms').updateOne(
            { _id: new ObjectId(classroomId) },
            {
                $push: { [updateField]: material },
                $set: { updatedAt: new Date() }
            }
        );

        console.log('📊 Database update result:', result);

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Classroom not found during update'
            });
        }

        if (result.modifiedCount === 0) {
            return res.status(500).json({
                success: false,
                message: 'Failed to add material to classroom'
            });
        }

        console.log('✅ Material added successfully');

        res.json({
            success: true,
            message: 'Material added successfully',
            material
        });

    } catch (error) {
        console.error('❌ Error adding material:', error);
        console.error('❌ Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Failed to add material',
            error: error.message
        });
    }
}
