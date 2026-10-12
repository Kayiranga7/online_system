import { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import api from '../services/api';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { PlantCard, DesignCard } from '../components/CatalogCard';
import { FullPageSpinner, toast } from '../components/UI';
import styles from './Catalog.module.css';

export default function WishlistPage() {
  const { addItem } = useCart();
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/wishlist').then((r) => setItems(r.data.items || [])).catch(() => toast(t('wishlist.loadFailed'), 'error')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleAdd = async (itemType, itemId) => {
    try { await addItem(itemType, itemId, 1); toast(t('wishlist.toastAdded'), 'success'); } catch { toast(t('wishlist.toastAddFailed'), 'error'); }
  };

  if (loading) return <FullPageSpinner />;

  return (
    <div className={styles.page}>
      <div className="container">
        <h1 className={styles.catalogTitle} style={{ marginBottom: 'var(--space-5)' }}>{t('wishlist.title')}</h1>
        {items.length === 0 ? (
          <div className={styles.empty}><Heart size={40} color="var(--color-line)" /><p>{t('wishlist.empty')}</p></div>
        ) : (
          <div className={styles.grid}>
            {items.map((w) => w.item && (
              w.itemType === 'plant'
                ? <PlantCard key={w.wishlistId} plant={w.item} onAddToCart={(id) => handleAdd('plant', id)} />
                : <DesignCard key={w.wishlistId} design={w.item} onAddToCart={(id) => handleAdd('design', id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
