import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Navbar from './Navbar';

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
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [transitionStage, location]);

  return (
    <>
      <Navbar />
      <main
        style={{
          opacity: transitionStage === 'enter' ? 1 : 0,
          transform: transitionStage === 'enter' ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
        }}
      >
        <div className="page-enter" key={displayLocation.pathname}>
          <Outlet />
        </div>
      </main>
    </>
  );
}
