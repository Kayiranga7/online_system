const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = require('./app');
const { verifyConnection } = require('./config/database');
const { verifyEmailConfig } = require('./services/emailService');
const { verifyAccessToken } = require('./utils/jwt');
const { attachSocketIO } = require('./services/notificationService');
const logger = require('./config/logger');

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true },
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
