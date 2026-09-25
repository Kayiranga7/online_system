const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { upload } = require('../config/upload');
const kycController = require('../controllers/kycController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

// Customer submits a KYC document
router.post(
  '/documents',
  authenticate,
  authorize('customer'),
  upload.single('document'),
  [body('documentType').isIn(['national_id', 'business_license', 'tax_certificate', 'utility_bill', 'other']).withMessage('Invalid document type.')],
  handleValidation,
  kycController.submitDocument
);

// Customer checks their own KYC status
router.get('/status', authenticate, kycController.getKycStatus);

// Admin/Manager lists pending KYC submissions
router.get('/pending', authenticate, authorize('admin', 'manager'), kycController.listPending);

// Admin/Manager views a specific user's KYC documents
router.get('/user/:userId', authenticate, authorize('admin', 'manager'), kycController.getUserDocuments);

// Admin/Manager reviews (approves/rejects) a document
router.patch(
  '/review/:documentId',
  authenticate,
  authorize('admin', 'manager'),
  [body('status').isIn(['approved', 'rejected']).withMessage('Status must be approved or rejected.')],
  handleValidation,
  kycController.reviewDocument
);

module.exports = router;
