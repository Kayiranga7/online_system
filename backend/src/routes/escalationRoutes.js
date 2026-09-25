const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const escalationController = require('../controllers/escalationController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

router.post('/', authenticate, [body('subject').trim().notEmpty()], handleValidation, escalationController.createEscalation);
router.get('/', authenticate, escalationController.listEscalations);
router.patch(
  '/:id',
  authenticate,
  authorize('manager', 'admin'),
  [body('status').isIn(['in_review', 'resolved', 'dismissed'])],
  handleValidation,
  escalationController.resolveEscalation
);

module.exports = router;
