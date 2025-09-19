const express = require('express');
const router = express.Router();
const { getDB } = require('../../database');
const { ObjectId } = require('mongodb');

// Import controller functions
const tasksController = require('../classroom/tasksController');

// ==================== MIDDLEWARE ====================

// Request logging middleware for debugging
router.use((req, res, next) => {
    console.log(`📋 TASK ROUTE: ${req.method} ${req.path}`);
    console.log(`📋 PARAMS:`, req.params);
    console.log(`📋 HEADERS:`, {
        authorization: req.headers.authorization ? 'present' : 'missing',
        userEmail: req.headers['user-email']
    });
    next();
});

// ==================== TASK CRUD ROUTES ====================

// Get all tasks for a classroom
router.get('/classrooms/:classroomId/tasks', tasksController.getTasks);

// Create a new task
router.post('/classrooms/:classroomId/tasks', tasksController.createTask);

// Get a specific task by ID
router.get('/classrooms/:classroomId/tasks/:taskId', tasksController.getTaskById);

// Update a specific task
router.put('/classrooms/:classroomId/tasks/:taskId', tasksController.updateTask);

// Delete a specific task
router.delete('/classrooms/:classroomId/tasks/:taskId', tasksController.deleteTask);

// ==================== SUBMISSION ROUTES ====================

// Get all submissions for a task - THIS FIXES YOUR MAIN PROBLEM
router.get('/classrooms/:classroomId/tasks/:taskId/submissions', async (req, res) => {
    try {
        const { classroomId, taskId } = req.params;
        const userEmail = req.headers['user-email'] || req.user?.email;

        console.log('📋 GET SUBMISSIONS - START:', {
            classroomId,
            taskId,
            userEmail
        });

        if (!userEmail) {
            return res.status(401).json({
                success: false,
                message: 'User email is required',
                debug: { headers: req.headers }
            });
        }

        // Validate classroomId
        if (!ObjectId.isValid(classroomId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid classroom ID'
            });
        }

        // Validate taskId
        if (!ObjectId.isValid(taskId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid task ID'
            });
        }

        const db = getDB();
        const classroom = await db.collection('classrooms').findOne({
            _id: new ObjectId(classroomId)
        });

        if (!classroom) {
            console.log('❌ CLASSROOM NOT FOUND:', classroomId);
            return res.status(404).json({
                success: false,
                message: 'Classroom not found'
            });
        }

        console.log('✅ CLASSROOM FOUND:', {
            name: classroom.name,
            teacherEmail: classroom.teacherEmail,
            tasksCount: classroom.tasks?.assignments?.length || 0
        });

        // Find the specific task
        const task = classroom.tasks?.assignments?.find(t =>
            t._id?.toString() === taskId || t.id?.toString() === taskId
        );

        if (!task) {
            console.log('❌ TASK NOT FOUND:', {
                taskId,
                availableTasks: classroom.tasks?.assignments?.map(t => ({
                    id: t._id || t.id,
                    title: t.title
                })) || []
            });
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        console.log('✅ TASK FOUND:', {
            title: task.title,
            submissionsCount: task.submissions?.length || 0
        });

        const submissions = task.submissions || [];

        // Determine user role
        const isTeacher = classroom.teacherEmail === userEmail ||
            classroom.createdBy === userEmail ||
            (classroom.teachers && classroom.teachers.includes(userEmail));

        console.log('👤 USER ROLE CHECK:', {
            userEmail,
            isTeacher,
            classroomTeacher: classroom.teacherEmail,
            classroomCreator: classroom.createdBy
        });

        // Filter submissions based on user role
        let filteredSubmissions = submissions;
        if (!isTeacher) {
            // Students can only see their own submissions
            filteredSubmissions = submissions.filter(sub => sub.studentEmail === userEmail);
            console.log('👤 STUDENT FILTER APPLIED:', {
                originalCount: submissions.length,
                filteredCount: filteredSubmissions.length
            });
        } else {
            console.log('👨‍🏫 TEACHER ACCESS - ALL SUBMISSIONS');
        }

        console.log('✅ RETURNING SUBMISSIONS:', {
            total: filteredSubmissions.length,
            userRole: isTeacher ? 'teacher' : 'student'
        });

        res.json({
            success: true,
            submissions: filteredSubmissions,
            count: filteredSubmissions.length,
            taskTitle: task.title,
            userRole: isTeacher ? 'teacher' : 'student',
            debug: {
                classroomId,
                taskId,
                userEmail,
                isTeacher,
                totalSubmissions: submissions.length,
                filteredSubmissions: filteredSubmissions.length
            }
        });

    } catch (error) {
        console.error('❌ GET SUBMISSIONS ERROR:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get submissions',
            error: error.message,
            debug: {
                params: req.params,
                userEmail: req.headers['user-email']
            }
        });
    }
});

// Submit a task
router.post('/classrooms/:classroomId/tasks/:taskId/submit', tasksController.submitTask);

// Resubmit a task
router.put('/classrooms/:classroomId/tasks/:taskId/submit', tasksController.resubmitTask);

// Get a specific submission by ID
router.get('/classrooms/:classroomId/tasks/:taskId/submissions/:submissionId', tasksController.getSubmissionById);

