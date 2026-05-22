import React, { useEffect, useState } from 'react';
import { Eye, Printer, Trash2, Search, Filter, CheckCircle, Clock, XCircle, Loader2, Edit, Download, Plus, LayoutDashboard, Calendar, Settings, X } from 'lucide-react';
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

type ExportColumn = 'ID' | 'Cliente' | 'Fecha' | 'Hora' | 'Estado' | 'Total Kilos' | 'Importe (€)' | 'Notas';

const defaultExportConfig: Record<ExportColumn, boolean> = {
  'ID': false,
  'Cliente': true,
  'Fecha': true,
  'Hora': false,
  'Estado': true,
  'Total Kilos': true,
  'Importe (€)': true,
  'Notas': false,
};

export function OrderList({ onSelectOrder, onEditOrder, onNewOrder, onViewDashboard }: OrderListProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showExportSettings, setShowExportSettings] = useState(false);
  const [exportConfig, setExportConfig] = useState<Record<ExportColumn, boolean>>(defaultExportConfig);

  useEffect(() => {
    const savedConfig = localStorage.getItem('gestorpro_export_config');
    if (savedConfig) {
      try {
        setExportConfig(JSON.parse(savedConfig));
      } catch (e) {}
    }
  }, []);

  const handleConfigChange = (col: ExportColumn, checked: boolean) => {
    const newConfig = { ...exportConfig, [col]: checked };
    setExportConfig(newConfig);
    localStorage.setItem('gestorpro_export_config', JSON.stringify(newConfig));
  };

  const fetchOrders = async () => {
    setIsRefreshing(true);
    setErrorMsg(null);
    try {
      const data = await storage.getOrders(startDate || undefined, endDate || undefined);
      setOrders(data);
    } catch (error: any) {
      console.error(error);
      setErrorMsg(error.message || 'Error al conectar con la base de datos');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>, id: string) => {
    e.stopPropagation();
    const newStatus = e.target.value;
    try {
      await storage.updateStatus(id, newStatus);
      fetchOrders();
    } catch (error) {
       console.error(error);
       alert('Error al actualizar estado');
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [startDate, endDate]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const dataToExport = filteredOrders.map(order => {
        const row: any = {};
        if (exportConfig['ID']) row['ID'] = order.id;
        if (exportConfig['Cliente']) row['Cliente'] = order.customer_name;
        if (exportConfig['Fecha']) row['Fecha'] = new Date(order.created_at).toLocaleDateString('es-ES');
        if (exportConfig['Hora']) row['Hora'] = new Date(order.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        if (exportConfig['Estado']) row['Estado'] = order.status === 'completed' ? 'Completado' : 'Pendiente';
        if (exportConfig['Total Kilos']) row['Total Kilos'] = Number(order.total_kilos.toFixed(2)) + ' kg';
        if (exportConfig['Importe (€)']) row['Importe (€)'] = (order.status === 'pending' ? 0 : (order.total_amount || 0)).toFixed(2) + ' €';
        if (exportConfig['Notas']) row['Notas'] = order.notes || '';
        return row;
      });

      // Add a total row at the end
      const totalRow: any = {};
      let firstColSet = false;
      const columnsInOrder: ExportColumn[] = ['ID', 'Cliente', 'Fecha', 'Hora', 'Estado', 'Total Kilos', 'Importe (€)', 'Notas'];
      
      for (const col of columnsInOrder) {
        if (exportConfig[col]) {
          if (!firstColSet) {
            totalRow[col] = "TOTAL";
            firstColSet = true;
          } else {
            if (col === 'Total Kilos') totalRow[col] = totalFilteredKilos.toFixed(2) + ' kg';
            else if (col === 'Importe (€)') totalRow[col] = totalFilteredAmount.toFixed(2) + ' €';
            else totalRow[col] = "";
          }
        }
      }

      if (!firstColSet) {
        alert('Debe seleccionar al menos una columna para exportar.');
        return;
      }

      dataToExport.push(totalRow);

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      
      // Auto-size columns
      const colWidths: any[] = [];
      if (exportConfig['ID']) colWidths.push({ wch: 20 });
      if (exportConfig['Cliente']) colWidths.push({ wch: 30 });
      if (exportConfig['Fecha']) colWidths.push({ wch: 15 });
      if (exportConfig['Hora']) colWidths.push({ wch: 10 });
      if (exportConfig['Estado']) colWidths.push({ wch: 15 });
      if (exportConfig['Total Kilos']) colWidths.push({ wch: 15 });
      if (exportConfig['Importe (€)']) colWidths.push({ wch: 15 });
      if (exportConfig['Notas']) colWidths.push({ wch: 40 });

      worksheet['!cols'] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Historial de Pedidos");
      
      XLSX.writeFile(workbook, `Reporte_Historial_${new Date().toISOString().split('T')[0]}.xlsx`);
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

  const totalFilteredKilos = filteredOrders.reduce((acc, o) => acc + (o.total_kilos || 0), 0);
  const totalFilteredAmount = filteredOrders.reduce((acc, o) => acc + (o.status === 'pending' ? 0 : (o.total_amount || 0)), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Historial de Pedidos</h2>
          <p className="text-sm text-slate-500">Administre y visualice todos los pedidos</p>
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={onViewDashboard}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            <LayoutDashboard size={18} />
            <span className="md:inline">Panel</span>
          </button>
          <button
            onClick={onNewOrder}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
          >
            <Plus size={18} />
            <span className="md:inline">Nuevo</span>
          </button>
          <div className="flex w-full md:w-auto">
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-l-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 border-r border-emerald-700/50"
            >
              {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              <span className="md:inline">Excel</span>
            </button>
            <button
              onClick={() => setShowExportSettings(true)}
              className="flex items-center justify-center px-3 bg-emerald-600 text-white rounded-r-lg hover:bg-emerald-700 transition-colors shadow-sm"
              title="Configurar Exportación"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </div>

      {showExportSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-bold text-lg text-slate-800">Exportar Historial</h3>
              <button onClick={() => setShowExportSettings(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 mb-4">Seleccione las columnas que desea incluir al exportar a Excel:</p>
              
              <div className="grid grid-cols-2 gap-4">
                {(Object.keys(defaultExportConfig) as ExportColumn[]).map((col) => (
                  <label key={col} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50 cursor-pointer hover:bg-emerald-50 hover:border-emerald-200 transition-colors">
                    <input
                      type="checkbox"
                      checked={exportConfig[col]}
                      onChange={(e) => handleConfigChange(col, e.target.checked)}
                      className="w-5 h-5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-medium text-slate-700">{col}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowExportSettings(false)}
                className="px-6 py-2 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar with Filters */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center gap-4">
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2 py-2 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none bg-white text-slate-700"
            >
              <option value="all">Todos los estados</option>
              <option value="pending">Pendiente</option>
              <option value="completed">Completado</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-600">Desde:</span>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2 py-2 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">Hasta:</span>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2 py-2 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
            />
          </div>
          {(startDate || endDate) && (
            <button 
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
            >
              Ver todos
            </button>
          )}
        </div>
        {isRefreshing && <Loader2 size={16} className="animate-spin text-slate-400 ml-auto" />}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500 font-medium">
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Total Kilos</th>
                <th className="px-6 py-4 text-right">Importe</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">Cargando pedidos...</td>
                </tr>
              ) : errorMsg ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-red-500">
                    <div className="font-bold mb-2">Error al cargar pedidos</div>
                    <div className="text-sm max-w-md mx-auto bg-red-50 p-4 rounded-lg border border-red-100 text-slate-600">
                      {errorMsg}
                    </div>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">No se encontraron pedidos</td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr 
                    key={order.id} 
                    onClick={() => onSelectOrder(order)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-4 font-medium text-slate-900">{order.customer_name}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(order.created_at).toLocaleDateString('es-ES')}
                    </td>
                    <td className="px-6 py-4">
                      <select 
                        value={order.status}
                        onChange={(e) => handleStatusChange(e, order.id)}
                        onClick={(e) => e.stopPropagation()}
                        className={cn("text-xs font-bold px-2 py-1 rounded-full border outline-none cursor-pointer", getStatusColor(order.status))}
                      >
                        <option value="pending" className="bg-white text-slate-800">Pendiente</option>
                        <option value="completed" className="bg-white text-slate-800">Completado</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-medium text-slate-500">
                      {order.total_kilos.toFixed(2)} kg
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                      {order.status === 'pending' ? (
                        <span className="text-slate-400 line-through">{(order.total_amount || 0).toFixed(2)} €</span>
                      ) : (
                        <span>{(order.total_amount || 0).toFixed(2)} €</span>
                      )}
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
            {filteredOrders.length > 0 && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-right font-bold text-slate-700 uppercase text-sm">
                    {statusFilter === 'pending' ? 'Total (Excluyendo Pendientes)' : 'Total Filtrado'}:
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-bold text-slate-500">
                    {totalFilteredKilos.toFixed(2)} kg
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-black text-slate-900 text-lg">
                    {totalFilteredAmount.toFixed(2)} €
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
