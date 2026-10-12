const express = require('express');
const path = require('path');
const router = express.Router();
const { upload, subdirs } = require('../config/upload');
const { saveFile } = require('../services/storageService');
const { authenticate, authorize } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

// POST /api/uploads/:category  (category one of: plants, designs, work-reports, avatars, models)
// Files are saved via storageService, which transparently uses S3-compatible
// object storage when configured, or local disk otherwise (see storageService.js).
router.post('/:category', authenticate, authorize('admin', 'manager', 'employee', 'customer'), (req, res, next) => {
  if (!subdirs.includes(req.params.category)) {
    return next(new AppError(`Invalid upload category. Use one of: ${subdirs.join(', ')}`, 400));
  }
  const permittedRoles = {
    plants: ['admin'],
    designs: ['admin'],
    models: ['admin'],
    'work-reports': ['employee', 'manager', 'admin'],
    avatars: ['admin', 'manager', 'employee', 'customer'],
  }[req.params.category];
  if (!permittedRoles.includes(req.user.role)) {
    return next(new AppError('You do not have permission to upload to this category.', 403));
  }
  upload.single('image')(req, res, async (err) => {
    if (err) return next(new AppError(err.message, 400));
    if (!req.file) return next(new AppError('No file uploaded.', 400));

    try {
      const ext = path.extname(req.file.originalname) || '';
      const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      const url = await saveFile({
        category: req.params.category,
        filename,
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
      });
      res.status(201).json({ url });
    } catch (storageErr) {
      next(new AppError(`File storage failed: ${storageErr.message}`, 502));
    }
  });
});

module.exports = router;
