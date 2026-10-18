const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = require('./app');
const { verifyConnection } = require('./config/database');
const { verifyEmailConfig } = require('./services/emailService');
const { verifyAccessToken } = require('./utils/jwt');
const { attachSocketIO } = require('./services/notificationService');
const { allowedOrigins, corsOrigin } = require('./config/cors');
const { uploadDir, isEphemeralUploadDir } = require('./config/paths');
const logger = require('./config/logger');

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: corsOrigin, credentials: true },
});

// Socket auth: client connects with `auth: { token: accessToken }`.
// On connect, the socket joins a per-user room and a per-role room so
// notificationService can target either individuals or whole roles
// (e.g. broadcasting a fraud alert to every connected Admin).
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required.'));
    const payload = verifyAccessToken(token);
    socket.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
    next(new Error('Invalid or expired token.'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.user.id}`);
  socket.join(`role:${socket.user.role}`);
  logger.info(`Socket connected: user ${socket.user.id} (${socket.user.role})`);

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: user ${socket.user.id}`);
  });
});

attachSocketIO(io);

async function start() {
  try {
    await verifyConnection();
    await verifyEmailConfig();
    server.listen(PORT, () => {
      logger.info(`IMIZI backend listening on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);

      // Misconfigured cookies and CORS are invisible in the logs but show up as
      // "logged out after every reload" and "blocked by CORS policy" in the
      // browser, so state the effective settings at boot.
      const sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
      const secure = process.env.COOKIE_SECURE
        ? process.env.COOKIE_SECURE === 'true'
        : process.env.NODE_ENV === 'production';
      logger.info(`Refresh cookie: sameSite=${sameSite} secure=${secure}`);
      if (sameSite === 'none' && !secure) {
        logger.warn('COOKIE_SAMESITE=none requires COOKIE_SECURE=true; browsers will reject the refresh cookie.');
      }
      logger.info(`CORS allowed origins: ${allowedOrigins().join(', ')}`);
      if (!process.env.S3_BUCKET) {
        logger.info(`[storage] Uploads directory: ${uploadDir()}`);
        if (isEphemeralUploadDir()) {
          logger.warn('[storage] Uploads are on the container filesystem: they disappear on the next deploy. Attach a volume (UPLOAD_DIR / RAILWAY_VOLUME_MOUNT_PATH) or set S3_BUCKET.');
        }
      }
    });
  } catch (err) {
    logger.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});
