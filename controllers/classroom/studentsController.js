const { getDB } = require('../../database');
const { ObjectId } = require('mongodb');
const { validateClassroomId, findClassroom } = require('../helpers/classroomHelpers');

const studentsController = {
    getClassroomStudents: async (req, res) => {
        try {
            const classroomId = req.params.id;
            //console.log('👥 Getting students for classroom:', classroomId);

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

            // Enhanced student data with computed fields
            const enhancedStudents = (classroom?.students || []).map(student => ({
                ...student,
                daysSinceJoined: Math.floor((new Date() - new Date(student.joinedAt)) / (1000 * 60 * 60 * 24)),
                tasksSubmitted: 0, // This would need to be calculated from task submissions
                attendanceRate: 0  // This would need to be calculated from attendance records
            }));

            res.json({
                success: true,
                students: enhancedStudents,
                count: enhancedStudents.length,
                maxStudents: classroom.maxStudents,
                availableSlots: classroom.maxStudents - enhancedStudents.length
            });

        } catch (error) {
            console.error('❌ Error getting classroom students:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get students',
                error: error.message
            });
        }
    },

    removeStudent: async (req, res) => {
        try {
            const classroomId = req.params.id;
            const { studentEmail, reason } = req.body;

            //console.log('➖ Removing student from classroom:', { classroomId, studentEmail });

            if (!studentEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'Student email is required'
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

            // First check if student exists in the classroom
            const classroom = await findClassroom(db, classroomId);
            if (!classroom) {
                return res.status(404).json({
                    success: false,
                    message: 'Classroom not found'
                });
            }

            const studentExists = classroom.students?.some(s => s.email === studentEmail);
            if (!studentExists) {
                return res.status(404).json({
                    success: false,
                    message: 'Student not found in this classroom'
                });
            }

            const result = await db.collection('classrooms').updateOne(
                { _id: new ObjectId(classroomId) },
                {
                    $pull: { students: { email: studentEmail } },
                    $push: {
                        'removedStudents': {
                            email: studentEmail,
                            removedAt: new Date(),
                            reason: reason || 'No reason provided'
                        }
                    },
                    $dec: { 'stats.totalStudents': 1 },
                    $set: { updatedAt: new Date() }
                }
            );

            if (result.modifiedCount === 0) {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to remove student'
                });
            }

            //console.log('✅ Student removed successfully');

            res.json({
                success: true,
                message: 'Student removed successfully'
            });

        } catch (error) {
            console.error('❌ Error removing student:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to remove student',
                error: error.message
            });
        }
    },

    addStudent: async (req, res) => {
        try {
            const classroomId = req.params.id;
            const { studentEmail, studentName } = req.body;

            //console.log('➕ Adding student to classroom:', { classroomId, studentEmail });

            if (!studentEmail || !studentName) {
                return res.status(400).json({
                    success: false,
                    message: 'Student email and name are required'
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
            const classroom = await findClassroom(db, classroomId);

            if (!classroom) {
                return res.status(404).json({
                    success: false,
                    message: 'Classroom not found'
                });
            }

            // Check if student already exists
            const studentExists = classroom.students?.some(s => s.email === studentEmail);
            if (studentExists) {
                return res.status(400).json({
                    success: false,
                    message: 'Student is already in this classroom'
                });
            }

            // Check capacity
            if (classroom.students?.length >= classroom.maxStudents) {
                return res.status(400).json({
                    success: false,
                    message: 'Classroom is at maximum capacity'
                });
            }

            const newStudent = {
                email: studentEmail,
                name: studentName,
                joinedAt: new Date(),
                status: 'active',
                role: 'student',
                addedBy: 'teacher'
            };

            const result = await db.collection('classrooms').updateOne(
                { _id: new ObjectId(classroomId) },
                {
                    $push: { students: newStudent },
                    $inc: { 'stats.totalStudents': 1 },
                    $set: { updatedAt: new Date() }
                }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Classroom not found'
                });
            }

            //console.log('✅ Student added successfully');

            res.json({
                success: true,
                message: 'Student added successfully',
                student: newStudent
            });

        } catch (error) {
            console.error('❌ Error adding student:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to add student',
                error: error.message
            });
        }
    },

    getStudentInfo: async (req, res) => {
        try {
            const { id: classroomId, studentEmail } = req.params;
            //console.log('🔍 Getting student info:', { classroomId, studentEmail });

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

            const student = classroom.students?.find(s => s.email === studentEmail);

            if (!student) {
                return res.status(404).json({
                    success: false,
                    message: 'Student not found in this classroom'
                });
            }

            // Calculate additional student statistics
            const tasks = classroom.tasks?.assignments || [];
            const submissions = tasks.reduce((acc, task) => {
                const studentSubmission = task.submissions?.find(s => s.studentEmail === studentEmail);
                if (studentSubmission) {
                    acc.push({
                        taskId: task.id,
                        taskTitle: task.title,
                        submittedAt: studentSubmission.submittedAt,
                        grade: studentSubmission.grade,
                        status: studentSubmission.status
                    });
                }
                return acc;
            }, []);

            const attendanceSessions = classroom.attendance?.sessions || [];
            const attendanceRecords = attendanceSessions.reduce((acc, session) => {
                const studentRecord = session.attendance?.find(a => a.studentEmail === studentEmail);
                if (studentRecord) {
                    acc.push({
                        sessionId: session.id,
                        date: session.date,
                        status: studentRecord.status
                    });
                }
                return acc;
            }, []);

            const enhancedStudent = {
                ...student,
                statistics: {
                    tasksSubmitted: submissions.length,
                    totalTasks: tasks.length,
                    submissionRate: tasks.length > 0 ? Math.round((submissions.length / tasks.length) * 100) : 0,
                    attendanceSessions: attendanceRecords.length,
                    presentSessions: attendanceRecords.filter(r => r.status === 'present').length,
                    attendanceRate: attendanceRecords.length > 0 ?
                        Math.round((attendanceRecords.filter(r => r.status === 'present').length / attendanceRecords.length) * 100) : 0
                },
                recentSubmissions: submissions.slice(-5).reverse(),
                recentAttendance: attendanceRecords.slice(-10).reverse()
            };

            res.json({
                success: true,
                student: enhancedStudent
            });

        } catch (error) {
            console.error('❌ Error getting student info:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get student info',
                error: error.message
            });
        }
    },

    updateStudentStatus: async (req, res) => {
        try {
            const { id: classroomId, studentEmail } = req.params;
            const { status } = req.body;

            //console.log('📝 Updating student status:', { classroomId, studentEmail, status });

            const validStatuses = ['active', 'inactive', 'suspended'];
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
                    'students.email': studentEmail
                },
                {
                    $set: {
                        'students.$.status': status,
                        'students.$.statusUpdatedAt': new Date(),
                        updatedAt: new Date()
                    }
                }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Classroom or student not found'
                });
            }

            res.json({
                success: true,
                message: 'Student status updated successfully'
            });

        } catch (error) {
            console.error('❌ Error updating student status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update student status',
                error: error.message
            });
        }
    }
};

module.exports = studentsController;
