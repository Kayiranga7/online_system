const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const plantController = require('../controllers/plantController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

const plantValidator = [
  body('name').trim().notEmpty().withMessage('Name is required.'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number.'),
  body('sunlightNeeds').optional().isIn(['full_sun', 'partial_shade', 'full_shade']),
  body('waterNeeds').optional().isIn(['low', 'medium', 'high']),
];

router.get('/', plantController.listPlants);
router.get('/recommendations', authenticate, authorize('customer'), plantController.getRecommendations);
router.post('/preferences', authenticate, authorize('customer'), plantController.savePreferences);
router.get('/:id', plantController.getPlant);

router.post('/', authenticate, authorize('admin'), plantValidator, handleValidation, plantController.createPlant);
router.post('/:id/images', authenticate, authorize('admin'), plantController.addPlantImage);
router.put('/:id', authenticate, authorize('admin'), plantController.updatePlant);
router.delete('/:id', authenticate, authorize('admin'), plantController.deletePlant);

module.exports = router;
