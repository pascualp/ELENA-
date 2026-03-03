import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Calculator, X, List, LayoutDashboard } from 'lucide-react';
import { OrderItem, Order } from '../types';
import { storage } from '../lib/storage';

interface OrderFormProps {
  onOrderCreated: () => void;
  initialOrder?: Order | null;
  onCancel?: () => void;
  onViewHistory?: () => void;
  onViewDashboard?: () => void;
}

export function OrderForm({ onOrderCreated, initialOrder, onCancel, onViewHistory, onViewDashboard }: OrderFormProps) {
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderItem[]>([
    { product_name: '', quantity: 1, kilos_per_unit: 0, lot_number: '', is_box: false }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentCustomers, setRecentCustomers] = useState<string[]>([]);

  useEffect(() => {
    // Fetch recent customers for autocomplete
    const fetchCustomers = async () => {
      const customers = await storage.getCustomers();
      setRecentCustomers(customers);
    };
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (initialOrder) {
      setCustomerName(initialOrder.customer_name);
      setNotes(initialOrder.notes);
      if (initialOrder.items && initialOrder.items.length > 0) {
        setItems(initialOrder.items.map(item => ({
          ...item,
          lot_number: item.lot_number || '',
          is_box: Boolean(item.is_box)
        })));
      }
    } else {
      setCustomerName('');
      setNotes('');
      setItems([{ product_name: '', quantity: 1, kilos_per_unit: 0, lot_number: '', is_box: false }]);
    }
  }, [initialOrder]);

  const addItem = () => {
    setItems([...items, { product_name: '', quantity: 1, kilos_per_unit: 0, lot_number: '', is_box: false }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof OrderItem, value: string | number | boolean) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const calculateTotalKilos = () => {
    return items.reduce((acc, item) => acc + (item.quantity * item.kilos_per_unit), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitOrder(false);
  };

  const submitOrder = async (shouldPrint: boolean) => {
    setIsSubmitting(true);

    try {
      if (initialOrder) {
        await storage.updateOrder(initialOrder.id, { customer_name: customerName, notes }, items);
        alert('Pedido actualizado correctamente');
      } else {
        await storage.createOrder({ customer_name: customerName, notes }, items);
        alert('Pedido guardado correctamente');
        setCustomerName('');
        setNotes('');
        setItems([{ product_name: '', quantity: 1, kilos_per_unit: 0, lot_number: '', is_box: false }]);
      }
      onOrderCreated();
    } catch (error) {
      console.error(error);
      alert('Error al guardar el pedido');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            {initialOrder ? 'Editar Pedido' : 'Nuevo Pedido'}
          </h2>
          <p className="text-slate-500">
            {initialOrder ? `Editando orden #${initialOrder.id}` : 'Ingrese los detalles del cliente y los productos.'}
          </p>
        </div>
        <div className="flex gap-2">
          {onViewDashboard && (
            <button
              onClick={onViewDashboard}
              className="flex items-center gap-2 text-slate-600 hover:text-blue-600 hover:bg-slate-50 px-4 py-2 rounded-lg transition-colors border border-slate-200"
            >
              <LayoutDashboard size={20} />
              <span className="hidden sm:inline">Panel</span>
            </button>
          )}
          {!initialOrder && onViewHistory && (
            <button
              onClick={onViewHistory}
              className="flex items-center gap-2 text-slate-600 hover:text-emerald-600 hover:bg-slate-50 px-4 py-2 rounded-lg transition-colors border border-slate-200"
            >
              <List size={20} />
              <span className="hidden sm:inline">Ver Historial</span>
            </button>
          )}
          {initialOrder && onCancel && (
            <button 
              onClick={onCancel}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X size={24} />
            </button>
          )}
        </div>
      </div>
      
      <form onSubmit={handleSubmit} className="p-6 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Nombre del Cliente</label>
            <input
              required
              type="text"
              list="customer-list"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              placeholder="Ej. Empresa S.A."
              autoComplete="off"
            />
            <datalist id="customer-list">
              {recentCustomers.map((customer, index) => (
                <option key={index} value={customer} />
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Notas Adicionales</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              placeholder="Ej. Entrega urgente"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-800">Items del Pedido</h3>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              <Plus size={16} />
              Agregar Producto
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="flex flex-col md:flex-row gap-4 items-end bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="flex-1 w-full md:w-auto">
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Producto</label>
                  <input
                    required
                    type="text"
                    value={item.product_name}
                    onChange={(e) => updateItem(index, 'product_name', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-emerald-500 outline-none"
                    placeholder="Nombre"
                  />
                </div>
                
                <div className="w-full md:w-32">
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Lote</label>
                  <input
                    type="text"
                    value={item.lot_number}
                    onChange={(e) => updateItem(index, 'lot_number', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-emerald-500 outline-none"
                    placeholder="Lote #123"
                  />
                </div>

                <div className="w-full md:w-24 flex items-center justify-center pb-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.is_box}
                      onChange={(e) => updateItem(index, 'is_box', e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-gray-300"
                    />
                    <span className="text-sm text-slate-600">Caja</span>
                  </label>
                </div>

                <div className="w-full md:w-24">
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Cant.</label>
                  <input
                    required
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-emerald-500 outline-none"
                  />
                </div>
                <div className="w-full md:w-28">
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Kg/Unid</label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.kilos_per_unit}
                    onChange={(e) => updateItem(index, 'kilos_per_unit', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-emerald-500 outline-none"
                  />
                </div>
                <div className="w-full md:w-32 bg-white px-3 py-2 rounded-lg border border-slate-200 flex items-center justify-between text-slate-600">
                  <span className="text-xs font-medium text-slate-400">Total</span>
                  <span className="font-mono font-semibold">{(item.quantity * item.kilos_per_unit).toFixed(2)}</span>
                </div>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center gap-6 pt-6 border-t border-slate-100">
          <div className="flex items-center gap-3 bg-slate-900 text-white px-6 py-3 rounded-xl">
            <Calculator size={20} className="text-emerald-400" />
            <div className="flex flex-col">
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Peso Total</span>
              <span className="text-xl font-bold font-mono">{calculateTotalKilos().toFixed(2)} kg</span>
            </div>
          </div>

          <div className="flex gap-3 w-full md:w-auto">
            {initialOrder && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 md:flex-none px-6 py-3 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-semibold shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={20} />
              {isSubmitting ? 'Guardando...' : (initialOrder ? 'Actualizar Pedido' : 'Guardar y Nuevo')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
