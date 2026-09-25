const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

function publicNotification(row) {
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category,
    title: row.title,
    message: row.message,
    relatedEntityType: row.related_entity_type,
    relatedEntityId: row.related_entity_id,
    isRead: !!row.is_read,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

async function listNotifications(req, res, next) {
  try {
    const { unreadOnly, page = 1, limit = 20 } = req.query;
    const conditions = ['user_id = ?'];
    const params = [req.user.id];
    if (unreadOnly === 'true') conditions.push('is_read = FALSE');

    const offset = (Number(page) - 1) * Number(limit);
    const [rows] = await pool.query(
      `SELECT * FROM notifications WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );
    const [[{ unreadCount }]] = await pool.query(
      'SELECT COUNT(*) AS unreadCount FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [req.user.id]
    );

    res.json({ notifications: rows.map(publicNotification), unreadCount });
  } catch (err) {
    next(err);
  }
}

async function getNotification(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM notifications WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    if (!rows.length) throw new AppError('Notification not found.', 404);
    res.json({ notification: publicNotification(rows[0]) });
  } catch (err) {
    next(err);
  }
}

async function markAsRead(req, res, next) {
  try {
    await pool.query('UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    res.json({ message: 'Notification marked as read.' });
  } catch (err) {
    next(err);
  }
}

async function markAllAsRead(req, res, next) {
  try {
    await pool.query('UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE user_id = ? AND is_read = FALSE', [req.user.id]);
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listNotifications, getNotification, markAsRead, markAllAsRead };
