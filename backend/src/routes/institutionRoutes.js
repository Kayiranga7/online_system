const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const institutionController = require('../controllers/institutionController');
const { authenticate, authorize, scopeToDistrict } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

router.post(
  '/',
  authenticate,
  authorize('customer'),
  [body('name').trim().notEmpty(), body('type').isIn(['personal', 'business'])],
  handleValidation,
  institutionController.createInstitution
);

router.get('/', authenticate, scopeToDistrict, institutionController.listInstitutions);

router.patch(
  '/:id/review',
  authenticate,
  authorize('admin', 'manager'),
  [body('approve').isBoolean()],
  handleValidation,
  institutionController.approveInstitution
);

module.exports = router;
