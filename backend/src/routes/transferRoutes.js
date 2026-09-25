const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const transferController = require('../controllers/transferController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

router.post(
  '/',
  authenticate,
  authorize('employee'),
  [body('requestType').isIn(['district', 'institution'])],
  handleValidation,
  transferController.createTransferRequest
);
router.get('/', authenticate, authorize('employee', 'manager', 'admin'), transferController.listTransferRequests);
router.get('/:id', authenticate, authorize('employee', 'manager', 'admin'), transferController.getTransferRequest);
router.patch(
  '/:id/review',
  authenticate,
  authorize('manager', 'admin'),
  [body('approve').isBoolean()],
  handleValidation,
  transferController.reviewTransferRequest
);

module.exports = router;
