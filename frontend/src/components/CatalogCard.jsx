import { Heart, ShoppingCart, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { resolveImageUrl } from '../utils/images';
import styles from './CatalogCard.module.css';

function Stars({ rating }) {
  return (
    <span className={styles.stars}>
      <Star size={12} fill={rating > 0 ? 'var(--color-gold)' : 'none'} color="var(--color-gold)" />
      <span>{Number(rating).toFixed(1)}</span>
    </span>
  );
}

export function PlantCard({ plant, onAddToCart, onWishlist, wishlistedIds = new Set(), index = 0 }) {
  const { t } = useLanguage();
  const img = resolveImageUrl(plant.primary_image);
  return (
    <div className={`${styles.card} card-in`} style={{ '--stagger-i': index }}>
      <Link to={`/plants/${plant.id}`} className={styles.imgWrap}>
        <img src={img} alt={plant.name} className={styles.img} loading="lazy" />
        <span className={`${styles.tag} ${styles['tag-' + plant.care_difficulty]}`}>
          {t(`catalog.diff.${plant.care_difficulty}`)}
        </span>
      </Link>
      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.sci}>{plant.scientific_name}</span>
          <Stars rating={plant.average_rating} />
        </div>
        <Link to={`/plants/${plant.id}`} className={styles.name}>{plant.name}</Link>
        <div className={styles.attrs}>
          <span className={styles.attr}>{t(`catalog.sun.${plant.sunlight_needs}`)}</span>
          <span className={styles.attr}>{t('catalog.waterText', { water: t(`catalog.water.${plant.water_needs}`).toLowerCase() })}</span>
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
                <ShoppingCart size={14} /> {t('catalog.add')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DesignCard({ design, onAddToCart, index = 0 }) {
  const { t } = useLanguage();
  const img = resolveImageUrl(design.primary_image);
  return (
    <div className={`${styles.card} card-in`} style={{ '--stagger-i': index }}>
      <Link to={`/designs/${design.id}`} className={styles.imgWrap}>
        <img src={img} alt={design.name} className={styles.img} loading="lazy" />
        <span className={`${styles.tag} ${styles.tagStyle}`}>{t(`catalog.style.${design.style}`)}</span>
      </Link>
      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.sci}>{t('catalog.minArea', { area: design.min_area_sqm })} · {t('catalog.installDays', { days: design.estimated_install_days })}</span>
          <Stars rating={design.average_rating} />
        </div>
        <Link to={`/designs/${design.id}`} className={styles.name}>{design.name}</Link>
        <div className={styles.footer}>
          <span className={styles.price}>RWF {Number(design.price).toLocaleString()}</span>
          {onAddToCart && (
            <button className={styles.addBtn} onClick={() => onAddToCart(design.id)}>
              <ShoppingCart size={14} /> {t('catalog.add')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
