import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Sliders, Sparkles, Leaf, X } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCart } from '../context/CartContext';
import { PlantCard } from '../components/CatalogCard';
import { Spinner, Pagination, toast } from '../components/UI';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import styles from './Catalog.module.css';

const SUNLIGHT_OPTS = ['full_sun', 'partial_shade', 'full_shade'];
const WATER_OPTS = ['low', 'medium', 'high'];
const DIFFICULTY_OPTS = ['easy', 'moderate', 'advanced'];

export default function PlantsPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { addItem } = useCart();
  const [plants, setPlants] = useState([]);
  const [recs, setRecs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: '', sunlight: '', water: '', careDifficulty: '', sort: 'newest' });
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [wishlisted, setWishlisted] = useState(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const LIMIT = 12;
  const requestSeq = useRef(0);

  const fetchPlants = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) });
      const res = await api.get(`/plants?${params}`);
      if (seq !== requestSeq.current) return; // a newer request superseded this one
      setPlants(res.data.plants || []);
      setTotal(res.data.pagination?.total || 0);
    } catch {
      if (seq === requestSeq.current) toast(t('catalog.loadPlantsFailed'), 'error');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { fetchPlants(); }, [fetchPlants]);

  // Debounced search: filters.search follows the input only after typing pauses,
  // so the list is not re-fetched (and page reset) on every keystroke.
  useEffect(() => {
    setFilters((f) => (f.search === debouncedSearch ? f : { ...f, search: debouncedSearch }));
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (user?.role === 'customer') {
      api.get('/plants/recommendations').then((r) => setRecs(r.data.recommendations || [])).catch(() => {});
      api.get('/wishlist').then((r) => {
        const ids = (r.data.items || []).filter((i) => i.itemType === 'plant').map((i) => i.item?.id).filter(Boolean);
        setWishlisted(new Set(ids));
      }).catch(() => {});
    }
  }, [user?.id]);

  const handleAddToCart = async (plantId) => {
    try { await addItem('plant', plantId, 1); toast(t('catalog.addedToCart'), 'success'); }
    catch (e) { toast(e.response?.data?.error || t('catalog.addToCartFailed'), 'error'); }
  };

  const handleWishlist = async (plantId) => {
    try {
      if (wishlisted.has(plantId)) {
        // find and remove (get wishlist id)
        const res = await api.get('/wishlist');
        const entry = res.data.items.find((i) => i.itemType === 'plant' && i.item?.id === plantId);
        if (entry) await api.delete(`/wishlist/${entry.wishlistId}`);
        setWishlisted((s) => { const n = new Set(s); n.delete(plantId); return n; });
      } else {
        await api.post('/wishlist', { itemType: 'plant', itemId: plantId });
        setWishlisted((s) => new Set([...s, plantId]));
        toast(t('catalog.addedToWishlist'), 'success');
      }
    } catch { toast(t('catalog.wishlistFailed'), 'error'); }
  };

  const setFilter = (k) => (e) => { setFilters((f) => ({ ...f, [k]: e.target.value })); setPage(1); };

  return (
    <div className={styles.page}>
      <div className="container">
        {/* Recommendations */}
        {recs.length > 0 && (
          <section className={styles.recSection}>
            <h2 className={styles.recTitle}><Sparkles size={18} /> {t('catalog.recommended')}</h2>
            <div className={styles.recGrid}>
              {recs.slice(0, 4).map((p) => (
                <PlantCard key={p.id} plant={p} onAddToCart={handleAddToCart} onWishlist={handleWishlist} wishlistedIds={wishlisted} />
              ))}
            </div>
          </section>
        )}

        {/* Header + search */}
        <div className={styles.catalogHeader}>
          <div>
            <h1 className={styles.catalogTitle}>{t('catalog.plantsTitle')}</h1>
            <p className={styles.catalogSub}>{t('catalog.plantsSub', { count: total })}</p>
          </div>
          <div className={styles.searchRow}>
            <div className={styles.searchWrap}>
              <input
                className={`input ${styles.searchInput}`}
                placeholder={t('catalog.searchPlants')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              {searchInput ? (
                <button type="button" className={styles.searchClear} aria-label={t('catalog.clear')} onClick={() => setSearchInput('')}>
                  <X size={14} />
                </button>
              ) : (
                <Search size={16} className={styles.searchIcon} aria-hidden="true" />
              )}
            </div>
            <button className={`btn btn-outline ${showFilters ? styles.filterBtnActive : ''}`} onClick={() => setShowFilters((s) => !s)}>
              <Sliders size={16} /> {t('catalog.filters')}
            </button>
          </div>
        </div>

        {/* Filters row */}
        {showFilters && (
          <div className={`card ${styles.filtersCard}`}>
            <select className="input" value={filters.sunlight} onChange={setFilter('sunlight')} style={{ width: 'auto' }}>
              <option value="">{t('catalog.sunlightAny')}</option>
              {SUNLIGHT_OPTS.map((o) => <option key={o} value={o}>{t(`catalog.sun.${o}`)}</option>)}
            </select>
            <select className="input" value={filters.water} onChange={setFilter('water')} style={{ width: 'auto' }}>
              <option value="">{t('catalog.waterAny')}</option>
              {WATER_OPTS.map((o) => <option key={o} value={o}>{t(`catalog.water.${o}`)}</option>)}
            </select>
            <select className="input" value={filters.careDifficulty} onChange={setFilter('careDifficulty')} style={{ width: 'auto' }}>
              <option value="">{t('catalog.difficultyAny')}</option>
              {DIFFICULTY_OPTS.map((o) => <option key={o} value={o}>{t(`catalog.diff.${o}`)}</option>)}
            </select>
            <select className="input" value={filters.sort} onChange={setFilter('sort')} style={{ width: 'auto' }}>
              <option value="newest">{t('catalog.sortNewest')}</option>
              <option value="price_asc">{t('catalog.sortPriceAsc')}</option>
              <option value="price_desc">{t('catalog.sortPriceDesc')}</option>
              <option value="rating">{t('catalog.sortRating')}</option>
            </select>
            <button className="btn btn-ghost" onClick={() => { setFilters({ search: '', sunlight: '', water: '', careDifficulty: '', sort: 'newest' }); setSearchInput(''); setPage(1); }}>
              {t('catalog.clear')}
            </button>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className={styles.loadingWrap}><Spinner size={36} /></div>
        ) : plants.length === 0 ? (
          <div className={styles.empty}>
            <Leaf size={40} color="var(--color-line)" />
            <p>{t('catalog.noPlants')}</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {plants.map((p, i) => (
              <PlantCard key={p.id} index={i} plant={p} onAddToCart={user?.role === 'customer' ? handleAddToCart : null} onWishlist={user?.role === 'customer' ? handleWishlist : null} wishlistedIds={wishlisted} />
            ))}
          </div>
        )}

        <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
      </div>
    </div>
  );
}
