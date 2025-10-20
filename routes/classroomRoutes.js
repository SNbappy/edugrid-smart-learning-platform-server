const express = require('express');
const router = express.Router();
const classroomController = require('../controllers/classroomController');
const attendanceController = require('../controllers/classroom/attendanceController');

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
    console.log('📝 Request body:', req.body);
    console.log('📝 Request params:', req.params);
    next();
});

// ===== DEBUGGING ROUTES (TEMPORARY - PLACE AT TOP TO AVOID CONFLICTS) =====

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

// GET /api/classrooms/debug/permissions/:classroomId/:userEmail - Debug permissions (TEMPORARY)
router.get('/debug/permissions/:classroomId/:userEmail', async (req, res) => {
    try {
        const { classroomId, userEmail } = req.params;

        const { getDB } = require('../database');
        const { ObjectId } = require('mongodb');

        console.log('🔍 DEBUG PERMISSIONS REQUEST:', { classroomId, userEmail });

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
            isCreatedBy: classroom.createdBy === userEmail,
            isInInstructorsList: classroom.instructors && classroom.instructors.includes(userEmail),
            isInInstructorsArray: Array.isArray(classroom.instructors) && classroom.instructors.includes(userEmail)
        };

        const hasAnyPermission = Object.values(permissionChecks).some(check => check === true);

        res.json({
            success: true,
            debug: {
                userEmail,
                classroomId,
                classroomData: {
                    _id: classroom._id,
                    name: classroom.name,
                    owner: classroom.owner,
                    teacher: classroom.teacher,
                    createdBy: classroom.createdBy,
                    instructors: classroom.instructors,
                    allKeys: Object.keys(classroom),
                    students: classroom.students ? classroom.students.length : 0,
                    createdAt: classroom.createdAt
                },
                permissionChecks,
                hasAnyPermission,
                recommendation: hasAnyPermission ? 'User should have access' : 'Check if user email matches any instructor field'
            }
        });
    } catch (error) {
        console.error('❌ Debug permissions error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// ===== CLASSROOM MANAGEMENT ROUTES =====

// POST /api/classrooms - Create new classroom
router.post('/', classroomController.createClassroom);

// GET /api/classrooms - Get all active classrooms (for All Classes page)
router.get('/', classroomController.getAllClassrooms);

// POST /api/classrooms/join - Join classroom with class code
router.post('/join', classroomController.joinClassroom);

// ===== TEACHER SPECIFIC ROUTES =====

// GET /api/classrooms/teacher/:teacherEmail - Get classrooms created by teacher
router.get('/teacher/:teacherEmail', classroomController.getMyClassrooms);

// ===== STUDENT SPECIFIC ROUTES =====

// GET /api/classrooms/student/:studentEmail - Get classrooms student is enrolled in
router.get('/student/:studentEmail', classroomController.getStudentClassrooms);

// POST /api/classrooms/:id/leave - Leave a classroom
router.post('/:id/leave', classroomController.leaveClassroom);

// ===== INDIVIDUAL CLASSROOM ROUTES =====

// GET /api/classrooms/:id - Get single classroom details
router.get('/:id', classroomController.getClassroomById);

// PUT /api/classrooms/:id - Update classroom information
router.put('/:id', classroomController.updateClassroom);

// DELETE /api/classrooms/:id - Delete (soft delete) classroom
router.delete('/:id', classroomController.deleteClassroom);

// GET /api/classrooms/:id/stats - Get classroom statistics and analytics
router.get('/:id/stats', classroomController.getClassroomStats);

// ===== MATERIALS ROUTES =====

// GET /api/classrooms/:id/materials - Get class materials
router.get('/:id/materials', classroomController.getMaterials);

// POST /api/classrooms/:id/materials - Add new material
router.post('/:id/materials', classroomController.addMaterial);

// DELETE /api/classrooms/:id/materials/:materialId - Delete material
router.delete('/:id/materials/:materialId', classroomController.deleteMaterial);

// PUT /api/classrooms/:id/materials/:materialId - Update material
router.put('/:id/materials/:materialId', classroomController.updateMaterial);

// ===== ATTENDANCE ROUTES =====
// FIXED: Updated routes to match frontend calls and use attendanceController

// GET /api/classrooms/:id/attendance - Get attendance data
router.get('/:id/attendance', attendanceController.getAttendance);

// POST /api/classrooms/:id/attendance/sessions - Create attendance session
router.post('/:id/attendance/sessions', attendanceController.createAttendanceSession);

// GET /api/classrooms/:id/attendance/sessions/:sessionId - Get specific session
router.get('/:id/attendance/sessions/:sessionId', attendanceController.getAttendanceSession);

// PUT /api/classrooms/:id/attendance/sessions/:sessionId - Update attendance session
router.put('/:id/attendance/sessions/:sessionId', attendanceController.updateAttendanceSession);

// POST /api/classrooms/:id/attendance/sessions/:sessionId/mark - Mark attendance
router.post('/:id/attendance/sessions/:sessionId/mark', attendanceController.markAttendance);

// DELETE /api/classrooms/:id/attendance/sessions/:sessionId - Delete session
router.delete('/:id/attendance/sessions/:sessionId', attendanceController.deleteAttendanceSession);

// ===== TASKS/ASSIGNMENTS ROUTES =====

// GET /api/classrooms/:id/tasks - Get classroom tasks/assignments
router.get('/:id/tasks', classroomController.getTasks);

// POST /api/classrooms/:id/tasks - Create new task/assignment
router.post('/:id/tasks', classroomController.createTask);

// GET /api/classrooms/:id/tasks/:taskId - Get specific task
router.get('/:id/tasks/:taskId', classroomController.getTaskById);

// PUT /api/classrooms/:id/tasks/:taskId - Update task
router.put('/:id/tasks/:taskId', classroomController.updateTask);

// DELETE /api/classrooms/:id/tasks/:taskId - Delete task
router.delete('/:id/tasks/:taskId', classroomController.deleteTask);

// ===== SUBMISSION ROUTES (UPDATED) =====

// POST /api/classrooms/:id/tasks/:taskId/submit - Submit task solution (legacy)
router.post('/:id/tasks/:taskId/submit', classroomController.submitTask);

// **NEW SUBMISSION ROUTES:**

// GET /api/classrooms/:classroomId/tasks/:taskId/submissions - Get task submissions
router.get('/:classroomId/tasks/:taskId/submissions', getTaskSubmissions);

// POST /api/classrooms/:classroomId/tasks/:taskId/submissions - Create submission (alternative endpoint)
router.post('/:classroomId/tasks/:taskId/submissions', submitTask);

// PUT /api/classrooms/:classroomId/tasks/:taskId/submissions/:submissionId - Resubmit task
router.put('/:classroomId/tasks/:taskId/submissions/:submissionId', resubmitTask);

// GET /api/classrooms/:classroomId/tasks/:taskId/submissions/:submissionId - Get specific submission
router.get('/:classroomId/tasks/:taskId/submissions/:submissionId', getSubmissionById);

// **GRADING ROUTE:**
// PUT /api/classrooms/:classroomId/tasks/:taskId/submissions/:submissionId/grade - Grade submission
router.put('/:classroomId/tasks/:taskId/submissions/:submissionId/grade', gradeSubmission);

// ===== MARKS/GRADEBOOK ROUTES =====

// GET /api/classrooms/:id/marks - Get gradebook/marks
router.get('/:id/marks', classroomController.getMarks);

// POST /api/classrooms/:id/marks - Add/update marks
router.post('/:id/marks', classroomController.addMarks);

// PUT /api/classrooms/:id/marks/:markId - Update specific mark
router.put('/:id/marks/:markId', classroomController.updateMark);

// DELETE /api/classrooms/:id/marks/:markId - Delete mark
router.delete('/:id/marks/:markId', classroomController.deleteMark);

// GET /api/classrooms/:id/marks/student/:studentEmail - Get marks for specific student
router.get('/:id/marks/student/:studentEmail', classroomController.getStudentMarks);

// ===== STUDENT MANAGEMENT ROUTES =====

// GET /api/classrooms/:id/students - Get all students in classroom
router.get('/:id/students', classroomController.getClassroomStudents);

// POST /api/classrooms/:id/students/remove - Remove student from classroom
router.post('/:id/students/remove', classroomController.removeStudent);

// POST /api/classrooms/:id/students/add - Add student to classroom (alternative to join)
router.post('/:id/students/add', classroomController.addStudent);

// GET /api/classrooms/:id/students/:studentEmail - Get specific student info in classroom
router.get('/:id/students/:studentEmail', classroomController.getStudentInfo);

// ===== ANALYTICS AND REPORTING ROUTES =====

// GET /api/classrooms/:id/analytics - Get detailed analytics
router.get('/:id/analytics', classroomController.getClassroomAnalytics);

// GET /api/classrooms/:id/reports/attendance - Get attendance report
router.get('/:id/reports/attendance', classroomController.getAttendanceReport);

// GET /api/classrooms/:id/reports/performance - Get performance report
router.get('/:id/reports/performance', classroomController.getPerformanceReport);

// GET /api/classrooms/:id/reports/materials - Get materials usage report
router.get('/:id/reports/materials', classroomController.getMaterialsReport);

// ===== COMMUNICATION ROUTES =====

// GET /api/classrooms/:id/announcements - Get classroom announcements
router.get('/:id/announcements', classroomController.getAnnouncements);

// POST /api/classrooms/:id/announcements - Create new announcement
router.post('/:id/announcements', classroomController.createAnnouncement);

// PUT /api/classrooms/:id/announcements/:announcementId - Update announcement
router.put('/:id/announcements/:announcementId', classroomController.updateAnnouncement);

// DELETE /api/classrooms/:id/announcements/:announcementId - Delete announcement
router.delete('/:id/announcements/:announcementId', classroomController.deleteAnnouncement);

// ===== UTILITY ROUTES =====

// POST /api/classrooms/:id/duplicate - Duplicate classroom
router.post('/:id/duplicate', classroomController.duplicateClassroom);

// POST /api/classrooms/:id/archive - Archive classroom
router.post('/:id/archive', classroomController.archiveClassroom);

// POST /api/classrooms/:id/restore - Restore archived classroom
router.post('/:id/restore', classroomController.restoreClassroom);

// GET /api/classrooms/:id/export - Export classroom data
router.get('/:id/export', classroomController.exportClassroomData);

// POST /api/classrooms/:id/import - Import classroom data
router.post('/:id/import', classroomController.importClassroomData);

// ===== SETTINGS ROUTES =====

// GET /api/classrooms/:id/settings - Get classroom settings
router.get('/:id/settings', classroomController.getClassroomSettings);

// PUT /api/classrooms/:id/settings - Update classroom settings
router.put('/:id/settings', classroomController.updateClassroomSettings);

// ===== PERMISSION ROUTES =====

// GET /api/classrooms/:id/permissions - Get user permissions for classroom
router.get('/:id/permissions', classroomController.getClassroomPermissions);

// POST /api/classrooms/:id/permissions - Update user permissions
router.post('/:id/permissions', classroomController.updateClassroomPermissions);

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