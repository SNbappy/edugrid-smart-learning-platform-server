const { getDB } = require('../../database');
const { ObjectId } = require('mongodb');
const { validateClassroomId, findClassroom, createSubmissionObject } = require('./taskHelpers');
const { hasSubmissionAccess, isInstructor, getUserEmailFromRequest } = require('./submissionAccess');

const submitTask = async (req, res) => {
    try {
        const classroomId = req.params.classroomId || req.params.id;
        const taskId = req.params.taskId;
        const {
            studentEmail,
            studentName,
            submissionText,
            submissionUrl,
            attachments = [],
            isResubmission = false // Add this flag to detect resubmissions
        } = req.body;

        console.log('📤 Submitting task:', { classroomId, taskId, studentEmail, isResubmission });

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
        const classroom = await findClassroom(db, classroomId);

        if (!classroom) {
            return res.status(404).json({
                success: false,
                message: 'Classroom not found'
            });
        }

        // Check if task exists
        const task = classroom.tasks?.assignments?.find(t =>
            t._id?.toString() === taskId || t.id?.toString() === taskId
        );

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        // Check if task is overdue
        if (new Date() > new Date(task.dueDate)) {
            return res.status(400).json({
                success: false,
                message: 'Cannot submit - assignment is overdue'
            });
        }

        // Check if student already submitted
        const existingSubmission = task.submissions?.find(s =>
            s.studentEmail === studentEmail
        );

        if (existingSubmission && !isResubmission) {
            return res.status(400).json({
                success: false,
                message: 'You have already submitted this task. Use resubmit option to update your submission.'
            });
        }

        if (existingSubmission && isResubmission) {
            // Handle resubmission - update existing submission
            return await handleResubmission(req, res, db, classroomId, taskId, existingSubmission);
        }

        // Handle new submission
        const submission = createSubmissionObject({
            studentEmail,
            studentName,
            submissionText,
            submissionUrl,
            attachments
        });

        // Add submission to the task (try both _id and id)
        let result = await db.collection('classrooms').updateOne(
            {
                _id: new ObjectId(classroomId),
                'tasks.assignments._id': new ObjectId(taskId)
            },
            {
                $push: { 'tasks.assignments.$.submissions': submission },
                $inc: { 'tasks.assignments.$.stats.totalSubmissions': 1 },
                $set: { updatedAt: new Date() }
            }
        );

        if (result.matchedCount === 0) {
            result = await db.collection('classrooms').updateOne(
                {
                    _id: new ObjectId(classroomId),
                    'tasks.assignments.id': new ObjectId(taskId)
                },
                {
                    $push: { 'tasks.assignments.$.submissions': submission },
                    $inc: { 'tasks.assignments.$.stats.totalSubmissions': 1 },
                    $set: { updatedAt: new Date() }
                }
            );
        }

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Failed to submit task'
            });
        }

        console.log('✅ Task submitted successfully');

        res.status(201).json({
            success: true,
            message: 'Task submitted successfully',
            submission: {
                ...submission,
                // Don't return sensitive data
                attachments: submission.attachments?.length || 0
            }
        });

    } catch (error) {
        console.error('❌ Error submitting task:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit task',
            error: error.message
        });
    }
};

// New function to handle resubmissions
const handleResubmission = async (req, res, db, classroomId, taskId, existingSubmission) => {
    try {
        const {
            studentEmail,
            studentName,
            submissionText,
            submissionUrl,
            attachments = []
        } = req.body;

        console.log('🔄 Handling resubmission for:', studentEmail);

        // Create updated submission object
        const updatedSubmission = {
            ...existingSubmission,
            submissionText: submissionText || existingSubmission.submissionText,
            submissionUrl: submissionUrl || existingSubmission.submissionUrl,
            attachments: attachments.length > 0 ? attachments : existingSubmission.attachments,
            submittedAt: new Date(), // Update submission time
            status: 'resubmitted', // Mark as resubmitted
            version: (existingSubmission.version || 1) + 1, // Increment version
            // Keep original submission data for audit trail
            originalSubmissionDate: existingSubmission.submittedAt || existingSubmission.originalSubmissionDate,
            // Reset grading info since it's a new submission
            grade: null,
            feedback: null,
            gradedBy: null,
            gradedAt: null
        };

        // Update the specific submission in the array
        let result = await db.collection('classrooms').updateOne(
            {
                _id: new ObjectId(classroomId),
                'tasks.assignments._id': new ObjectId(taskId),
                'tasks.assignments.submissions.studentEmail': studentEmail
            },
            {
                $set: {
                    'tasks.assignments.$[task].submissions.$[submission]': updatedSubmission,
                    updatedAt: new Date()
                }
            },
            {
                arrayFilters: [
                    { 'task._id': new ObjectId(taskId) },
                    { 'submission.studentEmail': studentEmail }
                ]
            }
        );

        // Try with alternative task id field if first attempt fails
        if (result.matchedCount === 0) {
            result = await db.collection('classrooms').updateOne(
                {
                    _id: new ObjectId(classroomId),
                    'tasks.assignments.id': new ObjectId(taskId),
                    'tasks.assignments.submissions.studentEmail': studentEmail
                },
                {
                    $set: {
                        'tasks.assignments.$[task].submissions.$[submission]': updatedSubmission,
                        updatedAt: new Date()
                    }
                },
                {
                    arrayFilters: [
                        { 'task.id': new ObjectId(taskId) },
                        { 'submission.studentEmail': studentEmail }
                    ]
                }
            );
        }

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Failed to update submission'
            });
        }

        console.log('✅ Task resubmitted successfully');

        res.status(200).json({
            success: true,
            message: 'Task resubmitted successfully',
            submission: {
                ...updatedSubmission,
                attachments: updatedSubmission.attachments?.length || 0
            }
        });

    } catch (error) {
        console.error('❌ Error resubmitting task:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to resubmit task',
            error: error.message
        });
    }
};

