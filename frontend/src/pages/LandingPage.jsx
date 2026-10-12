import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Hammer, ShieldCheck, ArrowRight, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';
import { PlantCard, DesignCard } from '../components/CatalogCard';
import { heroBackground } from '../utils/heroBackground';
import styles from './Landing.module.css';

export default function LandingPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [plants, setPlants] = useState([]);
  const [designs, setDesigns] = useState([]);

  useEffect(() => {
    api.get('/plants?limit=4&sort=newest').then((r) => setPlants(r.data.plants || [])).catch(() => {});
    api.get('/designs?limit=3').then((r) => setDesigns(r.data.designs || [])).catch(() => {});
  }, []);

  return (
    <div className={styles.page}>
      <section className={styles.hero} style={heroBackground}>
        <div className={styles.aurora} />
        <div className={styles.heroFade} />
        <div className="container">
          <div className={styles.heroInner}>
            {user ? (
              <>
                <h1 className={styles.heroTitle}>{t('landing.welcomeBack', { name: user.fullName?.split(' ')[0] })}</h1>
                <p className={styles.heroSub}>
                  {t('landing.heroSubAuth')}
                </p>
                <div className={styles.heroActions}>
                  <Link to="/dashboard" className="btn btn-primary" style={{ padding: '0.85rem 1.6rem', fontSize: '1rem' }}>
                    {t('landing.goToDashboard')} <LayoutDashboard size={17} />
                  </Link>
                  {user.role === 'customer' && (
                    <Link to="/plants" className="btn btn-outline" style={{ padding: '0.85rem 1.6rem', fontSize: '1rem', borderColor: 'var(--color-cream)', color: 'var(--color-cream)' }}>
                      {t('landing.browsePlants')}
                    </Link>
                  )}
                </div>
              </>
            ) : (
              <>
                <h1 className={styles.heroTitle}>{t('landing.heroTitle')}</h1>
                <p className={styles.heroSub}>
                  {t('landing.heroSub')}
                </p>
                <div className={styles.heroActions}>
                  <Link to="/login" className="btn btn-primary" style={{ padding: '0.85rem 1.6rem', fontSize: '1rem' }}>
                    {t('nav.getStarted')} <ArrowRight size={17} />
                  </Link>
                  <Link to="/plants" className="btn btn-outline" style={{ padding: '0.85rem 1.6rem', fontSize: '1rem', borderColor: 'var(--color-cream)', color: 'var(--color-cream)' }}>
                    {t('landing.browsePlants')}
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
                <span className={styles.showcaseTag}>{t('landing.fromCatalogue')}</span>
                <h2 className={styles.showcaseTitle}>{t('landing.plantsReady')}</h2>
              </div>
              <Link to="/plants" className={styles.showcaseLink}>
                {t('landing.seeAllPlants')} <ArrowRight size={15} />
              </Link>
            </div>
            <div className={styles.showcaseGrid}>
              {plants.map((p, i) => <PlantCard key={p.id} plant={p} index={i} />)}
            </div>
          </div>
        </section>
      )}

      {designs.length > 0 && (
        <section className={`${styles.showcase} ${styles.showcaseAlt}`}>
          <div className="container">
            <div className={styles.showcaseHead}>
              <div>
                <span className={styles.showcaseTag}>{t('landing.fullService')}</span>
                <h2 className={styles.showcaseTitle}>{t('landing.designsLove')}</h2>
              </div>
              <Link to="/designs" className={styles.showcaseLink}>
                {t('landing.seeAllDesigns')} <ArrowRight size={15} />
              </Link>
            </div>
            <div className={styles.showcaseGrid}>
              {designs.map((d, i) => <DesignCard key={d.id} design={d} index={i} />)}
            </div>
          </div>
        </section>
      )}

      <section className={styles.features}>
        <div className="container">
          <div className={styles.featGrid}>
            <div className={styles.featCard}>
              <p>🪾 🌳</p>
              <h3>{t('landing.feature1Title')}</h3>
              <p>{t('landing.feature1Body')}</p>
            </div>
            <div className={styles.featCard}>
              <p>🌴 🪴</p>
              <h3>{t('landing.feature2Title')}</h3>
              <p>{t('landing.feature2Body')}</p>
            </div>
            <div className={styles.featCard}>
              <Hammer size={26} color="var(--accent-strong)" />
              <h3>{t('landing.feature3Title')}</h3>
              <p>{t('landing.feature3Body')}</p>
            </div>
            <div className={styles.featCard}>
              <ShieldCheck size={26} color="var(--accent-strong)" />
              <h3>{t('landing.feature4Title')}</h3>
              <p>{t('landing.feature4Body')}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
