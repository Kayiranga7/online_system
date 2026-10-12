import api from '../services/api';

export async function openKycDocument(documentId) {
  const popup = window.open('', '_blank');
  try {
    const { data } = await api.get(`/kyc/documents/${documentId}/file`, { responseType: 'blob' });
    const objectUrl = URL.createObjectURL(data);
    if (popup) {
      popup.location.href = objectUrl;
    } else {
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `kyc-document-${documentId}`;
      link.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    popup?.close();
    throw error;
  }
}
