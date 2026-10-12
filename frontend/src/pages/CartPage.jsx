import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, ShoppingBag, ArrowRight } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { toast, ConfirmModal } from '../components/UI';
import styles from './Cart.module.css';

export default function CartPage() {
  const { items, subtotal, updateItem, removeItem } = useCart();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [confirmRemove, setConfirmRemove] = useState(null);

  const TAX_RATE = 0.18;
  const DELIVERY_FEE = 10;
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax + DELIVERY_FEE;

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}><ShoppingBag size={30} /></div>
        <h2>{t('cart.emptyTitle')}</h2>
        <p>{t('cart.emptyBody')}</p>
        <Link to="/plants" className="btn btn-primary">{t('landing.browsePlants')}</Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className="container">
        <h1 className={styles.heading}>{t('cart.title')}</h1>
        <div className={styles.layout}>
          {/* Items */}
          <div className={styles.items}>
            {items.map((item) => (
              <div key={item.id} className={`card ${styles.item}`}>
                <div className={styles.itemInfo}>
                  <span className={`badge badge-neutral`} style={{ textTransform: 'capitalize' }}>{item.itemType}</span>
                  <p className={styles.itemName}>{item.name}</p>
                  <p className={styles.itemPrice}>RWF {Number(item.unitPrice).toLocaleString()} {t('cart.each')}</p>
                </div>
                <div className={styles.itemControls}>
                  <div className={styles.qtyRow}>
                    <button className={styles.qtyBtn} onClick={() => item.quantity > 1 && updateItem(item.id, item.quantity - 1)}>−</button>
                    <span className={styles.qty}>{item.quantity}</span>
                    <button className={styles.qtyBtn} onClick={() => updateItem(item.id, item.quantity + 1)}>+</button>
                  </div>
                  <span className={styles.lineTotal}>RWF {Number(item.lineTotal).toLocaleString()}</span>
                  <button className={styles.removeBtn} onClick={() => setConfirmRemove(item.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className={`card ${styles.summary}`}>
            <h2 className={styles.summaryTitle}>{t('cart.summary')}</h2>
            <div className={styles.summaryRow}><span>{t('cart.subtotal')}</span><span>RWF {subtotal.toLocaleString()}</span></div>
            <div className={styles.summaryRow}><span>{t('cart.vat')}</span><span>RWF {tax.toLocaleString()}</span></div>
            <div className={styles.summaryRow}><span>{t('cart.delivery')}</span><span>RWF {DELIVERY_FEE.toLocaleString()}</span></div>
            <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
              <span>{t('dash.total')}</span><span>RWF {total.toLocaleString()}</span>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 'var(--space-4)' }} onClick={() => navigate('/checkout')}>
              {t('cart.checkout')} <ArrowRight size={16} />
            </button>
            <Link to="/plants" className="btn btn-ghost" style={{ width: '100%', marginTop: 'var(--space-2)' }}>
              {t('cart.continueShopping')}
            </Link>
          </div>
        </div>
      </div>

      {confirmRemove && (
        <ConfirmModal
          message={t('cart.removeConfirm')}
          dangerous
          onConfirm={async () => { await removeItem(confirmRemove); setConfirmRemove(null); toast(t('cart.removed')); }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}
