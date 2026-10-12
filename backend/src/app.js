const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const { apiLimiter } = require('./middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/api', apiLimiter);
// KYC files are served only through the authenticated KYC download endpoint.
app.use('/uploads', (req, res, next) => {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(req.path).replace(/\\/g, '/');
  } catch {
    return res.sendStatus(400);
  }
  if (/^\/?kyc-documents(?:\/|$)/i.test(decodedPath)) return res.sendStatus(404);
  next();
});
app.use('/uploads', express.static(process.env.UPLOAD_DIR || 'uploads'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/plants', require('./routes/plantRoutes'));
app.use('/api/designs', require('./routes/designRoutes'));
app.use('/api/cart', require('./routes/cartRoutes'));
app.use('/api/wishlist', require('./routes/wishlistRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/institutions', require('./routes/institutionRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));
app.use('/api/equipment', require('./routes/equipmentRoutes'));
app.use('/api/transfers', require('./routes/transferRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/escalations', require('./routes/escalationRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/uploads', require('./routes/uploadRoutes'));
app.use('/api/kyc', require('./routes/kycRoutes'));

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
