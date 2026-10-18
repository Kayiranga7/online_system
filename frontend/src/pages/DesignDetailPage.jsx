import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Star, ShoppingCart, Ruler, Clock } from 'lucide-react';
import api from '../services/api';
import { resolveImageUrl } from '../utils/images';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { FullPageSpinner, toast } from '../components/UI';
import ARPreview from '../components/ARPreview';
import styles from './Detail.module.css';

export default function DesignDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { addItem } = useCart();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [reviewRating, setReviewRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const load = () => {
    setLoading(true);
    api.get(`/designs/${id}`).then((r) => setData(r.data)).catch(() => toast('Failed to load design.', 'error')).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    setSubmittingReview(true);
    try {
      await api.post('/reviews', { itemType: 'design', itemId: Number(id), rating: reviewRating, comment: reviewComment || undefined });
      toast('Review submitted. Thank you!', 'success');
      setReviewComment('');
      setReviewRating(5);
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Could not submit review.', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleDeleteReview = async (reviewId) => {
    try {
      await api.delete(`/reviews/${reviewId}`);
      toast('Review deleted.', 'success');
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Could not delete review.', 'error');
    }
  };

  if (loading) return <FullPageSpinner />;
  if (!data) return null;
  const { design, images, includedPlants, reviews } = data;
  const img = resolveImageUrl(images?.[0]?.image_url || design.primary_image);

  const handleAdd = async () => {
    try { await addItem('design', design.id, 1); toast('Added to cart!', 'success'); }
    catch (e) { toast(e.response?.data?.error || 'Could not add to cart.', 'error'); }
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.layout}>
          <div className={styles.imageCol}><img src={img} alt={design.name} className={styles.mainImg} /></div>
          <div className={styles.infoCol}>
            <span className={styles.category}>{design.style?.replace('_', ' ')} style</span>
            <h1 className={styles.title}>{design.name}</h1>
            <div className={styles.rating}>
              <Star size={15} fill="var(--color-gold)" color="var(--color-gold)" />
              <span>{Number(design.average_rating).toFixed(1)} ({design.review_count} reviews)</span>
            </div>
            <p className={styles.desc}>{design.description}</p>

            <div className={styles.attrGrid}>
              <div className={styles.attrItem}><Ruler size={16} /> min {design.min_area_sqm}m²</div>
              <div className={styles.attrItem}><Clock size={16} /> {design.estimated_install_days} day install</div>
            </div>

            {includedPlants?.length > 0 && (
              <>
                <p style={{ fontWeight: 600, marginBottom: 8 }}>Included plants</p>
                <div className={styles.includedList}>
                  {includedPlants.map((p) => (
                    <div key={p.id} className={styles.includedItem}>
                      <span>{p.name}</span><span>× {p.quantity}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className={styles.priceRow}>
              <span className={styles.price}>RWF {Number(design.price).toLocaleString()}</span>
            </div>

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <ARPreview modelUrl={images?.[0]?.ar_model_url} posterUrl={img} name={design.name} />
            </div>

            {user?.role === 'customer' && (
              <button className="btn btn-primary" onClick={handleAdd}>
                <ShoppingCart size={16} /> Add to cart
              </button>
            )}
          </div>
        </div>

        <div className="divider-leaf">Reviews</div>

        {user?.role === 'customer' && (
          <form onSubmit={handleSubmitReview} className={styles.reviewForm}>
            <p className={styles.reviewFormLabel}>Write a review</p>
            <div className={styles.starPicker}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  type="button" key={n}
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setReviewRating(n)}
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                >
                  <Star size={22} fill={(hoverRating || reviewRating) >= n ? 'var(--color-gold)' : 'none'} color="var(--color-gold)" />
                </button>
              ))}
            </div>
            <textarea
              className="input" rows={3} placeholder="Share your experience with this design (optional)"
              value={reviewComment} onChange={(e) => setReviewComment(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={submittingReview}>
              {submittingReview ? 'Submitting…' : 'Submit review'}
            </button>
          </form>
        )}

        <div className={styles.reviews}>
          {reviews?.length === 0 ? (
            <p style={{ color: 'var(--color-charcoal-soft)' }}>No reviews yet.</p>
          ) : (
            reviews.map((r) => (
              <div key={r.id} className={styles.review}>
                <div className={styles.reviewHeader}>
                  <strong>{r.full_name}</strong>
                  {r.is_verified_purchase === 1 && <span className="badge badge-green">Verified purchase</span>}
                  <span className={styles.reviewStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                  {(user?.id === r.customer_id || user?.role === 'admin') && (
                    <button className={styles.reviewDelete} onClick={() => handleDeleteReview(r.id)}>Delete</button>
                  )}
                </div>
                <p>{r.comment}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
