import React, { useEffect, useState } from 'react';
import { Eye, Printer, Trash2, Search, Filter, CheckCircle, Clock, XCircle, Loader2, Edit, Download, Plus, LayoutDashboard } from 'lucide-react';
import { Order } from '../types';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import { storage } from '../lib/storage';

interface OrderListProps {
  onSelectOrder: (order: Order) => void;
  onEditOrder: (order: Order) => void;
  onNewOrder: () => void;
  onViewDashboard: () => void;
}

export function OrderList({ onSelectOrder, onEditOrder, onNewOrder, onViewDashboard }: OrderListProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await storage.getOrders();
      setOrders(data);
    } catch (error: any) {
      console.error(error);
      setErrorMsg(error.message || 'Error al conectar con la base de datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await storage.getAllDataForExport();

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Pedidos");
      
      XLSX.writeFile(workbook, `Reporte_Pedidos_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error("Error exporting data:", error);
      alert("Error al exportar datos");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('¿Está seguro de eliminar este pedido?')) return;

    try {
      await storage.deleteOrder(id);
      fetchOrders();
    } catch (error) {
      console.error(error);
      alert('Error al eliminar el pedido');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'processing': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'cancelled': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-amber-100 text-amber-700 border-amber-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle size={14} />;
      case 'processing': return <Loader2 size={14} className="animate-spin" />;
      case 'cancelled': return <XCircle size={14} />;
      default: return <Clock size={14} />;
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          order.id.toString().includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-800">Historial de Pedidos</h2>
        
        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={onViewDashboard}
            className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            <LayoutDashboard size={18} />
            <span className="hidden md:inline">Panel de Control</span>
          </button>
          <button
            onClick={onNewOrder}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
          >
            <Plus size={18} />
            <span className="hidden md:inline">Nuevo Pedido</span>
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            <span className="hidden md:inline">Exportar Excel</span>
          </button>
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Buscar cliente o ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500 font-medium">
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4 text-right">Total Kilos</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">Cargando pedidos...</td>
                </tr>
              ) : errorMsg ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-red-500">
                    <div className="font-bold mb-2">Error al cargar pedidos</div>
                    <div className="text-sm max-w-md mx-auto bg-red-50 p-4 rounded-lg border border-red-100 text-slate-600">
                      {errorMsg}
                      <br/><br/>
                      <strong>Nota:</strong> Si usas Supabase gratuito, tu proyecto puede estar pausado por inactividad.
                    </div>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">No se encontraron pedidos</td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr 
                    key={order.id} 
                    onClick={() => onSelectOrder(order)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-4 font-mono text-sm text-slate-500">#{order.id.slice(0, 6)}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{order.customer_name}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(order.created_at).toLocaleDateString('es-ES')}
                      <span className="text-xs text-slate-400 block">
                        {new Date(order.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-medium text-slate-700">
                      {order.total_kilos.toFixed(2)} kg
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); onSelectOrder(order); }}
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Ver detalles"
                        >
                          <Eye size={18} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onEditOrder(order); }}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit size={18} />
                        </button>
                        <button 
                          onClick={(e) => handleDelete(e, order.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
