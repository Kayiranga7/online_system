const { pool } = require('../config/database');
const { sendEmail } = require('./emailService');
const logger = require('../config/logger');

let ioInstance = null;

/** Called once from server.js after socket.io is initialized. */
function attachSocketIO(io) {
  ioInstance = io;
}

/**
 * Creates an in-app notification row and pushes it over WebSocket to the
 * user's room (if connected). Optionally also queues an email.
 *
 * category: one of the notifications.category ENUM values.
 */
async function notify({ userId, category, title, message, relatedEntityType = null, relatedEntityId = null, channel = 'in_app', email = null }) {
  try {
    const [result] = await pool.query(
      `INSERT INTO notifications (user_id, category, title, message, related_entity_type, related_entity_id, channel)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, category, title, message, relatedEntityType, relatedEntityId, channel]
    );

    const notification = {
      id: result.insertId,
      userId,
      category,
      title,
      message,
      relatedEntityType,
      relatedEntityId,
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    if (ioInstance) {
      ioInstance.to(`user:${userId}`).emit('notification', notification);
    }

    if ((channel === 'email' || channel === 'both') && email) {
      await sendEmail(email.to, email.template, email.payload);
    }

    return notification;
  } catch (err) {
    logger.error('notify() failed', { userId, category, error: err.message });
  }
}

/** Broadcasts to every connected user with a given role - used for system alerts. */
function broadcastToRole(role, event, payload) {
  if (ioInstance) {
    ioInstance.to(`role:${role}`).emit(event, payload);
  }
}

module.exports = { attachSocketIO, notify, broadcastToRole };
