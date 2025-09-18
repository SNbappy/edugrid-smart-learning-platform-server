const hasSubmissionAccess = (user, classroom, submission) => {
    // Check if user is instructor
    if (isInstructor(user, classroom)) {
        return true;
    }

    // Check if user is the submitter
    if (submission && submission.studentEmail === user.email) {
        return true;
    }

    return false;
};

const isInstructor = (user, classroom) => {
    if (!user || !user.email || !classroom) {
        return false;
    }

    return (
        classroom.createdBy === user.email ||
        classroom.teachers?.includes(user.email) ||
        classroom.owner === user.email ||
        classroom.instructors?.includes(user.email)
    );
};

const isStudent = (user, classroom) => {
    if (!user || !user.email || !classroom) {
        return false;
    }

    return (
        classroom.students?.includes(user.email) ||
        classroom.enrolledStudents?.includes(user.email)
    );
};

const getUserEmailFromRequest = (req) => {
    // Get user email from various possible sources
    return req.user?.email ||
        req.body.userEmail ||
        req.headers['user-email'] ||
        req.query.userEmail;
};

const canSubmitTask = (user, task, isResubmission = false) => {
    const now = new Date();
    const dueDate = new Date(task.dueDate);

    // Check if task is overdue
    if (now > dueDate) {
        return {
            allowed: false,
            reason: 'Task is overdue'
        };
    }

    // Check if user already submitted
    const existingSubmission = task.submissions?.find(sub => sub.studentEmail === user.email);

    if (existingSubmission && !isResubmission) {
        return {
            allowed: false,
            reason: 'Already submitted. Use resubmit option to update your submission.',
            hasExistingSubmission: true,
            existingSubmission: existingSubmission
        };
    }

    if (existingSubmission && isResubmission) {
        return {
            allowed: true,
            reason: 'Resubmission allowed',
            isResubmission: true,
            existingSubmission: existingSubmission
        };
    }

    return {
        allowed: true,
        reason: 'New submission allowed'
    };
};

const canResubmitTask = (user, task) => {
    const now = new Date();
    const dueDate = new Date(task.dueDate);

    // Check if task is overdue
    if (now > dueDate) {
        return {
            allowed: false,
            reason: 'Cannot resubmit - task is overdue'
        };
    }

    // Check if user has an existing submission
    const existingSubmission = task.submissions?.find(sub => sub.studentEmail === user.email);

    if (!existingSubmission) {
        return {
            allowed: false,
            reason: 'No existing submission found. Submit the task first.'
        };
    }

    // Check if submission is already graded (optional - you might want to allow resubmissions even after grading)
    if (existingSubmission.status === 'graded' && existingSubmission.grade !== null) {
        return {
            allowed: false,
            reason: 'Cannot resubmit - assignment has already been graded',
            isGraded: true
        };
    }

    return {
        allowed: true,
        reason: 'Resubmission allowed',
        existingSubmission: existingSubmission
    };
};

const canGradeSubmission = (user, classroom) => {
    return isInstructor(user, classroom);
};

const filterSubmissionsForUser = (user, classroom, submissions) => {
    if (isInstructor(user, classroom)) {
        // Instructors can see all submissions
        return submissions;
    } else {
        // Students can only see their own submissions
        return submissions.filter(sub => sub.studentEmail === user.email);
    }
};

const getSubmissionStatus = (user, task) => {
    if (!user || !user.email || !task) {
        return {
            hasSubmitted: false,
            canSubmit: false,
            canResubmit: false
        };
    }

    const existingSubmission = task.submissions?.find(sub => sub.studentEmail === user.email);
    const submitCheck = canSubmitTask(user, task, false);
    const resubmitCheck = canResubmitTask(user, task);

    return {
        hasSubmitted: !!existingSubmission,
        canSubmit: submitCheck.allowed,
        canResubmit: resubmitCheck.allowed,
        isOverdue: new Date() > new Date(task.dueDate),
        isGraded: existingSubmission?.status === 'graded' && existingSubmission?.grade !== null,
        existingSubmission: existingSubmission,
        submitReason: submitCheck.reason,
        resubmitReason: resubmitCheck.reason
    };
};

const validateSubmissionData = (submissionData) => {
    const { submissionText, submissionUrl, attachments } = submissionData;

    // Check if at least one form of submission is provided
    if (!submissionText?.trim() && !submissionUrl?.trim() && (!attachments || attachments.length === 0)) {
        return {
            valid: false,
            message: 'Please provide either text, URL, or file attachments for your submission.'
        };
    }

    // Validate submission text length (optional)
    if (submissionText && submissionText.length > 10000) {
        return {
            valid: false,
            message: 'Submission text is too long. Maximum 10,000 characters allowed.'
        };
    }

    // Validate URL format (optional)
    if (submissionUrl && submissionUrl.trim()) {
        try {
            new URL(submissionUrl);
        } catch (error) {
            return {
                valid: false,
                message: 'Please provide a valid URL.'
            };
        }
    }

    return {
        valid: true,
        message: 'Submission data is valid'
    };
};

const getTaskPermissions = (user, classroom, task) => {
    const isUserInstructor = isInstructor(user, classroom);
    const isUserStudent = isStudent(user, classroom);
    const submissionStatus = getSubmissionStatus(user, task);

    return {
        canView: isUserInstructor || isUserStudent,
        canSubmit: isUserStudent && submissionStatus.canSubmit,
        canResubmit: isUserStudent && submissionStatus.canResubmit,
        canGrade: isUserInstructor,
        canViewAllSubmissions: isUserInstructor,
        canViewOwnSubmission: isUserStudent,
        userRole: isUserInstructor ? 'instructor' : (isUserStudent ? 'student' : 'unauthorized'),
        submissionStatus: submissionStatus
    };
};

module.exports = {
    hasSubmissionAccess,
    isInstructor,
    isStudent,
    getUserEmailFromRequest,
    canSubmitTask,
    canResubmitTask, // New function
    canGradeSubmission,
    filterSubmissionsForUser,
    getSubmissionStatus, // New function
    validateSubmissionData, // New function
    getTaskPermissions // New function
};
