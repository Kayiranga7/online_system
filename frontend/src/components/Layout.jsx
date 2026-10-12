import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Navbar from './Navbar';
import styles from './Layout.module.css';

export default function Layout() {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState('enter');

  useEffect(() => {
    if (location.pathname !== displayLocation.pathname) {
      setTransitionStage('exit');
    }
  }, [location, displayLocation]);

  useEffect(() => {
    if (transitionStage === 'exit') {
      const timer = setTimeout(() => {
        setDisplayLocation(location);
        setTransitionStage('enter');
      }, 160);
      return () => clearTimeout(timer);
    }
  }, [transitionStage, location]);

  return (
    <>
      <Navbar />
      <main className={transitionStage === 'enter' ? styles.stageEnter : styles.stageExit}>
        <div className={transitionStage === 'enter' ? 'page-enter' : 'page-exit'} key={displayLocation.pathname}>
          <Outlet />
        </div>
      </main>
    </>
  );
}
