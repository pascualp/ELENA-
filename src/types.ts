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
