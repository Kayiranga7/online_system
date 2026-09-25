import { useState, useEffect } from 'react';
import { ShieldCheck, Upload, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from '../components/UI';

const DOC_TYPES = [
  { value: 'national_id', label: 'National ID' },
  { value: 'business_license', label: 'Business License' },
  { value: 'tax_certificate', label: 'Tax Certificate' },
  { value: 'utility_bill', label: 'Utility Bill (proof of address)' },
  { value: 'other', label: 'Other Supporting Document' },
];

const STATUS_CONFIG = {
  none: { color: 'var(--color-charcoal-soft)', icon: AlertTriangle, label: 'Not Started', desc: 'Submit your documents to verify your business account.' },
  pending: { color: 'var(--color-amber, #f59e0b)', icon: Loader2, label: 'Pending', desc: 'Documents submitted. Awaiting review.' },
  submitted: { color: 'var(--color-amber, #f59e0b)', icon: Loader2, label: 'Under Review', desc: 'Your documents are being reviewed by our team.' },
  approved: { color: 'var(--color-success, #10b981)', icon: CheckCircle, label: 'Approved', desc: 'Your business account is verified. You can place orders.' },
  rejected: { color: 'var(--color-danger, #ef4444)', icon: XCircle, label: 'Rejected', desc: 'One or more documents were rejected. Please review and resubmit.' },
};

const STATUS_ICONS = { pending: Loader2, submitted: Loader2, approved: CheckCircle, rejected: XCircle };

export default function KycPage() {
  const { user } = useAuth();
  const [kycStatus, setKycStatus] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [docType, setDocType] = useState('national_id');
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');

  useEffect(() => { fetchKyc(); }, []);

  const fetchKyc = async () => {
    try {
      const { data } = await api.get('/kyc/status');
      setKycStatus(data.kycStatus);
      setDocuments(data.documents || []);
    } catch {
      toast('Failed to load KYC status.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { toast('Please select a document file.', 'error'); return; }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('documentType', docType);
      await api.post('/kyc/documents', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast('Document submitted successfully!', 'success');
      setFile(null);
      setFileName('');
      await fetchKyc();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to submit document.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setFileName(f.name); }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Loader2 size={24} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--color-terracotta)' }} />
      </div>
    );
  }

  if (user?.institutionType !== 'business') {
    return (
      <div className="container" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <ShieldCheck size={48} style={{ color: 'var(--color-terracotta)', marginBottom: '1rem' }} />
        <h2>KYC Verification</h2>
        <p style={{ color: 'var(--color-charcoal-soft)' }}>KYC verification is only required for business accounts. Your account is set up as a personal garden account.</p>
      </div>
    );
  }

  const statusInfo = STATUS_CONFIG[kycStatus] || STATUS_CONFIG.none;
  const StatusIcon = STATUS_ICONS[kycStatus] || AlertTriangle;
  const canSubmit = !kycStatus || kycStatus === 'none' || kycStatus === 'rejected';

  return (
    <div className="container" style={{ padding: '2rem 1rem', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <ShieldCheck size={28} color="var(--color-terracotta)" />
        <h1 style={{ margin: 0 }}>KYC Verification</h1>
      </div>

      {/* Status banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '1rem 1.25rem', borderRadius: 'var(--radius)',
        background: 'var(--color-sand-light, #fef3c7)', marginBottom: '1.5rem',
        border: `1px solid ${statusInfo.color}33`,
      }}>
        <StatusIcon size={20} color={statusInfo.color} style={kycStatus === 'submitted' || kycStatus === 'pending' ? { animation: 'spin 0.8s linear infinite' } : {}} />
        <div>
          <div style={{ fontWeight: 600 }}>{statusInfo.label}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-charcoal-soft)' }}>{statusInfo.desc}</div>
        </div>
      </div>

      {/* Submit new document form */}
      {canSubmit && (
        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Upload Document</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label className="label">Document Type</label>
              <select className="input" value={docType} onChange={(e) => setDocType(e.target.value)}>
                {DOC_TYPES.map((dt) => (
                  <option key={dt.value} value={dt.value}>{dt.label}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label className="label">Document File</label>
              <label style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.75rem 1rem', borderRadius: 'var(--radius)',
                border: '2px dashed var(--color-charcoal-light, #d1d5db)',
                cursor: 'pointer', background: 'var(--color-cream)',
                transition: 'border-color 0.2s',
              }}>
                <Upload size={18} color="var(--color-charcoal-soft)" />
                <span style={{ color: fileName ? 'var(--color-charcoal)' : 'var(--color-charcoal-soft)' }}>
                  {fileName || 'Choose a file (JPEG, PNG, PDF)…'}
                </span>
                <input type="file" accept="image/*,.pdf" onChange={onFileChange} style={{ display: 'none' }} />
              </label>
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={submitting || !file}>
              {submitting ? 'Uploading…' : 'Submit Document'}
            </button>
          </form>
        </div>
      )}

      {/* Document history */}
      {documents.length > 0 && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Submitted Documents</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {documents.map((doc) => {
              const docStatusColors = { pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444' };
              const DocStatusIcon = STATUS_ICONS[doc.status] || AlertTriangle;
              return (
                <div key={doc.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  padding: '0.75rem 1rem', borderRadius: 'var(--radius)',
                  border: '1px solid var(--color-charcoal-light, #e5e7eb)',
                }}>
                  <DocStatusIcon size={18} color={docStatusColors[doc.status]} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                      {DOC_TYPES.find((d) => d.value === doc.document_type)?.label || doc.document_type}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-charcoal-soft)' }}>
                      Submitted {new Date(doc.created_at).toLocaleDateString()}
                      {doc.reviewed_at && ` · Reviewed ${new Date(doc.reviewed_at).toLocaleDateString()}`}
                    </div>
                    {doc.rejection_reason && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-danger, #ef4444)', marginTop: 4 }}>
                        Reason: {doc.rejection_reason}
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize',
                    padding: '0.15rem 0.5rem', borderRadius: 'var(--radius)',
                    background: `${docStatusColors[doc.status]}15`, color: docStatusColors[doc.status],
                  }}>
                    {doc.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
