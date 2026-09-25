const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const reviewController = require('../controllers/reviewController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

router.post(
  '/',
  authenticate,
  authorize('customer'),
  [body('itemType').isIn(['plant', 'design']), body('itemId').isInt({ min: 1 }), body('rating').isInt({ min: 1, max: 5 })],
  handleValidation,
  reviewController.createReview
);
router.delete('/:id', authenticate, authorize('customer', 'admin'), reviewController.deleteReview);

module.exports = router;
