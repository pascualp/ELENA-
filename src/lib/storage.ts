import { supabase } from './supabase';
import { Order, OrderItem } from '../types';

export const storage = {
  getOrders: async (): Promise<Order[]> => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  getOrder: async (id: number): Promise<Order | null> => {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (orderError) return null;

    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', id);

    if (itemsError) throw itemsError;

    return { ...order, items: items || [] };
  },

  createOrder: async (orderData: Omit<Order, 'id' | 'created_at' | 'status' | 'total_kilos'>, items: Omit<OrderItem, 'id' | 'order_id' | 'total_item_kilos'>[]): Promise<Order> => {
    // Calculate total kilos
    let totalKilos = 0;
    items.forEach(item => {
      totalKilos += (item.quantity * item.kilos_per_unit);
    });

    // Insert Order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([{
        customer_name: orderData.customer_name,
        notes: orderData.notes,
        status: 'pending',
        total_kilos: totalKilos
      }])
      .select()
      .single();

    if (orderError) throw orderError;

    // Prepare Items
    const itemsToInsert = items.map(item => ({
      order_id: order.id,
      product_name: item.product_name,
      quantity: item.quantity,
      kilos_per_unit: item.kilos_per_unit,
      total_item_kilos: item.quantity * item.kilos_per_unit,
      lot_number: item.lot_number,
      is_box: item.is_box
    }));

    // Insert Items
    const { data: insertedItems, error: itemsError } = await supabase
      .from('order_items')
      .insert(itemsToInsert)
      .select();

    if (itemsError) throw itemsError;

    return { ...order, items: insertedItems };
  },

  updateOrder: async (id: number, orderData: Partial<Order>, items: Omit<OrderItem, 'id' | 'order_id' | 'total_item_kilos'>[]) => {
    // Calculate new total
    let totalKilos = 0;
    items.forEach(item => {
      totalKilos += (item.quantity * item.kilos_per_unit);
    });

    // Update Order
    const { error: orderError } = await supabase
      .from('orders')
      .update({
        customer_name: orderData.customer_name,
        notes: orderData.notes,
        total_kilos: totalKilos
      })
      .eq('id', id);

    if (orderError) throw orderError;

    // Delete old items
    const { error: deleteError } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', id);

    if (deleteError) throw deleteError;

    // Insert new items
    const itemsToInsert = items.map(item => ({
      order_id: id,
      product_name: item.product_name,
      quantity: item.quantity,
      kilos_per_unit: item.kilos_per_unit,
      total_item_kilos: item.quantity * item.kilos_per_unit,
      lot_number: item.lot_number,
      is_box: item.is_box
    }));

    const { error: insertError } = await supabase
      .from('order_items')
      .insert(itemsToInsert);

    if (insertError) throw insertError;
  },

  updateStatus: async (id: number, status: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id);
    
    if (error) throw error;
  },

  deleteOrder: async (id: number) => {
    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  getStats: async () => {
    const { count: totalOrders, error: countError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    const { data: orders, error: kilosError } = await supabase
      .from('orders')
      .select('total_kilos, created_at, customer_name');

    if (kilosError) throw kilosError;

    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('product_name, total_item_kilos');

    if (itemsError) throw itemsError;

    const totalKilos = orders.reduce((acc, o) => acc + (o.total_kilos || 0), 0);

    // Daily stats (last 7 days)
    const dailyStats = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      const ordersThatDay = orders.filter(o => o.created_at.startsWith(dateStr));
      
      dailyStats.push({
        date: dateStr,
        count: ordersThatDay.length,
        kilos: ordersThatDay.reduce((acc, o) => acc + (o.total_kilos || 0), 0)
      });
    }

    // Top Customers
    const customerMap: Record<string, number> = {};
    orders.forEach(o => {
      customerMap[o.customer_name] = (customerMap[o.customer_name] || 0) + (o.total_kilos || 0);
    });
    const topCustomers = Object.entries(customerMap)
      .map(([name, kilos]) => ({ name, kilos }))
      .sort((a, b) => b.kilos - a.kilos)
      .slice(0, 5);

    // Top Products
    const productMap: Record<string, number> = {};
    items.forEach(i => {
      productMap[i.product_name] = (productMap[i.product_name] || 0) + (i.total_item_kilos || 0);
    });
    const topProducts = Object.entries(productMap)
      .map(([name, kilos]) => ({ name, kilos }))
      .sort((a, b) => b.kilos - a.kilos)
      .slice(0, 5);

    return { 
      totalOrders: totalOrders || 0, 
      totalKilos, 
      dailyStats,
      topCustomers,
      topProducts
    };
  },

  getCustomers: async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('customer_name')
      .order('customer_name');

    if (error) throw error;

    const customers = new Set(data.map(o => o.customer_name));
    return Array.from(customers);
  },

  getAllDataForExport: async () => {
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .order('created_at', { ascending: false });

    if (ordersError) throw ordersError;

    return orders.map(order => {
      if (!order.order_items || order.order_items.length === 0) {
        return [{
          "ID Pedido": order.id,
          "Cliente": order.customer_name,
          "Fecha Creación": new Date(order.created_at).toLocaleString('es-ES'),
          "Estado": order.status,
          "Notas": order.notes,
          "Total Kilos Pedido": order.total_kilos,
          "Producto": "",
          "Lote": "",
          "Es Caja": "",
          "Cantidad": "",
          "Kg por Unidad": "",
          "Total Kilos Item": ""
        }];
      }
      return order.order_items.map((item: any) => ({
        "ID Pedido": order.id,
        "Cliente": order.customer_name,
        "Fecha Creación": new Date(order.created_at).toLocaleString('es-ES'),
        "Estado": order.status,
        "Notas": order.notes,
        "Total Kilos Pedido": order.total_kilos,
        "Producto": item.product_name,
        "Lote": item.lot_number,
        "Es Caja": item.is_box ? "Sí" : "No",
        "Cantidad": item.quantity,
        "Kg por Unidad": item.kilos_per_unit,
        "Total Kilos Item": item.total_item_kilos
      }));
    }).flat();
  }
};

