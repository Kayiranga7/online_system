const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');
const {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  updateProfileValidator,
  updatePasswordValidator,
  googleLoginValidator,
  auth0LoginValidator,
} = require('../validators/authValidators');

router.post('/register', authLimiter, registerValidator, handleValidation, authController.register);
router.get('/verify-email', authController.verifyEmail);
router.post('/resend-verification', authLimiter, forgotPasswordValidator, handleValidation, authController.resendVerificationEmail);
router.post('/login', authLimiter, loginValidator, handleValidation, authController.login);
router.post('/google', authLimiter, googleLoginValidator, handleValidation, authController.googleLogin);
router.post('/auth0', authLimiter, auth0LoginValidator, handleValidation, authController.auth0Login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/forgot-password', authLimiter, forgotPasswordValidator, handleValidation, authController.forgotPassword);
router.post('/reset-password', authLimiter, resetPasswordValidator, handleValidation, authController.resetPassword);

router.get('/me', authenticate, authController.me);
router.patch('/me', authenticate, updateProfileValidator, handleValidation, authController.updateMe);
router.patch('/update-password', authenticate, updatePasswordValidator, handleValidation, authController.updatePassword);
router.post('/2fa/setup', authenticate, authController.setupTwoFactor);
router.post('/2fa/enable', authenticate, authController.enableTwoFactor);
router.post('/2fa/disable', authenticate, authController.disableTwoFactor);

module.exports = router;
