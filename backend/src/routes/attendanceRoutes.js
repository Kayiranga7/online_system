const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const attendanceController = require('../controllers/attendanceController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

router.post(
  '/shifts',
  authenticate,
  authorize('manager', 'admin'),
  [body('employeeId').isInt({ min: 1 }), body('shiftDate').isISO8601(), body('startTime').notEmpty(), body('endTime').notEmpty()],
  handleValidation,
  attendanceController.createShift
);
router.get('/shifts', authenticate, authorize('manager', 'employee', 'admin'), attendanceController.listShifts);
router.post('/check-in', authenticate, authorize('employee'), attendanceController.checkIn);
router.patch('/check-out/:attendanceId', authenticate, authorize('employee'), attendanceController.checkOut);

module.exports = router;
