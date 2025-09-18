const taskOperations = require('./taskOperations');
const submissionOperations = require('./submissionOperations');
const { getDB } = require('../../database');
const { ObjectId } = require('mongodb');
const { getUserEmailFromRequest, isInstructor, getTaskPermissions } = require('./submissionAccess');

const tasksController = {
    // ==================== TASK OPERATIONS ====================
    
    // Get all tasks for a classroom
    getTasks: taskOperations.getTasks,
    
    // Create a new task
    createTask: taskOperations.createTask,
    
    // Update an existing task
    updateTask: taskOperations.updateTask,
    
    // Delete a task
    deleteTask: taskOperations.deleteTask,
    
    // Get a specific task by ID
    getTaskById: taskOperations.getTaskById,

    // Get task with user-specific permissions and status
    getTaskWithPermissions: async (req, res) => {
        try {
            const { classroomId, taskId } = req.params;
            const userEmail = getUserEmailFromRequest(req);

            if (!userEmail) {
                return res.status(401).json({
                    success: false,
                    message: 'User authentication required'
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

            const permissions = getTaskPermissions(
                { email: userEmail },
                classroom,
                task
            );

            res.json({
                success: true,
                task: task,
                permissions: permissions,
                userEmail: userEmail
            });

        } catch (error) {
            console.error('❌ Error getting task with permissions:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get task details',
                error: error.message
            });
        }
    },

    // ==================== SUBMISSION OPERATIONS ====================
    
    // Submit a new task
    submitTask: submissionOperations.submitTask,
    
    // Resubmit an existing task
    resubmitTask: submissionOperations.resubmitTask,
    
    // Get all submissions for a task
    getTaskSubmissions: submissionOperations.getTaskSubmissions,
    
    // Get a specific submission by ID
    getSubmissionById: submissionOperations.getSubmissionById,
    
    // Grade a submission
    gradeSubmission: submissionOperations.gradeSubmission,

    // ==================== ADDITIONAL UTILITY METHODS ====================
    
    // Get current user's submission for a task
    getMySubmission: submissionOperations.getMySubmission,
    
    // Get submission status for current user
    getSubmissionStatus: submissionOperations.getSubmissionStatus,
    
    // Update an existing submission (for resubmissions)
    updateSubmission: submissionOperations.updateSubmission,
    
    // Delete a submission (if allowed)
    deleteSubmission: submissionOperations.deleteSubmission,

    // Check if user can submit/resubmit a task
    checkSubmissionEligibility: async (req, res) => {
        try {
            const { classroomId, taskId } = req.params;
            const userEmail = getUserEmailFromRequest(req);

            if (!userEmail) {
                return res.status(401).json({
                    success: false,
                    message: 'User authentication required'
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

            const permissions = getTaskPermissions(
                { email: userEmail },
                classroom,
                task
            );

            res.json({
                success: true,
                eligibility: {
                    canSubmit: permissions.canSubmit,
                    canResubmit: permissions.canResubmit,
                    hasSubmitted: permissions.submissionStatus.hasSubmitted,
                    isOverdue: permissions.submissionStatus.isOverdue,
                    isGraded: permissions.submissionStatus.isGraded,
                    existingSubmission: permissions.submissionStatus.existingSubmission
                },
                reasons: {
                    submitReason: permissions.submissionStatus.submitReason,
                    resubmitReason: permissions.submissionStatus.resubmitReason
                }
            });

        } catch (error) {
            console.error('❌ Error checking submission eligibility:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to check submission eligibility',
                error: error.message
            });
        }
    },

    // ==================== BULK OPERATIONS FOR TEACHERS ====================
    
    // Get all submissions for a task (teacher view)
    getAllSubmissionsForTask: submissionOperations.getAllSubmissionsForTask,
    
    // Grade multiple submissions at once
    gradeMultipleSubmissions: submissionOperations.gradeMultipleSubmissions,
    
    // Export submissions to CSV or other formats
    exportSubmissions: submissionOperations.exportSubmissions,

    // Bulk download all submission files
    downloadAllSubmissions: async (req, res) => {
        try {
            const { classroomId, taskId } = req.params;
            const userEmail = getUserEmailFromRequest(req);

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

            if (!isInstructor({ email: userEmail }, classroom)) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Only instructors can download submissions.'
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
            const submissionsWithFiles = submissions.filter(sub => 
                sub.attachments && sub.attachments.length > 0
            );

            res.json({
                success: true,
                message: `Found ${submissionsWithFiles.length} submissions with files`,
                submissions: submissionsWithFiles.map(sub => ({
                    studentEmail: sub.studentEmail,
                    studentName: sub.studentName,
                    submittedAt: sub.submittedAt,
                    attachments: sub.attachments
                }))
            });

        } catch (error) {
            console.error('❌ Error downloading submissions:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to download submissions',
                error: error.message
            });
        }
    },

    // ==================== PERMISSION AND VALIDATION HELPERS ====================
    
    // Validate submission permissions
    validateSubmissionPermissions: submissionOperations.validateSubmissionPermissions,
    
    // Check resubmission eligibility
    checkResubmissionEligibility: submissionOperations.checkResubmissionEligibility,

    // Validate task deadline
    validateTaskDeadline: async (req, res) => {
        try {
            const { classroomId, taskId } = req.params;

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

            const now = new Date();
            const dueDate = new Date(task.dueDate);
            const isOverdue = now > dueDate;
            const timeRemaining = dueDate.getTime() - now.getTime();

            res.json({
                success: true,
                deadline: {
                    dueDate: task.dueDate,
                    isOverdue: isOverdue,
                    timeRemaining: isOverdue ? 0 : timeRemaining,
                    timeRemainingFormatted: isOverdue ? 'Overdue' : formatTimeRemaining(timeRemaining)
                }
            });

        } catch (error) {
            console.error('❌ Error validating task deadline:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to validate task deadline',
                error: error.message
            });
        }
    },

    // ==================== ANALYTICS AND STATISTICS ====================
    
    // Get task statistics
    getTaskStatistics: submissionOperations.getTaskStatistics,
    
    // Get student submission history
    getStudentSubmissionHistory: submissionOperations.getStudentSubmissionHistory,

    // Get comprehensive task analytics
    getTaskAnalytics: async (req, res) => {
        try {
            const { classroomId, taskId } = req.params;
            const userEmail = getUserEmailFromRequest(req);

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

            if (!isInstructor({ email: userEmail }, classroom)) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Only instructors can view analytics.'
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
            const submittedCount = submissions.length;
            const gradedCount = submissions.filter(sub => sub.grade !== null && sub.grade !== undefined).length;
            const resubmissionCount = submissions.filter(sub => sub.status === 'resubmitted').length;

            // Calculate average grade
            const gradedSubmissions = submissions.filter(sub => sub.grade !== null && sub.grade !== undefined);
            const averageGrade = gradedSubmissions.length > 0 
                ? gradedSubmissions.reduce((sum, sub) => sum + parseFloat(sub.grade), 0) / gradedSubmissions.length
                : null;

            res.json({
                success: true,
                analytics: {
                    totalStudents: totalStudents,
                    submittedCount: submittedCount,
                    gradedCount: gradedCount,
                    resubmissionCount: resubmissionCount,
                    submissionRate: totalStudents > 0 ? (submittedCount / totalStudents * 100).toFixed(1) : 0,
                    gradingRate: submittedCount > 0 ? (gradedCount / submittedCount * 100).toFixed(1) : 0,
                    averageGrade: averageGrade ? averageGrade.toFixed(2) : null,
                    dueDate: task.dueDate,
                    isOverdue: new Date() > new Date(task.dueDate),
                    createdAt: task.createdAt,
                    lastSubmission: submissions.length > 0 ? 
                        Math.max(...submissions.map(sub => new Date(sub.submittedAt).getTime())) : null
                }
            });

        } catch (error) {
            console.error('❌ Error getting task analytics:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get task analytics',
                error: error.message
            });
        }
    },

    // ==================== NOTIFICATION AND COMMUNICATION ====================
    
    // Send reminders to students who haven't submitted
    sendSubmissionReminders: async (req, res) => {
        try {
            const { classroomId, taskId } = req.params;
            const userEmail = getUserEmailFromRequest(req);

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

            if (!isInstructor({ email: userEmail }, classroom)) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Only instructors can send reminders.'
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
            const submittedEmails = submissions.map(sub => sub.studentEmail);
            const allStudents = classroom.students || [];
            const pendingStudents = allStudents.filter(email => !submittedEmails.includes(email));

            // Here you would integrate with your notification system
            // For now, we'll just return the list of students to remind

            res.json({
                success: true,
                message: `Found ${pendingStudents.length} students to remind`,
                pendingStudents: pendingStudents,
                taskTitle: task.title,
                dueDate: task.dueDate
            });

        } catch (error) {
            console.error('❌ Error sending submission reminders:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to send submission reminders',
                error: error.message
            });
        }
    }
};

// Helper function to format time remaining
function formatTimeRemaining(milliseconds) {
    const days = Math.floor(milliseconds / (1000 * 60 * 60 * 24));
    const hours = Math.floor((milliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
        return `${days} day${days !== 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''}`;
    } else if (hours > 0) {
        return `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
}

module.exports = tasksController;
