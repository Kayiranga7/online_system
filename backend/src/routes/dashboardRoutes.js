const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, dashboardController.getDashboard);

module.exports = router;
