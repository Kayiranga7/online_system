import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Auth0Provider } from '@auth0/auth0-react';
import { auth0ProviderConfig, isAuth0Configured, AUTH0_CALLBACK_PATH } from './services/auth0';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotifProvider } from './context/NotifContext';
import { CartProvider } from './context/CartContext';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider, AuthenticatedLanguageSync } from './context/LanguageContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { ToastProvider } from './components/UI';

import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import { VerifyEmailPage, ForgotPasswordPage, ResetPasswordPage } from './pages/AuthExtras';
import Auth0CallbackPage from './pages/Auth0CallbackPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';

import PlantsPage from './pages/PlantsPage';
import PlantDetailPage from './pages/PlantDetailPage';
import DesignsPage from './pages/DesignsPage';
import DesignDetailPage from './pages/DesignDetailPage';
import WishlistPage from './pages/WishlistPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';

import TasksPage from './pages/TasksPage';
import EmployeeTasksPage from './pages/EmployeeTasksPage';
import UsersPage from './pages/UsersPage';
import AdminCatalogPage from './pages/AdminCatalogPage';
import EquipmentPage from './pages/EquipmentPage';
import InstitutionsPage from './pages/InstitutionsPage';
import PaymentsPage from './pages/PaymentsPage';
import ShiftsPage from './pages/ShiftsPage';
import TransfersPage from './pages/TransfersPage';
import TransferDetailPage from './pages/TransferDetailPage';
import NotificationDetailPage from './pages/NotificationDetailPage';
import KycPage from './pages/KycPage';
import KycReviewPage from './pages/KycReviewPage';
import EmailQueuePage from './pages/EmailQueuePage';

import './styles/tokens.css';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : <LandingPage />;
}

/**
 * Mounts the Auth0 SDK only when a tenant is configured. Everything using
 * `useAuth0` lives inside it, so an unconfigured deployment never touches the
 * SDK and the password/Google flows stay exactly as they were.
 */
function Auth0Shell({ children }) {
  const navigate = useNavigate();
  if (!isAuth0Configured) return children;

  return (
    <Auth0Provider
      {...auth0ProviderConfig}
      onRedirectCallback={(appState) => navigate(appState?.returnTo || AUTH0_CALLBACK_PATH, { replace: true })}
    >
      {children}
    </Auth0Provider>
  );
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Auth0Shell>
        <AuthProvider>
          <LanguageProvider>
          <AuthenticatedLanguageSync />
          <NotifProvider>
            <CartProvider>
              <ToastProvider />
              <Routes>
              {/* Outside Layout: the Auth0 redirect lands here before there is a session */}
              {isAuth0Configured && <Route path={AUTH0_CALLBACK_PATH} element={<Auth0CallbackPage />} />}
              <Route element={<Layout />}>
                {/* Public */}
                <Route path="/" element={<HomeRedirect />} />
                <Route path="/home" element={<LandingPage />} />
                <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
                <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/plants" element={<PlantsPage />} />
                <Route path="/plants/:id" element={<PlantDetailPage />} />
                <Route path="/designs" element={<DesignsPage />} />
                <Route path="/designs/:id" element={<DesignDetailPage />} />

                {/* Authenticated - any role */}
                <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                <Route path="/orders" element={<ProtectedRoute roles={['customer','manager','admin']}><OrdersPage /></ProtectedRoute>} />
                <Route path="/orders/:id" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
                <Route path="/notifications/:id" element={<ProtectedRoute><NotificationDetailPage /></ProtectedRoute>} />
                <Route path="/kyc" element={<ProtectedRoute roles={['customer']}><KycPage /></ProtectedRoute>} />
                <Route path="/transfers/:id" element={<ProtectedRoute roles={['employee','manager','admin']}><TransferDetailPage /></ProtectedRoute>} />

                {/* Customer-only */}
                <Route path="/wishlist" element={<ProtectedRoute roles={['customer']}><WishlistPage /></ProtectedRoute>} />
                <Route path="/cart" element={<ProtectedRoute roles={['customer']}><CartPage /></ProtectedRoute>} />
                <Route path="/checkout" element={<ProtectedRoute roles={['customer']}><CheckoutPage /></ProtectedRoute>} />

                {/* Manager/Admin */}
                <Route path="/manager/orders" element={<ProtectedRoute roles={['manager','admin']}><OrdersPage /></ProtectedRoute>} />
                <Route path="/manager/tasks" element={<ProtectedRoute roles={['manager','admin']}><TasksPage /></ProtectedRoute>} />
                <Route path="/manager/employees" element={<ProtectedRoute roles={['manager','admin']}><UsersPage /></ProtectedRoute>} />
                <Route path="/manager/equipment" element={<ProtectedRoute roles={['manager','admin']}><EquipmentPage /></ProtectedRoute>} />
                <Route path="/manager/institutions" element={<ProtectedRoute roles={['manager','admin']}><InstitutionsPage /></ProtectedRoute>} />
                <Route path="/manager/transfers" element={<ProtectedRoute roles={['manager','admin']}><TransfersPage /></ProtectedRoute>} />
                <Route path="/admin/users" element={<ProtectedRoute roles={['admin']}><UsersPage /></ProtectedRoute>} />
                <Route path="/admin/orders" element={<ProtectedRoute roles={['admin']}><OrdersPage /></ProtectedRoute>} />
                <Route path="/admin/plants" element={<ProtectedRoute roles={['admin']}><AdminCatalogPage /></ProtectedRoute>} />
                <Route path="/admin/payments" element={<ProtectedRoute roles={['admin']}><PaymentsPage /></ProtectedRoute>} />
                <Route path="/admin/kyc" element={<ProtectedRoute roles={['admin', 'manager']}><KycReviewPage /></ProtectedRoute>} />
                <Route path="/admin/emails" element={<ProtectedRoute roles={['admin']}><EmailQueuePage /></ProtectedRoute>} />

                {/* Employee */}
                <Route path="/employee/tasks" element={<ProtectedRoute roles={['employee']}><EmployeeTasksPage /></ProtectedRoute>} />
                <Route path="/employee/shifts" element={<ProtectedRoute roles={['employee']}><ShiftsPage /></ProtectedRoute>} />
                <Route path="/employee/transfers" element={<ProtectedRoute roles={['employee']}><TransfersPage /></ProtectedRoute>} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
            </CartProvider>
          </NotifProvider>
          </LanguageProvider>
        </AuthProvider>
        </Auth0Shell>
      </BrowserRouter>
    </ThemeProvider>
  );
}
