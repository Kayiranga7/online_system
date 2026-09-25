const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const cartController = require('../controllers/cartController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

router.use(authenticate, authorize('customer'));

router.get('/', cartController.getCart);
router.post(
  '/items',
  [body('itemType').isIn(['plant', 'design']), body('itemId').isInt({ min: 1 }), body('quantity').optional().isInt({ min: 1 })],
  handleValidation,
  cartController.addToCart
);
router.patch('/items/:itemId', [body('quantity').isInt({ min: 1 })], handleValidation, cartController.updateCartItem);
router.delete('/items/:itemId', cartController.removeCartItem);

module.exports = router;
