import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { OrderForm } from './components/OrderForm';
import { OrderList } from './components/OrderList';
import { OrderDetail } from './components/OrderDetail';
import { Menu } from 'lucide-react';
import { Order } from './types';

import { storage } from './lib/storage';

export default function App() {
  const [activeTab, setActiveTab] = useState('new-order');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const handleOrderCreated = () => {
    setEditingOrder(null);
    setActiveTab('orders');
  };

  const handleSelectOrder = (order: Order) => {
    setSelectedOrder(order);
    setActiveTab('order-detail');
  };

  const handleEditOrder = async (order: Order) => {
    const fullOrder = await storage.getOrder(order.id);
    if (fullOrder) {
      setEditingOrder(fullOrder);
      setActiveTab('new-order');
    }
  };

  const handleCancelEdit = () => {
    setEditingOrder(null);
    if (selectedOrder) {
      setActiveTab('order-detail');
    } else {
      setActiveTab('orders');
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'new-order':
        return (
          <OrderForm 
            onOrderCreated={handleOrderCreated} 
            initialOrder={editingOrder}
            onCancel={editingOrder ? handleCancelEdit : undefined}
            onViewHistory={() => setActiveTab('orders')}
          />
        );
      case 'orders':
        return (
          <OrderList 
            onSelectOrder={handleSelectOrder} 
            onEditOrder={handleEditOrder} 
            onNewOrder={() => {
              setEditingOrder(null);
              setActiveTab('new-order');
            }}
          />
        );
      case 'order-detail':
        return selectedOrder ? (
          <OrderDetail 
            orderId={selectedOrder.id} 
            onBack={() => setActiveTab('orders')} 
            onEdit={handleEditOrder}
          />
        ) : (
          <OrderList 
            onSelectOrder={handleSelectOrder} 
            onEditOrder={handleEditOrder}
            onNewOrder={() => {
              setEditingOrder(null);
              setActiveTab('new-order');
            }}
          />
        );
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'new-order') {
            setEditingOrder(null); // Reset edit mode when manually clicking "New Order"
          }
        }} 
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />

      <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible">
        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-slate-200 p-4 flex items-center gap-4 print:hidden">
          <button onClick={() => setIsSidebarOpen(true)} className="text-slate-600">
            <Menu size={24} />
          </button>
          <h1 className="font-bold text-lg">GestorPro</h1>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 print:overflow-visible print:p-0">
          <div className="max-w-7xl mx-auto print:max-w-none">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}
