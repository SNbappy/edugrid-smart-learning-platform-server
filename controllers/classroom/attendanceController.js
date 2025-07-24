const { getDB } = require('../../database');
const { ObjectId } = require('mongodb');
const { validateClassroomId, findClassroom } = require('../helpers/classroomHelpers');

const attendanceController = {
    getAttendance: async (req, res) => {
        try {
            const classroomId = req.params.id;
            console.log('📋 Getting attendance for classroom:', classroomId);

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
                attendance: classroom?.attendance || { sessions: [], totalSessions: 0 }
            });

        } catch (error) {
            console.error('❌ Error getting attendance:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get attendance',
                error: error.message
            });
        }
    },

    createAttendanceSession: async (req, res) => {
        try {
            const classroomId = req.params.id;
            const { date, title, description } = req.body;

            console.log('📅 Creating attendance session for classroom:', classroomId);

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

            const session = {
                id: new ObjectId(),
                date: date ? new Date(date) : new Date(),
                title: title || `Attendance ${new Date().toLocaleDateString()}`,
                description: description || '',
                createdAt: new Date(),
                status: 'active',
                attendance: classroom.students.map(student => ({
                    studentEmail: student.email,
                    studentName: student.name,
                    status: 'unmarked', // unmarked, present, absent, late
                    markedAt: null,
                    markedBy: null
                }))
            };

            const result = await db.collection('classrooms').updateOne(
                { _id: new ObjectId(classroomId) },
                {
                    $push: { 'attendance.sessions': session },
                    $inc: { 'attendance.totalSessions': 1 },
                    $set: { updatedAt: new Date() }
                }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Classroom not found'
                });
            }

            console.log('✅ Attendance session created successfully');

            res.json({
                success: true,
                message: 'Attendance session created successfully',
                session
            });

        } catch (error) {
            console.error('❌ Error creating attendance session:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create attendance session',
                error: error.message
            });
        }
    },

    updateAttendanceSession: async (req, res) => {
        try {
            const { id: classroomId, sessionId } = req.params;
            const { title, description, status } = req.body;

            console.log('📝 Updating attendance session:', { classroomId, sessionId });

            const validation = validateClassroomId(classroomId);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: validation.message
                });
            }

            const db = getDB();
            const updateFields = {};

            if (title) updateFields['attendance.sessions.$.title'] = title;
            if (description) updateFields['attendance.sessions.$.description'] = description;
            if (status) updateFields['attendance.sessions.$.status'] = status;

            updateFields['attendance.sessions.$.updatedAt'] = new Date();
            updateFields.updatedAt = new Date();

            const result = await db.collection('classrooms').updateOne(
                {
                    _id: new ObjectId(classroomId),
                    'attendance.sessions.id': new ObjectId(sessionId)
                },
                { $set: updateFields }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Classroom or attendance session not found'
                });
            }

            res.json({
                success: true,
                message: 'Attendance session updated successfully'
            });

        } catch (error) {
            console.error('❌ Error updating attendance session:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update attendance session',
                error: error.message
            });
        }
    },

    markAttendance: async (req, res) => {
        try {
            const { id: classroomId, sessionId } = req.params;
            const { studentEmail, status, markedBy } = req.body;

            console.log('✅ Marking attendance:', { classroomId, sessionId, studentEmail, status });

            if (!studentEmail || !status) {
                return res.status(400).json({
                    success: false,
                    message: 'Student email and status are required'
                });
            }

            const validStatuses = ['present', 'absent', 'late'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
                });
            }

            const validation = validateClassroomId(classroomId);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: validation.message
                });
            }

            const db = getDB();
            const result = await db.collection('classrooms').updateOne(
                {
                    _id: new ObjectId(classroomId),
                    'attendance.sessions.id': new ObjectId(sessionId),
                    'attendance.sessions.attendance.studentEmail': studentEmail
                },
                {
                    $set: {
                        'attendance.sessions.$.attendance.$[elem].status': status,
                        'attendance.sessions.$.attendance.$[elem].markedAt': new Date(),
                        'attendance.sessions.$.attendance.$[elem].markedBy': markedBy || 'teacher',
                        updatedAt: new Date()
                    }
                },
                {
                    arrayFilters: [{ 'elem.studentEmail': studentEmail }]
                }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Classroom, session, or student not found'
                });
            }

            res.json({
                success: true,
                message: 'Attendance marked successfully'
            });

        } catch (error) {
            console.error('❌ Error marking attendance:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to mark attendance',
                error: error.message
            });
        }
    },

    getAttendanceSession: async (req, res) => {
        try {
            const { id: classroomId, sessionId } = req.params;
            console.log('🔍 Getting attendance session:', { classroomId, sessionId });

            const validation = validateClassroomId(classroomId);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: validation.message
                });
            }

            const db = getDB();
            const classroom = await db.collection('classrooms').findOne({
                _id: new ObjectId(classroomId),
                'attendance.sessions.id': new ObjectId(sessionId)
            });

            if (!classroom) {
                return res.status(404).json({
                    success: false,
                    message: 'Classroom or attendance session not found'
                });
            }

            const session = classroom.attendance.sessions.find(s =>
                s.id.toString() === sessionId
            );

            res.json({
                success: true,
                session: session
            });

        } catch (error) {
            console.error('❌ Error getting attendance session:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get attendance session',
                error: error.message
            });
        }
    },

    deleteAttendanceSession: async (req, res) => {
        try {
            const { id: classroomId, sessionId } = req.params;
            console.log('🗑️ Deleting attendance session:', { classroomId, sessionId });

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
                    $pull: { 'attendance.sessions': { id: new ObjectId(sessionId) } },
                    $inc: { 'attendance.totalSessions': -1 },
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
                message: 'Attendance session deleted successfully'
            });

        } catch (error) {
            console.error('❌ Error deleting attendance session:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete attendance session',
                error: error.message
            });
        }
    }
};

module.exports = attendanceController;
