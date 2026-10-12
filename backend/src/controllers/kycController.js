const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('../services/auditService');
const { notify, broadcastToRole } = require('../services/notificationService');
const { sendEmail } = require('../services/emailService');
const { saveFile, deleteFile, readFile } = require('../services/storageService');
const path = require('path');

// ------------------------------------------------------------------
// POST /api/kyc/documents — customer submits a KYC document
// ------------------------------------------------------------------
async function submitDocument(req, res, next) {
  try {
    const { documentType } = req.body;

    // Only business customers need KYC
    const [[user]] = await pool.query(
      'SELECT id, full_name, email, institution_type, kyc_status FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) throw new AppError('User not found.', 404);
    if (user.institution_type !== 'business') {
      throw new AppError('KYC is only required for business accounts.', 400);
    }

    if (!req.file) throw new AppError('No document file uploaded.', 400);

    // Save the file via storage service
    const ext = path.extname(req.file.originalname) || '.jpg';
    const filename = `kyc-${req.user.id}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    await saveFile({
      category: 'kyc-documents',
      filename,
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      isPrivate: true,
    });
    // Store the private storage key, never a public URL.
    const documentUrl = `kyc-documents/${filename}`;

    // Insert document record
    const [result] = await pool.query(
      `INSERT INTO kyc_documents (user_id, document_type, document_url, original_filename)
       VALUES (?, ?, ?, ?)`,
      [req.user.id, documentType, documentUrl, req.file.originalname || null]
    );

    // Update user KYC status to 'submitted' if currently 'none' or 'pending'
    if (!user.kyc_status || user.kyc_status === 'none' || user.kyc_status === 'pending' || user.kyc_status === 'rejected') {
      await pool.query("UPDATE users SET kyc_status = 'submitted' WHERE id = ?", [req.user.id]);
    }

    await recordAudit({
      userId: req.user.id,
      action: 'KYC_DOCUMENT_SUBMITTED',
      entityType: 'kyc_document',
      entityId: result.insertId,
      req,
      details: { documentType },
    });

    // Notify admin/manager via WebSocket
    broadcastToRole('admin', 'kyc_submitted', { userId: req.user.id, documentType });
    broadcastToRole('manager', 'kyc_submitted', { userId: req.user.id, documentType });

    // Send confirmation email to the customer
    sendEmail(user.email, 'kyc_submitted', {
      name: user.full_name,
      documentType: documentType.replace(/_/g, ' '),
    }).catch(() => {}); // best-effort, don't block the response

    res.status(201).json({
      document: { id: result.insertId, documentType, documentUrl, status: 'pending' },
      message: 'Document submitted for review.',
    });
  } catch (err) {
    next(err);
  }
}

async function ensureCanManageUser(req, userId) {
  if (req.user.role === 'admin') return;
  const [[manager]] = await pool.query('SELECT district_id FROM users WHERE id = ?', [req.user.id]);
  const [[target]] = await pool.query('SELECT district_id FROM users WHERE id = ?', [userId]);
  if (!manager || !target || manager.district_id == null || manager.district_id !== target.district_id) {
    throw new AppError('User not found.', 404);
  }
}

async function getDocumentFile(req, res, next) {
  try {
    const [[doc]] = await pool.query(
      'SELECT id, user_id, document_url FROM kyc_documents WHERE id = ?',
      [req.params.documentId]
    );
    if (!doc) throw new AppError('Document not found.', 404);
    if (req.user.role === 'customer' && doc.user_id !== req.user.id) {
      throw new AppError('Document not found.', 404);
    }
    if (req.user.role === 'manager') await ensureCanManageUser(req, doc.user_id);
    if (!['customer', 'manager', 'admin'].includes(req.user.role)) {
      throw new AppError('Document not found.', 404);
    }

    const { buffer, contentType } = await readFile(doc.document_url);
    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="kyc-document-${doc.id}"`,
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(buffer);
  } catch (err) {
    if (err.code === 'ENOENT' || err.name === 'NoSuchKey') return next(new AppError('Document file not found.', 404));
    next(err);
  }
}

// ------------------------------------------------------------------
// GET /api/kyc/status — customer checks their own KYC status
// ------------------------------------------------------------------
async function getKycStatus(req, res, next) {
  try {
    const [[user]] = await pool.query(
      'SELECT kyc_status, institution_type FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) throw new AppError('User not found.', 404);

    const [documents] = await pool.query(
      `SELECT id, document_type, status, rejection_reason, created_at, reviewed_at
       FROM kyc_documents WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      kycStatus: user.kyc_status,
      institutionType: user.institution_type,
      documents,
    });
  } catch (err) {
    next(err);
  }
}

// ------------------------------------------------------------------
// GET /api/kyc/pending — admin/manager lists pending submissions
// ------------------------------------------------------------------
async function listPending(req, res, next) {
  try {
    const districtClause = req.user.role === 'admin' ? '' : 'AND u.district_id = ?';
    const params = req.user.role === 'admin' ? [] : [req.user.districtId];
    const [rows] = await pool.query(
      `SELECT u.id AS user_id, u.full_name, u.email, u.institution_type, u.kyc_status,
              u.district_id, d.name AS district_name,
              COUNT(kd.id) AS document_count,
              MIN(kd.created_at) AS submitted_at
       FROM users u
       JOIN kyc_documents kd ON kd.user_id = u.id
       LEFT JOIN districts d ON d.id = u.district_id
       WHERE u.kyc_status = 'submitted' ${districtClause}
       GROUP BY u.id
       ORDER BY submitted_at ASC`,
      params
    );
    res.json({ submissions: rows });
  } catch (err) {
    next(err);
  }
}

// ------------------------------------------------------------------
// GET /api/kyc/user/:userId — admin/manager views a user's documents
// ------------------------------------------------------------------
async function getUserDocuments(req, res, next) {
  try {
    await ensureCanManageUser(req, Number(req.params.userId));
    const [[user]] = await pool.query(
      'SELECT id, full_name, email, institution_type, kyc_status, district_id FROM users WHERE id = ?',
      [req.params.userId]
    );
    if (!user) throw new AppError('User not found.', 404);

    const [documents] = await pool.query(
      `SELECT kd.*, u.full_name AS reviewed_by_name
       FROM kyc_documents kd
       LEFT JOIN users u ON u.id = kd.reviewed_by
       WHERE kd.user_id = ?
       ORDER BY kd.created_at DESC`,
      [req.params.userId]
    );

    res.json({ user, documents });
  } catch (err) {
    next(err);
  }
}

// ------------------------------------------------------------------
// PATCH /api/kyc/review/:documentId — admin/manager approves/rejects a document
// ------------------------------------------------------------------
async function reviewDocument(req, res, next) {
  try {
    const { status, rejectionReason } = req.body; // 'approved' or 'rejected'
    if (!['approved', 'rejected'].includes(status)) {
      throw new AppError('Status must be "approved" or "rejected".', 400);
    }
    if (status === 'rejected' && !rejectionReason) {
      throw new AppError('Rejection reason is required.', 400);
    }

    const [rows] = await pool.query('SELECT * FROM kyc_documents WHERE id = ?', [req.params.documentId]);
    if (!rows.length) throw new AppError('Document not found.', 404);
    const doc = rows[0];
    await ensureCanManageUser(req, doc.user_id);

    // Update the document
    await pool.query(
      `UPDATE kyc_documents SET status = ?, reviewed_by = ?, reviewed_at = NOW(), rejection_reason = ?
       WHERE id = ?`,
      [status, req.user.id, status === 'rejected' ? rejectionReason : null, req.params.documentId]
    );

    // Check if ALL documents for this user are reviewed
    const [allDocs] = await pool.query(
      'SELECT status FROM kyc_documents WHERE user_id = ?',
      [doc.user_id]
    );

    let newKycStatus = null;
    const allReviewed = allDocs.every(d => d.status === 'approved' || d.status === 'rejected');
    const anyRejected = allDocs.some(d => d.status === 'rejected');

    if (allReviewed) {
      newKycStatus = anyRejected ? 'rejected' : 'approved';
    }

    if (newKycStatus) {
      await pool.query('UPDATE users SET kyc_status = ? WHERE id = ?', [newKycStatus, doc.user_id]);
    }

    await recordAudit({
      userId: req.user.id,
      action: `KYC_DOCUMENT_${status.toUpperCase()}`,
      entityType: 'kyc_document',
      entityId: Number(req.params.documentId),
      req,
      details: { documentUserId: doc.user_id, rejectionReason: status === 'rejected' ? rejectionReason : undefined },
    });

    // Notify the customer (in-app + email)
    const [[customer]] = await pool.query(
      'SELECT full_name, email FROM users WHERE id = ?',
      [doc.user_id]
    );

    await notify({
      userId: doc.user_id,
      category: 'system_alert',
      title: `KYC document ${status}`,
      message: status === 'approved'
        ? 'Your KYC document has been approved. You can now place orders as a business account.'
        : `Your KYC document was rejected. Reason: ${rejectionReason}. Please resubmit.`,
      relatedEntityType: 'kyc_document',
      relatedEntityId: Number(req.params.documentId),
    });

    // Send email notification
    if (customer?.email) {
      const emailTemplate = status === 'approved' ? 'kyc_approved' : 'kyc_rejected';
      sendEmail(customer.email, emailTemplate, {
        name: customer.full_name,
        ...(status === 'rejected' ? { reason: rejectionReason } : {}),
      }).catch(() => {}); // best-effort
    }

    res.json({ message: `Document ${status}.`, kycStatus: newKycStatus || 'pending' });
  } catch (err) {
    next(err);
  }
}

module.exports = { submitDocument, getDocumentFile, getKycStatus, listPending, getUserDocuments, reviewDocument };
