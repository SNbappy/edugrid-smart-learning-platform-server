const { getDB } = require('../../database');
const { ObjectId } = require('mongodb');
const { validateClassroomId, findClassroom, createTaskObject } = require('./taskHelpers');

const getTasks = async (req, res) => {
    try {
        const classroomId = req.params.id;
        //console.log('📝 Getting tasks for classroom:', classroomId);

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
};

const createTask = async (req, res) => {
    try {
        const classroomId = req.params.classroomId || req.params.id;
        const {
            title,
            description,
            dueDate,
            points,
            type = 'assignment',
            instructions,
            attachments = [],
            createdBy
        } = req.body;

        //console.log('➕ Creating task for classroom:', classroomId);
        //console.log('📋 Task data:', { title, type, dueDate, points });

        if (!title) {
            return res.status(400).json({
                success: false,
                message: 'Task title is required'
            });
        }

        if (!dueDate) {
            return res.status(400).json({
                success: false,
                message: 'Due date is required'
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

        // Create task using helper function
        const task = createTaskObject({
            title,
            description,
            instructions,
            dueDate,
            points,
            type,
            attachments,
            createdBy
        });

        //console.log('💾 Inserting task with ID:', task._id);

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

        if (result.modifiedCount === 0) {
            return res.status(500).json({
                success: false,
                message: 'Failed to create task - no changes made'
            });
        }

        //console.log('✅ Task created successfully with ID:', task._id);

        res.status(201).json({
            success: true,
            message: 'Task created successfully',
            task: task
        });

    } catch (error) {
        console.error('❌ Error creating task:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create task',
            error: error.message
        });
    }
};

const getTaskById = async (req, res) => {
    try {
        const classroomId = req.params.classroomId || req.params.id;
        const taskId = req.params.taskId;
        //console.log('🔍 Getting task by ID:', { classroomId, taskId });

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

        // Search by both _id and id for compatibility
        const task = classroom.tasks?.assignments?.find(t =>
            t._id?.toString() === taskId || t.id?.toString() === taskId
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
};

const updateTask = async (req, res) => {
    try {
        const classroomId = req.params.classroomId || req.params.id;
        const taskId = req.params.taskId;
        const updateData = req.body;

        //console.log('📝 Updating task:', { classroomId, taskId });

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
                if (field === 'dueDate' && updateData[field]) {
                    updateFields[`tasks.assignments.$.${field}`] = new Date(updateData[field]);
                } else if (field === 'points' && updateData[field]) {
                    updateFields[`tasks.assignments.$.${field}`] = parseInt(updateData[field]);
                } else {
                    updateFields[`tasks.assignments.$.${field}`] = updateData[field];
                }
            }
        });

        updateFields['tasks.assignments.$.updatedAt'] = new Date();
        updateFields.updatedAt = new Date();

        // Try updating with _id first, then fallback to id
        let result = await db.collection('classrooms').updateOne(
            {
                _id: new ObjectId(classroomId),
                'tasks.assignments._id': new ObjectId(taskId)
            },
            { $set: updateFields }
        );

        // If no match with _id, try with id
        if (result.matchedCount === 0) {
            result = await db.collection('classrooms').updateOne(
                {
                    _id: new ObjectId(classroomId),
                    'tasks.assignments.id': new ObjectId(taskId)
                },
                { $set: updateFields }
            );
        }

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
};

const deleteTask = async (req, res) => {
    try {
        const classroomId = req.params.classroomId || req.params.id;
        const taskId = req.params.taskId;

        //console.log('🗑️ Deleting task:', { classroomId, taskId });

        const validation = validateClassroomId(classroomId);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        const db = getDB();

        // Try deleting with _id first, then fallback to id
        let result = await db.collection('classrooms').updateOne(
            { _id: new ObjectId(classroomId) },
            {
                $pull: { 'tasks.assignments': { _id: new ObjectId(taskId) } },
                $set: { updatedAt: new Date() }
            }
        );

        // If no match with _id, try with id
        if (result.modifiedCount === 0) {
            result = await db.collection('classrooms').updateOne(
                { _id: new ObjectId(classroomId) },
                {
                    $pull: { 'tasks.assignments': { id: taskId } },
                    $set: { updatedAt: new Date() }
                }
            );
        }

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Classroom not found'
            });
        }

        if (result.modifiedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        //console.log('✅ Task deleted successfully');

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
};

module.exports = {
    getTasks,
    createTask,
    getTaskById,
    updateTask,
    deleteTask
};
