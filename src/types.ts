export interface OrderItem {
  id?: string;
  order_id?: string;
  product_name: string;
  quantity: number | string;
  kilos_per_unit: number | string;
  tare: number | string;
  price: number | string;
  total_item_kilos?: number;
  total_price?: number;
  lot_number: string;
  is_box: boolean;
}

export interface Order {
  id: string;
  customer_name: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  created_at: string;
  total_kilos: number;
  total_amount: number;
  notes: string;
  items?: OrderItem[];
  // Kilos por producto de este pedido, guardados en el propio pedido para que el panel no tenga que leer las líneas
  // de cada pedido (25/11/2026). resumen_total_kilos = total_kilos del pedido cuando se hizo el resumen: si no cuadra,
  // el pedido se cambió desde otra versión de la app y el resumen se vuelve a calcular.
  resumen_productos?: { nombre: string; kilos: number }[];
  resumen_total_kilos?: number;
}

export interface Stats {
  totalOrders: number;
  totalKilos: number;
  totalAmount: number;
  dailyStats: {
    date: string;
    kilos: number;
    count: number;
    amount: number;
  }[];
  topCustomers: {
    name: string;
    kilos: number;
    amount: number;
  }[];
  topProducts: {
    name: string;
    kilos: number;
  }[];
}
