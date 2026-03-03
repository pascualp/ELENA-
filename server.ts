import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Database
const db = new Database('orders.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, processing, completed, cancelled
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_kilos REAL DEFAULT 0,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    kilos_per_unit REAL NOT NULL,
    total_item_kilos REAL NOT NULL,
    lot_number TEXT,
    is_box INTEGER DEFAULT 0,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
  );
`);

// Migration for existing tables
try {
  db.exec("ALTER TABLE order_items ADD COLUMN lot_number TEXT");
  db.exec("ALTER TABLE order_items ADD COLUMN is_box INTEGER DEFAULT 0");
} catch (e) {
  // Columns likely exist
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  
  // Get all orders
  app.get('/api/orders', (req, res) => {
    const stmt = db.prepare('SELECT * FROM orders ORDER BY created_at DESC');
    const orders = stmt.all();
    res.json(orders);
  });

  // Get single order with items
  app.get('/api/orders/:id', (req, res) => {
    const orderStmt = db.prepare('SELECT * FROM orders WHERE id = ?');
    const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
    
    const order = orderStmt.get(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const items = itemsStmt.all(req.params.id);
    res.json({ ...order, items });
  });

  // Create order
  app.post('/api/orders', (req, res) => {
    const { customer_name, notes, items } = req.body;
    
    if (!customer_name || !items || items.length === 0) {
      return res.status(400).json({ error: 'Invalid data' });
    }

    const insertOrder = db.prepare(`
      INSERT INTO orders (customer_name, notes, total_kilos, status)
      VALUES (?, ?, ?, 'pending')
    `);

    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_name, quantity, kilos_per_unit, total_item_kilos, lot_number, is_box)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const createOrderTransaction = db.transaction((orderData, orderItems) => {
      let totalKilos = 0;
      for (const item of orderItems) {
        totalKilos += (item.quantity * item.kilos_per_unit);
      }

      const info = insertOrder.run(orderData.customer_name, orderData.notes, totalKilos);
      const orderId = info.lastInsertRowid;

      for (const item of orderItems) {
        insertItem.run(
          orderId,
          item.product_name,
          item.quantity,
          item.kilos_per_unit,
          item.quantity * item.kilos_per_unit,
          item.lot_number || '',
          item.is_box ? 1 : 0
        );
      }
      return orderId;
    });

    try {
      const orderId = createOrderTransaction({ customer_name, notes }, items);
      res.json({ id: orderId, success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create order' });
    }
  });

  // Update order (full update)
  app.put('/api/orders/:id', (req, res) => {
    const { customer_name, notes, items } = req.body;
    const orderId = req.params.id;

    if (!customer_name || !items || items.length === 0) {
      return res.status(400).json({ error: 'Invalid data' });
    }

    const updateOrder = db.prepare(`
      UPDATE orders SET customer_name = ?, notes = ?, total_kilos = ? WHERE id = ?
    `);

    const deleteItems = db.prepare('DELETE FROM order_items WHERE order_id = ?');

    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_name, quantity, kilos_per_unit, total_item_kilos, lot_number, is_box)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const updateTransaction = db.transaction((orderData, orderItems) => {
      let totalKilos = 0;
      for (const item of orderItems) {
        totalKilos += (item.quantity * item.kilos_per_unit);
      }

      updateOrder.run(orderData.customer_name, orderData.notes, totalKilos, orderId);
      deleteItems.run(orderId);

      for (const item of orderItems) {
        insertItem.run(
          orderId,
          item.product_name,
          item.quantity,
          item.kilos_per_unit,
          item.quantity * item.kilos_per_unit,
          item.lot_number || '',
          item.is_box ? 1 : 0
        );
      }
    });

    try {
      updateTransaction({ customer_name, notes }, items);
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update order' });
    }
  });

  // Update status
  app.patch('/api/orders/:id/status', (req, res) => {
    const { status } = req.body;
    const updateStmt = db.prepare('UPDATE orders SET status = ? WHERE id = ?');
    updateStmt.run(status, req.params.id);
    res.json({ success: true });
  });

  // Delete order
  app.delete('/api/orders/:id', (req, res) => {
    const deleteStmt = db.prepare('DELETE FROM orders WHERE id = ?');
    deleteStmt.run(req.params.id);
    res.json({ success: true });
  });

  // Statistics
  app.get('/api/stats', (req, res) => {
    const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get();
    const totalKilos = db.prepare('SELECT SUM(total_kilos) as sum FROM orders').get();
    
    // Daily stats for the last 7 days
    const dailyStats = db.prepare(`
      SELECT date(created_at) as date, SUM(total_kilos) as kilos, COUNT(*) as count
      FROM orders
      WHERE created_at >= date('now', '-7 days')
      GROUP BY date(created_at)
      ORDER BY date(created_at)
    `).all();

    res.json({
      totalOrders: totalOrders.count,
      totalKilos: totalKilos.sum || 0,
      dailyStats
    });
  });

  // Get unique customers for autocomplete
  app.get('/api/customers', (req, res) => {
    const stmt = db.prepare('SELECT DISTINCT customer_name FROM orders ORDER BY customer_name ASC');
    const customers = stmt.all().map((row: any) => row.customer_name);
    res.json(customers);
  });

  // Get all data for export
  app.get('/api/export-data', (req, res) => {
    const stmt = db.prepare(`
      SELECT 
        o.id as "ID Pedido",
        o.customer_name as "Cliente",
        o.created_at as "Fecha Creación",
        o.status as "Estado",
        o.notes as "Notas",
        o.total_kilos as "Total Kilos Pedido",
        i.product_name as "Producto",
        i.lot_number as "Lote",
        i.is_box as "Es Caja",
        i.quantity as "Cantidad",
        i.kilos_per_unit as "Kg por Unidad",
        i.total_item_kilos as "Total Kilos Item"
      FROM orders o
      LEFT JOIN order_items i ON o.id = i.order_id
      ORDER BY o.created_at DESC
    `);
    const data = stmt.all();
    
    // Convert is_box to readable text
    const formattedData = data.map((row: any) => ({
      ...row,
      "Es Caja": row["Es Caja"] ? "Sí" : "No",
      "Fecha Creación": new Date(row["Fecha Creación"]).toLocaleString('es-ES')
    }));

    res.json(formattedData);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production (if we were building for prod)
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
