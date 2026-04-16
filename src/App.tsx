import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { OrderForm } from './components/OrderForm';
import { OrderList } from './components/OrderList';
import { OrderDetail } from './components/OrderDetail';
import { Menu, LogIn, Loader2 } from 'lucide-react';
import { Order } from './types';

import { storage } from './lib/storage';
import { auth } from './lib/firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Error signing in:', error);
      if (error.code === 'auth/unauthorized-domain') {
        alert(`ERROR DE DOMINIO: Tu web en Vercel no tiene permiso todavía.\n\n1. Ve a: https://console.firebase.google.com/project/gen-lang-client-0061028494/auth/settings\n2. Busca la pestaña "Settings" -> "Authorized domains".\n3. Añade: elena-qak1-hopezcizs-pascualps-projects.vercel.app`);
      } else {
        alert(`Error al iniciar sesión: ${error.message || 'Error desconocido'}`);
      }
    }
  };

  if (authLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-emerald-600" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center max-w-md w-full mx-4">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">GestorPro</h1>
          <p className="text-slate-500 mb-8">Inicia sesión para acceder a tu panel de control y gestionar pedidos.</p>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-medium transition-colors shadow-sm"
          >
            <LogIn size={20} />
            Iniciar sesión con Google
          </button>
        </div>
      </div>
    );
  }

  const handleOrderCreated = (order: Order) => {
    setEditingOrder(null);
    handleSelectOrder(order);
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
        return <Dashboard onAction={setActiveTab} />;
      case 'new-order':
        return (
          <OrderForm 
            onOrderCreated={handleOrderCreated} 
            initialOrder={editingOrder}
            onCancel={editingOrder ? handleCancelEdit : undefined}
            onViewHistory={() => setActiveTab('orders')}
            onViewDashboard={() => setActiveTab('dashboard')}
          />
        );
      case 'orders':
        return (
          <OrderList 
            onSelectOrder={handleSelectOrder} 
            onEditOrder={handleEditOrder} 
            onViewDashboard={() => setActiveTab('dashboard')}
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
            onViewDashboard={() => setActiveTab('dashboard')}
          />
        ) : (
          <OrderList 
            onSelectOrder={handleSelectOrder} 
            onEditOrder={handleEditOrder}
            onViewDashboard={() => setActiveTab('dashboard')}
            onNewOrder={() => {
              setEditingOrder(null);
              setActiveTab('new-order');
            }}
          />
        );
      default:
        return <Dashboard onAction={setActiveTab} />;
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