// New function specifically for resubmissions (can be called from PUT route)
const resubmitTask = async (req, res) => {
    // Add isResubmission flag to request body
    req.body.isResubmission = true;

    // Call the main submitTask function
    return await submitTask(req, res);
};

const getTaskSubmissions = async (req, res) => {
    try {
        const classroomId = req.params.classroomId || req.params.id;
        const taskId = req.params.taskId;
        const userEmail = getUserEmailFromRequest(req);

        console.log('📋 Getting task submissions:', { classroomId, taskId, userEmail });

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

        const task = classroom.tasks?.assignments?.find(t =>
            t._id?.toString() === taskId || t.id?.toString() === taskId
        );

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        // Check if user is instructor
        const userIsInstructor = isInstructor({ email: userEmail }, classroom);

        let submissions = [];

        if (userIsInstructor) {
            // Instructor can see all submissions
            submissions = task.submissions || [];
        } else {
            // Student can only see their own submission
            submissions = task.submissions?.filter(sub => sub.studentEmail === userEmail) || [];
        }

        res.json({
            success: true,
            submissions: submissions,
            count: submissions.length,
            taskTitle: task.title,
            userRole: userIsInstructor ? 'teacher' : 'student'
        });

    } catch (error) {
        console.error('❌ Error getting task submissions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get task submissions',
            error: error.message
        });
    }
};

const getSubmissionById = async (req, res) => {
    try {
        const { classroomId, taskId, submissionId } = req.params;
        const userEmail = getUserEmailFromRequest(req);

        console.log('🔍 Getting submission by ID:', { classroomId, taskId, submissionId, userEmail });

        const db = getDB();
        const classroom = await findClassroom(db, classroomId);

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

        const submission = task.submissions?.find(s =>
            s.id?.toString() === submissionId || s._id?.toString() === submissionId
        );

        if (!submission) {
            return res.status(404).json({
                success: false,
                message: 'Submission not found'
            });
        }

        // Check access rights - CRITICAL SECURITY CHECK
        if (!hasSubmissionAccess({ email: userEmail }, classroom, submission)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only view your own submissions or submissions in classes you teach.'
            });
        }

        res.json({
            success: true,
            submission: submission
        });

    } catch (error) {
        console.error('❌ Error getting submission:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get submission',
            error: error.message
        });
    }
};

const gradeSubmission = async (req, res) => {
    try {
        const { classroomId, taskId, submissionId } = req.params;
        const { grade, feedback, gradedBy } = req.body;
        const userEmail = getUserEmailFromRequest(req);

        console.log('📝 Grading submission:', { classroomId, taskId, submissionId, grade });

        const db = getDB();
        const classroom = await findClassroom(db, classroomId);

        if (!classroom) {
            return res.status(404).json({
                success: false,
                message: 'Classroom not found'
            });
        }

        // Only instructors can grade
        if (!isInstructor({ email: userEmail }, classroom)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Only instructors can grade submissions.'
            });
        }

        const result = await db.collection('classrooms').updateOne(
            {
                _id: new ObjectId(classroomId),
                'tasks.assignments._id': new ObjectId(taskId),
                'tasks.assignments.submissions.id': new ObjectId(submissionId)
            },
            {
                $set: {
                    'tasks.assignments.$[task].submissions.$[submission].grade': grade,
                    'tasks.assignments.$[task].submissions.$[submission].feedback': feedback || '',
                    'tasks.assignments.$[task].submissions.$[submission].gradedBy': gradedBy || userEmail,
                    'tasks.assignments.$[task].submissions.$[submission].gradedAt': new Date(),
                    'tasks.assignments.$[task].submissions.$[submission].status': 'graded',
                    updatedAt: new Date()
                }
            },
            {
                arrayFilters: [
                    { 'task._id': new ObjectId(taskId) },
                    { 'submission.id': new ObjectId(submissionId) }
                ]
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Submission not found'
            });
        }

        res.json({
            success: true,
            message: 'Submission graded successfully'
        });

    } catch (error) {
        console.error('❌ Error grading submission:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to grade submission',
            error: error.message
        });
    }
};

module.exports = {
    submitTask,
    resubmitTask, // Export new resubmit function
    getTaskSubmissions,
    getSubmissionById,
    gradeSubmission
};
