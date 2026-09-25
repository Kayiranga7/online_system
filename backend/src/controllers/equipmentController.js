const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('../services/auditService');

async function listEquipment(req, res, next) {
  try {
    const conditions = [];
    const params = [];
    if (req.districtFilter) {
      conditions.push('e.district_id = ?');
      params.push(req.districtFilter);
    }
    if (req.query.status) {
      conditions.push('e.status = ?');
      params.push(req.query.status);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT e.*, c.name AS category_name, d.name AS district_name FROM equipment e
       LEFT JOIN categories c ON c.id = e.category_id LEFT JOIN districts d ON d.id = e.district_id
       ${whereClause} ORDER BY e.name`,
      params
    );
    res.json({ equipment: rows });
  } catch (err) {
    next(err);
  }
}

async function createEquipment(req, res, next) {
  try {
    const { name, categoryId, serialNumber, districtId, purchaseDate, purchaseCost, conditionNotes } = req.body;
    const [result] = await pool.query(
      `INSERT INTO equipment (name, category_id, serial_number, district_id, purchase_date, purchase_cost, condition_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, categoryId || null, serialNumber || null, districtId || null, purchaseDate || null, purchaseCost || null, conditionNotes || null]
    );
    await recordAudit({ userId: req.user.id, action: 'EQUIPMENT_CREATED', entityType: 'equipment', entityId: result.insertId, req });
    res.status(201).json({ id: result.insertId, message: 'Equipment registered.' });
  } catch (err) {
    next(err);
  }
}

async function checkOutEquipment(req, res, next) {
  try {
    const { equipmentId, employeeId, taskId } = req.body;
    const [equipRows] = await pool.query('SELECT * FROM equipment WHERE id = ? FOR UPDATE', [equipmentId]);
    if (!equipRows.length) throw new AppError('Equipment not found.', 404);
    if (equipRows[0].status !== 'available') throw new AppError('Equipment is not available for checkout.', 400);

    await pool.query('UPDATE equipment SET status = ? WHERE id = ?', ['in_use', equipmentId]);
    const [result] = await pool.query(
      'INSERT INTO equipment_assignments (equipment_id, employee_id, task_id) VALUES (?, ?, ?)',
      [equipmentId, employeeId, taskId || null]
    );

    await recordAudit({ userId: req.user.id, action: 'EQUIPMENT_CHECKED_OUT', entityType: 'equipment', entityId: equipmentId, req });
    res.status(201).json({ assignmentId: result.insertId, message: 'Equipment checked out.' });
  } catch (err) {
    next(err);
  }
}

async function checkInEquipment(req, res, next) {
  try {
    const { conditionOnReturn, newStatus } = req.body; // newStatus: 'available' | 'maintenance' | 'retired'
    const [assignRows] = await pool.query('SELECT * FROM equipment_assignments WHERE id = ?', [req.params.assignmentId]);
    if (!assignRows.length) throw new AppError('Equipment assignment not found.', 404);

    await pool.query('UPDATE equipment_assignments SET checked_in_at = NOW(), condition_on_return = ? WHERE id = ?', [
      conditionOnReturn || null,
      req.params.assignmentId,
    ]);
    await pool.query('UPDATE equipment SET status = ? WHERE id = ?', [newStatus || 'available', assignRows[0].equipment_id]);

    await recordAudit({
      userId: req.user.id,
      action: 'EQUIPMENT_CHECKED_IN',
      entityType: 'equipment',
      entityId: assignRows[0].equipment_id,
      req,
    });
    res.json({ message: 'Equipment checked in.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listEquipment, createEquipment, checkOutEquipment, checkInEquipment };
