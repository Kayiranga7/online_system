import { useState, useEffect } from 'react';
import { Plus, Leaf, LayoutGrid, Image as ImageIcon } from 'lucide-react';
import api from '../services/api';
import { FullPageSpinner, toast } from '../components/UI';
import MediaManager from '../components/MediaManager';
import styles from './Tasks.module.css';

const SUNLIGHT = ['full_sun', 'partial_shade', 'full_shade'];
const WATER = ['low', 'medium', 'high'];
const DIFFICULTY = ['easy', 'moderate', 'advanced'];
const STYLES = ['modern', 'tropical', 'minimalist', 'cottage', 'japanese', 'xeriscape', 'other'];

const EMPTY_PLANT = { name: '', scientificName: '', price: '', stockQuantity: '', sunlightNeeds: 'full_sun', waterNeeds: 'medium', careDifficulty: 'easy', description: '' };
const EMPTY_DESIGN = { name: '', price: '', style: 'modern', minAreaSqm: '', estimatedInstallDays: '', description: '' };

export default function AdminCatalogPage() {
  const [tab, setTab] = useState('plants'); // 'plants' | 'designs'
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [mediaTarget, setMediaTarget] = useState(null); // item id currently managing media for
  const [plantForm, setPlantForm] = useState(EMPTY_PLANT);
  const [designForm, setDesignForm] = useState(EMPTY_DESIGN);

  const load = () => {
    setLoading(true);
    const endpoint = tab === 'plants' ? '/plants?limit=50' : '/designs?limit=50';
    api.get(endpoint)
      .then((r) => setItems(tab === 'plants' ? r.data.plants : r.data.designs))
      .catch(() => toast('Failed to load catalogue.', 'error'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); setShowForm(false); setMediaTarget(null); }, [tab]);

  const setPF = (k) => (e) => setPlantForm((f) => ({ ...f, [k]: e.target.value }));
  const setDF = (k) => (e) => setDesignForm((f) => ({ ...f, [k]: e.target.value }));

  const handleCreatePlant = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/plants', plantForm);
      toast('Plant created. Now add a photo / AR model below.', 'success');
      setPlantForm(EMPTY_PLANT);
      setShowForm(false);
      load();
      setMediaTarget(res.data.id);
    } catch (err) { toast(err.response?.data?.error || 'Failed to create plant.', 'error'); }
  };

  const handleCreateDesign = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/designs', designForm);
      toast('Design created. Now add a photo / AR model below.', 'success');
      setDesignForm(EMPTY_DESIGN);
      setShowForm(false);
      load();
      setMediaTarget(res.data.id);
    } catch (err) { toast(err.response?.data?.error || 'Failed to create design.', 'error'); }
  };

  const toggleActive = async (item) => {
    try {
      const endpoint = tab === 'plants' ? `/plants/${item.id}` : `/designs/${item.id}`;
      await api.put(endpoint, { isActive: !item.is_active });
      toast(item.is_active ? 'Removed from catalogue.' : 'Restored to catalogue.', 'success');
      load();
    } catch { toast('Could not update item.', 'error'); }
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.header}>
          <h1 className={styles.heading}>Catalogue management</h1>
          <div className={styles.headerActions}>
            <div style={{ display: 'flex', border: '1.5px solid var(--color-line)', borderRadius: 8, overflow: 'hidden' }}>
              <button
                onClick={() => setTab('plants')}
                style={{ padding: '0.5rem 1rem', border: 'none', background: tab === 'plants' ? 'var(--color-forest)' : 'transparent', color: tab === 'plants' ? 'white' : 'var(--color-charcoal)', display: 'flex', gap: 6, alignItems: 'center', fontWeight: 600, fontSize: '0.85rem' }}
              ><Leaf size={14} /> Plants</button>
              <button
                onClick={() => setTab('designs')}
                style={{ padding: '0.5rem 1rem', border: 'none', background: tab === 'designs' ? 'var(--color-forest)' : 'transparent', color: tab === 'designs' ? 'white' : 'var(--color-charcoal)', display: 'flex', gap: 6, alignItems: 'center', fontWeight: 600, fontSize: '0.85rem' }}
              ><LayoutGrid size={14} /> Designs</button>
            </div>
            <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
              <Plus size={16} /> New {tab === 'plants' ? 'plant' : 'design'}
            </button>
          </div>
        </div>

        {showForm && tab === 'plants' && (
          <form onSubmit={handleCreatePlant} className={`card ${styles.createForm}`}>
            <h3 className={styles.sectionTitle}>New plant</h3>
            <div className={styles.formGrid}>
              <div className={styles.field}><label className="label">Name *</label><input className="input" value={plantForm.name} onChange={setPF('name')} required /></div>
              <div className={styles.field}><label className="label">Scientific name</label><input className="input" value={plantForm.scientificName} onChange={setPF('scientificName')} /></div>
              <div className={styles.field}><label className="label">Price (RWF) *</label><input className="input" type="number" step="1" value={plantForm.price} onChange={setPF('price')} required /></div>
              <div className={styles.field}><label className="label">Stock quantity</label><input className="input" type="number" value={plantForm.stockQuantity} onChange={setPF('stockQuantity')} /></div>
              <div className={styles.field}><label className="label">Sunlight needs</label>
                <select className="input" value={plantForm.sunlightNeeds} onChange={setPF('sunlightNeeds')}>{SUNLIGHT.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
              </div>
              <div className={styles.field}><label className="label">Water needs</label>
                <select className="input" value={plantForm.waterNeeds} onChange={setPF('waterNeeds')}>{WATER.map((w) => <option key={w} value={w}>{w}</option>)}</select>
              </div>
              <div className={styles.field}><label className="label">Care difficulty</label>
                <select className="input" value={plantForm.careDifficulty} onChange={setPF('careDifficulty')}>{DIFFICULTY.map((d) => <option key={d} value={d}>{d}</option>)}</select>
              </div>
              <div className={`${styles.field} ${styles.span2}`}><label className="label">Description</label><textarea className="input" rows={2} value={plantForm.description} onChange={setPF('description')} /></div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create plant</button>
            </div>
          </form>
        )}

        {showForm && tab === 'designs' && (
          <form onSubmit={handleCreateDesign} className={`card ${styles.createForm}`}>
            <h3 className={styles.sectionTitle}>New design</h3>
            <div className={styles.formGrid}>
              <div className={styles.field}><label className="label">Name *</label><input className="input" value={designForm.name} onChange={setDF('name')} required /></div>
              <div className={styles.field}><label className="label">Price (RWF) *</label><input className="input" type="number" step="1" value={designForm.price} onChange={setDF('price')} required /></div>
              <div className={styles.field}><label className="label">Style</label>
                <select className="input" value={designForm.style} onChange={setDF('style')}>{STYLES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              </div>
              <div className={styles.field}><label className="label">Min area (m²)</label><input className="input" type="number" step="0.1" value={designForm.minAreaSqm} onChange={setDF('minAreaSqm')} /></div>
              <div className={styles.field}><label className="label">Install days</label><input className="input" type="number" value={designForm.estimatedInstallDays} onChange={setDF('estimatedInstallDays')} /></div>
              <div className={`${styles.field} ${styles.span2}`}><label className="label">Description</label><textarea className="input" rows={2} value={designForm.description} onChange={setDF('description')} /></div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create design</button>
            </div>
          </form>
        )}

        {loading ? <FullPageSpinner /> : (
          <div className={`card ${styles.tableCard}`}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Name</th>
                    <th className={styles.th}>Price</th>
                    {tab === 'plants' && <th className={styles.th}>Stock</th>}
                    <th className={styles.th}>Rating</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <>
                      <tr key={item.id} className={styles.tr}>
                        <td className={styles.td} style={{ fontWeight: 500 }}>{item.name}</td>
                        <td className={styles.td}>RWF {Number(item.price).toLocaleString()}</td>
                        {tab === 'plants' && <td className={styles.td}>{item.stock_quantity}</td>}
                        <td className={styles.td}>★ {Number(item.average_rating).toFixed(1)} ({item.review_count})</td>
                        <td className={styles.td}><span className={`badge ${item.is_active ? 'badge-green' : 'badge-red'}`}>{item.is_active ? 'active' : 'hidden'}</span></td>
                        <td className={styles.td} style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '0.25rem 0.5rem' }} onClick={() => setMediaTarget(mediaTarget === item.id ? null : item.id)}>
                            <ImageIcon size={13} /> Media
                          </button>
                          <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '0.25rem 0.5rem' }} onClick={() => toggleActive(item)}>
                            {item.is_active ? 'Hide' : 'Restore'}
                          </button>
                        </td>
                      </tr>
                      {mediaTarget === item.id && (
                        <tr>
                          <td colSpan={6} style={{ padding: 'var(--space-4)', background: 'var(--color-sage)' }}>
                            <MediaManager itemType={tab === 'plants' ? 'plant' : 'design'} itemId={item.id} onSaved={() => setMediaTarget(null)} />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
