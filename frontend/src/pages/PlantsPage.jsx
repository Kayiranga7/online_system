import { useState, useEffect, useCallback } from 'react';
import { Search, Sliders, Sparkles } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { PlantCard } from '../components/CatalogCard';
import { FullPageSpinner, Spinner, Pagination, toast } from '../components/UI';
import styles from './Catalog.module.css';

const SUNLIGHT_OPTS = ['full_sun', 'partial_shade', 'full_shade'];
const WATER_OPTS = ['low', 'medium', 'high'];
const DIFFICULTY_OPTS = ['easy', 'moderate', 'advanced'];

export default function PlantsPage() {
  const { user } = useAuth();
  const { addItem } = useCart();
  const [plants, setPlants] = useState([]);
  const [recs, setRecs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: '', sunlight: '', water: '', careDifficulty: '', sort: 'newest' });
  const [wishlisted, setWishlisted] = useState(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const LIMIT = 12;

  const fetchPlants = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) });
      const res = await api.get(`/plants?${params}`);
      setPlants(res.data.plants || []);
      setTotal(res.data.pagination?.total || 0);
    } catch { toast('Failed to load plants.', 'error'); }
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { fetchPlants(); }, [fetchPlants]);

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
    try { await addItem('plant', plantId, 1); toast('Added to cart!', 'success'); }
    catch (e) { toast(e.response?.data?.error || 'Could not add to cart.', 'error'); }
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
        toast('Added to wishlist.', 'success');
      }
    } catch { toast('Could not update wishlist.', 'error'); }
  };

  const setFilter = (k) => (e) => { setFilters((f) => ({ ...f, [k]: e.target.value })); setPage(1); };

  return (
    <div className={styles.page}>
      <div className="container">
        {/* Recommendations */}
        {recs.length > 0 && (
          <section className={styles.recSection}>
            <h2 className={styles.recTitle}><Sparkles size={18} /> Recommended for your garden</h2>
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
            <h1 className={styles.catalogTitle}>Plant catalogue</h1>
            <p className={styles.catalogSub}>{total} plants available across Rwanda</p>
          </div>
          <div className={styles.searchRow}>
            <div className={styles.searchWrap}>
              <Search size={16} className={styles.searchIcon} />
              <input
                className={`input ${styles.searchInput}`}
                placeholder="     Search plants…"
                value={filters.search}
                onChange={setFilter('search')}
              />
            </div>
            <button className={`btn btn-outline ${showFilters ? styles.filterBtnActive : ''}`} onClick={() => setShowFilters((s) => !s)}>
              <Sliders size={16} /> Filters
            </button>
          </div>
        </div>

        {/* Filters row */}
        {showFilters && (
          <div className={`card ${styles.filtersCard}`}>
            <select className="input" value={filters.sunlight} onChange={setFilter('sunlight')} style={{ width: 'auto' }}>
              <option value="">Sunlight: any</option>
              {SUNLIGHT_OPTS.map((o) => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
            </select>
            <select className="input" value={filters.water} onChange={setFilter('water')} style={{ width: 'auto' }}>
              <option value="">Water: any</option>
              {WATER_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select className="input" value={filters.careDifficulty} onChange={setFilter('careDifficulty')} style={{ width: 'auto' }}>
              <option value="">Difficulty: any</option>
              {DIFFICULTY_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select className="input" value={filters.sort} onChange={setFilter('sort')} style={{ width: 'auto' }}>
              <option value="newest">Newest first</option>
              <option value="price_asc">Price: low → high</option>
              <option value="price_desc">Price: high → low</option>
              <option value="rating">Highest rated</option>
            </select>
            <button className="btn btn-ghost" onClick={() => { setFilters({ search: '', sunlight: '', water: '', careDifficulty: '', sort: 'newest' }); setPage(1); }}>
              Clear
            </button>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className={styles.loadingWrap}><Spinner size={36} /></div>
        ) : plants.length === 0 ? (
          <div className={styles.empty}>
            <Leaf size={40} color="var(--color-line)" />
            <p>No plants match your filters. Try adjusting your search.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {plants.map((p) => (
              <PlantCard key={p.id} plant={p} onAddToCart={user?.role === 'customer' ? handleAddToCart : null} onWishlist={user?.role === 'customer' ? handleWishlist : null} wishlistedIds={wishlisted} />
            ))}
          </div>
        )}

        <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
      </div>
    </div>
  );
}
