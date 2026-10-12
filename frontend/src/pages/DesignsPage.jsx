import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { DesignCard } from '../components/CatalogCard';
import { Spinner, Pagination, toast } from '../components/UI';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import styles from './Catalog.module.css';

const DESIGN_STYLES = ['modern', 'tropical', 'minimalist', 'cottage', 'japanese', 'xeriscape', 'other'];

export default function DesignsPage() {
  const { user } = useAuth();
  const { addItem } = useCart();
  const { t } = useLanguage();
  const [designs, setDesigns] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [style, setStyle] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const LIMIT = 12;
  const requestSeq = useRef(0);

  const fetchDesigns = useCallback(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    const params = new URLSearchParams({ page, limit: LIMIT });
    if (search) params.set('search', search);
    if (style) params.set('style', style);
    api.get(`/designs?${params}`).then((r) => {
      if (seq !== requestSeq.current) return; // a newer request superseded this one
      setDesigns(r.data.designs || []);
      setTotal(r.data.pagination?.total || 0);
    })
      .catch(() => { if (seq === requestSeq.current) toast(t('catalog.loadDesignsFailed'), 'error'); })
      .finally(() => { if (seq === requestSeq.current) setLoading(false); });
  }, [page, search, style]);

  useEffect(() => { fetchDesigns(); }, [fetchDesigns]);

  // Debounced search: commits the input only after typing pauses.
  useEffect(() => {
    setSearch((s) => (s === debouncedSearch ? s : debouncedSearch));
    setPage(1);
  }, [debouncedSearch]);

  const handleAdd = async (designId) => {
    try { await addItem('design', designId, 1); toast(t('catalog.addedToCart'), 'success'); }
    catch (e) { toast(e.response?.data?.error || t('catalog.addToCartFailed'), 'error'); }
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.catalogHeader}>
          <div>
            <h1 className={styles.catalogTitle}>{t('catalog.designsTitle')}</h1>
            <p className={styles.catalogSub}>{t('catalog.designsSub', { count: total })}</p>
          </div>
          <div className={styles.searchRow}>
            <div className={styles.searchWrap}>
              <input className={`input ${styles.searchInput}`} placeholder={t('catalog.searchDesigns')} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
              {searchInput ? (
                <button type="button" className={styles.searchClear} aria-label={t('catalog.clear')} onClick={() => setSearchInput('')}>
                  <X size={14} />
                </button>
              ) : (
                <Search size={16} className={styles.searchIcon} aria-hidden="true" />
              )}
            </div>
            <select className="input" style={{ width: 'auto' }} value={style} onChange={(e) => { setStyle(e.target.value); setPage(1); }}>
              <option value="">{t('catalog.allStyles')}</option>
              {DESIGN_STYLES.map((s) => <option key={s} value={s}>{t(`catalog.style.${s}`)}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className={styles.loadingWrap}><Spinner size={36} /></div>
        ) : designs.length === 0 ? (
          <div className={styles.empty}><p>{t('catalog.noDesigns')}</p></div>
        ) : (
          <div className={styles.grid}>
            {designs.map((d, i) => <DesignCard key={d.id} index={i} design={d} onAddToCart={user?.role === 'customer' ? handleAdd : null} />)}
          </div>
        )}
        <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
      </div>
    </div>
  );
}
