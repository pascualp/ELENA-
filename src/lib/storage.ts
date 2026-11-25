import { db, handleFirestoreError, OperationType } from './firebase';
import { collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, query, orderBy, writeBatch } from 'firebase/firestore';
import { Order, OrderItem, Stats } from '../types';

// Hace fn(x) para cada elemento con como mucho `limite` consultas a la vez y devuelve los resultados EN EL MISMO ORDEN.
// 25/11/2026: con todos los pedidos a la vez (Promise.all de cientos) Firestore responde «Too many outstanding requests»;
// uno detrás de otro (como estaba antes) tardaba demasiado. Por eso, tandas de 20.
export async function enTandas<T, R>(lista: T[], fn: (x: T) => Promise<R>, limite = 20): Promise<R[]> {
  const resultados: R[] = new Array(lista.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < lista.length) {
      const i = siguiente++;
      resultados[i] = await fn(lista[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, lista.length) }, trabajador));
  return resultados;
}

// Kilos por producto de un pedido, a partir de sus líneas (ya calculadas, con total_item_kilos).
export function resumirProductos(items: { product_name?: string; total_item_kilos?: number }[]) {
  const mapa: Record<string, number> = {};
  for (const it of items) {
    if (it.product_name) mapa[it.product_name] = (mapa[it.product_name] || 0) + (Number(it.total_item_kilos) || 0);
  }
  return Object.entries(mapa).map(([nombre, kilos]) => ({ nombre, kilos }));
}

// El resumen guardado sirve si se hizo con los mismos kilos que tiene ahora el pedido.
const resumenAlDia = (o: Order) =>
  Array.isArray(o.resumen_productos) && o.resumen_total_kilos === (o.total_kilos || 0);

// Guarda el resumen en los pedidos que no lo tenían (en lotes de 400 escrituras; Firestore admite 500).
// Si falla no pasa nada: la próxima vez se vuelve a calcular.
async function guardarResumenes(lista: { id: string; resumen_productos: Order['resumen_productos']; resumen_total_kilos: number }[]) {
  for (let i = 0; i < lista.length; i += 400) {
    const batch = writeBatch(db);
    for (const r of lista.slice(i, i + 400)) {
      batch.update(doc(db, 'orders', r.id), { resumen_productos: r.resumen_productos, resumen_total_kilos: r.resumen_total_kilos });
    }
    await batch.commit();
  }
}

const sumarResumen = (mapa: Record<string, number>, resumen: Order['resumen_productos']) =>
  (resumen || []).forEach(r => { mapa[r.nombre] = (mapa[r.nombre] || 0) + (Number(r.kilos) || 0); });

const top5 = (mapa: Record<string, number>) =>
  Object.entries(mapa).map(([name, kilos]) => ({ name, kilos })).sort((a, b) => b.kilos - a.kilos).slice(0, 5);

export interface ProductosCompletos {
  topProducts: Stats['topProducts'];
  segundos: number;      // lo que tardó leer las líneas y guardar los resúmenes
  guardados: number;     // resúmenes guardados (0 si falló al guardar)
  error?: string;        // por qué no se pudieron guardar (entonces la próxima vez se vuelven a leer)
}

