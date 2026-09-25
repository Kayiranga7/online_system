const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const orderController = require('../controllers/orderController');
const { authenticate, authorize, requireActiveAccount } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

router.post(
  '/',
  authenticate,
  authorize('customer'),
  requireActiveAccount,
  [body('deliveryAddress').trim().notEmpty().withMessage('Delivery address is required.')],
  handleValidation,
  orderController.createOrder
);

router.get('/', authenticate, authorize('customer', 'manager', 'admin'), orderController.listOrders);
router.get('/:id', authenticate, orderController.getOrder);
router.post('/:id/cancel', authenticate, orderController.cancelOrder);
router.patch(
  '/:id/status',
  authenticate,
  authorize('manager', 'employee', 'admin'),
  [body('status').notEmpty()],
  handleValidation,
  orderController.updateOrderStatus
);

module.exports = router;
