const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('../services/auditService');
const { notify } = require('../services/notificationService');
const { sendEmail } = require('../services/emailService');

// ---------------------------------------------------------------------
// POST /api/tasks - Manager creates a task
// ---------------------------------------------------------------------
async function createTask(req, res, next) {
  try {
    const { title, description, taskType, orderId, institutionId, priority, dueDate, assignToEmployeeId } = req.body;

    // Every task must belong to an institution and be handed to an employee
    // up front - a manager cannot leave either blank when creating a task.
    if (!institutionId) throw new AppError('Please select the institution this task is for.', 400);
    if (!assignToEmployeeId) throw new AppError('Please assign this task to an employee.', 400);

    const [instRows] = await pool.query('SELECT * FROM institutions WHERE id = ?', [institutionId]);
    if (!instRows.length) throw new AppError('Institution not found.', 404);
    const institution = instRows[0];
    if (req.user.role === 'manager' && institution.district_id !== req.user.districtId) {
      throw new AppError('You can only create tasks for institutions in your own district.', 403);
    }

    const [empRows] = await pool.query(
      `SELECT u.* FROM users u JOIN employee_profiles ep ON ep.user_id = u.id WHERE u.id = ? AND u.role = 'employee'`,
      [assignToEmployeeId]
    );
    if (!empRows.length) throw new AppError('Employee not found.', 404);
    if (req.user.role === 'manager' && empRows[0].district_id !== req.user.districtId) {
      throw new AppError('You can only assign employees from your own district.', 403);
    }

    const [result] = await pool.query(
      `INSERT INTO tasks (title, description, task_type, order_id, institution_id, priority, due_date, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unassigned')`,
      [title, description || null, taskType || 'other', orderId || null, institutionId, priority || 'medium', dueDate || null, req.user.id]
    );
    const taskId = result.insertId;

    await assignEmployeeToTask(taskId, assignToEmployeeId, req.user.id);

    await recordAudit({ userId: req.user.id, action: 'TASK_CREATED', entityType: 'task', entityId: taskId, req });
    res.status(201).json({ id: taskId, message: 'Task created and assigned successfully.' });
  } catch (err) {
    next(err);
  }
}

async function assignEmployeeToTask(taskId, employeeId, assignedBy) {
  await pool.query('INSERT INTO task_assignments (task_id, employee_id, assigned_by) VALUES (?, ?, ?)', [
    taskId,
    employeeId,
    assignedBy,
  ]);
  await pool.query('UPDATE tasks SET status = ? WHERE id = ?', ['assigned', taskId]);

  const [[task]] = await pool.query('SELECT title FROM tasks WHERE id = ?', [taskId]);
  const [[employee]] = await pool.query('SELECT email, full_name FROM users WHERE id = ?', [employeeId]);

  await notify({
    userId: employeeId,
    category: 'task_assignment',
    title: 'New task assigned',
    message: `You have been assigned: "${task.title}"`,
    relatedEntityType: 'task',
    relatedEntityId: taskId,
    channel: 'both',
    email: { to: employee.email, template: 'task_assigned', payload: { name: employee.full_name, taskTitle: task.title } },
  });
}

// ---------------------------------------------------------------------
// PATCH /api/tasks/:id/assign - Manager assigns/reassigns an employee
// ---------------------------------------------------------------------
async function assignTask(req, res, next) {
  try {
    const { employeeId } = req.body;
    const [taskRows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!taskRows.length) throw new AppError('Task not found.', 404);

    const [empRows] = await pool.query(
      `SELECT u.* FROM users u JOIN employee_profiles ep ON ep.user_id = u.id WHERE u.id = ? AND u.role = 'employee'`,
      [employeeId]
    );
    if (!empRows.length) throw new AppError('Employee not found.', 404);
    if (req.user.role === 'manager' && empRows[0].district_id !== req.user.districtId) {
      throw new AppError('You can only assign employees from your own district.', 403);
    }

    await assignEmployeeToTask(req.params.id, employeeId, req.user.id);
    await recordAudit({ userId: req.user.id, action: 'TASK_ASSIGNED', entityType: 'task', entityId: req.params.id, req, details: { employeeId } });
    res.json({ message: 'Task assigned successfully.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// GET /api/tasks - list (scoped by role)
// ---------------------------------------------------------------------
async function listTasks(req, res, next) {
  try {
    const { status, priority } = req.query;
    const conditions = [];
    const params = [];

    if (req.user.role === 'employee') {
      conditions.push('ta.employee_id = ?');
      params.push(req.user.id);
    } else if (req.user.role === 'manager') {
      conditions.push('u_created.district_id = ?');
      params.push(req.user.districtId);
    }
    if (status) {
      conditions.push('t.status = ?');
      params.push(status);
    }
    if (priority) {
      conditions.push('t.priority = ?');
      params.push(priority);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT DISTINCT t.*, u_created.full_name AS created_by_name,
        (SELECT u2.full_name FROM task_assignments ta2 JOIN users u2 ON u2.id = ta2.employee_id
         WHERE ta2.task_id = t.id ORDER BY ta2.assigned_at DESC LIMIT 1) AS assigned_employee_name
       FROM tasks t
       JOIN users u_created ON u_created.id = t.created_by
       LEFT JOIN task_assignments ta ON ta.task_id = t.id
       ${whereClause} ORDER BY t.created_at DESC`,
      params
    );
    res.json({ tasks: rows });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// PATCH /api/tasks/:id/complete - Employee marks task complete + submits work report
// ---------------------------------------------------------------------
async function completeTask(req, res, next) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { reportText, hoursSpent, photoUrls } = req.body;

    const [assignRows] = await conn.query(
      'SELECT * FROM task_assignments WHERE task_id = ? AND employee_id = ? ORDER BY assigned_at DESC LIMIT 1',
      [req.params.id, req.user.id]
    );
    if (!assignRows.length) throw new AppError('You are not assigned to this task.', 403);

    await conn.query('UPDATE task_assignments SET completed_at = NOW(), completion_notes = ? WHERE id = ?', [
      reportText || null,
      assignRows[0].id,
    ]);
    await conn.query('UPDATE tasks SET status = ? WHERE id = ?', ['completed', req.params.id]);

    const [reportResult] = await conn.query(
      'INSERT INTO work_reports (task_id, employee_id, report_text, hours_spent) VALUES (?, ?, ?, ?)',
      [req.params.id, req.user.id, reportText || null, hoursSpent || null]
    );

    if (Array.isArray(photoUrls)) {
      for (const url of photoUrls) {
        await conn.query('INSERT INTO work_report_photos (work_report_id, photo_url) VALUES (?, ?)', [reportResult.insertId, url]);
      }
    }

    await conn.query('UPDATE employee_profiles SET tasks_completed = tasks_completed + 1 WHERE user_id = ?', [req.user.id]);
    await conn.commit();

    await recordAudit({ userId: req.user.id, action: 'TASK_COMPLETED', entityType: 'task', entityId: req.params.id, req });
    res.json({ message: 'Task marked complete and work report submitted.' });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

module.exports = { createTask, assignTask, listTasks, completeTask };
