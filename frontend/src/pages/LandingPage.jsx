import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Hammer, ShieldCheck, ArrowRight, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { PlantCard, DesignCard } from '../components/CatalogCard';
import styles from './Landing.module.css';

export default function LandingPage() {
  const { user } = useAuth();
  const [plants, setPlants] = useState([]);
  const [designs, setDesigns] = useState([]);

  useEffect(() => {
    api.get('/plants?limit=4&sort=newest').then((r) => setPlants(r.data.plants || [])).catch(() => {});
    api.get('/designs?limit=3').then((r) => setDesigns(r.data.designs || [])).catch(() => {});
  }, []);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroInner}>
            {user ? (
              <>
                <span className={styles.heroTag}>Garden & Landscape  Rwanda</span>
                <h1 className={styles.heroTitle}>Welcome back, {user.fullName?.split(' ')[0]}.</h1>
                <p className={styles.heroSub}>
                  Pick up right where you left off — your dashboard, orders, and everything else are one click away.
                </p>
                <div className={styles.heroActions}>
                  <Link to="/dashboard" className="btn btn-primary" style={{ padding: '0.85rem 1.6rem', fontSize: '1rem' }}>
                    Go to dashboard <LayoutDashboard size={17} />
                  </Link>
                  {user.role === 'customer' && (
                    <Link to="/plants" className="btn btn-outline" style={{ padding: '0.85rem 1.6rem', fontSize: '1rem', borderColor: 'var(--color-cream)', color: 'var(--color-cream)' }}>
                      Browse plants
                    </Link>
                  )}
                </div>
              </>
            ) : (
              <>
                <span className={styles.heroTag}>Garden & Landscape Rwanda</span>
                <h1 className={styles.heroTitle}>Plant something beautiful, wherever you are in Rwanda.</h1>
                <p className={styles.heroSub}>
                  Browse plants, order full garden designs, and book professional installation —
                  all tracked from order to bloom.
                </p>
                <div className={styles.heroActions}>
                  <Link to="/login" className="btn btn-primary" style={{ padding: '0.85rem 1.6rem', fontSize: '1rem' }}>
                    Get started <ArrowRight size={17} />
                  </Link>
                  <Link to="/plants" className="btn btn-outline" style={{ padding: '0.85rem 1.6rem', fontSize: '1rem', borderColor: 'var(--color-cream)', color: 'var(--color-cream)' }}>
                    Browse plants
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {plants.length > 0 && (
        <section className={styles.showcase}>
          <div className="container">
            <div className={styles.showcaseHead}>
              <div>
                <span className={styles.showcaseTag}>From the catalogue</span>
                <h2 className={styles.showcaseTitle}>Plants ready for your garden</h2>
              </div>
              <Link to="/plants" className={styles.showcaseLink}>
                See all plants <ArrowRight size={15} />
              </Link>
            </div>
            <div className={styles.showcaseGrid}>
              {plants.map((p) => <PlantCard key={p.id} plant={p} />)}
            </div>
          </div>
        </section>
      )}

      {designs.length > 0 && (
        <section className={`${styles.showcase} ${styles.showcaseAlt}`}>
          <div className="container">
            <div className={styles.showcaseHead}>
              <div>
                <span className={styles.showcaseTag}>Full-service landscaping</span>
                <h2 className={styles.showcaseTitle}>Garden designs to fall in love with</h2>
              </div>
              <Link to="/designs" className={styles.showcaseLink}>
                See all designs <ArrowRight size={15} />
              </Link>
            </div>
            <div className={styles.showcaseGrid}>
              {designs.map((d) => <DesignCard key={d.id} design={d} />)}
            </div>
          </div>
        </section>
      )}

      <section className={styles.features}>
        <div className="container">
          <div className={styles.featGrid}>
            <div className={styles.featCard}>
              <p>🪾 🌳</p>
              <h3>Curated plant catalogue</h3>
              <p>Locally suited species with care guides for Rwanda's highland and tropical climates.</p>
            </div>
            <div className={styles.featCard}>
              <p>🌴 🪴</p>
              <h3>Full garden designs</h3>
              <p>From modern courtyards to drought-smart xeriscapes, with professional installation.</p>
            </div>
            <div className={styles.featCard}>
              <Hammer size={26} color="var(--color-terracotta)" />
              <h3>Tracked installation</h3>
              <p>Real-time order tracking from purchase through delivery and on-site installation.</p>
            </div>
            <div className={styles.featCard}>
              <ShieldCheck size={26} color="var(--color-terracotta)" />
              <h3>Secure payments</h3>
              <p>Pay by card, MTN Mobile Money, or PayPal .</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
