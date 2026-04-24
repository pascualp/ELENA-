import { db, handleFirestoreError, OperationType } from './firebase';
import { collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, query, orderBy, writeBatch } from 'firebase/firestore';
import { Order, OrderItem } from '../types';

export const storage = {
  getOrders: async (startDate?: string, endDate?: string): Promise<Order[]> => {
    try {
      let q = query(collection(db, 'orders'), orderBy('created_at', 'desc'));
      const snapshot = await getDocs(q);
      let orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

      if (startDate || endDate) {
        orders = orders.filter(o => {
          if (!o.created_at) return false;
          const orderDate = o.created_at.split('T')[0];
          if (startDate && orderDate < startDate) return false;
          if (endDate && orderDate > endDate) return false;
          return true;
        });
      }
      return orders;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'orders');
      return [];
    }
  },

  getOrder: async (id: string): Promise<Order | null> => {
    try {
      const docRef = doc(db, 'orders', id);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) return null;

      const order = { id: docSnap.id, ...docSnap.data() } as Order;

      const itemsSnap = await getDocs(collection(db, 'orders', id, 'items'));
      order.items = itemsSnap.docs.map(itemDoc => ({ id: itemDoc.id, ...itemDoc.data() } as OrderItem));

      return order;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `orders/${id}`);
      return null;
    }
  },

  createOrder: async (orderData: Omit<Order, 'id' | 'created_at' | 'status' | 'total_kilos' | 'total_amount'>, items: Omit<OrderItem, 'id' | 'order_id' | 'total_item_kilos' | 'total_price'>[]): Promise<Order> => {
    try {
      let totalKilos = 0;
      let totalAmount = 0;
      items.forEach(item => {
        const qty = Number(item.quantity) || 1;
        const kpu = Number(item.kilos_per_unit) || 0;
        const tare = Number(item.tare) || 0;
        const price = Number(item.price) || 0;
        
        let itemKilos = 0;
        let itemTotal = 0;
        
        if (kpu > 0) {
          itemKilos = Math.max(0, kpu - (qty * tare));
          itemTotal = itemKilos * price;
        } else {
          itemTotal = qty * price;
        }
        
        totalKilos += itemKilos;
        totalAmount += itemTotal;
      });

      const orderRef = doc(collection(db, 'orders'));
      const newOrder: any = {
        customer_name: orderData.customer_name,
        notes: orderData.notes,
        status: 'pending',
        total_kilos: totalKilos,
        total_amount: totalAmount,
        created_at: new Date().toISOString()
      };

      const batch = writeBatch(db);
      batch.set(orderRef, newOrder);

      const insertedItems: OrderItem[] = [];
      items.forEach(item => {
        const itemRef = doc(collection(db, 'orders', orderRef.id, 'items'));
        const qty = Number(item.quantity) || 1;
        const kpu = Number(item.kilos_per_unit) || 0;
        const tare = Number(item.tare) || 0;
        const price = Number(item.price) || 0;
        
        let itemKilos = 0;
        let itemTotal = 0;
        
        if (kpu > 0) {
          itemKilos = Math.max(0, kpu - (qty * tare));
          itemTotal = itemKilos * price;
        } else {
          itemTotal = qty * price;
        }

        const newItem = {
          product_name: item.product_name,
          quantity: qty,
          kilos_per_unit: kpu,
          tare: tare,
          price: price,
          total_item_kilos: itemKilos,
          total_price: itemTotal,
          lot_number: item.lot_number,
          is_box: item.is_box
        };
        batch.set(itemRef, newItem);
        insertedItems.push({ id: itemRef.id, order_id: orderRef.id, ...newItem });
      });

      await batch.commit();

      return { id: orderRef.id, ...newOrder, items: insertedItems };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders');
      throw error;
    }
  },

  updateOrder: async (id: string, orderData: Partial<Order>, items: Omit<OrderItem, 'id' | 'order_id' | 'total_item_kilos' | 'total_price'>[]): Promise<Order> => {
    try {
      let totalKilos = 0;
      let totalAmount = 0;
      items.forEach(item => {
        const qty = Number(item.quantity) || 1;
        const kpu = Number(item.kilos_per_unit) || 0;
        const tare = Number(item.tare) || 0;
        const price = Number(item.price) || 0;
        
        let itemKilos = 0;
        let itemTotal = 0;
        
        if (kpu > 0) {
          itemKilos = Math.max(0, kpu - (qty * tare));
          itemTotal = itemKilos * price;
        } else {
          itemTotal = qty * price;
        }
        
        totalKilos += itemKilos;
        totalAmount += itemTotal;
      });

      const orderRef = doc(db, 'orders', id);
      const batch = writeBatch(db);

      const updatedOrderData = {
        customer_name: orderData.customer_name,
        notes: orderData.notes,
        total_kilos: totalKilos,
        total_amount: totalAmount
      };

      batch.update(orderRef, updatedOrderData);

      // Delete old items
      const oldItemsSnap = await getDocs(collection(db, 'orders', id, 'items'));
      oldItemsSnap.docs.forEach(itemDoc => {
        batch.delete(itemDoc.ref);
      });

      // Insert new items
      const insertedItems: OrderItem[] = [];
      items.forEach(item => {
        const itemRef = doc(collection(db, 'orders', id, 'items'));
        const qty = Number(item.quantity) || 1;
        const kpu = Number(item.kilos_per_unit) || 0;
        const tare = Number(item.tare) || 0;
        const price = Number(item.price) || 0;
        
        let itemKilos = 0;
        let itemTotal = 0;
        
        if (kpu > 0) {
          itemKilos = Math.max(0, kpu - (qty * tare));
          itemTotal = itemKilos * price;
        } else {
          itemTotal = qty * price;
        }

        const newItem = {
          product_name: item.product_name,
          quantity: qty,
          kilos_per_unit: kpu,
          tare: tare,
          price: price,
          total_item_kilos: itemKilos,
          total_price: itemTotal,
          lot_number: item.lot_number,
          is_box: item.is_box
        };
        batch.set(itemRef, newItem);
        insertedItems.push({ id: itemRef.id, order_id: id, ...newItem });
      });

      await batch.commit();
      
      // Get the full order to return
      const finalOrder = await storage.getOrder(id);
      if (!finalOrder) throw new Error("Order not found after update");
      return finalOrder;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${id}`);
      throw error;
    }
  },

  updateStatus: async (id: string, status: string) => {
    const orderRef = doc(db, 'orders', id);
    await updateDoc(orderRef, { status });
  },

  deleteOrder: async (id: string) => {
    const orderRef = doc(db, 'orders', id);
    const batch = writeBatch(db);
    
    const itemsSnap = await getDocs(collection(db, 'orders', id, 'items'));
    itemsSnap.docs.forEach(itemDoc => {
      batch.delete(itemDoc.ref);
    });
    
    batch.delete(orderRef);
    await batch.commit();
  },

  getStats: async (startDate?: string, endDate?: string) => {
    let q = query(collection(db, 'orders'));
    const ordersSnap = await getDocs(q);
    let orders = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
    
    // Filter by date if provided
    if (startDate || endDate) {
      orders = orders.filter(o => {
        if (!o.created_at) return false;
        const orderDate = o.created_at.split('T')[0];
        if (startDate && orderDate < startDate) return false;
        if (endDate && orderDate > endDate) return false;
        return true;
      });
    }
    
    const totalOrders = orders.length;
    const totalKilos = orders.reduce((acc, o) => acc + (o.total_kilos || 0), 0);
    const totalAmount = orders.reduce((acc, o) => acc + (o.total_amount || 0), 0);

    // Daily stats logic
    const dailyStatsMap: Record<string, {count: number, kilos: number, amount: number}> = {};
    
    // Determine range for daily stats
    let dailyRange = [];
    if (startDate && endDate) {
      let current = new Date(startDate);
      const last = new Date(endDate);
      while (current <= last) {
        dailyRange.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
        if (dailyRange.length > 90) break; // Safety limit
      }
    } else {
      // Default to last 7 days from now or from the last order
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dailyRange.push(d.toISOString().split('T')[0]);
      }
    }

    dailyRange.forEach(date => {
      const ordersThatDay = orders.filter(o => o.created_at && o.created_at.startsWith(date));
      dailyStatsMap[date] = {
        count: ordersThatDay.length,
        kilos: ordersThatDay.reduce((acc, o) => acc + (o.total_kilos || 0), 0),
        amount: ordersThatDay.reduce((acc, o) => acc + (o.total_amount || 0), 0)
      };
    });

    const dailyStats = Object.entries(dailyStatsMap).map(([date, data]) => ({
      date,
      ...data
    })).sort((a, b) => a.date.localeCompare(b.date));

    // Top Customers
    const customerMap: Record<string, {kilos: number, amount: number}> = {};
    orders.forEach(o => {
      if (o.customer_name) {
        if (!customerMap[o.customer_name]) {
          customerMap[o.customer_name] = { kilos: 0, amount: 0 };
        }
        customerMap[o.customer_name].kilos += (o.total_kilos || 0);
        customerMap[o.customer_name].amount += (o.total_amount || 0);
      }
    });
    const topCustomers = Object.entries(customerMap)
      .map(([name, data]) => ({ name, kilos: data.kilos, amount: data.amount }))
      .sort((a, b) => b.kilos - a.kilos)
      .slice(0, 5);

    // Top Products
    const productMap: Record<string, number> = {};
    for (const order of orders) {
      const itemsSnap = await getDocs(collection(db, 'orders', order.id, 'items'));
      itemsSnap.docs.forEach(itemDoc => {
        const item = itemDoc.data() as OrderItem;
        if (item.product_name) {
          productMap[item.product_name] = (productMap[item.product_name] || 0) + (item.total_item_kilos || 0);
        }
      });
    }
    const topProducts = Object.entries(productMap)
      .map(([name, kilos]) => ({ name, kilos }))
      .sort((a, b) => b.kilos - a.kilos)
      .slice(0, 5);

    return { 
      totalOrders, 
      totalKilos, 
      totalAmount,
      dailyStats,
      topCustomers,
      topProducts
    };
  },

  getCustomers: async () => {
    const ordersSnap = await getDocs(collection(db, 'orders'));
    const customers = new Set(ordersSnap.docs.map(doc => doc.data().customer_name).filter(Boolean));
    return Array.from(customers);
  },

  getAllDataForExport: async (startDate?: string, endDate?: string) => {
    let q = query(collection(db, 'orders'), orderBy('created_at', 'desc'));
    const ordersSnap = await getDocs(q);
    let orders = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));

    if (startDate || endDate) {
      orders = orders.filter(o => {
        if (!o.created_at) return false;
        const orderDate = o.created_at.split('T')[0];
        if (startDate && orderDate < startDate) return false;
        if (endDate && orderDate > endDate) return false;
        return true;
      });
    }
    
    const exportData: any[] = [];
    
    for (const order of orders) {
      const itemsSnap = await getDocs(collection(db, 'orders', order.id, 'items'));
      const items = itemsSnap.docs.map(doc => doc.data() as OrderItem);
      
      if (items.length === 0) {
        exportData.push({
          "Cliente": order.customer_name,
          "Fecha Creación": new Date(order.created_at).toLocaleString('es-ES'),
          "Estado": order.status,
          "Notas": order.notes,
          "Total Kilos Pedido": order.total_kilos,
          "Importe Total Pedido": order.total_amount || 0,
          "Producto": "",
          "Lote": "",
          "Cantidad": "",
          "Kg por Unidad": "",
          "Tara": "",
          "Precio": ""
        });
      } else {
        items.forEach(item => {
          exportData.push({
            "Cliente": order.customer_name,
            "Fecha Creación": new Date(order.created_at).toLocaleString('es-ES'),
            "Estado": order.status,
            "Notas": order.notes,
            "Total Kilos Pedido": order.total_kilos,
            "Importe Total Pedido": order.total_amount || 0,
            "Producto": item.product_name,
            "Lote": item.lot_number,
            "Cantidad": item.quantity,
            "Kg por Unidad": item.kilos_per_unit,
            "Tara": (Number(item.tare) || 0) * (Number(item.quantity) || 1),
            "Precio": item.price || 0
          });
        });
      }
    }
    
    return exportData;
  }
};
