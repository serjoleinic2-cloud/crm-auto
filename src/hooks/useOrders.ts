import { useState, useCallback } from 'react';
import { ipcService } from '../services/ipcService';
import type { Order } from '../types';

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchOrders = useCallback(async (clientId: number) => {
    setLoading(true);
    try {
      const data = await ipcService.orders.getByClientId(clientId);
      setOrders(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const createOrder = useCallback(async (data: Omit<Order, 'id' | 'created_at' | 'updated_at' | 'order_status_name' | 'order_status_color'>) => {
    try {
      const id = await ipcService.orders.create(data);
      return id;
    } catch {
      return null;
    }
  }, []);

  const updateOrder = useCallback(async (id: number, data: Partial<Order>) => {
    try {
      return await ipcService.orders.update(id, data);
    } catch {
      return false;
    }
  }, []);

  const deleteOrder = useCallback(async (id: number) => {
    try {
      return await ipcService.orders.delete(id);
    } catch {
      return false;
    }
  }, []);

  return { orders, loading, fetchOrders, createOrder, updateOrder, deleteOrder };
}
