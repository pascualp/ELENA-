import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Calculator, X, List, LayoutDashboard, TrendingUp, Edit2 } from 'lucide-react';
import { OrderItem, Order } from '../types';
import { storage } from '../lib/storage';

interface OrderFormProps {
  onOrderCreated: (order: Order) => void;
  initialOrder?: Order | null;
  onCancel?: () => void;
  onViewHistory?: () => void;
  onViewDashboard?: () => void;
}

const PRODUCT_CODES: Record<string, string> = {
  '4510': 'Mango',
  '4511': 'Mango avión',
  '4790': 'Sandia',
  '7790': 'Sandia',
  '3746': 'Piña',
  '3742': 'Piña madura',
  '9032': 'Pitahaya',
  '3280': 'Coco',
  '3282': 'Coco de agua'
};

export function OrderForm({ onOrderCreated, initialOrder, onCancel, onViewHistory, onViewDashboard }: OrderFormProps) {
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderItem[]>([]);
  const [currentItem, setCurrentItem] = useState<OrderItem>({ 
    product_name: '', quantity: '', kilos_per_unit: '', tare: '', price: '', lot_number: '', is_box: false 
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentCustomers, setRecentCustomers] = useState<string[]>([]);
  const lotInputRef = React.useRef<HTMLInputElement>(null);

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
          is_box: Boolean(item.is_box),
          tare: item.tare ?? '',
          price: item.price ?? '',
          quantity: item.quantity ?? '',
          kilos_per_unit: item.kilos_per_unit ?? ''
        })));
      }
    } else {
      setCustomerName('');
      setNotes('');
      setItems([]);
      resetCurrentItem();
    }
  }, [initialOrder]);

  const resetCurrentItem = () => {
    setCurrentItem({ product_name: '', quantity: '', kilos_per_unit: '', tare: '', price: '', lot_number: '', is_box: false });
    lotInputRef.current?.focus();
  };

  const addItemToList = () => {
    if (!currentItem.product_name) {
      alert('Por favor, ingrese el nombre del producto');
      return;
    }
    setItems([...items, { ...currentItem }]);
    resetCurrentItem();
  };

  const editItem = (index: number) => {
    const itemToEdit = items[index];
    setCurrentItem({ ...itemToEdit });
    setItems(items.filter((_, i) => i !== index));
    lotInputRef.current?.focus();
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateCurrentItem = (field: keyof OrderItem, value: string | number | boolean) => {
    let updatedItem = { ...currentItem, [field]: value };
    
    // Auto-fill product name based on lot number
    if (field === 'lot_number') {
      const lotStr = String(value);
      for (const [code, name] of Object.entries(PRODUCT_CODES)) {
        if (lotStr.includes(code)) {
          updatedItem.product_name = name;
          break;
        }
      }
    }
    
    setCurrentItem(updatedItem);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItemToList();
    }
  };

  const handleCheckboxKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      if (currentItem.product_name) {
        e.preventDefault();
        addItemToList();
      }
    }
  };

  const calculateTotalKilos = () => {
    return items.reduce((acc, item) => {
      const qty = Number(item.quantity) || 1;
      const kpu = Number(item.kilos_per_unit) || 0;
      const tare = Number(item.tare) || 0;
      const netKilos = Math.max(0, (qty * kpu) - (qty * tare));
      return acc + netKilos;
    }, 0);
  };

  const calculateTotalAmount = () => {
    return items.reduce((acc, item) => {
      const qty = Number(item.quantity) || 1;
      const kpu = Number(item.kilos_per_unit) || 0;
      const tare = Number(item.tare) || 0;
      const price = Number(item.price) || 0;
      
      if (kpu > 0) {
        const netKilos = Math.max(0, (qty * kpu) - (qty * tare));
        return acc + (netKilos * price);
      } else {
        return acc + (qty * price);
      }
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitOrder(false);
  };

  const submitOrder = async (shouldPrint: boolean) => {
    setIsSubmitting(true);

    try {
      let savedOrder: Order;
      if (initialOrder) {
        savedOrder = await storage.updateOrder(initialOrder.id, { customer_name: customerName, notes }, items);
      } else {
        savedOrder = await storage.createOrder({ customer_name: customerName, notes }, items);
        setCustomerName('');
        setNotes('');
        setItems([]);
        resetCurrentItem();
      }
      onOrderCreated(savedOrder);
    } catch (error: any) {
      console.error(error);
      alert(`Error al guardar el pedido: ${error.message || 'Error desconocido'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            {initialOrder ? 'Editar Pedido' : 'Nuevo Pedido'}
          </h2>
          <p className="text-slate-500">
            {initialOrder ? `Editando orden #${initialOrder.id.slice(0, 6)}` : 'Ingrese los detalles del cliente y los productos.'}
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

        <div className="space-y-6">
          <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100 space-y-4">
            <h3 className="text-base font-black text-emerald-900 uppercase tracking-wider">Entrada Rápida de Producto</h3>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-2">
                <label className="text-sm font-bold text-slate-700 mb-1 block">Lote</label>
                <input
                  ref={lotInputRef}
                  type="text"
                  value={currentItem.lot_number}
                  onChange={(e) => updateCurrentItem('lot_number', e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full px-3 py-2 text-lg rounded-lg border-2 border-slate-200 focus:border-emerald-500 outline-none transition-colors"
                  placeholder="Escriba aquí..."
                />
              </div>
              <div className="md:col-span-3">
                <label className="text-sm font-bold text-slate-700 mb-1 block">Producto</label>
                <input
                  type="text"
                  value={currentItem.product_name}
                  onChange={(e) => updateCurrentItem('product_name', e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full px-3 py-2 text-lg rounded-lg border-2 border-slate-200 focus:border-emerald-500 outline-none transition-colors"
                  placeholder="Nombre..."
                />
              </div>
              <div className="md:col-span-1">
                <label className="text-sm font-bold text-slate-700 mb-1 block">Cant.</label>
                <input
                  type="number"
                  value={currentItem.quantity}
                  onChange={(e) => updateCurrentItem('quantity', e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full px-3 py-2 text-lg rounded-lg border-2 border-slate-200 focus:border-emerald-500 outline-none transition-colors"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-bold text-slate-700 mb-1 block">Kg/Unid</label>
                <input
                  type="number"
                  step="0.01"
                  value={currentItem.kilos_per_unit}
                  onChange={(e) => updateCurrentItem('kilos_per_unit', e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full px-3 py-2 text-lg rounded-lg border-2 border-slate-200 focus:border-emerald-500 outline-none transition-colors"
                />
              </div>
              <div className="md:col-span-1">
                <label className="text-sm font-bold text-slate-700 mb-1 block">Tara</label>
                <input
                  type="number"
                  step="0.01"
                  value={currentItem.tare}
                  onChange={(e) => updateCurrentItem('tare', e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full px-3 py-2 text-lg rounded-lg border-2 border-slate-200 focus:border-emerald-500 outline-none transition-colors"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-bold text-slate-700 mb-1 block">Precio</label>
                <input
                  type="number"
                  step="0.01"
                  value={currentItem.price}
                  onChange={(e) => updateCurrentItem('price', e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full px-3 py-2 text-lg rounded-lg border-2 border-slate-200 focus:border-emerald-500 outline-none transition-colors"
                />
              </div>
              <div className="md:col-span-1 flex items-center justify-center pb-2">
                <label className="flex flex-col items-center gap-1 cursor-pointer">
                  <span className="text-[10px] font-black text-slate-700 uppercase">Caja</span>
                  <input
                    type="checkbox"
                    checked={currentItem.is_box}
                    onChange={(e) => updateCurrentItem('is_box', e.target.checked)}
                    onKeyDown={handleCheckboxKeyDown}
                    className="w-6 h-6 text-emerald-600 rounded focus:ring-emerald-500 border-gray-300"
                  />
                </label>
              </div>
              <div className="md:col-span-1">
                <button
                  type="button"
                  onClick={addItemToList}
                  className="w-full bg-emerald-600 text-white p-3 rounded-xl hover:bg-emerald-700 transition-all shadow-md active:scale-95 flex items-center justify-center"
                  title="Añadir a la lista (Enter)"
                >
                  <Plus size={24} strokeWidth={3} />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <List size={20} className="text-slate-400" />
              Productos Añadidos ({items.length})
            </h3>

            {items.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-2xl text-slate-400">
                No hay productos en la lista. Use la entrada rápida de arriba.
              </div>
            ) : (
              <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500 font-black">
                      <th className="px-4 py-4">Lote</th>
                      <th className="px-4 py-4">Producto</th>
                      <th className="px-4 py-4 text-center">Tipo</th>
                      <th className="px-4 py-4 text-right">Cant.</th>
                      <th className="px-4 py-4 text-right">Kg/Ud</th>
                      <th className="px-4 py-4 text-right">Tara</th>
                      <th className="px-4 py-4 text-right">Neto</th>
                      <th className="px-4 py-4 text-right">Precio</th>
                      <th className="px-4 py-4 text-right">Subtotal</th>
                      <th className="px-4 py-4 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item, index) => {
                      const qty = Number(item.quantity) || 1;
                      const kpu = Number(item.kilos_per_unit) || 0;
                      const tare = Number(item.tare) || 0;
                      const price = Number(item.price) || 0;
                      const netKilos = Math.max(0, (qty * kpu) - (qty * tare));
                      const subtotal = kpu > 0 ? netKilos * price : qty * price;

                      return (
                        <tr key={index} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-4 py-4 text-base text-slate-500 font-mono">{item.lot_number || '-'}</td>
                          <td className="px-4 py-4 text-base font-bold text-slate-800">{item.product_name}</td>
                          <td className="px-4 py-4 text-center">
                            {item.is_box ? (
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-black bg-blue-100 text-blue-700 uppercase">Caja</span>
                            ) : (
                              <span className="text-xs text-slate-400 uppercase font-bold">Unid</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-base text-right text-slate-700 font-medium">{qty}</td>
                          <td className="px-4 py-4 text-base text-right text-slate-700">{kpu > 0 ? kpu.toFixed(2) : '-'}</td>
                          <td className="px-4 py-4 text-base text-right text-red-400 font-medium">-{ (qty * tare).toFixed(2) }</td>
                          <td className="px-4 py-4 text-base text-right font-mono font-bold text-slate-900">
                            {kpu > 0 ? `${netKilos.toFixed(2)}kg` : '-'}
                          </td>
                          <td className="px-4 py-4 text-base text-right text-slate-700 font-medium">{price.toFixed(2)}€</td>
                          <td className="px-4 py-4 text-lg text-right font-mono font-black text-emerald-600">{subtotal.toFixed(2)}€</td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => editItem(index)}
                                className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                title="Editar línea"
                              >
                                <Edit2 size={20} />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeItem(index)}
                                className="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                title="Eliminar línea"
                              >
                                <Trash2 size={20} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center gap-6 pt-6 border-t border-slate-100">
          <div className="flex gap-4">
            <div className="flex items-center gap-4 bg-slate-900 text-white px-8 py-4 rounded-2xl">
              <Calculator size={28} className="text-emerald-400" />
              <div className="flex flex-col">
                <span className="text-xs text-slate-400 font-black uppercase tracking-widest">Peso Neto Total</span>
                <span className="text-2xl font-black font-mono">{calculateTotalKilos().toFixed(2)} kg</span>
              </div>
            </div>
            <div className="flex items-center gap-4 bg-emerald-900 text-white px-8 py-4 rounded-2xl">
              <TrendingUp size={28} className="text-emerald-400" />
              <div className="flex flex-col">
                <span className="text-xs text-emerald-400 font-black uppercase tracking-widest">Importe Total</span>
                <span className="text-3xl font-black font-mono">{calculateTotalAmount().toFixed(2)} €</span>
              </div>
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
