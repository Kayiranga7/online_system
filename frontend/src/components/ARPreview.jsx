import { useState } from 'react';
import { View, Smartphone, X } from 'lucide-react';
import { assetUrl } from '../services/config';
import styles from './ARPreview.module.css';

/**
 * Renders an interactive 3D / AR preview for a plant or design, using
 * Google's <model-viewer> web component (free, open-source, no API keys).
 *
 * - Desktop: shows an orbit-controllable 3D viewer inline.
 * - Mobile (iOS Quick Look / Android Scene Viewer): the "View in your space"
 *   button launches the OS-level AR experience automatically - model-viewer
 *   handles the USDZ/glTF handoff, no extra code needed here.
 *
 * The <model-viewer> custom element registration (~700KB) is dynamically
 * imported only when a user actually opens the AR panel, since most catalog
 * items won't have a model and most page loads never touch this component.
 *
 * Renders nothing if the item has no ar_model_url - AR is opt-in per item,
 * not a requirement for every catalogue entry.
 */
export default function ARPreview({ modelUrl, posterUrl, name }) {
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState(false);

  if (!modelUrl) return null;

  const openViewer = async () => {
    if (!ready) {
      await import('@google/model-viewer');
      setReady(true);
    }
    setExpanded(true);
  };

  return (
    <>
      <button className={styles.trigger} onClick={openViewer}>
        <View size={16} /> View in 3D / AR
      </button>

      {expanded && ready && (
        <div className={styles.overlay} onClick={() => setExpanded(false)}>
          <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeBtn} onClick={() => setExpanded(false)}>
              <X size={18} />
            </button>
            {/* eslint-disable-next-line react/no-unknown-property */}
            <model-viewer
              src={assetUrl(modelUrl)}
              // The caller resolves the poster (resolveImageUrl), so it is
              // already either absolute or a bundled placeholder - running it
              // through assetUrl again would point a bundled asset at the API.
              poster={posterUrl}
              alt={`3D model of ${name}`}
              camera-controls
              auto-rotate
              ar
              ar-modes="webxr scene-viewer quick-look"
              shadow-intensity="1"
              exposure="1"
              style={{ width: '100%', height: '100%', '--poster-color': 'transparent' }}
            >
              <button slot="ar-button" className={styles.arButton}>
                <Smartphone size={15} /> View in your space
              </button>
            </model-viewer>
            <p className={styles.hint}>Drag to rotate · Pinch or scroll to zoom</p>
          </div>
        </div>
      )}
    </>
  );
}
