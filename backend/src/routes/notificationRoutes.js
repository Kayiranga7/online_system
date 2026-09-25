const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, notificationController.listNotifications);
router.get('/:id', authenticate, notificationController.getNotification);
router.patch('/:id/read', authenticate, notificationController.markAsRead);
router.patch('/read-all', authenticate, notificationController.markAllAsRead);

module.exports = router;
