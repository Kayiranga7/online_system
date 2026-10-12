const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const emailController = require('../controllers/emailController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

// Admin only: these rows contain recipients' addresses and provider errors.
router.get('/', authenticate, authorize('admin'), emailController.listEmails);

// Re-send failed/queued emails. dryRun returns the plan without sending.
router.post(
  '/retry',
  authenticate,
  authorize('admin'),
  [
    body('ids').optional().isArray({ max: 50 }).withMessage('ids must be an array of at most 50 queue ids'),
    body('ids.*').optional().isInt({ min: 1 }).withMessage('ids must be positive integers'),
    body('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit must be between 1 and 50'),
    body('dryRun').optional().isBoolean().withMessage('dryRun must be a boolean'),
  ],
  handleValidation,
  emailController.retryFailed
);

router.post(
  '/:id/retry',
  authenticate,
  authorize('admin'),
  [param('id').isInt({ min: 1 }).withMessage('id must be a positive integer')],
  handleValidation,
  emailController.retryRow
);

module.exports = router;
