const { ObjectId } = require('mongodb');

// Generate random classroom code
const generateClassroomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// Helper function to calculate average attendance
const calculateAverageAttendance = (sessions) => {
    if (!sessions || sessions.length === 0) return 0;

    const totalAttendance = sessions.reduce((sum, session) => {
        const presentCount = session.attendance?.filter(record => record.status === 'present')?.length || 0;
        const totalStudents = session.attendance?.length || 0;
        return sum + (totalStudents > 0 ? (presentCount / totalStudents) * 100 : 0);
    }, 0);

    return Math.round(totalAttendance / sessions.length);
};

// Validate classroom ID
const validateClassroomId = (classroomId) => {
    if (!classroomId || !ObjectId.isValid(classroomId)) {
        return { valid: false, message: 'Invalid classroom ID format' };
    }
    return { valid: true };
};

// Check if classroom exists
const findClassroom = async (db, classroomId) => {
    try {
        const classroom = await db.collection('classrooms').findOne({
            _id: new ObjectId(classroomId)
        });
        return classroom;
    } catch (error) {
        console.error('Error finding classroom:', error);
        return null;
    }
};

module.exports = {
    generateClassroomCode,
    calculateAverageAttendance,
    validateClassroomId,
    findClassroom
};
