import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../services/api';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [subtotal, setSubtotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || user.role !== 'customer') return;
    setLoading(true);
    try {
      const res = await api.get('/cart');
      setItems(res.data.items || []);
      setSubtotal(res.data.subtotal || 0);
    } catch {} finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const addItem = async (itemType, itemId, quantity = 1) => {
    await api.post('/cart/items', { itemType, itemId, quantity });
    await refresh();
  };

  const updateItem = async (cartItemId, quantity) => {
    await api.patch(`/cart/items/${cartItemId}`, { quantity });
    await refresh();
  };

  const removeItem = async (cartItemId) => {
    await api.delete(`/cart/items/${cartItemId}`);
    await refresh();
  };

  return (
    <CartContext.Provider value={{ items, subtotal, loading, refresh, addItem, updateItem, removeItem, count: items.length }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
