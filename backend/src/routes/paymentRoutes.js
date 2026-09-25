const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const paymentController = require('../controllers/paymentController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');
const { paymentLimiter } = require('../middleware/rateLimiter');

router.post(
  '/momo/pay',
  authenticate,
  authorize('customer'),
  paymentLimiter,
  [body('orderId').isInt({ min: 1 }), body('phoneNumber').matches(/^(\+250|250|0)[0-9]{9}$/).withMessage('Phone number must be a valid Rwanda number: +250XXXXXXXXX, 250XXXXXXXXX, or 0XXXXXXXXX')],
  handleValidation,
  paymentController.payWithMomo
);

router.get('/momo/status/:referenceId', authenticate, authorize('customer'), paymentController.getMomoStatus);

module.exports = router;
