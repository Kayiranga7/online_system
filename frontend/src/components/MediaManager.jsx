import { useState } from 'react';
import { Upload, Box, Image as ImageIcon, X } from 'lucide-react';
import api from '../services/api';
import { toast } from './UI';
import styles from './MediaManager.module.css';

/**
 * Lets an Admin attach a primary image and an optional .glb/.gltf AR model
 * to a plant or design. Used from the admin catalogue management screens.
 * Uploads go through /api/uploads/:category, which is backed by
 * storageService (local disk or S3-compatible, configured server-side).
 */
export default function MediaManager({ itemType, itemId, onSaved }) {
  const [imageFile, setImageFile] = useState(null);
  const [modelFile, setModelFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const imagesEndpoint = itemType === 'plant' ? '/plants' : '/designs';

  const handleUpload = async () => {
    if (!imageFile && !modelFile) {
      toast('Choose an image or a 3D model file first.', 'warning');
      return;
    }
    setUploading(true);
    try {
      let imageUrl = null;
      let modelUrl = null;

      if (imageFile) {
        const form = new FormData();
        form.append('image', imageFile);
        const res = await api.post(`/uploads/${itemType === 'plant' ? 'plants' : 'designs'}`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        imageUrl = res.data.url;
      }

      if (modelFile) {
        const form = new FormData();
        form.append('image', modelFile); // field name is generic on the backend regardless of file type
        const res = await api.post('/uploads/models', form, { headers: { 'Content-Type': 'multipart/form-data' } });
        modelUrl = res.data.url;
      }

      await api.post(`${imagesEndpoint}/${itemId}/images`, { imageUrl, arModelUrl: modelUrl, isPrimary: true });

      toast('Media uploaded and attached.', 'success');
      setImageFile(null);
      setModelFile(null);
      onSaved?.({ imageUrl, modelUrl });
    } catch (err) {
      toast(err.response?.data?.error || 'Upload failed.', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.field}>
        <label className={styles.dropLabel}>
          <ImageIcon size={16} />
          {imageFile ? imageFile.name : 'Choose product image (JPEG/PNG/WEBP)'}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
        </label>
        {imageFile && <button className={styles.clearBtn} onClick={() => setImageFile(null)}><X size={14} /></button>}
      </div>

      <div className={styles.field}>
        <label className={styles.dropLabel}>
          <Box size={16} />
          {modelFile ? modelFile.name : 'Choose AR model — .glb or .gltf (optional)'}
          <input type="file" accept=".glb,.gltf" hidden onChange={(e) => setModelFile(e.target.files?.[0] || null)} />
        </label>
        {modelFile && <button className={styles.clearBtn} onClick={() => setModelFile(null)}><X size={14} /></button>}
      </div>

      <button className="btn btn-primary" onClick={handleUpload} disabled={uploading || (!imageFile && !modelFile)}>
        <Upload size={15} /> {uploading ? 'Uploading…' : 'Upload & attach'}
      </button>
      <p className={styles.note}>
        AR models let customers view the {itemType} in 3D / AR on the {itemType} detail page.
        Export from Blender, or use any glTF 2.0 (.glb) asset.
      </p>
    </div>
  );
}
