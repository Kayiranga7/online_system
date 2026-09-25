import { useState } from 'react';
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import { toast } from './UI';
import styles from '../pages/Checkout.module.css';

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '15px',
      fontFamily: '"Inter", sans-serif',
      color: 'var(--color-charcoal)',
      '::placeholder': { color: '#9a9788' },
    },
    invalid: { color: 'var(--color-danger)' },
  },
};

/**
 * Real Stripe.js card confirmation flow:
 *   1. Backend creates a PaymentIntent (test-mode, sk_test_/pk_test_ keys) and
 *      returns its client_secret.
 *   2. This component mounts a Stripe CardElement and, on submit, calls
 *      stripe.confirmCardPayment(clientSecret, { payment_method: { card } }).
 *   3. Stripe handles 3D Secure / SCA challenges automatically if the test
 *      card triggers them. On success, the PaymentIntent's webhook
 *      (payment_intent.succeeded) marks the order as paid server-side.
 *
 * Test cards: 4242 4242 4242 4242 (success), 4000 0025 0000 3155 (requires
 * 3D Secure), 4000 0000 0000 9995 (declined) - any future expiry, any CVC.
 */
export default function StripePaymentForm({ clientSecret, onSuccess, onError, amount }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [cardError, setCardError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setCardError(null);

    const cardElement = elements.getElement(CardElement);
    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: cardElement },
    });

    if (error) {
      setCardError(error.message);
      onError?.(error.message);
      setSubmitting(false);
      return;
    }

    if (paymentIntent.status === 'succeeded') {
      onSuccess?.(paymentIntent);
    } else {
      // requires_action / processing - Stripe.js already handled any 3DS challenge by this point;
      // anything other than 'succeeded' here means it genuinely didn't complete.
      toast(`Payment status: ${paymentIntent.status}. Please try again.`, 'warning');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.stripeFields}>
      <div className={styles.field}>
        <label className="label">Card details</label>
        <div className="input" style={{ paddingTop: '0.75rem', paddingBottom: '0.75rem' }}>
          <CardElement options={CARD_ELEMENT_OPTIONS} onChange={(e) => setCardError(e.error?.message || null)} />
        </div>
        {cardError && <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem', marginTop: 6 }}>{cardError}</span>}
        <span style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-soft)', marginTop: 8 }}>
          Test mode — try 4242 4242 4242 4242 (any future expiry / CVC) for an instant success,
          or 4000 0025 0000 3155 to see the 3D Secure challenge.
        </span>
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 'var(--space-3)' }} disabled={!stripe || submitting}>
        {submitting ? 'Confirming payment…' : `Pay $${amount}`}
      </button>
    </form>
  );
}
