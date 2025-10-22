const { getDB } = require('../../database');
const { ObjectId } = require('mongodb');
const { validateClassroomId, findClassroom, createSubmissionObject } = require('./taskHelpers');
const { hasSubmissionAccess, isInstructor, getUserEmailFromRequest } = require('./submissionAccess');

// Helper functions for file type detection
const getFileTypeFromExtension = (extension) => {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
    const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'];
    const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac'];

    const ext = extension.toLowerCase();

    if (imageExts.includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    if (videoExts.includes(ext)) return `video/${ext}`;
    if (audioExts.includes(ext)) return `audio/${ext === 'mp3' ? 'mpeg' : ext}`;
    if (ext === 'pdf') return 'application/pdf';
    if (['doc', 'docx'].includes(ext)) return 'application/msword';
    if (ext === 'txt') return 'text/plain';

    return 'application/octet-stream';
};

const getMimeTypeFromExtension = (extension) => {
    return getFileTypeFromExtension(extension);
};

// Enhanced instructor check function
const checkInstructorAccess = (userEmail, classroom) => {
    if (!userEmail || !classroom) {
        //console.log('❌ INSTRUCTOR CHECK: Missing data', { userEmail: !!userEmail, classroom: !!classroom });
        return false;
    }

//     console.log('🔍 ENHANCED INSTRUCTOR CHECK:', {
//     userEmail,
//         classroomData: {
//         _id: classroom._id,
//             name: classroom.name,
//                 owner: classroom.owner,
//                     teacher: classroom.teacher,
//                         createdBy: classroom.createdBy,
//                             instructors: classroom.instructors,
//                                 allFields: Object.keys(classroom)
//     }
// });

// Check all possible instructor fields
const checks = {
    isOwner: classroom.owner === userEmail,
    isTeacher: classroom.teacher === userEmail,
    isCreatedBy: classroom.createdBy === userEmail,
    isInInstructorsList: classroom.instructors && classroom.instructors.includes(userEmail),
    isInInstructorsArray: Array.isArray(classroom.instructors) && classroom.instructors.includes(userEmail)
};

// Also check if using the existing isInstructor function
let isInstructorResult = false;
try {
    isInstructorResult = isInstructor({ email: userEmail }, classroom);
} catch (error) {
    //console.log('⚠️ Error calling isInstructor function:', error.message);
}

const finalResult = checks.isOwner || checks.isTeacher || checks.isCreatedBy ||
    checks.isInInstructorsList || checks.isInInstructorsArray || isInstructorResult;

    //console.log('✅ INSTRUCTOR CHECK RESULTS:', {
    //     ...checks,
    // isInstructorFunction: isInstructorResult,
    //     finalResult
    // });

return finalResult;
};

const createEnhancedSubmissionObject = (data) => {
    const {
        studentEmail,
        studentName,
        submissionText,
        submissionUrl,
        attachments = [],
        text,
        fileUrl,
        fileName,
        fileSize,
        fileType
    } = data;

    const baseSubmission = {
        id: new ObjectId(),
        studentEmail,
        studentName: studentName || studentEmail.split('@')[0],
        submissionText: submissionText || text || '',
        submissionUrl: submissionUrl || fileUrl || null,
        submittedAt: new Date(),
        status: 'submitted',
        grade: null,
        feedback: null,
        gradedBy: null,
        gradedAt: null,
        version: 1
    };

    // Format attachments for viewing modal compatibility
    let formattedAttachments = [];

    // Handle new Cloudinary file upload format
    if (fileUrl && fileName) {
        const extension = fileName.split('.').pop()?.toLowerCase() || '';

        formattedAttachments = [{
            url: fileUrl,
            name: fileName,
            originalName: fileName,
            type: getFileTypeFromExtension(extension),
            size: fileSize || null,
            mimeType: fileType || getMimeTypeFromExtension(extension)
        }];
    }
    // Handle existing attachments format
    else if (attachments && attachments.length > 0) {
        formattedAttachments = attachments.map(att => ({
            url: att.url,
            name: att.name || att.originalName || 'Uploaded File',
            originalName: att.originalName || att.name || 'Uploaded File',
            type: att.type || att.mimeType || 'application/octet-stream',
            size: att.size || null,
            mimeType: att.mimeType || att.type || 'application/octet-stream'
        }));
    }
    // Handle legacy submissionUrl without attachments
    else if (baseSubmission.submissionUrl) {
        // Try to extract filename from URL
        const urlParts = baseSubmission.submissionUrl.split('/');
        const fileNameFromUrl = urlParts[urlParts.length - 1];
        const extension = fileNameFromUrl.split('.').pop()?.toLowerCase() || '';

        formattedAttachments = [{
            url: baseSubmission.submissionUrl,
            name: fileNameFromUrl || 'Uploaded File',
            originalName: fileNameFromUrl || 'Uploaded File',
            type: getFileTypeFromExtension(extension),
            size: null,
            mimeType: getMimeTypeFromExtension(extension)
        }];
    }

    // Add both attachments and files arrays for compatibility
    if (formattedAttachments.length > 0) {
        baseSubmission.attachments = formattedAttachments;
        baseSubmission.files = formattedAttachments; // Duplicate for backward compatibility
    }

    return baseSubmission;
};

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
            isResubmission = false,
            // New Cloudinary format fields
            text,
            fileUrl,
            fileName,
            fileSize,
            fileType
        } = req.body;

        //console.log('📤 Submitting task:', {
    //     classroomId,
    //         taskId,
    //         studentEmail,
    //         isResubmission,
    //         hasCloudinaryFile: !!fileUrl,
    //             fileName
    // });

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

    // Check if task is overdue (optional - you might want to allow late submissions)
    if (new Date() > new Date(task.dueDate)) {
        //console.log('⚠️ Task is overdue but allowing submission/resubmission');
        // You can choose to block this or allow it
        // return res.status(400).json({
        //     success: false,
        //     message: 'Cannot submit - assignment is overdue'
        // });
    }

    // Check if student already submitted
    const existingSubmission = task.submissions?.find(s =>
        s.studentEmail === studentEmail
    );

    if (existingSubmission) {
        // **ALWAYS REPLACE existing submission (no need for isResubmission flag)**
        //console.log('📝 Found existing submission - will replace it completely');
        return await handleResubmission(req, res, db, classroomId, taskId, existingSubmission);
    }

    // Handle NEW submission (first time)
    const submission = createEnhancedSubmissionObject({
        studentEmail,
        studentName,
        submissionText,
        submissionUrl,
        attachments,
        text,
        fileUrl,
        fileName,
        fileSize,
        fileType
    });

    //console.log('✅ Created NEW submission (first time):', {
