import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, ShoppingBag, ArrowRight } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { toast, ConfirmModal } from '../components/UI';
import styles from './Cart.module.css';

export default function CartPage() {
  const { items, subtotal, updateItem, removeItem } = useCart();
  const navigate = useNavigate();
  const [confirmRemove, setConfirmRemove] = useState(null);

  const TAX_RATE = 0.18;
  const DELIVERY_FEE = 10;
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax + DELIVERY_FEE;

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <ShoppingBag size={52} color="var(--color-line)" />
        <h2>Your cart is empty</h2>
        <p>Browse our plant catalogue and garden designs to get started.</p>
        <Link to="/plants" className="btn btn-primary">Browse plants</Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className="container">
        <h1 className={styles.heading}>Your cart</h1>
        <div className={styles.layout}>
          {/* Items */}
          <div className={styles.items}>
            {items.map((item) => (
              <div key={item.id} className={`card ${styles.item}`}>
                <div className={styles.itemInfo}>
                  <span className={`badge badge-neutral`} style={{ textTransform: 'capitalize' }}>{item.itemType}</span>
                  <p className={styles.itemName}>{item.name}</p>
                  <p className={styles.itemPrice}>RWF {Number(item.unitPrice).toLocaleString()} each</p>
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
            <h2 className={styles.summaryTitle}>Order summary</h2>
            <div className={styles.summaryRow}><span>Subtotal</span><span>RWF {subtotal.toLocaleString()}</span></div>
            <div className={styles.summaryRow}><span>VAT (18%)</span><span>RWF {tax.toLocaleString()}</span></div>
            <div className={styles.summaryRow}><span>Delivery fee</span><span>RWF {DELIVERY_FEE.toLocaleString()}</span></div>
            <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
              <span>Total</span><span>RWF {total.toLocaleString()}</span>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 'var(--space-4)' }} onClick={() => navigate('/checkout')}>
              Checkout <ArrowRight size={16} />
            </button>
            <Link to="/plants" className="btn btn-ghost" style={{ width: '100%', marginTop: 'var(--space-2)' }}>
              Continue shopping
            </Link>
          </div>
        </div>
      </div>

      {confirmRemove && (
        <ConfirmModal
          message="Remove this item from your cart?"
          dangerous
          onConfirm={async () => { await removeItem(confirmRemove); setConfirmRemove(null); toast('Item removed.'); }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}
