const express = require('express');
const router = express.Router();
const classroomController = require('../controllers/classroomController');
const attendanceController = require('../controllers/classroom/attendanceController');
const { verifyToken, verifyTeacher, verifyEnrolled } = require('../middleware/authMiddleware');

// Import submission operations controller
const {
    submitTask,
    resubmitTask,
    getTaskSubmissions,
    getSubmissionById,
    gradeSubmission
} = require('../controllers/classroom/submissionOperations');

// Add logging middleware for debugging
router.use((req, res, next) => {
    console.log('🚀 Classroom route accessed:', req.method, req.originalUrl);
    console.log('📝 User:', req.user?.email || 'Not authenticated');
    next();
});

// ===== PUBLIC ROUTES (No authentication required) =====

// GET /api/classrooms - Get all active classrooms (for browsing/All Classes page)
router.get('/', classroomController.getAllClassrooms);

// GET /api/classrooms/debug/routes - List all registered routes (for debugging)
router.get('/debug/routes', (req, res) => {
    const routes = [];

    router.stack.forEach((middleware) => {
        if (middleware.route) {
            const path = middleware.route.path;
            const method = Object.keys(middleware.route.methods)[0].toUpperCase();
            routes.push(`${method} /api/classrooms${path}`);
        }
    });

    res.json({
        success: true,
        message: 'All registered classroom routes',
        routes: routes.sort(),
        totalRoutes: routes.length
    });
});

// ===== APPLY AUTHENTICATION TO ALL ROUTES BELOW =====
router.use(verifyToken);

// ===== DEBUGGING ROUTES (AUTHENTICATED) =====

