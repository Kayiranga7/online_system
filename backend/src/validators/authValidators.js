const { body } = require('express-validator');

const registerValidator = [
  body('fullName').trim().isLength({ min: 2, max: 150 }).withMessage('Full name is required.'),
  body('email').isEmail().normalizeEmail().withMessage('A valid email is required.'),
  body('phoneNumber').optional().isMobilePhone('any').withMessage('Invalid phone number.'),
  body('dateOfBirth').isISO8601().toDate().withMessage('A valid date of birth is required.'),
  body('district').isInt({ min: 1 }).withMessage('District is required.'),
  body('institutionType').isIn(['personal', 'business']).withMessage('Institution type must be personal or business.'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters.')
    .matches(/\d/)
    .withMessage('Password must contain a number.')
    .matches(/[A-Z]/)
    .withMessage('Password must contain an uppercase letter.'),
];

const loginValidator = [
  body('email').isEmail().normalizeEmail().withMessage('A valid email is required.'),
  body('password').notEmpty().withMessage('Password is required.'),
  body('twoFactorCode').optional().isLength({ min: 6, max: 6 }),
];

const forgotPasswordValidator = [body('email').isEmail().normalizeEmail()];

const resetPasswordValidator = [
  body('token').notEmpty(),
  body('newPassword')
    .isLength({ min: 8 })
    .matches(/\d/)
    .matches(/[A-Z]/)
    .withMessage('Password must be at least 8 characters with an uppercase letter and a number.'),
];

const updateProfileValidator = [
  // All fields optional: the language switcher PATCHes { language } alone,
  // while the profile form PATCHes the full set.
  body('fullName').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 150 }).withMessage('Full name is required.'),
  body('phoneNumber').optional({ checkFalsy: true }).isMobilePhone('any').withMessage('Invalid phone number.'),
  body('language').optional().isIn(['en', 'rw', 'fr']).withMessage('Unsupported language.'),
];

const updatePasswordValidator = [
  body('currentPassword').notEmpty().withMessage('Current password is required.'),
  body('newPassword')
    .isLength({ min: 8 })
    .matches(/\d/)
    .matches(/[A-Z]/)
    .withMessage('New password must be at least 8 characters with an uppercase letter and a number.'),
];

const googleLoginValidator = [
  body('idToken').notEmpty().withMessage('Google ID token is required.'),
  body('district').optional().isInt({ min: 1 }),
  body('institutionType').optional().isIn(['personal', 'business']),
];

const auth0LoginValidator = [
  body('accessToken').isString().notEmpty().withMessage('Auth0 access token is required.'),
  body('district').optional().isInt({ min: 1 }),
  body('institutionType').optional().isIn(['personal', 'business']),
  body('twoFactorCode').optional().isLength({ min: 6, max: 6 }),
];

module.exports = {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  updateProfileValidator,
  updatePasswordValidator,
  googleLoginValidator,
  auth0LoginValidator,
};
