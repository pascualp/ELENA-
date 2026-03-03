export interface OrderItem {
  id?: number;
  product_name: string;
  quantity: number;
  kilos_per_unit: number;
  total_item_kilos?: number;
  lot_number: string;
  is_box: boolean;
}

export interface Order {
  id: number;
  customer_name: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  created_at: string;
  total_kilos: number;
  notes: string;
  items?: OrderItem[];
}

export interface Stats {
  totalOrders: number;
  totalKilos: number;
  dailyStats: {
    date: string;
    kilos: number;
    count: number;
  }[];
  topCustomers: {
    name: string;
    kilos: number;
  }[];
  topProducts: {
    name: string;
    kilos: number;
  }[];
}
