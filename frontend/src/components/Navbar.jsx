import { useState, useRef } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ShoppingCart, Bell, Menu, X, Leaf, ChevronDown, LogOut, User, LayoutDashboard, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useNotif } from '../context/NotifContext';
import { useTheme } from '../context/ThemeContext';
import NotifDropdown from './NotifDropdown';
import styles from './Navbar.module.css';

const ROLE_NAV = {
  admin: [
    { to: '/home', label: 'Home' },
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/orders', label: 'Orders' },
    { to: '/admin/plants', label: 'Catalog' },
    { to: '/admin/payments', label: 'Payments' },
  ],
  manager: [
    { to: '/home', label: 'Home' },
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/manager/orders', label: 'Orders' },
    { to: '/manager/tasks', label: 'Tasks' },
    { to: '/manager/employees', label: 'Employees' },
    { to: '/manager/equipment', label: 'Equipment' },
    { to: '/manager/institutions', label: 'Institutions' },
    { to: '/manager/transfers', label: 'Transfers' },
  ],
  employee: [
    { to: '/home', label: 'Home' },
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/employee/tasks', label: 'My Tasks' },
    { to: '/employee/shifts', label: 'Shifts' },
    { to: '/employee/transfers', label: 'Transfers' },
  ],
  customer: [
    { to: '/home', label: 'Home' },
    { to: '/plants', label: 'Plants' },
    { to: '/designs', label: 'Designs' },
    { to: '/wishlist', label: 'Wishlist' },
  ],
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const { unreadCount } = useNotif();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const closeTimerRef = useRef(null);
  const navigate = useNavigate();

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

  const navLinks = user ? (ROLE_NAV[user.role] || []) : [];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        {/* Logo */}
        <Link to={user ? '/dashboard' : '/'} className={styles.logo}>
          <p style={{ fontSize: '1.5rem', }}>🌴</p>
          <span className={styles.logoText}>IMIZI</span>
  
        </Link>

        {/* Desktop nav */}
        <nav className={styles.nav}>
          {navLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        {/* Right actions */}
        <div className={styles.actions}>
          <button
            className={styles.iconBtn}
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
                    <User size={15} /> Profile
                  </Link>
                  <Link to="/dashboard" className={styles.dropItem} onClick={() => setUserMenuOpen(false)}>
                    <LayoutDashboard size={15} /> Dashboard
                  </Link>
                  <div className={styles.dropDivider} />
                  <button className={`${styles.dropItem} ${styles.dropItemDanger}`} onClick={handleLogout}>
                    <LogOut size={15} /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.authLinks}>
              <Link to="/register" className="btn btn-outline" style={{ padding: '0.5rem 1rem', fontSize: '0.88rem' }}>Register</Link>
              <Link to="/login" className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.88rem' }}>Get started</Link>
            </div>
          )}

          {/* Mobile toggle */}
          <button className={styles.mobileToggle} onClick={() => setMobileOpen((o) => !o)}>
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className={styles.mobileNav}>
          <button className={styles.mobileLink} onClick={toggleTheme} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', textAlign: 'left', width: '100%' }}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          {navLinks.map((l) => (
            <NavLink key={l.to} to={l.to} className={styles.mobileLink} onClick={() => setMobileOpen(false)}>
              {l.label}
            </NavLink>
          ))}
          {user ? (
            <button className={`${styles.mobileLink} ${styles.mobileDanger}`} onClick={handleLogout}>Sign out</button>
          ) : (
            <>
              <Link to="/login" className={styles.mobileLink} onClick={() => setMobileOpen(false)}>Sign in</Link>
              <Link to="/register" className={styles.mobileLink} onClick={() => setMobileOpen(false)}>Register</Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
