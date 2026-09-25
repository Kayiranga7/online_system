const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const taskController = require('../controllers/taskController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

router.post(
  '/',
  authenticate,
  authorize('manager', 'admin'),
  [
    body('title').trim().notEmpty(),
    body('institutionId').isInt({ min: 1 }).withMessage('An institution is required.'),
    body('assignToEmployeeId').isInt({ min: 1 }).withMessage('An assigned employee is required.'),
  ],
  handleValidation,
  taskController.createTask
);
router.get('/', authenticate, authorize('manager', 'employee', 'admin'), taskController.listTasks);
router.patch(
  '/:id/assign',
  authenticate,
  authorize('manager', 'admin'),
  [body('employeeId').isInt({ min: 1 })],
  handleValidation,
  taskController.assignTask
);
router.patch('/:id/complete', authenticate, authorize('employee'), taskController.completeTask);

module.exports = router;
