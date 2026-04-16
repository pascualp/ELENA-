import React, { useEffect, useState } from 'react';
import { Printer, ArrowLeft, Edit, Download, LayoutDashboard } from 'lucide-react';
import { Order, OrderItem } from '../types';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import { storage } from '../lib/storage';

interface OrderDetailProps {
  orderId: string;
  onBack: () => void;
  onEdit: (order: Order) => void;
  onViewDashboard: () => void;
}

export function OrderDetail({ orderId, onBack, onEdit, onViewDashboard }: OrderDetailProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrder = async () => {
    setLoading(true);
    try {
      const data = await storage.getOrder(orderId);
      setOrder(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const updateStatus = async (status: string) => {
    try {
      await storage.updateStatus(orderId, status);
      fetchOrder();
    } catch (error) {
      console.error(error);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportSingle = () => {
    if (!order) return;

    // Flatten data for Excel
    const data = order.items?.map(item => ({
      "ID Pedido": order.id,
      "Cliente": order.customer_name,
      "Fecha": new Date(order.created_at).toLocaleDateString('es-ES'),
      "Hora": new Date(order.created_at).toLocaleTimeString('es-ES'),
      "Estado": order.status,
      "Notas": order.notes,
      "Producto": item.product_name,
      "Lote": item.lot_number || '-',
      "Tipo": item.is_box ? "Caja" : "Unidad",
      "Cantidad": item.quantity,
      "Kg/Unidad": item.kilos_per_unit,
      "Tara": item.tare || 0,
      "Total Kg Item": item.total_item_kilos,
      "Precio/Kg": item.price || 0,
      "Total Importe Item": item.total_price || 0,
      "Total Kg Pedido": order.total_kilos,
      "Total Importe Pedido": order.total_amount || 0
    }));

    if (data) {
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `Pedido_${order.id}`);
      
      // Auto-width columns
      const wscols = [
        {wch: 10}, {wch: 20}, {wch: 12}, {wch: 10}, {wch: 10}, 
        {wch: 20}, {wch: 20}, {wch: 15}, {wch: 10}, {wch: 10}, 
        {wch: 10}, {wch: 10}, {wch: 15}, {wch: 10}, {wch: 15},
        {wch: 15}, {wch: 15}
      ];
      worksheet['!cols'] = wscols;

      XLSX.writeFile(workbook, `Trazabilidad_Pedido_${order.id}_${order.customer_name.replace(/\s+/g, '_')}.xlsx`);
    }
  };

  if (loading) return <div className="p-8 text-center">Cargando detalles...</div>;
  if (!order) return <div className="p-8 text-center text-red-500">Pedido no encontrado</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Action Bar - Hidden when printing */}
      <div className="flex justify-between items-center print:hidden">
        <div className="flex gap-4">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft size={20} />
            Volver
          </button>
          <button 
            onClick={onViewDashboard}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors"
          >
            <LayoutDashboard size={18} />
            Panel
          </button>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={handleExportSingle}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
            title="Descargar Excel de Trazabilidad"
          >
            <Download size={18} />
            <span className="hidden sm:inline">Excel</span>
          </button>

          <button
            onClick={() => order && onEdit(order)}
            className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Edit size={18} />
            <span className="hidden sm:inline">Editar</span>
          </button>
          
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10"
          >
            <Printer size={18} />
            <span className="hidden sm:inline">Imprimir</span>
          </button>
        </div>
      </div>

      {/* Printable Area */}
      <div className="bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-slate-100 print:shadow-none print:border-none print:p-0">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-100 pb-8 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Orden de Pedido</h1>
            <p className="text-slate-500">#{order.id.slice(0, 6)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">
              Fecha: {new Date(order.created_at).toLocaleDateString('es-ES')}
            </p>
            <p className="text-sm text-slate-500">
              Hora: {new Date(order.created_at).toLocaleTimeString('es-ES')}
            </p>
          </div>
        </div>

        {/* Customer Info */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">Cliente</h3>
            <p className="text-lg font-medium text-slate-900">{order.customer_name}</p>
          </div>
          {order.notes && (
            <div>
              <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">Notas</h3>
              <p className="text-slate-700">{order.notes}</p>
            </div>
          )}
        </div>

        {/* Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full mb-8 min-w-[600px]">
            <thead>
              <tr className="border-b-2 border-slate-100">
                <th className="text-left py-3 text-sm font-semibold text-slate-600">Producto</th>
                <th className="text-left py-3 text-sm font-semibold text-slate-600">Lote</th>
                <th className="text-center py-3 text-sm font-semibold text-slate-600">Tipo</th>
                <th className="text-right py-3 text-sm font-semibold text-slate-600">Cant.</th>
                <th className="text-right py-3 text-sm font-semibold text-slate-600">Kg/Unid</th>
                <th className="text-right py-3 text-sm font-semibold text-slate-600">Tara</th>
                <th className="text-right py-3 text-sm font-semibold text-slate-600">Neto</th>
                <th className="text-right py-3 text-sm font-semibold text-slate-600">Precio</th>
                <th className="text-right py-3 text-sm font-semibold text-slate-600">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {order.items?.map((item, index) => (
                <tr key={index}>
                  <td className="py-4 text-slate-800">{item.product_name}</td>
                  <td className="py-4 text-slate-600 text-sm">{item.lot_number || '-'}</td>
                  <td className="py-4 text-center text-slate-600 text-sm">
                    {item.is_box ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        Caja
                      </span>
                    ) : (
                      <span className="text-slate-400">Unidad</span>
                    )}
                  </td>
                  <td className="py-4 text-right text-slate-600">{item.quantity}</td>
                  <td className="py-4 text-right text-slate-600">{item.kilos_per_unit.toFixed(2)}</td>
                  <td className="py-4 text-right text-slate-400 text-xs">-{item.tare?.toFixed(2)}</td>
                  <td className="py-4 text-right font-mono text-slate-900">{item.total_item_kilos?.toFixed(2)}</td>
                  <td className="py-4 text-right text-slate-600">{item.price?.toFixed(2)}€</td>
                  <td className="py-4 text-right font-mono font-medium text-emerald-600">{item.total_price?.toFixed(2)}€</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-100">
                <td colSpan={6} className="py-4 text-right font-bold text-slate-800">Totales</td>
                <td className="py-4 text-right font-mono font-bold text-lg text-slate-900">
                  {order.total_kilos.toFixed(2)} kg
                </td>
                <td></td>
                <td className="py-4 text-right font-mono font-bold text-xl text-emerald-600">
                  {(order.total_amount || 0).toFixed(2)} €
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer for Print */}
        <div className="hidden print:block mt-16 pt-8 border-t border-slate-200 text-center text-sm text-slate-400">
          <p>Gracias por su preferencia</p>
          <p className="text-xs mt-1">Generado por GestorPro - {new Date().toLocaleString('es-ES')}</p>
        </div>
      </div>
    </div>
  );
}