// Grade a submission
router.put('/classrooms/:classroomId/tasks/:taskId/submissions/:submissionId/grade', tasksController.gradeSubmission);

// ==================== UTILITY ROUTES ====================

// Get current user's submission for a task
router.get('/classrooms/:classroomId/tasks/:taskId/my-submission', async (req, res) => {
    try {
        const { classroomId, taskId } = req.params;
        const userEmail = req.headers['user-email'] || req.user?.email;

        if (!userEmail) {
            return res.status(401).json({
                success: false,
                message: 'User email is required'
            });
        }

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

        const task = classroom.tasks?.assignments?.find(t =>
            t._id?.toString() === taskId || t.id?.toString() === taskId
        );

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        const userSubmission = task.submissions?.find(sub => sub.studentEmail === userEmail);

        res.json({
            success: true,
            submission: userSubmission || null,
            hasSubmission: !!userSubmission,
            taskTitle: task.title
        });

    } catch (error) {
        console.error('❌ GET MY SUBMISSION ERROR:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get submission',
            error: error.message
        });
    }
});

// Get submission status for current user
router.get('/classrooms/:classroomId/tasks/:taskId/submission-status', async (req, res) => {
    try {
        const { classroomId, taskId } = req.params;
        const userEmail = req.headers['user-email'] || req.user?.email;

        if (!userEmail) {
            return res.status(401).json({
                success: false,
                message: 'User email is required'
            });
        }

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

        const task = classroom.tasks?.assignments?.find(t =>
            t._id?.toString() === taskId || t.id?.toString() === taskId
        );

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        const userSubmission = task.submissions?.find(sub => sub.studentEmail === userEmail);
        const isOverdue = new Date() > new Date(task.dueDate);

        const status = {
            hasSubmitted: !!userSubmission,
            isOverdue: isOverdue,
            canSubmit: !isOverdue && !userSubmission,
            canResubmit: !isOverdue && !!userSubmission,
            submissionDate: userSubmission?.submittedAt || null,
            grade: userSubmission?.grade || null,
            feedback: userSubmission?.feedback || null,
            dueDate: task.dueDate
        };

        res.json({
            success: true,
            status: status,
            taskTitle: task.title
        });

    } catch (error) {
        console.error('❌ GET SUBMISSION STATUS ERROR:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get submission status',
            error: error.message
        });
    }
});

// ==================== ANALYTICS ROUTES ====================

// Get task statistics (for teachers)
router.get('/classrooms/:classroomId/tasks/:taskId/stats', async (req, res) => {
    try {
        const { classroomId, taskId } = req.params;
        const userEmail = req.headers['user-email'] || req.user?.email;

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

        // Check if user is teacher
        const isTeacher = classroom.teacherEmail === userEmail ||
            classroom.createdBy === userEmail;

        if (!isTeacher) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Only teachers can view statistics.'
            });
        }

        const task = classroom.tasks?.assignments?.find(t =>
            t._id?.toString() === taskId || t.id?.toString() === taskId
        );

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        const submissions = task.submissions || [];
        const totalStudents = classroom.students?.length || 0;

        const stats = {
            totalStudents: totalStudents,
            submittedCount: submissions.length,
            submissionRate: totalStudents > 0 ? (submissions.length / totalStudents * 100).toFixed(1) : 0,
            gradedCount: submissions.filter(sub => sub.grade !== null && sub.grade !== undefined).length,
            averageGrade: submissions.filter(sub => sub.grade !== null && sub.grade !== undefined)
                .reduce((sum, sub, _, arr) => sum + parseFloat(sub.grade) / arr.length, 0),
            lateSubmissions: submissions.filter(sub =>
                new Date(sub.submittedAt) > new Date(task.dueDate)
            ).length,
            onTimeSubmissions: submissions.filter(sub =>
                new Date(sub.submittedAt) <= new Date(task.dueDate)
            ).length
        };

        res.json({
            success: true,
            statistics: stats,
            taskTitle: task.title
        });

    } catch (error) {
        console.error('❌ GET TASK STATS ERROR:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get task statistics',
            error: error.message
        });
    }
});

// ==================== DEBUGGING ROUTES ====================

// Test route to verify router is working
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Task routes are working!',
        timestamp: new Date(),
        path: req.path,
        method: req.method
    });
});

// List all registered routes (development only)
router.get('/debug/routes', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({
            success: false,
            message: 'Route not found'
        });
    }

    const routes = [];
    router.stack.forEach((middleware) => {
        if (middleware.route) {
            const method = Object.keys(middleware.route.methods)[0].toUpperCase();
            routes.push({
                method: method,
                path: `/api${middleware.route.path}`,
                description: `${method} route for ${middleware.route.path}`
            });
        }
    });

    res.json({
        success: true,
        message: 'Registered task routes',
        routes: routes,
        count: routes.length
    });
});

// ==================== ERROR HANDLING ====================

// Catch-all error handler for this router
router.use((err, req, res, next) => {
    console.error('❌ TASK ROUTES ERROR:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error in task routes',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        path: req.path,
        method: req.method
    });
});

module.exports = router;
