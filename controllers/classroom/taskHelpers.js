const { ObjectId } = require('mongodb');

const validateClassroomId = (classroomId) => {
    if (!classroomId) {
        return {
            valid: false,
            message: 'Classroom ID is required'
        };
    }

    if (!ObjectId.isValid(classroomId)) {
        return {
            valid: false,
            message: 'Invalid classroom ID format'
        };
    }

    return {
        valid: true
    };
};

const findClassroom = async (db, classroomId) => {
    try {
        return await db.collection('classrooms').findOne({
            _id: new ObjectId(classroomId)
        });
    } catch (error) {
        console.error('Error finding classroom:', error);
        return null;
    }
};

const createTaskObject = ({
    title,
    description,
    instructions,
    dueDate,
    points,
    type,
    attachments,
    createdBy
}) => {
    return {
        _id: new ObjectId(),
        id: new ObjectId().toString(), // Keep both for compatibility
        title,
        description: description || '',
        instructions: instructions || '',
        dueDate: new Date(dueDate),
        points: parseInt(points) || 100,
        type: type,
        attachments: attachments,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: createdBy || '',
        isCompleted: false,
        isPublished: true,
        status: 'active',
        submissions: [],
        stats: {
            totalSubmissions: 0,
            gradedSubmissions: 0,
            averageScore: 0
        }
    };
};

const createSubmissionObject = ({
    studentEmail,
    studentName,
    submissionText,
    submissionUrl,
    attachments
}) => {
    return {
        id: new ObjectId(),
        _id: new ObjectId(),
        studentEmail,
        studentName: studentName || '',
        submissionText: submissionText || '',
        submissionUrl: submissionUrl || '',
        attachments: attachments || [],
        submittedAt: new Date(),
        status: 'submitted',
        grade: null,
        feedback: '',
        gradedAt: null,
        gradedBy: null
    };
};

const calculateTaskStats = (task) => {
    const submissions = task.submissions || [];
    const gradedSubmissions = submissions.filter(s => s.grade !== null && s.grade !== undefined);

    let averageScore = 0;
    if (gradedSubmissions.length > 0) {
        const totalScore = gradedSubmissions.reduce((sum, sub) => sum + (sub.grade || 0), 0);
        averageScore = Math.round((totalScore / gradedSubmissions.length) * 100) / 100;
    }

    return {
        totalSubmissions: submissions.length,
        gradedSubmissions: gradedSubmissions.length,
        averageScore: averageScore
    };
};

module.exports = {
    validateClassroomId,
    findClassroom,
    createTaskObject,
    createSubmissionObject,
    calculateTaskStats
};