// Lee las líneas de los pedidos sin resumen (en tandas de 20), suma sus productos a los que ya había y GUARDA el
// resumen en cada pedido, para que la próxima vez no haga falta. Si ya hay uno en marcha (p. ej. se salió y se volvió
// al panel), se reutiliza: así nunca hay más de 20 consultas abiertas a la vez.
let completando: Promise<ProductosCompletos> | null = null;
async function completarProductos(sinResumen: Order[], parcial: Record<string, number>): Promise<ProductosCompletos> {
  if (completando) return completando;
  completando = (async () => {
    const t0 = Date.now();
    const mapa = { ...parcial };
    const itemsPorPedido = await enTandas(sinResumen, o => getDocs(collection(db, 'orders', o.id, 'items')));
    const nuevos = sinResumen.map((o, i) => ({
      id: o.id,
      resumen_productos: resumirProductos(itemsPorPedido[i].docs.map(d => d.data() as OrderItem)),
      resumen_total_kilos: o.total_kilos || 0,
    }));
    nuevos.forEach(n => sumarResumen(mapa, n.resumen_productos));
    let error: string | undefined;
    try {
      await guardarResumenes(nuevos);
    } catch (e: any) {
      error = e?.code || e?.message || String(e);
      console.warn('No se pudieron guardar los resúmenes de productos:', e);
    }
    return { topProducts: top5(mapa), segundos: (Date.now() - t0) / 1000, guardados: error ? 0 : nuevos.length, error };
  })();
  try {
    return await completando;
  } finally {
    completando = null;
  }
}

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
        
        if (kpu !== 0) {
          const netKilosNominal = kpu - (qty * tare);
          itemKilos = kpu < 0 ? netKilosNominal : Math.max(0, netKilosNominal);
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
        
        if (kpu !== 0) {
          const netKilosNominal = kpu - (qty * tare);
          itemKilos = kpu < 0 ? netKilosNominal : Math.max(0, netKilosNominal);
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

      // Resumen de kilos por producto para el panel. Va APARTE y después: si fallara, el pedido ya está guardado
      // igual que siempre y el panel leerá sus líneas.
      guardarResumenes([{ id: orderRef.id, resumen_productos: resumirProductos(insertedItems), resumen_total_kilos: totalKilos }])
        .catch(err => console.warn('No se pudo guardar el resumen del pedido:', err));

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
        
        if (kpu !== 0) {
          const netKilosNominal = kpu - (qty * tare);
          itemKilos = kpu < 0 ? netKilosNominal : Math.max(0, netKilosNominal);
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
        
        if (kpu !== 0) {
          const netKilosNominal = kpu - (qty * tare);
          itemKilos = kpu < 0 ? netKilosNominal : Math.max(0, netKilosNominal);
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

      // Resumen al día con las líneas nuevas, aparte (ver createOrder). Se espera para que getOrder lo devuelva ya.
      await guardarResumenes([{ id, resumen_productos: resumirProductos(insertedItems), resumen_total_kilos: totalKilos }])
        .catch(err => console.warn('No se pudo guardar el resumen del pedido:', err));
      
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

  // Estadísticas del panel en dos tiempos: `stats` sale con UNA consulta (pedidos); si hay pedidos sin resumen de
  // productos, `completar()` lee sus líneas, guarda los resúmenes y devuelve los productos completos.
  getStatsRapido: async (startDate?: string, endDate?: string) => {
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
    const totalAmount = orders.reduce((acc, o) => acc + (o.status === 'pending' ? 0 : (o.total_amount || 0)), 0);

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
        amount: ordersThatDay.reduce((acc, o) => acc + (o.status === 'pending' ? 0 : (o.total_amount || 0)), 0)
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
        customerMap[o.customer_name].amount += (o.status === 'pending' ? 0 : (o.total_amount || 0));
      }
    });
    const topCustomers = Object.entries(customerMap)
      .map(([name, data]) => ({ name, kilos: data.kilos, amount: data.amount }))
      .sort((a, b) => b.kilos - a.kilos)
      .slice(0, 5);

    // Top Products: con los resúmenes guardados en cada pedido (sin leer líneas). Los pedidos SIN resumen al día
    // (los antiguos, la primera vez) NO se esperan aquí: se completan aparte con `completar` (ver completarProductos),
    // así el panel se enseña ya y solo la tarjeta de productos espera.
    const productMap: Record<string, number> = {};
    const sinResumen = orders.filter(o => !resumenAlDia(o));
    orders.filter(resumenAlDia).forEach(o => sumarResumen(productMap, o.resumen_productos));

    const stats: Stats = { totalOrders, totalKilos, totalAmount, dailyStats, topCustomers, topProducts: top5(productMap) };
    return {
      stats,
      pedidos: orders.length,
      sinResumen: sinResumen.length,
      completar: sinResumen.length === 0 ? null : () => completarProductos(sinResumen, productMap),
    };
  },

  // Igual que antes (todo junto, esperando también a los productos), por si algo más lo usa.
  getStats: async (startDate?: string, endDate?: string): Promise<Stats> => {
    const r = await storage.getStatsRapido(startDate, endDate);
    if (r.completar) r.stats.topProducts = (await r.completar()).topProducts;
    return r.stats;
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
    // Igual que en getStats: en tandas de 20 (enTandas mantiene el orden de los pedidos).
    const itemsPorPedido = await enTandas(orders, order => getDocs(collection(db, 'orders', order.id, 'items')));

    for (const [i, order] of orders.entries()) {
      const itemsSnap = itemsPorPedido[i];
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
