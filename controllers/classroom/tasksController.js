const { getDB } = require('../../database');
const { ObjectId } = require('mongodb');
const { validateClassroomId, findClassroom } = require('../helpers/classroomHelpers');

const tasksController = {
    getTasks: async (req, res) => {
        try {
            const classroomId = req.params.id;
            console.log('📝 Getting tasks for classroom:', classroomId);

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

            // Sort tasks by creation date (newest first)
            const tasks = classroom?.tasks?.assignments || [];
            const sortedTasks = tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            res.json({
                success: true,
                tasks: sortedTasks,
                count: sortedTasks.length
            });

        } catch (error) {
            console.error('❌ Error getting tasks:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get tasks',
                error: error.message
            });
        }
    },

    createTask: async (req, res) => {
        try {
            const classroomId = req.params.id;
            const {
                title,
                description,
                dueDate,
                points,
                type = 'Assignment',
                instructions,
                attachments = []
            } = req.body;

            console.log('➕ Creating task for classroom:', classroomId);

            if (!title) {
                return res.status(400).json({
                    success: false,
                    message: 'Task title is required'
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

            const task = {
                id: new ObjectId(),
                title,
                description: description || '',
                instructions: instructions || '',
                dueDate: dueDate ? new Date(dueDate) : null,
                points: parseInt(points) || 0,
                type: type,
                attachments: attachments,
                createdAt: new Date(),
                updatedAt: new Date(),
                isCompleted: false,
                isPublished: true,
                submissions: [],
                stats: {
                    totalSubmissions: 0,
                    gradedSubmissions: 0,
                    averageScore: 0
                }
            };

            const result = await db.collection('classrooms').updateOne(
                { _id: new ObjectId(classroomId) },
                {
                    $push: { 'tasks.assignments': task },
                    $set: { updatedAt: new Date() }
                }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Classroom not found'
                });
            }

            console.log('✅ Task created successfully');

            res.json({
                success: true,
                message: 'Task created successfully',
                task
            });

        } catch (error) {
            console.error('❌ Error creating task:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create task',
                error: error.message
            });
        }
    },

    getTaskById: async (req, res) => {
        try {
            const { id: classroomId, taskId } = req.params;
            console.log('🔍 Getting task by ID:', { classroomId, taskId });

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
                t.id.toString() === taskId
            );

            if (!task) {
                return res.status(404).json({
                    success: false,
                    message: 'Task not found'
                });
            }

            // Add computed stats
            const taskWithStats = {
                ...task,
                computedStats: {
                    submissionCount: task.submissions?.length || 0,
                    isOverdue: task.dueDate ? new Date() > new Date(task.dueDate) : false,
                    daysUntilDue: task.dueDate ?
                        Math.ceil((new Date(task.dueDate) - new Date()) / (1000 * 60 * 60 * 24)) : null
                }
            };

            res.json({
                success: true,
                task: taskWithStats
            });

        } catch (error) {
            console.error('❌ Error getting task:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get task',
                error: error.message
            });
        }
    },

    updateTask: async (req, res) => {
        try {
            const { id: classroomId, taskId } = req.params;
            const updateData = req.body;

            console.log('📝 Updating task:', { classroomId, taskId });

            const validation = validateClassroomId(classroomId);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: validation.message
                });
            }

            const db = getDB();

            // Create update fields for the specific task
            const updateFields = {};
            const allowedFields = ['title', 'description', 'instructions', 'dueDate', 'points', 'type', 'isPublished'];

            allowedFields.forEach(field => {
                if (updateData[field] !== undefined) {
                    updateFields[`tasks.assignments.$.${field}`] = updateData[field];
                }
            });

            updateFields['tasks.assignments.$.updatedAt'] = new Date();
            updateFields.updatedAt = new Date();

            const result = await db.collection('classrooms').updateOne(
                {
                    _id: new ObjectId(classroomId),
                    'tasks.assignments.id': new ObjectId(taskId)
                },
                { $set: updateFields }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Classroom or task not found'
                });
            }

            res.json({
                success: true,
                message: 'Task updated successfully'
            });

        } catch (error) {
            console.error('❌ Error updating task:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update task',
                error: error.message
            });
        }
    },

    deleteTask: async (req, res) => {
        try {
            const { id: classroomId, taskId } = req.params;

            console.log('🗑️ Deleting task:', { classroomId, taskId });

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
                    $pull: { 'tasks.assignments': { id: new ObjectId(taskId) } },
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
                message: 'Task deleted successfully'
            });

        } catch (error) {
            console.error('❌ Error deleting task:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete task',
                error: error.message
            });
        }
    },

    submitTask: async (req, res) => {
        try {
            const { id: classroomId, taskId } = req.params;
            const {
                studentEmail,
                studentName,
                submissionText,
                submissionUrl,
                attachments = []
            } = req.body;

            console.log('📤 Submitting task:', { classroomId, taskId, studentEmail });

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
                t.id.toString() === taskId
            );

            if (!task) {
                return res.status(404).json({
                    success: false,
                    message: 'Task not found'
                });
            }

            // Check if student already submitted
            const existingSubmission = task.submissions?.find(s =>
                s.studentEmail === studentEmail
            );

            if (existingSubmission) {
                return res.status(400).json({
                    success: false,
                    message: 'You have already submitted this task'
                });
            }

            const submission = {
                id: new ObjectId(),
                studentEmail,
                studentName: studentName || '',
                submissionText: submissionText || '',
                submissionUrl: submissionUrl || '',
                attachments: attachments,
                submittedAt: new Date(),
                status: 'submitted',
                grade: null,
                feedback: '',
                gradedAt: null,
                gradedBy: null
            };

            // Add submission to the task
            const result = await db.collection('classrooms').updateOne(
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

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Failed to submit task'
                });
            }

            res.json({
                success: true,
                message: 'Task submitted successfully',
                submission
            });

        } catch (error) {
            console.error('❌ Error submitting task:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to submit task',
                error: error.message
            });
        }
    },

    getTaskSubmissions: async (req, res) => {
        try {
            const { id: classroomId, taskId } = req.params;
            console.log('📋 Getting task submissions:', { classroomId, taskId });

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
                t.id.toString() === taskId
            );

            if (!task) {
                return res.status(404).json({
                    success: false,
                    message: 'Task not found'
                });
            }

            res.json({
                success: true,
                submissions: task.submissions || [],
                count: task.submissions?.length || 0,
                taskTitle: task.title
            });

        } catch (error) {
            console.error('❌ Error getting task submissions:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get task submissions',
                error: error.message
            });
        }
    }
};

module.exports = tasksController;
