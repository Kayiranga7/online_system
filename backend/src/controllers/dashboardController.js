const { pool } = require('../config/database');

// ---------------------------------------------------------------------
// GET /api/dashboard - returns role-appropriate summary stats
// ---------------------------------------------------------------------
async function getDashboard(req, res, next) {
  try {
    if (req.user.role === 'admin') {
      const [[users]] = await pool.query(`SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL`);
      const [[orders]] = await pool.query(`SELECT COUNT(*) AS total, SUM(total_amount) AS revenue FROM orders WHERE status NOT IN ('cancelled','pending_payment')`);
      const [[pendingInstitutions]] = await pool.query(`SELECT COUNT(*) AS total FROM institutions WHERE status = 'pending_approval'`);
      const [[flaggedPayments]] = await pool.query(`SELECT COUNT(*) AS total FROM payments WHERE flagged_for_review = TRUE`);
      const [recentOrders] = await pool.query(
        `SELECT o.id, o.order_number, o.status, o.total_amount, u.full_name AS customer_name, o.created_at
         FROM orders o JOIN users u ON u.id = o.customer_id ORDER BY o.created_at DESC LIMIT 5`
      );
      const [byDistrict] = await pool.query(
        `SELECT d.name, COUNT(o.id) AS orderCount FROM districts d LEFT JOIN orders o ON o.district_id = d.id
         GROUP BY d.id ORDER BY orderCount DESC`
      );

      return res.json({
        role: 'admin',
        stats: { totalUsers: users.total, totalOrders: orders.total, totalRevenue: orders.revenue || 0, pendingInstitutions: pendingInstitutions.total, flaggedPayments: flaggedPayments.total },
        recentOrders,
        ordersByDistrict: byDistrict,
      });
    }

    if (req.user.role === 'manager') {
      const [[orders]] = await pool.query(
        `SELECT COUNT(*) AS total FROM orders WHERE district_id = ? AND status NOT IN ('cancelled','pending_payment')`,
        [req.user.districtId]
      );
      const [[pendingTasks]] = await pool.query(
        `SELECT COUNT(*) AS total FROM tasks t JOIN users u ON u.id = t.created_by WHERE u.district_id = ? AND t.status = 'unassigned'`,
        [req.user.districtId]
      );
      const [[employees]] = await pool.query(
        `SELECT COUNT(*) AS total FROM users WHERE role = 'employee' AND district_id = ? AND status = 'active'`,
        [req.user.districtId]
      );
      const [[pendingTransfers]] = await pool.query(
        `SELECT COUNT(*) AS total FROM transfer_requests WHERE current_district_id = ? AND status = 'pending'`,
        [req.user.districtId]
      );
      const [recentOrders] = await pool.query(
        `SELECT o.id, o.order_number, o.status, o.total_amount, u.full_name AS customer_name FROM orders o
         JOIN users u ON u.id = o.customer_id WHERE o.district_id = ? ORDER BY o.created_at DESC LIMIT 5`,
        [req.user.districtId]
      );

      return res.json({
        role: 'manager',
        stats: { districtOrders: orders.total, pendingTasks: pendingTasks.total, activeEmployees: employees.total, pendingTransfers: pendingTransfers.total },
        recentOrders,
      });
    }

    if (req.user.role === 'employee') {
      const [[tasks]] = await pool.query(
        `SELECT COUNT(*) AS total FROM task_assignments WHERE employee_id = ? AND completed_at IS NULL`,
        [req.user.id]
      );
      const [[completed]] = await pool.query(`SELECT tasks_completed, rating FROM employee_profiles WHERE user_id = ?`, [req.user.id]);
      const [myTasks] = await pool.query(
        `SELECT t.* FROM tasks t JOIN task_assignments ta ON ta.task_id = t.id
         WHERE ta.employee_id = ? AND ta.completed_at IS NULL ORDER BY t.due_date ASC LIMIT 5`,
        [req.user.id]
      );

      return res.json({
        role: 'employee',
        stats: { activeTasks: tasks.total, tasksCompleted: completed?.tasks_completed || 0, rating: completed?.rating || 0 },
        upcomingTasks: myTasks,
      });
    }

    // customer
    const [[orders]] = await pool.query(`SELECT COUNT(*) AS total FROM orders WHERE customer_id = ?`, [req.user.id]);
    const [[wishlist]] = await pool.query(`SELECT COUNT(*) AS total FROM wishlists WHERE user_id = ?`, [req.user.id]);
    const [recentOrders] = await pool.query(
      `SELECT id, order_number, status, total_amount, created_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 5`,
      [req.user.id]
    );

    res.json({
      role: 'customer',
      stats: { totalOrders: orders.total, wishlistItems: wishlist.total },
      recentOrders,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboard };
