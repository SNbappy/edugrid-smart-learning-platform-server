const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken } = require('../middleware/authMiddleware');

// PUBLIC ROUTES (no authentication needed)
router.post('/', userController.createUser); // User registration

// PROTECTED ROUTES (authentication required)
router.use(verifyToken); // Apply to all routes below

router.get('/', userController.getAllUsers);
router.get('/:email', userController.getUserByEmail);
router.put('/:email', userController.updateUserProfile);

module.exports = router;
