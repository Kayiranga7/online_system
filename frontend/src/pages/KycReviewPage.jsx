import { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle, XCircle, Eye, Loader2, ArrowLeft } from 'lucide-react';
import api from '../services/api';
import { toast } from '../components/UI';
import { openKycDocument } from '../utils/kycDocuments';

const DOC_TYPES = {
  national_id: 'National ID',
  business_license: 'Business License',
  tax_certificate: 'Tax Certificate',
  utility_bill: 'Utility Bill',
  other: 'Other',
};

const STATUS_COLORS = { pending: 'var(--color-warning)', approved: 'var(--color-success)', rejected: 'var(--color-danger)' };

export default function KycReviewPage() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDocs, setUserDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => { fetchPending(); }, []);

  const fetchPending = async () => {
    try {
      const { data } = await api.get('/kyc/pending');
      setSubmissions(data.submissions || []);
    } catch {
      toast('Failed to load pending submissions.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const viewUser = async (userId) => {
    setDocsLoading(true);
    setSelectedUser(userId);
    setRejectReason('');
    try {
      const { data } = await api.get(`/kyc/user/${userId}`);
      setUserDocs(data.documents || []);
    } catch {
      toast('Failed to load user documents.', 'error');
    } finally {
      setDocsLoading(false);
    }
  };

  const reviewDoc = async (docId, status) => {
    if (status === 'rejected' && !rejectReason.trim()) {
      toast('Please provide a rejection reason.', 'error');
      return;
    }
    setReviewing(docId);
    try {
      await api.patch(`/kyc/review/${docId}`, {
        status,
        ...(status === 'rejected' ? { rejectionReason: rejectReason.trim() } : {}),
      });
      toast(`Document ${status}.`, 'success');
      setRejectReason('');
      // Refresh user docs and pending list
      if (selectedUser) await viewUser(selectedUser);
      await fetchPending();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to review document.', 'error');
    } finally {
      setReviewing(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Loader2 size={24} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--accent-strong)' }} />
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '2rem 1rem', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <ShieldCheck size={28} color="var(--accent-strong)" />
        <h1 style={{ margin: 0 }}>KYC Review</h1>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-charcoal-soft)', marginLeft: 'auto' }}>
          {submissions.length} pending submission{submissions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {submissions.length === 0 && !selectedUser && (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <CheckCircle size={48} color="var(--color-success, #10b981)" />
          <h3 style={{ marginTop: '1rem' }}>All caught up</h3>
          <p style={{ color: 'var(--color-charcoal-soft)' }}>No pending KYC submissions to review.</p>
        </div>
      )}

      {/* User list */}
      {submissions.length > 0 && !selectedUser && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Pending Submissions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {submissions.map((sub) => (
              <div key={sub.user_id} style={{
                display: 'flex', alignItems: 'center', gap: '1rem',
                padding: '0.75rem 1rem', borderRadius: 'var(--radius)',
                border: '1px solid var(--color-charcoal-light, #e5e7eb)',
                cursor: 'pointer', transition: 'background 0.15s',
              }}
                onClick={() => viewUser(sub.user_id)}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-sand-light, #fef3c7)'}
                onMouseLeave={(e) => e.currentTarget.style.background = ''}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{sub.full_name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-charcoal-soft)' }}>
                    {sub.email} · {sub.district_name || '—'} · {sub.document_count} document{sub.document_count !== 1 ? 's' : ''}
                  </div>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-soft)' }}>
                  {new Date(sub.submitted_at).toLocaleDateString()}
                </span>
                <Eye size={16} color="var(--color-charcoal-soft)" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Document detail view */}
      {selectedUser && (
        <div>
          <button
            onClick={() => { setSelectedUser(null); setUserDocs([]); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--accent-strong)', marginBottom: '1rem',
              fontSize: '0.9rem', fontWeight: 500,
            }}
          >
            <ArrowLeft size={16} /> Back to submissions
          </button>

          {docsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--accent-strong)' }} />
            </div>
          ) : (
            <div className="card" style={{ padding: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem' }}>Documents</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {userDocs.map((doc) => (
                  <div key={doc.id} style={{
                    padding: '1rem', borderRadius: 'var(--radius)',
                    border: '1px solid var(--color-charcoal-light, #e5e7eb)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{DOC_TYPES[doc.document_type] || doc.document_type}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-charcoal-soft)' }}>
                          {doc.original_filename || 'Document'} · Submitted {new Date(doc.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize',
                        padding: '0.15rem 0.5rem', borderRadius: 'var(--radius)',
                        background: `${STATUS_COLORS[doc.status]}15`, color: STATUS_COLORS[doc.status],
                      }}>
                        {doc.status}
                      </span>
                    </div>

                    {/* Document preview */}
                    <button type="button" onClick={() => openKycDocument(doc.id).catch(() => toast('Could not open this document.', 'error'))}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                        fontSize: '0.85rem', color: 'var(--accent-strong)',
                        textDecoration: 'none', marginBottom: '0.75rem', border: 0, background: 'transparent', cursor: 'pointer',
                      }}
                    >
                      <Eye size={14} /> View document
                    </button>

                    {/* Rejection reason from prior review */}
                    {doc.rejection_reason && (
                      <div style={{
                        fontSize: '0.8rem', color: 'var(--color-danger, #ef4444)',
                        padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)',
                        background: 'var(--tile-red-soft, #fef2f2)', marginBottom: '0.75rem',
                      }}>
                        Rejected: {doc.rejection_reason}
                      </div>
                    )}

                    {/* Review actions (only for pending docs) */}
                    {doc.status === 'pending' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="btn btn-primary"
                            style={{ flex: 1 }}
                            onClick={() => reviewDoc(doc.id, 'approved')}
                            disabled={!!reviewing}
                          >
                            <CheckCircle size={14} style={{ marginRight: 4 }} /> Approve
                          </button>
                          <button
                            className="btn btn-outline"
                            style={{ flex: 1, color: 'var(--color-danger, #ef4444)', borderColor: 'var(--color-danger, #ef4444)' }}
                            onClick={() => {
                              if (!rejectReason.trim()) {
                                toast('Enter a rejection reason above first.', 'error');
                                return;
                              }
                              reviewDoc(doc.id, 'rejected');
                            }}
                            disabled={!!reviewing}
                          >
                            <XCircle size={14} style={{ marginRight: 4 }} /> Reject
                          </button>
                        </div>
                        <input
                          className="input"
                          placeholder="Rejection reason (required for reject)…"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
