const express = require('express');
const router = express.Router();
const tasksController = require('../controllers/classroom/tasksController');

// Task routes
router.get('/classrooms/:classroomId/tasks', tasksController.getTasks);
router.post('/classrooms/:classroomId/tasks', tasksController.createTask);
router.get('/classrooms/:classroomId/tasks/:taskId', tasksController.getTaskById);
router.put('/classrooms/:classroomId/tasks/:taskId', tasksController.updateTask);
router.delete('/classrooms/:classroomId/tasks/:taskId', tasksController.deleteTask);

// Submission routes
router.post('/classrooms/:classroomId/tasks/:taskId/submit', tasksController.submitTask);
router.post('/classrooms/:classroomId/tasks/:taskId/resubmit', tasksController.resubmitTask);
router.get('/classrooms/:classroomId/tasks/:taskId/submissions', tasksController.getTaskSubmissions);
router.get('/classrooms/:classroomId/tasks/:taskId/submissions/:submissionId', tasksController.getSubmissionById);
router.put('/classrooms/:classroomId/tasks/:taskId/submissions/:submissionId/grade', tasksController.gradeSubmission);

// Additional utility routes for better UX
router.get('/classrooms/:classroomId/tasks/:taskId/my-submission', tasksController.getMySubmission);
router.get('/classrooms/:classroomId/tasks/:taskId/submission-status', tasksController.getSubmissionStatus);

module.exports = router;
