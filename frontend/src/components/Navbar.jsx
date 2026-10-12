import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ShoppingCart, Bell, Menu, X, ChevronDown, ChevronRight, LogOut, User,
  LayoutDashboard, Sun, Moon, Globe, Check, Home, Users, UsersRound, ShoppingBag,
  Leaf, CreditCard, ClipboardList, Wrench, Building2, ArrowLeftRight, PencilRuler,
  Heart, CalendarDays, Mail,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useNotif } from '../context/NotifContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import NotifDropdown from './NotifDropdown';
import styles from './Navbar.module.css';

const ROLE_NAV = {
  admin: [
    { to: '/home', key: 'nav.home' },
    { to: '/dashboard', key: 'nav.dashboard' },
    { to: '/admin/users', key: 'nav.users' },
    { to: '/admin/orders', key: 'nav.orders' },
    { to: '/admin/plants', key: 'nav.catalog' },
    { to: '/admin/payments', key: 'nav.payments' },
    { to: '/admin/emails', key: 'nav.emails' },
  ],
  manager: [
    { to: '/home', key: 'nav.home' },
    { to: '/dashboard', key: 'nav.dashboard' },
    { to: '/manager/orders', key: 'nav.orders' },
    { to: '/manager/tasks', key: 'nav.tasks' },
    { to: '/manager/employees', key: 'nav.employees' },
    { to: '/manager/equipment', key: 'nav.equipment' },
    { to: '/manager/institutions', key: 'nav.institutions' },
    { to: '/manager/transfers', key: 'nav.transfers' },
  ],
  employee: [
    { to: '/home', key: 'nav.home' },
    { to: '/dashboard', key: 'nav.dashboard' },
    { to: '/employee/tasks', key: 'nav.myTasks' },
    { to: '/employee/shifts', key: 'nav.shifts' },
    { to: '/employee/transfers', key: 'nav.transfers' },
  ],
  customer: [
    { to: '/home', key: 'nav.home' },
    { to: '/plants', key: 'nav.plants' },
    { to: '/designs', key: 'nav.designs' },
    { to: '/wishlist', key: 'nav.wishlist' },
  ],
};

// Menu rows carry an icon; the desktop bar stays text-only so more links fit
// before any of them has to move into the menu.
const NAV_ICONS = {
  'nav.home': Home,
  'nav.dashboard': LayoutDashboard,
  'nav.users': Users,
  'nav.plants': Leaf,
  'nav.designs': PencilRuler,
  'nav.wishlist': Heart,
  'nav.orders': ShoppingBag,
  'nav.catalog': Leaf,
  'nav.payments': CreditCard,
  'nav.emails': Mail,
  'nav.tasks': ClipboardList,
  'nav.myTasks': ClipboardList,
  'nav.employees': UsersRound,
  'nav.equipment': Wrench,
  'nav.institutions': Building2,
  'nav.transfers': ArrowLeftRight,
  'nav.shifts': CalendarDays,
};

const DESKTOP_QUERY = '(min-width: 900px)';

