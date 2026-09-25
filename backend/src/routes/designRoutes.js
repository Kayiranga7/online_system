const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const designController = require('../controllers/designController');
const { authenticate, authorize } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

const designValidator = [
  body('name').trim().notEmpty().withMessage('Name is required.'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number.'),
];

router.get('/', designController.listDesigns);
router.get('/:id', designController.getDesign);
router.post('/', authenticate, authorize('admin'), designValidator, handleValidation, designController.createDesign);
router.post('/:id/images', authenticate, authorize('admin'), designController.addDesignImage);
router.put('/:id', authenticate, authorize('admin'), designController.updatePlantDesign);
router.delete('/:id', authenticate, authorize('admin'), designController.deleteDesign);

module.exports = router;
