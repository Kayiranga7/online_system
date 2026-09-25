const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const userController = require('../controllers/userController');
const { authenticate, authorize, scopeToDistrict } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

const createAccountValidator = [
  body('fullName').trim().isLength({ min: 2, max: 150 }),
  body('email').isEmail().normalizeEmail(),
  body('phoneNumber').optional().isMobilePhone('any'),
  body('password').isLength({ min: 8 }).matches(/\d/).matches(/[A-Z]/),
];

router.get('/districts', userController.listDistricts);

// Admin: full access. Manager: scoped to own district.
router.get('/', authenticate, authorize('admin', 'manager'), scopeToDistrict, userController.listUsers);

router.post(
  '/managers',
  authenticate,
  authorize('admin'),
  [...createAccountValidator, body('district').isInt({ min: 1 })],
  handleValidation,
  userController.createManager
);

router.post(
  '/employees',
  authenticate,
  authorize('admin', 'manager'),
  [...createAccountValidator, body('district').optional().isInt({ min: 1 }), body('specialty').optional().isString()],
  handleValidation,
  userController.createEmployee
);

router.patch(
  '/:id/status',
  authenticate,
  authorize('admin', 'manager'),
  [body('status').isIn(['active', 'suspended'])],
  handleValidation,
  userController.updateUserStatus
);

module.exports = router;