// GET /api/classrooms/debug/permissions/:classroomId/:userEmail - Debug permissions
router.get('/debug/permissions/:classroomId/:userEmail', async (req, res) => {
    try {
        const { classroomId, userEmail } = req.params;

        const { getDB } = require('../database');
        const { ObjectId } = require('mongodb');

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

        const permissionChecks = {
            isOwner: classroom.owner === userEmail,
            isTeacher: classroom.teacher === userEmail,
            isTeacherEmail: classroom.teacherEmail === userEmail,
            isCreatedBy: classroom.createdBy === userEmail,
            isInInstructorsList: classroom.instructors && classroom.instructors.includes(userEmail),
            isStudent: classroom.students?.some(s => s.email === userEmail)
        };

        const hasAnyPermission = Object.values(permissionChecks).some(check => check === true);

        res.json({
            success: true,
            debug: {
                authenticatedUser: req.user.email,
                requestedUserEmail: userEmail,
                classroomId,
                classroomData: {
                    _id: classroom._id,
                    name: classroom.name,
                    teacherEmail: classroom.teacherEmail,
                    allKeys: Object.keys(classroom),
                    studentsCount: classroom.students ? classroom.students.length : 0,
                    createdAt: classroom.createdAt
                },
                permissionChecks,
                hasAnyPermission,
                recommendation: hasAnyPermission ? 'User should have access' : 'User does not have permissions'
            }
        });
    } catch (error) {
        console.error('❌ Debug permissions error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ===== CLASSROOM MANAGEMENT ROUTES =====

// POST /api/classrooms - Create new classroom
router.post('/', classroomController.createClassroom);

// POST /api/classrooms/join - Join classroom with class code
router.post('/join', classroomController.joinClassroom);

// ===== TEACHER SPECIFIC ROUTES =====

// GET /api/classrooms/teacher/:teacherEmail - Get classrooms created by teacher
router.get('/teacher/:teacherEmail', classroomController.getMyClassrooms);

// ===== STUDENT SPECIFIC ROUTES =====

// GET /api/classrooms/student/:studentEmail - Get classrooms student is enrolled in
router.get('/student/:studentEmail', classroomController.getStudentClassrooms);

// POST /api/classrooms/:id/leave - Leave a classroom (enrolled users only)
router.post('/:id/leave', verifyEnrolled, classroomController.leaveClassroom);

// ===== INDIVIDUAL CLASSROOM ROUTES =====

// GET /api/classrooms/:id - Get single classroom details (enrolled users only)
router.get('/:id', verifyEnrolled, classroomController.getClassroomById);

// PUT /api/classrooms/:id - Update classroom information (teacher only)
router.put('/:id', verifyTeacher, classroomController.updateClassroom);

// DELETE /api/classrooms/:id - Delete (soft delete) classroom (teacher only)
router.delete('/:id', verifyTeacher, classroomController.deleteClassroom);

// GET /api/classrooms/:id/stats - Get classroom statistics (enrolled users only)
router.get('/:id/stats', verifyEnrolled, classroomController.getClassroomStats);

// ===== MATERIALS ROUTES =====

// GET /api/classrooms/:id/materials - Get class materials (enrolled users only)
router.get('/:id/materials', verifyEnrolled, classroomController.getMaterials);

// POST /api/classrooms/:id/materials - Add new material (teacher only)
router.post('/:id/materials', verifyTeacher, classroomController.addMaterial);

// DELETE /api/classrooms/:id/materials/:materialId - Delete material (teacher only)
router.delete('/:id/materials/:materialId', verifyTeacher, classroomController.deleteMaterial);

// PUT /api/classrooms/:id/materials/:materialId - Update material (teacher only)
router.put('/:id/materials/:materialId', verifyTeacher, classroomController.updateMaterial);

// ===== ATTENDANCE ROUTES =====

// GET /api/classrooms/:id/attendance - Get attendance data (enrolled users only)
router.get('/:id/attendance', verifyEnrolled, attendanceController.getAttendance);

// POST /api/classrooms/:id/attendance/sessions - Create attendance session (teacher only)
router.post('/:id/attendance/sessions', verifyTeacher, attendanceController.createAttendanceSession);

// GET /api/classrooms/:id/attendance/sessions/:sessionId - Get specific session (enrolled users only)
router.get('/:id/attendance/sessions/:sessionId', verifyEnrolled, attendanceController.getAttendanceSession);

// PUT /api/classrooms/:id/attendance/sessions/:sessionId - Update attendance session (teacher only)
router.put('/:id/attendance/sessions/:sessionId', verifyTeacher, attendanceController.updateAttendanceSession);

// POST /api/classrooms/:id/attendance/sessions/:sessionId/mark - Mark attendance (teacher only)
router.post('/:id/attendance/sessions/:sessionId/mark', verifyTeacher, attendanceController.markAttendance);

// DELETE /api/classrooms/:id/attendance/sessions/:sessionId - Delete session (teacher only)
router.delete('/:id/attendance/sessions/:sessionId', verifyTeacher, attendanceController.deleteAttendanceSession);

// ===== TASKS/ASSIGNMENTS ROUTES =====

// GET /api/classrooms/:id/tasks - Get classroom tasks/assignments (enrolled users only)
router.get('/:id/tasks', verifyEnrolled, classroomController.getTasks);

// POST /api/classrooms/:id/tasks - Create new task/assignment (teacher only)
router.post('/:id/tasks', verifyTeacher, classroomController.createTask);

// GET /api/classrooms/:id/tasks/:taskId - Get specific task (enrolled users only)
router.get('/:id/tasks/:taskId', verifyEnrolled, classroomController.getTaskById);

// PUT /api/classrooms/:id/tasks/:taskId - Update task (teacher only)
router.put('/:id/tasks/:taskId', verifyTeacher, classroomController.updateTask);

// DELETE /api/classrooms/:id/tasks/:taskId - Delete task (teacher only)
router.delete('/:id/tasks/:taskId', verifyTeacher, classroomController.deleteTask);

// ===== SUBMISSION ROUTES =====

// POST /api/classrooms/:id/tasks/:taskId/submit - Submit task solution (enrolled users only)
router.post('/:id/tasks/:taskId/submit', verifyEnrolled, classroomController.submitTask);

// GET /api/classrooms/:classroomId/tasks/:taskId/submissions - Get task submissions (enrolled users only)
router.get('/:classroomId/tasks/:taskId/submissions', verifyEnrolled, getTaskSubmissions);

// POST /api/classrooms/:classroomId/tasks/:taskId/submissions - Create submission (enrolled users only)
router.post('/:classroomId/tasks/:taskId/submissions', verifyEnrolled, submitTask);

// PUT /api/classrooms/:classroomId/tasks/:taskId/submissions/:submissionId - Resubmit task (enrolled users only)
router.put('/:classroomId/tasks/:taskId/submissions/:submissionId', verifyEnrolled, resubmitTask);

// GET /api/classrooms/:classroomId/tasks/:taskId/submissions/:submissionId - Get specific submission (enrolled users only)
router.get('/:classroomId/tasks/:taskId/submissions/:submissionId', verifyEnrolled, getSubmissionById);

// PUT /api/classrooms/:classroomId/tasks/:taskId/submissions/:submissionId/grade - Grade submission (teacher only)
router.put('/:classroomId/tasks/:taskId/submissions/:submissionId/grade', verifyTeacher, gradeSubmission);

// ===== MARKS/GRADEBOOK ROUTES =====

// GET /api/classrooms/:id/marks - Get gradebook/marks (enrolled users only)
router.get('/:id/marks', verifyEnrolled, classroomController.getMarks);

// POST /api/classrooms/:id/marks - Add/update marks (teacher only)
router.post('/:id/marks', verifyTeacher, classroomController.addMarks);

// PUT /api/classrooms/:id/marks/:markId - Update specific mark (teacher only)
router.put('/:id/marks/:markId', verifyTeacher, classroomController.updateMark);

// DELETE /api/classrooms/:id/marks/:markId - Delete mark (teacher only)
router.delete('/:id/marks/:markId', verifyTeacher, classroomController.deleteMark);

// GET /api/classrooms/:id/marks/student/:studentEmail - Get marks for specific student (enrolled users only)
router.get('/:id/marks/student/:studentEmail', verifyEnrolled, classroomController.getStudentMarks);

// ===== STUDENT MANAGEMENT ROUTES =====

// GET /api/classrooms/:id/students - Get all students in classroom (enrolled users only)
router.get('/:id/students', verifyEnrolled, classroomController.getClassroomStudents);

// POST /api/classrooms/:id/students/remove - Remove student from classroom (teacher only)
router.post('/:id/students/remove', verifyTeacher, classroomController.removeStudent);

// POST /api/classrooms/:id/students/add - Add student to classroom (teacher only)
router.post('/:id/students/add', verifyTeacher, classroomController.addStudent);

// GET /api/classrooms/:id/students/:studentEmail - Get specific student info (enrolled users only)
router.get('/:id/students/:studentEmail', verifyEnrolled, classroomController.getStudentInfo);

// ===== ANALYTICS AND REPORTING ROUTES =====

// GET /api/classrooms/:id/analytics - Get detailed analytics (enrolled users only)
router.get('/:id/analytics', verifyEnrolled, classroomController.getClassroomAnalytics);

// GET /api/classrooms/:id/reports/attendance - Get attendance report (enrolled users only)
router.get('/:id/reports/attendance', verifyEnrolled, classroomController.getAttendanceReport);

// GET /api/classrooms/:id/reports/performance - Get performance report (enrolled users only)
router.get('/:id/reports/performance', verifyEnrolled, classroomController.getPerformanceReport);

// GET /api/classrooms/:id/reports/materials - Get materials usage report (enrolled users only)
router.get('/:id/reports/materials', verifyEnrolled, classroomController.getMaterialsReport);

// ===== COMMUNICATION ROUTES =====

// GET /api/classrooms/:id/announcements - Get classroom announcements (enrolled users only)
router.get('/:id/announcements', verifyEnrolled, classroomController.getAnnouncements);

// POST /api/classrooms/:id/announcements - Create new announcement (teacher only)
router.post('/:id/announcements', verifyTeacher, classroomController.createAnnouncement);

// PUT /api/classrooms/:id/announcements/:announcementId - Update announcement (teacher only)
router.put('/:id/announcements/:announcementId', verifyTeacher, classroomController.updateAnnouncement);

// DELETE /api/classrooms/:id/announcements/:announcementId - Delete announcement (teacher only)
router.delete('/:id/announcements/:announcementId', verifyTeacher, classroomController.deleteAnnouncement);

// ===== UTILITY ROUTES =====

// POST /api/classrooms/:id/duplicate - Duplicate classroom (teacher only)
router.post('/:id/duplicate', verifyTeacher, classroomController.duplicateClassroom);

// POST /api/classrooms/:id/archive - Archive classroom (teacher only)
router.post('/:id/archive', verifyTeacher, classroomController.archiveClassroom);

// POST /api/classrooms/:id/restore - Restore archived classroom (teacher only)
router.post('/:id/restore', verifyTeacher, classroomController.restoreClassroom);

// GET /api/classrooms/:id/export - Export classroom data (teacher only)
router.get('/:id/export', verifyTeacher, classroomController.exportClassroomData);

// POST /api/classrooms/:id/import - Import classroom data (teacher only)
router.post('/:id/import', verifyTeacher, classroomController.importClassroomData);

// ===== SETTINGS ROUTES =====

// GET /api/classrooms/:id/settings - Get classroom settings (enrolled users only)
router.get('/:id/settings', verifyEnrolled, classroomController.getClassroomSettings);

// PUT /api/classrooms/:id/settings - Update classroom settings (teacher only)
router.put('/:id/settings', verifyTeacher, classroomController.updateClassroomSettings);

// ===== PERMISSION ROUTES =====

// GET /api/classrooms/:id/permissions - Get user permissions for classroom (enrolled users only)
router.get('/:id/permissions', verifyEnrolled, classroomController.getClassroomPermissions);

// POST /api/classrooms/:id/permissions - Update user permissions (teacher only)
router.post('/:id/permissions', verifyTeacher, classroomController.updateClassroomPermissions);

// Error handling middleware for this router
router.use((error, req, res, next) => {
    console.error('❌ Classroom route error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error in classroom routes',
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
});

module.exports = router;
