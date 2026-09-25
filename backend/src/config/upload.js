const multer = require('multer');

// 3D/AR model formats accepted alongside images, for the AR preview feature
// (plant_images.ar_model_url / design_images.ar_model_url).
const subdirs = ['plants', 'designs', 'work-reports', 'avatars', 'models', 'kyc-documents'];

const ALLOWED_MIME = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  model: ['model/gltf-binary', 'model/gltf+json', 'application/octet-stream'], // .glb/.gltf
};

// Memory storage: files are buffered in RAM, then handed to storageService
// (local disk or S3-compatible) by the route handler. This keeps multer
// backend-agnostic - swapping storage backends never touches this file.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 5) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isModelUpload = req.params.category === 'models';
    const allowed = isModelUpload
      ? [...ALLOWED_MIME.model]
      : ALLOWED_MIME.image;
    // .glb files often report as application/octet-stream - also allow by extension for models
    const extOk = isModelUpload && /\.(glb|gltf)$/i.test(file.originalname);
    if (!allowed.includes(file.mimetype) && !extOk) {
      return cb(new Error(isModelUpload
        ? 'Only .glb and .gltf 3D model files are allowed.'
        : 'Only JPEG, PNG, WEBP, and GIF images are allowed.'));
    }
    cb(null, true);
  },
});

module.exports = { upload, subdirs };
