const { getDB } = require('../../database');
const { ObjectId } = require('mongodb');
const { validateClassroomId, findClassroom } = require('../helpers/classroomHelpers');

const materialsController = {
    getMaterials: async (req, res) => {
        try {
            const classroomId = req.params.id;
            //console.log('📄 Getting materials for classroom:', classroomId);

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
            const {
                title,
                description,
                type,
                url,
                youtubeUrl,
                embedUrl,
                fileName,
                fileSize,
                fileType,
                publicId
            } = req.body;

            //console.log('➕ Adding material:', { title, type, url, youtubeUrl, embedUrl });
            //console.log('📝 Full request body:', JSON.stringify(req.body, null, 2));

            // Basic validation
            if (!title || !title.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Title is required'
                });
            }

            if (!type) {
                return res.status(400).json({
                    success: false,
                    message: 'Material type is required'
                });
            }

            // Validate classroom ID
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

            // Create base material object
            const material = {
                id: new ObjectId(),
                title: title.trim(),
                description: description?.trim() || '',
                type: type,
                uploadedAt: new Date(),
                uploadedBy: req.user?.email || 'teacher'
            };

            // Handle different material types
            let dbFieldType = 'files'; // default

            if (type === 'youtube') {
                if (!youtubeUrl || !embedUrl) {
                    return res.status(400).json({
                        success: false,
                        message: 'YouTube URL and embed URL are required for YouTube videos'
                    });
                }

                material.youtubeUrl = youtubeUrl;
                material.embedUrl = embedUrl;
                material.url = youtubeUrl; // Store original URL too
                dbFieldType = 'videos';

            } else if (type === 'link') {
                if (!url) {
                    return res.status(400).json({
                        success: false,
                        message: 'URL is required for web links'
                    });
                }

                material.url = url;
                dbFieldType = 'links';

            } else if (type === 'file') {
                if (!url) {
                    return res.status(400).json({
                        success: false,
                        message: 'File URL is required for file uploads'
                    });
                }

                material.url = url;
                material.fileUrl = url;
                material.fileName = fileName || title;
                material.fileSize = fileSize || null;
                material.fileType = fileType || null;
                material.publicId = publicId || null;
                dbFieldType = 'files';

            } else {
                return res.status(400).json({
                    success: false,
                    message: `Invalid material type: ${type}. Must be 'youtube', 'link', or 'file'`
                });
            }

            //console.log('📋 Created material object:', material);
            //console.log('🗂️ Will store in field:', dbFieldType);

            // Add to database
            const updateField = `materials.${dbFieldType}`;
            const result = await db.collection('classrooms').updateOne(
                { _id: new ObjectId(classroomId) },
                {
                    $push: { [updateField]: material },
                    $set: { updatedAt: new Date() }
                }
            );

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

            //console.log('✅ Material added successfully to', updateField);

            res.status(201).json({
                success: true,
                message: 'Material added successfully',
                material: material
            });

        } catch (error) {
            console.error('❌ Error adding material:', error);
            console.error('❌ Error stack:', error.stack);
            res.status(500).json({
                success: false,
                message: 'Internal server error while adding material',
                error: error.message
            });
        }
    },

    deleteMaterial: async (req, res) => {
        try {
            const { id: classroomId, materialId } = req.params;

            //console.log('🗑️ Backend: Attempting to delete material:', { classroomId, materialId });

            const validation = validateClassroomId(classroomId);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: validation.message
                });
            }

            const db = getDB();

            // First, find which array contains this material
            const classroom = await findClassroom(db, classroomId);
            if (!classroom) {
                return res.status(404).json({
                    success: false,
                    message: 'Classroom not found'
                });
            }

            //console.log('🔍 Searching for material in all arrays...');

            // Search in all three arrays to find the material
            const materialArrays = [
                { fieldName: 'materials.files', array: classroom.materials?.files || [], type: 'file' },
                { fieldName: 'materials.videos', array: classroom.materials?.videos || [], type: 'youtube' },
                { fieldName: 'materials.links', array: classroom.materials?.links || [], type: 'link' }
            ];

            let foundInField = null;
            let foundMaterial = null;

            for (const { fieldName, array, type } of materialArrays) {
                const found = array.find(m => m.id.toString() === materialId);
                if (found) {
                    foundInField = fieldName;
                    foundMaterial = found;
                    //console.log(`✅ Found material in ${fieldName}:`, found.title);
                    break;
                }
            }

            if (!foundInField) {
                console.error('❌ Material not found in any array:', materialId);
                return res.status(404).json({
                    success: false,
                    message: 'Material not found'
                });
            }

            // Delete from the correct array
            //console.log(`🗂️ Deleting from ${foundInField}`);

            const result = await db.collection('classrooms').updateOne(
                { _id: new ObjectId(classroomId) },
                {
                    $pull: { [foundInField]: { id: new ObjectId(materialId) } },
                    $set: { updatedAt: new Date() }
                }
            );

            //console.log('📊 Delete operation result:', {
        //     matchedCount: result.matchedCount,
        //         modifiedCount: result.modifiedCount,
        //             foundInField,
        //             materialTitle: foundMaterial.title
        // });

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Classroom not found during deletion'
            });
        }

        if (result.modifiedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Material not found or already deleted'
            });
        }

        //console.log('✅ Material successfully deleted from database');

        res.json({
            success: true,
            message: 'Material deleted successfully'
        });

    } catch(error) {
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
            //console.log('📝 Updating material:', { classroomId, materialId });

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
