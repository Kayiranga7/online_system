const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const equipmentController = require('../controllers/equipmentController');
const { authenticate, authorize, scopeToDistrict } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

router.get('/', authenticate, authorize('manager', 'employee', 'admin'), scopeToDistrict, equipmentController.listEquipment);
router.post(
  '/',
  authenticate,
  authorize('manager', 'admin'),
  [body('name').trim().notEmpty()],
  handleValidation,
  equipmentController.createEquipment
);
router.post(
  '/checkout',
  authenticate,
  authorize('manager', 'admin'),
  [body('equipmentId').isInt({ min: 1 }), body('employeeId').isInt({ min: 1 })],
  handleValidation,
  equipmentController.checkOutEquipment
);
router.patch('/checkin/:assignmentId', authenticate, authorize('manager', 'admin'), equipmentController.checkInEquipment);

module.exports = router;
