import { Heart, ShoppingCart, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import styles from './CatalogCard.module.css';

function Stars({ rating }) {
  return (
    <span className={styles.stars}>
      <Star size={12} fill={rating > 0 ? 'var(--color-gold)' : 'none'} color="var(--color-gold)" />
      <span>{Number(rating).toFixed(1)}</span>
    </span>
  );
}

export function PlantCard({ plant, onAddToCart, onWishlist, wishlistedIds = new Set() }) {
  const img = plant.primary_image || '/api/placeholder/300/220';
  return (
    <div className={styles.card}>
      <Link to={`/plants/${plant.id}`} className={styles.imgWrap}>
        <img src={img} alt={plant.name} className={styles.img} loading="lazy" />
        <span className={`${styles.tag} ${styles['tag-' + plant.care_difficulty]}`}>
          {plant.care_difficulty}
        </span>
      </Link>
      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.sci}>{plant.scientific_name}</span>
          <Stars rating={plant.average_rating} />
        </div>
        <Link to={`/plants/${plant.id}`} className={styles.name}>{plant.name}</Link>
        <div className={styles.attrs}>
          <span className={styles.attr}>{plant.sunlight_needs?.replace('_', ' ')}</span>
          <span className={styles.attr}>{plant.water_needs} water</span>
        </div>
        <div className={styles.footer}>
          <span className={styles.price}>RWF {Number(plant.price).toLocaleString()}</span>
          <div className={styles.actions}>
            {onWishlist && (
              <button
                className={`${styles.iconBtn} ${wishlistedIds.has(plant.id) ? styles.wishActive : ''}`}
                onClick={() => onWishlist(plant.id)}
                title="Add to wishlist"
              >
                <Heart size={16} fill={wishlistedIds.has(plant.id) ? 'currentColor' : 'none'} />
              </button>
            )}
            {onAddToCart && (
              <button className={styles.addBtn} onClick={() => onAddToCart(plant.id)}>
                <ShoppingCart size={14} /> Add
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DesignCard({ design, onAddToCart }) {
  const img = design.primary_image || '/api/placeholder/300/220';
  return (
    <div className={styles.card}>
      <Link to={`/designs/${design.id}`} className={styles.imgWrap}>
        <img src={img} alt={design.name} className={styles.img} loading="lazy" />
        <span className={`${styles.tag} ${styles.tagStyle}`}>{design.style?.replace('_', ' ')}</span>
      </Link>
      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.sci}>Min {design.min_area_sqm}m² · {design.estimated_install_days}d install</span>
          <Stars rating={design.average_rating} />
        </div>
        <Link to={`/designs/${design.id}`} className={styles.name}>{design.name}</Link>
        <div className={styles.footer}>
          <span className={styles.price}>RWF {Number(design.price).toLocaleString()}</span>
          {onAddToCart && (
            <button className={styles.addBtn} onClick={() => onAddToCart(design.id)}>
              <ShoppingCart size={14} /> Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
