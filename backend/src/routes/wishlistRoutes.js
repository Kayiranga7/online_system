const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const wishlistController = require('../controllers/wishlistController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

router.use(authenticate, authorize('customer'));

router.get('/', wishlistController.getWishlist);
router.post('/', [body('itemType').isIn(['plant', 'design']), body('itemId').isInt({ min: 1 })], handleValidation, wishlistController.addToWishlist);
router.delete('/:id', wishlistController.removeFromWishlist);

module.exports = router;