// Progressive nav collapse. Rather than dropping the whole bar at a single
// breakpoint, links are taken off the end one at a time as the row runs out of
// room and the menu button appears to hold them. Widths are read from an
// off-screen twin of the track, so this follows the signed-in role and the
// active language instead of a per-item breakpoint.
function useCollapsedNav(links, pathname) {
  const innerRef = useRef(null);
  const measureRef = useRef(null);
  const [state, setState] = useState(() => {
    const desktop = typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches;
    return { visibleCount: desktop ? links.length : 0, showToggle: !desktop, isDesktop: desktop };
  });

  useLayoutEffect(() => {
    const inner = innerRef.current;
    const measure = measureRef.current;
    if (!inner || !measure) return undefined;

    let cancelled = false;
    const commit = (next) => { if (!cancelled) setState(next); };

    const compute = () => {
      const isDesktop = window.matchMedia(DESKTOP_QUERY).matches;
      const total = links.length;

      if (!isDesktop) {
        commit({ visibleCount: 0, showToggle: true, isDesktop: false });
        return;
      }

      const logo = inner.querySelector('[data-nav="logo"]');
      const actions = inner.querySelector('[data-nav="actions"]');
      const toggle = inner.querySelector('[data-nav="toggle"]');
      const cloneRow = measureRef.current;
      const toggleClone = measure.querySelector('[data-measure="toggle"]');
      const linkClones = Array.from(measure.querySelectorAll('[data-measure="link"]'));
      if (!total || !logo || !actions || !cloneRow || !toggleClone) {
        commit({ visibleCount: 0, showToggle: false, isDesktop: true });
        return;
      }

      const rowStyle = getComputedStyle(inner);
      const contentWidth = inner.clientWidth
        - parseFloat(rowStyle.paddingLeft) - parseFloat(rowStyle.paddingRight);
      const rowGap = parseFloat(rowStyle.columnGap) || 0;

      // Reserve the menu button's slot unconditionally - including while it is
      // unmounted - so the answer never depends on whether the button is
      // currently rendered (which would flip back and forth).
      const actionsWidth = actions.getBoundingClientRect().width
        - (toggle ? toggle.getBoundingClientRect().width : 0)
        + toggleClone.getBoundingClientRect().width;

      const cloneStyle = getComputedStyle(cloneRow);
      const trackChrome = parseFloat(cloneStyle.paddingLeft) + parseFloat(cloneStyle.paddingRight)
        + parseFloat(cloneStyle.borderLeftWidth) + parseFloat(cloneStyle.borderRightWidth);
      const available = contentWidth - logo.getBoundingClientRect().width
        - actionsWidth - rowGap * 2 - trackChrome;
      const trackGap = parseFloat(cloneStyle.columnGap) || 0;

      let used = 0;
      let fits = 0;
      for (const clone of linkClones) {
        const width = clone.getBoundingClientRect().width;
        const next = used + (fits ? trackGap : 0) + width;
        if (next > available) break;
        used = next;
        fits += 1;
      }

      commit(fits >= total
        ? { visibleCount: total, showToggle: false, isDesktop: true }
        : { visibleCount: fits, showToggle: true, isDesktop: true });
    };

    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(inner);
    const media = window.matchMedia(DESKTOP_QUERY);
    media.addEventListener('change', compute);
    // Labels get wider once the display font swaps in.
    const fonts = document.fonts;
    if (fonts && fonts.ready) fonts.ready.then(() => compute()).catch(() => {});

    return () => {
      cancelled = true;
      observer.disconnect();
      media.removeEventListener('change', compute);
    };
  }, [links, pathname]);

  return { ...state, innerRef, measureRef };
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const { unreadCount } = useNotif();
  const { theme, toggleTheme } = useTheme();
  const { locale, setLocale, t, locales } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const closeTimerRef = useRef(null);
  const toggleRef = useRef(null);
  const langRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const activeLocale = locales.find((l) => l.code === locale) || locales[0];
  const navLinks = useMemo(() => (user ? ROLE_NAV[user.role] || [] : []), [user]);
  const { visibleCount, showToggle, isDesktop, innerRef, measureRef } =
    useCollapsedNav(navLinks, location.pathname);
  const menuLinks = navLinks.slice(visibleCount);
  // NavLink treats a deeper path as a match too; the measuring clones need the
  // same class as the rendered link so their widths line up.
  const isActivePath = (to) => location.pathname === to || location.pathname.startsWith(`${to}/`);

  // Small delay before closing on mouse-leave so moving the cursor diagonally
  // from the button down into the dropdown doesn't close it first.
  const openUserMenu = () => {
    clearTimeout(closeTimerRef.current);
    setUserMenuOpen(true);
  };
  const scheduleCloseUserMenu = () => {
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setUserMenuOpen(false), 150);
  };

  // Close the language dropdown when clicking anywhere else.
  useEffect(() => {
    if (!langOpen) return;
    const handleClick = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [langOpen]);

  // The menu button only exists while something is collapsed; if the bar grows
  // wide enough to take every link back, the panel goes with it.
  useEffect(() => {
    if (!showToggle) setMobileOpen(false);
  }, [showToggle]);

  // Navigating dismisses the menu.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Escape closes the menu and the page behind it stops scrolling while open.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      setMobileOpen(false);
      // The panel unmounts with the focus inside it, which would drop the
      // caret on <body>; hand it back to the button that opened the menu.
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  const handleLogout = async () => {
    setMobileOpen(false);
    await logout();
    navigate('/login');
  };

  const pickLocale = (code) => {
    setLocale(code);
    setLangOpen(false);
  };

  const themeLabel = theme === 'dark' ? 'nav.lightMode' : 'nav.darkMode';

  return (
    <header className={styles.header}>
      <div className={styles.inner} ref={innerRef}>
        {/* Logo */}
        <Link to={user ? '/dashboard' : '/'} className={styles.logo} data-nav="logo">
          <span className={styles.logoMark} aria-hidden="true">🌿</span>
          <span className={styles.logoText}>IMIZI</span>
        </Link>

        {/* Desktop nav */}
        <nav className={styles.nav}>
          <div className={styles.navTrack}>
            {navLinks.slice(0, visibleCount).map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
              >
                {t(l.key)}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Right actions */}
        <div className={styles.actions} data-nav="actions">
          {/* Language switcher */}
          <div className={styles.langWrap} ref={langRef}>
            <button
              className={styles.langBtn}
              onClick={() => setLangOpen((o) => !o)}
              aria-label={t('nav.language')}
              title={t('nav.language')}
              aria-haspopup="listbox"
              aria-expanded={langOpen}
            >
              <Globe size={18} />
              <span className={styles.langCode}>{activeLocale.short}</span>
              <ChevronDown size={13} className={langOpen ? styles.chevronUp : ''} />
            </button>
            {langOpen && (
              <div className={styles.langMenu} role="listbox">
                {locales.map((l) => (
                  <button
                    key={l.code}
                    role="option"
                    aria-selected={l.code === locale}
                    className={`${styles.langItem} ${l.code === locale ? styles.langItemActive : ''}`}
                    onClick={() => pickLocale(l.code)}
                  >
                    <span>{l.label}</span>
                    {l.code === locale && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className={`${styles.iconBtn} ${styles.themeBtn}`}
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          </button>

          {user?.role === 'customer' && (
            <Link to="/cart" className={styles.iconBtn}>
              <ShoppingCart size={20} />
              {count > 0 && <span className={styles.badge}>{count}</span>}
            </Link>
          )}

          {user && (
            <div className={styles.notifWrap}>
              <button className={styles.iconBtn} onClick={() => setNotifOpen((o) => !o)}>
                <Bell size={20} />
                {unreadCount > 0 && <span className={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>
              {notifOpen && <NotifDropdown onClose={() => setNotifOpen(false)} />}
            </div>
          )}

          {user ? (
            <div
              className={styles.userMenu}
              onMouseEnter={openUserMenu}
              onMouseLeave={scheduleCloseUserMenu}
            >
              <button className={styles.userBtn} onFocus={openUserMenu}>
                <div className={styles.avatar}>{user.fullName?.[0]?.toUpperCase() || '?'}</div>
                <span className={styles.userName}>{user.fullName?.split(' ')[0]}</span>
                <ChevronDown size={14} />
              </button>
              {userMenuOpen && (
                <div className={styles.dropdown}>
                  <Link to="/profile" className={styles.dropItem} onClick={() => setUserMenuOpen(false)}>
                    <User size={15} /> {t('nav.profile')}
                  </Link>
                  <Link to="/dashboard" className={styles.dropItem} onClick={() => setUserMenuOpen(false)}>
                    <LayoutDashboard size={15} /> {t('nav.dashboard')}
                  </Link>
                  <div className={styles.dropDivider} />
                  <button className={`${styles.dropItem} ${styles.dropItemDanger}`} onClick={handleLogout}>
                    <LogOut size={15} /> {t('nav.signOut')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.authLinks}>
              <Link to="/login" className={styles.signInLink}>{t('nav.signIn')}</Link>
              <Link to="/register" className={styles.registerBtn}>{t('nav.register')}</Link>
            </div>
          )}

          {/* Menu toggle - shown whenever a link could not fit in the bar */}
          {showToggle && (
            <button
              type="button"
              ref={toggleRef}
              className={styles.mobileToggle}
              onClick={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? t('nav.closeMenu') : t('nav.openMenu')}
              aria-expanded={mobileOpen}
              aria-controls="primary-menu"
              data-nav="toggle"
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          )}
        </div>

        {/* Off-screen twin of the track: natural widths for the collapse maths */}
        <div className={`${styles.navTrack} ${styles.measure}`} ref={measureRef} aria-hidden="true">
          {navLinks.map((l) => (
            <span
              key={l.to}
              data-measure="link"
              className={`${styles.navLink} ${isActivePath(l.to) ? styles.navLinkActive : ''}`}
            >
              {t(l.key)}
            </span>
          ))}
          <span data-measure="toggle" className={styles.mobileToggle} />
        </div>
      </div>

      {/* Menu panel */}
      {mobileOpen && (
        <>
          <div className={styles.scrim} onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div className={styles.mobileNav} id="primary-menu">
            {/* Language and account live in the bar on desktop, so the panel
                only carries them while the bar is in its small-screen form. */}
            {!isDesktop && (
              <div className={styles.mobileLangRow}>
                <Globe size={16} />
                <span className={styles.mobileLangLabel}>{t('nav.language')}</span>
                <div className={styles.mobileLangOptions}>
                  {locales.map((l) => (
                    <button
                      key={l.code}
                      className={`${styles.mobileLangOpt} ${l.code === locale ? styles.mobileLangOptActive : ''}`}
                      onClick={() => setLocale(l.code)}
                    >
                      {l.short}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {menuLinks.map((l) => {
              const Icon = NAV_ICONS[l.key];
              return (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) => `${styles.mobileLink} ${isActive ? styles.mobileLinkActive : ''}`}
                  onClick={() => setMobileOpen(false)}
                >
                  {Icon && <span className={styles.mobileIcon}><Icon size={17} /></span>}
                  <span className={styles.mobileLabel}>{t(l.key)}</span>
                  <ChevronRight size={15} className={styles.mobileChevron} />
                </NavLink>
              );
            })}

            {!isDesktop && (
              <>
                <button type="button" className={styles.mobileLink} onClick={toggleTheme}>
                  <span className={styles.mobileIcon}>
                    {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
                  </span>
                  <span className={styles.mobileLabel}>{t(themeLabel)}</span>
                </button>
                {user ? (
                  <button
                    type="button"
                    className={`${styles.mobileLink} ${styles.mobileDanger}`}
                    onClick={handleLogout}
                  >
                    <span className={styles.mobileIcon}><LogOut size={17} /></span>
                    <span className={styles.mobileLabel}>{t('nav.signOut')}</span>
                  </button>
                ) : (
                  <div className={styles.mobileAuthRow}>
                    <Link to="/login" className={styles.mobileSignIn} onClick={() => setMobileOpen(false)}>{t('nav.signIn')}</Link>
                    <Link to="/register" className={styles.mobileRegister} onClick={() => setMobileOpen(false)}>{t('nav.register')}</Link>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </header>
  );
}
