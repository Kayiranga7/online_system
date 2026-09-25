import { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import api from '../services/api';
import { useCart } from '../context/CartContext';
import { PlantCard, DesignCard } from '../components/CatalogCard';
import { FullPageSpinner, toast } from '../components/UI';
import styles from './Catalog.module.css';

export default function WishlistPage() {
  const { addItem } = useCart();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/wishlist').then((r) => setItems(r.data.items || [])).catch(() => toast('Failed to load wishlist.', 'error')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleAdd = async (itemType, itemId) => {
    try { await addItem(itemType, itemId, 1); toast('Added to cart!', 'success'); } catch { toast('Could not add to cart.', 'error'); }
  };

  if (loading) return <FullPageSpinner />;

  return (
    <div className={styles.page}>
      <div className="container">
        <h1 className={styles.catalogTitle} style={{ marginBottom: 'var(--space-5)' }}>Your wishlist</h1>
        {items.length === 0 ? (
          <div className={styles.empty}><Heart size={40} color="var(--color-line)" /><p>Your wishlist is empty. Browse the catalogue and tap the heart icon to save items.</p></div>
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
