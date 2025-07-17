const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// User Routes
router.post('/', userController.createUser);           // POST /api/users
router.get('/', userController.getAllUsers);          // GET /api/users
router.get('/:email', userController.getUserByEmail); // GET /api/users/:email
router.put('/:email', userController.updateUserProfile); // PUT /api/users/:email

module.exports = router;