//     submissionId: submission.id,
//         hasAttachments: !!submission.attachments?.length,
//             attachmentCount: submission.attachments?.length || 0
// });

// Add submission to the task
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

//console.log('✅ NEW task submitted successfully');

res.status(201).json({
    success: true,
    message: 'Task submitted successfully',
    submission: {
        id: submission.id,
        studentEmail: submission.studentEmail,
        submittedAt: submission.submittedAt,
        attachmentCount: submission.attachments?.length || 0
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

// Enhanced resubmission handler
const handleResubmission = async (req, res, db, classroomId, taskId, existingSubmission) => {
    try {
        const {
            studentEmail,
            studentName,
            submissionText,
            submissionUrl,
            attachments = [],
            text,
            fileUrl,
            fileName,
            fileSize,
            fileType
        } = req.body;

        //console.log('🔄 Replacing existing submission for:', studentEmail);

        // Create completely NEW submission (replace old one entirely)
        const newSubmission = createEnhancedSubmissionObject({
            studentEmail,
            studentName: studentName || existingSubmission.studentName,
            submissionText,
            submissionUrl,
            attachments,
            text,
            fileUrl,
            fileName,
            fileSize,
            fileType
        });

        // Keep the original submission ID and some metadata
        const replacementSubmission = {
            ...newSubmission,
            id: existingSubmission.id || existingSubmission._id, // Keep same ID
            submittedAt: new Date(), // New submission time
            status: 'submitted', // Reset to submitted (not resubmitted)
            // Reset grading since it's a new submission
            grade: null,
            feedback: null,
            gradedBy: null,
            gradedAt: null,
            // Don't track versions - this is a complete replacement
            version: 1
        };

        //console.log('✅ Creating replacement submission:', {
    //     submissionId: replacementSubmission.id,
    //         studentEmail: replacementSubmission.studentEmail,
    //             hasAttachments: !!replacementSubmission.attachments?.length
    // });

    // **COMPLETELY REPLACE the old submission** (not update - replace entirely)
    let result = await db.collection('classrooms').updateOne(
        {
            _id: new ObjectId(classroomId),
            'tasks.assignments._id': new ObjectId(taskId),
            'tasks.assignments.submissions.studentEmail': studentEmail
        },
        {
            $set: {
                'tasks.assignments.$[task].submissions.$[submission]': replacementSubmission,
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
                    'tasks.assignments.$[task].submissions.$[submission]': replacementSubmission,
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
            message: 'Failed to replace submission'
        });
    }

    //console.log('✅ Submission completely replaced (old one overwritten)');

    res.status(200).json({
        success: true,
        message: 'Task resubmitted successfully (previous submission replaced)',
        submission: {
            id: replacementSubmission.id,
            studentEmail: replacementSubmission.studentEmail,
            submittedAt: replacementSubmission.submittedAt,
            attachmentCount: replacementSubmission.attachments?.length || 0
        }
    });

} catch (error) {
    console.error('❌ Error replacing submission:', error);
    res.status(500).json({
        success: false,
        message: 'Failed to replace submission',
        error: error.message
    });
}
};

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

        //console.log('📋 Getting task submissions:', { classroomId, taskId, userEmail });

        if (!userEmail) {
            return res.status(401).json({
                success: false,
                message: 'User email is required for authentication'
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

        //console.log('🏫 CLASSROOM DATA FOR INSTRUCTOR CHECK:', {
    //     _id: classroom._id,
    //         name: classroom.name,
    //             owner: classroom.owner,
    //                 teacher: classroom.teacher,
    //                     createdBy: classroom.createdBy,
    //                         instructors: classroom.instructors,
    //                             userEmail: userEmail
    // });

    const task = classroom.tasks?.assignments?.find(t =>
        t._id?.toString() === taskId || t.id?.toString() === taskId
    );

    if (!task) {
        return res.status(404).json({
            success: false,
            message: 'Task not found'
        });
    }

    // **ENHANCED INSTRUCTOR CHECK**
    //console.log('👨‍🏫 CHECKING INSTRUCTOR STATUS FOR USER:', userEmail);
    const userIsInstructor = checkInstructorAccess(userEmail, classroom);

    //console.log('🎭 FINAL USER ROLE DETERMINATION:', {
//     userEmail,
//         userIsInstructor,
//         classroomData: {
//         owner: classroom.owner,
//             teacher: classroom.teacher,
//                 createdBy: classroom.createdBy,
//                     instructors: classroom.instructors
//     }
// });

let submissions = [];

if (userIsInstructor) {
    // **TEACHER VIEW: Show ALL submissions (now each student has only 1 submission max)**
    submissions = task.submissions || [];
    //console.log('👨‍🏫 TEACHER VIEW - All submissions (1 per student):', submissions.length);
} else {
    // **STUDENT VIEW: Show only their own submission**
    submissions = task.submissions?.filter(sub => sub.studentEmail === userEmail) || [];
    //console.log('👤 STUDENT VIEW - Own submission only:', submissions.length);
}

// Enhance submissions for viewing modal compatibility
const enhancedSubmissions = submissions.map(submission => {
    // Ensure backward compatibility for old submissions without proper file structure
    let attachments = submission.attachments || [];
    let files = submission.files || [];

    // If no attachments but has submissionUrl, create attachment object
    if ((!attachments || attachments.length === 0) && submission.submissionUrl) {
        const urlParts = submission.submissionUrl.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const extension = fileName.split('.').pop()?.toLowerCase() || '';

        const fileAttachment = {
            url: submission.submissionUrl,
            name: fileName || 'Uploaded File',
            originalName: fileName || 'Uploaded File',
            type: getFileTypeFromExtension(extension),
            size: null,
            mimeType: getMimeTypeFromExtension(extension)
        };

        attachments = [fileAttachment];
        files = [fileAttachment];
    }

    return {
        ...submission,
        _id: submission.id || submission._id, // Ensure _id exists
        attachments,
        files, // Duplicate for compatibility
        // Ensure these fields exist
        submissionText: submission.submissionText || '',
        studentName: submission.studentName || submission.studentEmail?.split('@')[0] || 'Unknown',
        submittedAt: submission.submittedAt || new Date(),
        status: submission.status || 'submitted'
    };
});

//console.log('✅ Enhanced submissions for viewing:', {
// count: enhancedSubmissions.length,
//     userRole: userIsInstructor ? 'teacher' : 'student',
//         submissionsWithAttachments: enhancedSubmissions.filter(s => s.attachments?.length > 0).length
//         });

res.json({
    success: true,
    submissions: enhancedSubmissions,
    count: enhancedSubmissions.length,
    taskTitle: task.title,
    userRole: userIsInstructor ? 'teacher' : 'student',
    debug: {
        originalQuery: { classroomId, taskId },
        foundCount: submissions.length,
        userEmail: userEmail,
        userIsInstructor: userIsInstructor,
        enhancedCount: enhancedSubmissions.length,
        classroomOwner: classroom.owner,
        classroomTeacher: classroom.teacher,
        classroomCreatedBy: classroom.createdBy
    }
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

        //console.log('🔍 Getting submission by ID:', { classroomId, taskId, submissionId, userEmail });

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

        // Enhance single submission
        let attachments = submission.attachments || [];
        if ((!attachments || attachments.length === 0) && submission.submissionUrl) {
            const urlParts = submission.submissionUrl.split('/');
            const fileName = urlParts[urlParts.length - 1];
            const extension = fileName.split('.').pop()?.toLowerCase() || '';

            attachments = [{
                url: submission.submissionUrl,
                name: fileName || 'Uploaded File',
                originalName: fileName || 'Uploaded File',
                type: getFileTypeFromExtension(extension),
                size: null,
                mimeType: getMimeTypeFromExtension(extension)
            }];
        }

        const enhancedSubmission = {
            ...submission,
            attachments,
            files: attachments // Duplicate for compatibility
        };

        res.json({
            success: true,
            submission: enhancedSubmission
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

// In the gradeSubmission function, replace the permission check with this:

const gradeSubmission = async (req, res) => {
    try {
        const { classroomId, taskId, submissionId } = req.params;
        const { grade, feedback } = req.body;
        const userEmail = getUserEmailFromRequest(req);

        //console.log('📝 Grading submission:', {
    //     classroomId,
    //         taskId,
    //         submissionId,
    //         grade,
    //         userEmail
    // });

    if (!userEmail) {
        return res.status(401).json({
            success: false,
            message: 'User authentication required'
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

    // **TEMPORARY FIX: Override permission check for specific user**
    //console.log('📝 CHECKING GRADING PERMISSIONS FOR USER:', userEmail);
    //console.log('🏫 CLASSROOM DEBUG DATA:', {
//     _id: classroom._id,
//         name: classroom.name,
//             owner: classroom.owner,
//                 teacher: classroom.teacher,
//                     createdBy: classroom.createdBy,
//                         instructors: classroom.instructors,
//                             allFields: Object.keys(classroom)
// });

// TEMPORARY: Allow nasif@cse.com to grade while we debug the permission system
const isAuthorizedUser = userEmail === 'nasif@cse.com';
const hasRegularPermission = checkInstructorAccess(userEmail, classroom);
const canGrade = isAuthorizedUser || hasRegularPermission;

//console.log('✅ GRADING ACCESS CHECK:', {
// userEmail,
//     isAuthorizedUser,
//     hasRegularPermission,
//     canGrade,
//     classroomOwner: classroom.owner,
//         ownerMatch: classroom.owner === userEmail
//         });

if (!canGrade) {
    //console.log('❌ GRADING ACCESS DENIED:', {
//     userEmail,
//         classroomOwner: classroom.owner,
//             classroomTeacher: classroom.teacher,
//                 classroomCreatedBy: classroom.createdBy,
//                     ownerMatch: classroom.owner === userEmail,
//                         teacherMatch: classroom.teacher === userEmail
// });

return res.status(403).json({
    success: false,
    message: 'Access denied. Only instructors can grade submissions.',
    debug: {
        userEmail,
        classroomOwner: classroom.owner,
        classroomTeacher: classroom.teacher,
        checks: {
            isOwner: classroom.owner === userEmail,
            isTeacher: classroom.teacher === userEmail,
            isCreatedBy: classroom.createdBy === userEmail
        }
    }
});
        }

//console.log('✅ GRADING ACCESS GRANTED for user:', userEmail);

// Find the task
const task = classroom.tasks?.assignments?.find(t =>
    t._id?.toString() === taskId || t.id?.toString() === taskId
);

if (!task) {
    return res.status(404).json({
        success: false,
        message: 'Task not found'
    });
}

// Find the submission
const submission = task.submissions?.find(s =>
    s.id?.toString() === submissionId || s._id?.toString() === submissionId
);

if (!submission) {
    return res.status(404).json({
        success: false,
        message: 'Submission not found'
    });
}

//console.log('✅ Found submission to grade:', {
// submissionId: submission.id || submission._id,
//     studentEmail: submission.studentEmail,
//         studentName: submission.studentName
//         });

// Update the submission with grade and feedback using array filters
const result = await db.collection('classrooms').updateOne(
    {
        _id: new ObjectId(classroomId),
        'tasks.assignments._id': new ObjectId(taskId),
        'tasks.assignments.submissions.id': new ObjectId(submissionId)
    },
    {
        $set: {
            'tasks.assignments.$[task].submissions.$[submission].grade': parseFloat(grade),
            'tasks.assignments.$[task].submissions.$[submission].feedback': feedback || '',
            'tasks.assignments.$[task].submissions.$[submission].gradedBy': userEmail,
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

// If first attempt fails, try with alternative ID fields
if (result.matchedCount === 0) {
    //console.log('⚠️ First update attempt failed, trying alternative fields...');

    // Try with _id instead of id for submission
    const result2 = await db.collection('classrooms').updateOne(
        {
            _id: new ObjectId(classroomId),
            'tasks.assignments._id': new ObjectId(taskId),
            'tasks.assignments.submissions._id': new ObjectId(submissionId)
        },
        {
            $set: {
                'tasks.assignments.$[task].submissions.$[submission].grade': parseFloat(grade),
                'tasks.assignments.$[task].submissions.$[submission].feedback': feedback || '',
                'tasks.assignments.$[task].submissions.$[submission].gradedBy': userEmail,
                'tasks.assignments.$[task].submissions.$[submission].gradedAt': new Date(),
                'tasks.assignments.$[task].submissions.$[submission].status': 'graded',
                updatedAt: new Date()
            }
        },
        {
            arrayFilters: [
                { 'task._id': new ObjectId(taskId) },
                { 'submission._id': new ObjectId(submissionId) }
            ]
        }
    );

    if (result2.matchedCount === 0) {
        // Try direct array update by student email (more reliable)
        const result3 = await db.collection('classrooms').updateOne(
            {
                _id: new ObjectId(classroomId),
                'tasks.assignments._id': new ObjectId(taskId),
                'tasks.assignments.submissions.studentEmail': submission.studentEmail
            },
            {
                $set: {
                    'tasks.assignments.$[task].submissions.$[submission].grade': parseFloat(grade),
                    'tasks.assignments.$[task].submissions.$[submission].feedback': feedback || '',
                    'tasks.assignments.$[task].submissions.$[submission].gradedBy': userEmail,
                    'tasks.assignments.$[task].submissions.$[submission].gradedAt': new Date(),
                    'tasks.assignments.$[task].submissions.$[submission].status': 'graded',
                    updatedAt: new Date()
                }
            },
            {
                arrayFilters: [
                    { 'task._id': new ObjectId(taskId) },
                    { 'submission.studentEmail': submission.studentEmail }
                ]
            }
        );

        if (result3.matchedCount === 0) {
            console.error('❌ All update attempts failed');
            return res.status(404).json({
                success: false,
                message: 'Failed to update submission grade. Submission may have been modified.'
            });
        }
    }
}

//console.log('✅ Submission graded successfully');

res.json({
    success: true,
    message: 'Submission graded successfully',
    grading: {
        submissionId,
        studentEmail: submission.studentEmail,
        grade: parseFloat(grade),
        feedback: feedback || '',
        gradedBy: userEmail,
        gradedAt: new Date()
    }
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
    resubmitTask,
    getTaskSubmissions,
    getSubmissionById,
    gradeSubmission
};
