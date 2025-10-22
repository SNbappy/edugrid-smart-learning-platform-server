const { getDB } = require('../../database');
const { ObjectId } = require('mongodb');
const { generateClassroomCode, calculateAverageAttendance, validateClassroomId, findClassroom } = require('../helpers/classroomHelpers');

const basicOperations = {
    // Create Classroom
    createClassroom: async (req, res) => {
        try {
            //console.log('📚 Creating classroom:', req.body);

            const db = getDB();
            const classroomsCollection = db.collection('classrooms');

            const {
                name,
                description,
                subject,
                grade,
                teacherEmail,
                teacherName,
                maxStudents = 30,
                imageUrl = ''
            } = req.body;

            // Validation
            if (!name || !subject || !teacherEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'Classroom name, subject, and teacher email are required'
                });
            }

            // Generate unique classroom code
            let classroomCode;
            let isUnique = false;
            while (!isUnique) {
                classroomCode = generateClassroomCode();
                const existingClass = await classroomsCollection.findOne({ code: classroomCode });
                if (!existingClass) {
                    isUnique = true;
                }
            }

            // Create new classroom with enhanced structure
            const newClassroom = {
                name: name,
                description: description || '',
                subject: subject,
                grade: grade || '',
                code: classroomCode,
                teacherEmail: teacherEmail,
                teacherName: teacherName,
                maxStudents: parseInt(maxStudents) || 30,
                imageUrl: imageUrl,
                students: [],

                // Enhanced features
                attendance: {
                    sessions: [],
                    totalSessions: 0
                },
                materials: {
                    files: [],
                    links: [],
                    videos: []
                },
                tasks: {
                    assignments: [],
                    submissions: []
                },
                marks: {
                    gradebook: [],
                    categories: ['Assignment', 'Quiz', 'Exam', 'Project']
                },
                announcements: [],

                // Analytics
                stats: {
                    totalStudents: 0,
                    activeTasks: 0,
                    completedTasks: 0,
                    averageAttendance: 0
                },

                // Settings
                settings: {
                    allowStudentSubmissions: true,
                    showGradesToStudents: true,
                    enableDiscussions: true,
                    requireApprovalToJoin: false
                },

                // Metadata
                createdAt: new Date(),
                updatedAt: new Date(),
                isActive: true
            };

            const result = await classroomsCollection.insertOne(newClassroom);
            //console.log('✅ Classroom created with ID:', result.insertedId);

            res.status(201).json({
                success: true,
                message: 'Classroom created successfully',
                classroom: { ...newClassroom, _id: result.insertedId },
                classCode: classroomCode
            });

        } catch (error) {
            console.error('❌ Error creating classroom:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create classroom',
                error: error.message
            });
        }
    },

    // Get all classrooms
    getAllClassrooms: async (req, res) => {
        try {
            //console.log('📋 Getting all classrooms');

            const db = getDB();
            const classroomsCollection = db.collection('classrooms');

            const classrooms = await classroomsCollection.find({
                isActive: true
            }).sort({ createdAt: -1 }).toArray();

            const updatedClassrooms = classrooms.map(classroom => ({
                ...classroom,
                studentCount: classroom.students?.length || 0,
                enrollmentPercentage: Math.round(((classroom.students?.length || 0) / classroom.maxStudents) * 100)
            }));

            //console.log(`✅ Found ${classrooms.length} classrooms`);

            res.json({
                success: true,
                count: classrooms.length,
                classrooms: updatedClassrooms
            });

        } catch (error) {
            console.error('❌ Error getting classrooms:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get classrooms',
                error: error.message
            });
        }
    },

    // Get classrooms by teacher
    getMyClassrooms: async (req, res) => {
        try {
            const teacherEmail = req.params.teacherEmail;
            //console.log('👨‍🏫 Getting classrooms for teacher:', teacherEmail);

            const db = getDB();
            const classroomsCollection = db.collection('classrooms');

            const classrooms = await classroomsCollection.find({
                teacherEmail: teacherEmail,
                isActive: true
            }).sort({ createdAt: -1 }).toArray();

            const enhancedClassrooms = classrooms.map(classroom => ({
                ...classroom,
                analytics: {
                    totalStudents: classroom.students?.length || 0,
                    activeTasks: classroom.tasks?.assignments?.filter(task => !task.isCompleted)?.length || 0,
                    materialsCount: (classroom.materials?.files?.length || 0) +
                        (classroom.materials?.links?.length || 0) +
                        (classroom.materials?.videos?.length || 0),
                    attendanceSessions: classroom.attendance?.sessions?.length || 0
                }
            }));

            //console.log(`✅ Found ${classrooms.length} classrooms for ${teacherEmail}`);

            res.json({
                success: true,
                count: classrooms.length,
                classrooms: enhancedClassrooms
            });

        } catch (error) {
            console.error('❌ Error getting teacher classrooms:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get teacher classrooms',
                error: error.message
            });
        }
    },

    // Get single classroom by ID
    getClassroomById: async (req, res) => {
        try {
            const classroomId = req.params.id;
            //console.log('🔍 Getting classroom:', classroomId);

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

            const enhancedClassroom = {
                ...classroom,
                computedStats: {
                    totalStudents: classroom.students?.length || 0,
                    activeTasks: classroom.tasks?.assignments?.filter(task => !task.isCompleted)?.length || 0,
                    completedTasks: classroom.tasks?.assignments?.filter(task => task.isCompleted)?.length || 0,
                    totalMaterials: (classroom.materials?.files?.length || 0) +
                        (classroom.materials?.links?.length || 0) +
                        (classroom.materials?.videos?.length || 0),
                    attendanceSessions: classroom.attendance?.sessions?.length || 0,
                    averageAttendance: calculateAverageAttendance(classroom.attendance?.sessions || [])
                }
            };

            //console.log('✅ Classroom found:', classroom.name);

            res.json({
                success: true,
                classroom: enhancedClassroom
            });

        } catch (error) {
            console.error('❌ Error getting classroom:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get classroom',
                error: error.message
            });
        }
    },

    // Join classroom with code
    joinClassroom: async (req, res) => {
        try {
            const { classCode, studentEmail, studentName } = req.body;

            //console.log('🔗 Student joining classroom:', { classCode, studentEmail });

            if (!classCode || !studentEmail || !studentName) {
                return res.status(400).json({
                    success: false,
                    message: 'Class code, student email, and name are required'
                });
            }

            const db = getDB();
            const classroomsCollection = db.collection('classrooms');

            const classroom = await classroomsCollection.findOne({
                code: classCode.toUpperCase(),
                isActive: true
            });

            if (!classroom) {
                return res.status(404).json({
                    success: false,
                    message: 'Invalid class code or classroom not found'
                });
            }

            const isEnrolled = classroom.students?.some(student => student.email === studentEmail);
            if (isEnrolled) {
                return res.status(400).json({
                    success: false,
                    message: 'You are already enrolled in this classroom'
                });
            }

            if (classroom.students?.length >= classroom.maxStudents) {
                return res.status(400).json({
                    success: false,
                    message: 'Classroom is full. Cannot join at this time.'
                });
            }

            const newStudent = {
                email: studentEmail,
                name: studentName,
                joinedAt: new Date(),
                status: 'active',
                role: 'student'
            };

            const result = await classroomsCollection.updateOne(
                { _id: classroom._id },
                {
                    $push: { students: newStudent },
                    $set: {
                        updatedAt: new Date(),
                        'stats.totalStudents': (classroom.students?.length || 0) + 1
                    }
                }
            );

            if (result.modifiedCount === 0) {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to join classroom'
                });
            }

            //console.log('✅ Student successfully joined classroom');

            res.json({
                success: true,
                message: 'Successfully joined classroom',
                classroom: {
                    id: classroom._id,
                    name: classroom.name,
                    subject: classroom.subject,
                    teacherName: classroom.teacherName,
                    code: classroom.code
                }
            });

        } catch (error) {
            console.error('❌ Error joining classroom:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to join classroom',
                error: error.message
            });
        }
    },

    // Get student's enrolled classrooms
    getStudentClassrooms: async (req, res) => {
        try {
            const studentEmail = req.params.studentEmail;
            //console.log('👨‍🎓 Getting classrooms for student:', studentEmail);

            const db = getDB();
            const classroomsCollection = db.collection('classrooms');

            const classrooms = await classroomsCollection.find({
                'students.email': studentEmail,
                isActive: true
            }).sort({ 'students.joinedAt': -1 }).toArray();

            //console.log(`✅ Found ${classrooms.length} classrooms for student ${studentEmail}`);

            res.json({
                success: true,
                count: classrooms.length,
                classrooms: classrooms
            });

        } catch (error) {
            console.error('❌ Error getting student classrooms:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get student classrooms',
                error: error.message
            });
        }
    },

    // Leave classroom
    leaveClassroom: async (req, res) => {
        try {
            const classroomId = req.params.id;
            const { studentEmail } = req.body;

            //console.log('👋 Student leaving classroom:', { classroomId, studentEmail });

            const validation = validateClassroomId(classroomId);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: validation.message
                });
            }

            const db = getDB();
            const result = await db.collection('classrooms').updateOne(
                { _id: new ObjectId(classroomId) },
                {
                    $pull: { students: { email: studentEmail } },
                    $set: { updatedAt: new Date() }
                }
            );

            if (result.modifiedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Classroom not found or student not enrolled'
                });
            }

            //console.log('✅ Student successfully left classroom');

            res.json({
                success: true,
                message: 'Successfully left classroom'
            });

        } catch (error) {
            console.error('❌ Error leaving classroom:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to leave classroom',
                error: error.message
            });
        }
    },

    // Update classroom
    updateClassroom: async (req, res) => {
        try {
            const classroomId = req.params.id;
            const updateData = req.body;

            //console.log('📝 Updating classroom:', classroomId);

            const validation = validateClassroomId(classroomId);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: validation.message
                });
            }

            const db = getDB();
            const cleanUpdateData = Object.entries(updateData).reduce((acc, [key, value]) => {
                if (value !== undefined && value !== null) {
                    acc[key] = value;
                }
                return acc;
            }, {});

            const result = await db.collection('classrooms').updateOne(
                { _id: new ObjectId(classroomId) },
                {
                    $set: {
                        ...cleanUpdateData,
                        updatedAt: new Date()
                    }
                }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Classroom not found'
                });
            }

            //console.log('✅ Classroom updated successfully');

            res.json({
                success: true,
                message: 'Classroom updated successfully'
            });

        } catch (error) {
            console.error('❌ Error updating classroom:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update classroom',
                error: error.message
            });
        }
    },

    // Delete classroom (soft delete)
    deleteClassroom: async (req, res) => {
        try {
            const classroomId = req.params.id;
            //console.log('🗑️ Deleting classroom:', classroomId);

            const validation = validateClassroomId(classroomId);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: validation.message
                });
            }

            const db = getDB();
            const result = await db.collection('classrooms').updateOne(
                { _id: new ObjectId(classroomId) },
                {
                    $set: {
                        isActive: false,
                        deletedAt: new Date(),
                        updatedAt: new Date()
                    }
                }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Classroom not found'
                });
            }

            //console.log('✅ Classroom deleted successfully');

            res.json({
                success: true,
                message: 'Classroom deleted successfully'
            });

        } catch (error) {
            console.error('❌ Error deleting classroom:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete classroom',
                error: error.message
            });
        }
    },

    // Get classroom statistics
    getClassroomStats: async (req, res) => {
        try {
            const classroomId = req.params.id;
            //console.log('📊 Getting classroom stats:', classroomId);

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

            const stats = {
                students: {
                    total: classroom.students?.length || 0,
                    active: classroom.students?.filter(s => s.status === 'active')?.length || 0
                },
                tasks: {
                    total: classroom.tasks?.assignments?.length || 0,
                    active: classroom.tasks?.assignments?.filter(task => !task.isCompleted)?.length || 0,
                    completed: classroom.tasks?.assignments?.filter(task => task.isCompleted)?.length || 0
                },
                materials: {
                    files: classroom.materials?.files?.length || 0,
                    links: classroom.materials?.links?.length || 0,
                    videos: classroom.materials?.videos?.length || 0,
                    total: (classroom.materials?.files?.length || 0) +
                        (classroom.materials?.links?.length || 0) +
                        (classroom.materials?.videos?.length || 0)
                },
                attendance: {
                    sessions: classroom.attendance?.sessions?.length || 0,
                    averageAttendance: calculateAverageAttendance(classroom.attendance?.sessions || [])
                }
            };

            res.json({
                success: true,
                stats: stats
            });

        } catch (error) {
            console.error('❌ Error getting classroom stats:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get classroom statistics',
                error: error.message
            });
        }
    }
};

module.exports = basicOperations;
