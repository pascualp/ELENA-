import { db } from './firebase';
import { collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, query, orderBy, writeBatch } from 'firebase/firestore';
import { Order, OrderItem } from '../types';

export const storage = {
  getOrders: async (): Promise<Order[]> => {
    const q = query(collection(db, 'orders'), orderBy('created_at', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
  },

  getOrder: async (id: string): Promise<Order | null> => {
    const docRef = doc(db, 'orders', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;

    const order = { id: docSnap.id, ...docSnap.data() } as Order;

    const itemsSnap = await getDocs(collection(db, 'orders', id, 'items'));
    order.items = itemsSnap.docs.map(itemDoc => ({ id: itemDoc.id, ...itemDoc.data() } as OrderItem));

    return order;
  },

  createOrder: async (orderData: Omit<Order, 'id' | 'created_at' | 'status' | 'total_kilos' | 'total_amount'>, items: Omit<OrderItem, 'id' | 'order_id' | 'total_item_kilos' | 'total_price'>[]): Promise<Order> => {
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
        itemKilos = Math.max(0, (qty * kpu) - tare);
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
        itemKilos = Math.max(0, (qty * kpu) - tare);
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
  },

  updateOrder: async (id: string, orderData: Partial<Order>, items: Omit<OrderItem, 'id' | 'order_id' | 'total_item_kilos' | 'total_price'>[]) => {
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
        itemKilos = Math.max(0, (qty * kpu) - tare);
        itemTotal = itemKilos * price;
      } else {
        itemTotal = qty * price;
      }
      
      totalKilos += itemKilos;
      totalAmount += itemTotal;
    });

    const orderRef = doc(db, 'orders', id);
    const batch = writeBatch(db);

    batch.update(orderRef, {
      customer_name: orderData.customer_name,
      notes: orderData.notes,
      total_kilos: totalKilos,
      total_amount: totalAmount
    });

    // Delete old items
    const oldItemsSnap = await getDocs(collection(db, 'orders', id, 'items'));
    oldItemsSnap.docs.forEach(itemDoc => {
      batch.delete(itemDoc.ref);
    });

    // Insert new items
    items.forEach(item => {
      const itemRef = doc(collection(db, 'orders', id, 'items'));
      const qty = Number(item.quantity) || 1;
      const kpu = Number(item.kilos_per_unit) || 0;
      const tare = Number(item.tare) || 0;
      const price = Number(item.price) || 0;
      
      let itemKilos = 0;
      let itemTotal = 0;
      
      if (kpu > 0) {
        itemKilos = Math.max(0, (qty * kpu) - tare);
        itemTotal = itemKilos * price;
      } else {
        itemTotal = qty * price;
      }

      batch.set(itemRef, {
        product_name: item.product_name,
        quantity: qty,
        kilos_per_unit: kpu,
        tare: tare,
        price: price,
        total_item_kilos: itemKilos,
        total_price: itemTotal,
        lot_number: item.lot_number,
        is_box: item.is_box
      });
    });

    await batch.commit();
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

  getStats: async () => {
    const ordersSnap = await getDocs(collection(db, 'orders'));
    const orders = ordersSnap.docs.map(doc => doc.data() as Order);
    
    const totalOrders = orders.length;
    const totalKilos = orders.reduce((acc, o) => acc + (o.total_kilos || 0), 0);

    // Daily stats (last 7 days)
    const dailyStats = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      const ordersThatDay = orders.filter(o => o.created_at && o.created_at.startsWith(dateStr));
      
      dailyStats.push({
        date: dateStr,
        count: ordersThatDay.length,
        kilos: ordersThatDay.reduce((acc, o) => acc + (o.total_kilos || 0), 0)
      });
    }

    // Top Customers
    const customerMap: Record<string, number> = {};
    orders.forEach(o => {
      if (o.customer_name) {
        customerMap[o.customer_name] = (customerMap[o.customer_name] || 0) + (o.total_kilos || 0);
      }
    });
    const topCustomers = Object.entries(customerMap)
      .map(([name, kilos]) => ({ name, kilos }))
      .sort((a, b) => b.kilos - a.kilos)
      .slice(0, 5);

    // Top Products
    const productMap: Record<string, number> = {};
    for (const orderDoc of ordersSnap.docs) {
      const itemsSnap = await getDocs(collection(db, 'orders', orderDoc.id, 'items'));
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

  getAllDataForExport: async () => {
    const q = query(collection(db, 'orders'), orderBy('created_at', 'desc'));
    const ordersSnap = await getDocs(q);
    
    const exportData: any[] = [];
    
    for (const orderDoc of ordersSnap.docs) {
      const order = { id: orderDoc.id, ...orderDoc.data() } as Order;
      const itemsSnap = await getDocs(collection(db, 'orders', order.id, 'items'));
      const items = itemsSnap.docs.map(doc => doc.data() as OrderItem);
      
      if (items.length === 0) {
        exportData.push({
          "ID Pedido": order.id,
          "Cliente": order.customer_name,
          "Fecha Creación": new Date(order.created_at).toLocaleString('es-ES'),
          "Estado": order.status,
          "Notas": order.notes,
          "Total Kilos Pedido": order.total_kilos,
          "Importe Total Pedido": order.total_amount || 0,
          "Producto": "",
          "Lote": "",
          "Es Caja": "",
          "Cantidad": "",
          "Kg por Unidad": "",
          "Tara": "",
          "Precio": "",
          "Total Kilos Item": "",
          "Total Importe Item": ""
        });
      } else {
        items.forEach(item => {
          exportData.push({
            "ID Pedido": order.id,
            "Cliente": order.customer_name,
            "Fecha Creación": new Date(order.created_at).toLocaleString('es-ES'),
            "Estado": order.status,
            "Notas": order.notes,
            "Total Kilos Pedido": order.total_kilos,
            "Importe Total Pedido": order.total_amount || 0,
            "Producto": item.product_name,
            "Lote": item.lot_number,
            "Es Caja": item.is_box ? "Sí" : "No",
            "Cantidad": item.quantity,
            "Kg por Unidad": item.kilos_per_unit,
            "Tara": item.tare || 0,
            "Precio": item.price || 0,
            "Total Kilos Item": item.total_item_kilos,
            "Total Importe Item": item.total_price || 0
          });
        });
      }
    }
    
    return exportData;
  }
};
