import { useState, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { DesignCard } from '../components/CatalogCard';
import { Spinner, Pagination, toast } from '../components/UI';
import styles from './Catalog.module.css';

export default function DesignsPage() {
  const { user } = useAuth();
  const { addItem } = useCart();
  const [designs, setDesigns] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [style, setStyle] = useState('');
  const LIMIT = 12;

  const fetchDesigns = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: LIMIT });
    if (search) params.set('search', search);
    if (style) params.set('style', style);
    api.get(`/designs?${params}`).then((r) => { setDesigns(r.data.designs || []); setTotal(r.data.pagination?.total || 0); })
      .catch(() => toast('Failed to load designs.', 'error')).finally(() => setLoading(false));
  }, [page, search, style]);

  useEffect(() => { fetchDesigns(); }, [fetchDesigns]);

  const handleAdd = async (designId) => {
    try { await addItem('design', designId, 1); toast('Added to cart!', 'success'); }
    catch (e) { toast(e.response?.data?.error || 'Could not add to cart.', 'error'); }
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.catalogHeader}>
          <div>
            <h1 className={styles.catalogTitle}>Garden designs</h1>
            <p className={styles.catalogSub}>{total} curated designs with professional installation</p>
          </div>
          <div className={styles.searchRow}>
            <div className={styles.searchWrap}>
              <Search size={16} className={styles.searchIcon} />
              <input className={`input ${styles.searchInput}`} placeholder="     Search designs…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <select className="input" style={{ width: 'auto' }} value={style} onChange={(e) => { setStyle(e.target.value); setPage(1); }}>
              <option value="">All styles</option>
              {['modern','tropical','minimalist','cottage','japanese','xeriscape','other'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className={styles.loadingWrap}><Spinner size={36} /></div>
        ) : designs.length === 0 ? (
          <div className={styles.empty}><p>No designs match your filters.</p></div>
        ) : (
          <div className={styles.grid}>
            {designs.map((d) => <DesignCard key={d.id} design={d} onAddToCart={user?.role === 'customer' ? handleAdd : null} />)}
          </div>
        )}
        <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
      </div>
    </div>
  );
}
