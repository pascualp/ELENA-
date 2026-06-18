import React, { useEffect, useState } from 'react';
import { Eye, Printer, Trash2, Search, Filter, CheckCircle, Clock, XCircle, Loader2, Edit, Download, Plus, LayoutDashboard, Calendar, Settings, X, ClipboardList, Copy, Check, RefreshCw } from 'lucide-react';
import { Order, OrderItem } from '../types';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import { storage } from '../lib/storage';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

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
  const [showLotReport, setShowLotReport] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportItems, setReportItems] = useState<any[]>([]);
  const [reportSearchTerm, setReportSearchTerm] = useState('');
  const [copiedReport, setCopiedReport] = useState(false);
  const [reportStartDate, setReportStartDate] = useState<string>('');
  const [reportEndDate, setReportEndDate] = useState<string>('');

  const [showArticleReport, setShowArticleReport] = useState(false);
  const [loadingArticleReport, setLoadingArticleReport] = useState(false);
  const [articleReportError, setArticleReportError] = useState<string | null>(null);
  const [articleReportItems, setArticleReportItems] = useState<any[]>([]);
  const [articleReportSearchTerm, setArticleReportSearchTerm] = useState('');
  const [articleReportStartDate, setArticleReportStartDate] = useState<string>('');
  const [articleReportEndDate, setArticleReportEndDate] = useState<string>('');

  const loadArticleReportForDates = async (start: string, end: string) => {
    setLoadingArticleReport(true);
    setArticleReportError(null);
    try {
      const fetchedItems: any[] = [];
      const reportOrders = await storage.getOrders(start || undefined, end || undefined);

      await Promise.all(reportOrders.map(async (order) => {
        const itemsSnap = await getDocs(collection(db, 'orders', order.id, 'items'));
        itemsSnap.docs.forEach(docSnap => {
          const item = docSnap.data() as OrderItem;
          fetchedItems.push({
            order_id: order.id,
            order_date: order.created_at,
            customer_name: order.customer_name,
            product_name: item.product_name || 'Desconocido',
            quantity: Number(item.quantity) || 0,
            kilos: Number(item.total_item_kilos) || 0,
            is_box: Boolean(item.is_box)
          });
        });
      }));

      // Sort by order date desc
      fetchedItems.sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime());
      setArticleReportItems(fetchedItems);
    } catch (err: any) {
      console.error("Error generating article report:", err);
      setArticleReportError(err.message || 'Error al compilar el informe de artículos');
    } finally {
      setLoadingArticleReport(false);
    }
  };

  const handleOpenArticleReport = async () => {
    setShowArticleReport(true);
    setArticleReportSearchTerm('');
    const initialStart = startDate || new Date().toISOString().split('T')[0];
    const initialEnd = endDate || new Date().toISOString().split('T')[0];
    setArticleReportStartDate(initialStart);
    setArticleReportEndDate(initialEnd);
    loadArticleReportForDates(initialStart, initialEnd);
  };

  const filteredArticleReportItems = articleReportItems.filter(item => {
    if (!articleReportSearchTerm) return false; // Por defecto no mostrar nada si no hay filtro
    return item.product_name.toLowerCase().includes(articleReportSearchTerm.toLowerCase());
  });

  const loadReportForDates = async (start: string, end: string) => {
    setLoadingReport(true);
    setReportError(null);
    try {
      const fetchedGroups: Record<string, {
        product_name: string;
        lot_number: string;
        total_kilos: number;
        total_quantity: number;
        is_box: boolean;
        product_names_set?: Set<string>;
      }> = {};

      // Load all orders for the selected date range
      const reportOrders = await storage.getOrders(start || undefined, end || undefined);

      await Promise.all(reportOrders.map(async (order) => {
        const itemsSnap = await getDocs(collection(db, 'orders', order.id, 'items'));
        itemsSnap.docs.forEach(docSnap => {
          const item = docSnap.data() as OrderItem;
          const productName = item.product_name || 'Desconocido';
          const lotNumber = item.lot_number || 'Sin Lote';
          const kilos = Number(item.total_item_kilos) || 0;
          const qty = Number(item.quantity) || 0;

          // Group by lot number if available. For empty/Sin Lote items, group by product name so that unrelated items aren't merged.
          const cleanLot = lotNumber.trim();
          const isNoLot = !cleanLot || cleanLot.toLowerCase() === 'sin lote' || cleanLot.toLowerCase() === 'sin_lote' || cleanLot === '';
          const key = isNoLot ? `nolot_${productName}` : cleanLot;

          if (!fetchedGroups[key]) {
            fetchedGroups[key] = {
              product_name: productName,
              lot_number: isNoLot ? 'Sin Lote' : cleanLot,
              total_kilos: 0,
              total_quantity: 0,
              is_box: Boolean(item.is_box),
              product_names_set: new Set([productName])
            };
          } else {
            fetchedGroups[key].product_names_set?.add(productName);
          }

          fetchedGroups[key].total_kilos += kilos;
          fetchedGroups[key].total_quantity += qty;
        });
      }));

      // Join the unique product names for items with the same lot
      const finalItems = Object.values(fetchedGroups).map(group => {
        if (group.product_names_set && group.product_names_set.size > 0) {
          group.product_name = Array.from(group.product_names_set).join(' / ');
        }
        // Remove the set before putting it in state to keep it clean
        delete group.product_names_set;
        return group;
      });

      setReportItems(finalItems);
    } catch (err: any) {
      console.error("Error generating lot report:", err);
      setReportError(err.message || 'Error al compilar el informe de lotes');
    } finally {
      setLoadingReport(false);
    }
  };

  const handleOpenLotReport = async () => {
    setShowLotReport(true);
    setReportSearchTerm('');
    // Default inside-report dates to the outer screen filters (or current local date if empty)
    const initialStart = startDate || new Date().toISOString().split('T')[0];
    const initialEnd = endDate || new Date().toISOString().split('T')[0];
    setReportStartDate(initialStart);
    setReportEndDate(initialEnd);
    loadReportForDates(initialStart, initialEnd);
  };

  const handleExportLotReportExcel = (itemsToExport: any[]) => {
    try {
      const data = itemsToExport.map(item => ({
        "Producto": item.product_name,
        "Lote": item.lot_number,
        "Cantidad": item.total_quantity,
        "Kilos Totales": Number(item.total_kilos.toFixed(2))
      }));

      const totalQty = itemsToExport.reduce((sum, item) => sum + item.total_quantity, 0);
      const totalKilos = itemsToExport.reduce((sum, item) => sum + item.total_kilos, 0);

      data.push({
        "Producto": "TOTAL CONSOLIDADO",
        "Lote": "",
        "Cantidad": totalQty,
        "Kilos Totales": Number(totalKilos.toFixed(2))
      });

      const worksheet = XLSX.utils.json_to_sheet(data);
      
      worksheet['!cols'] = [
        { wch: 35 }, // Producto
        { wch: 15 }, // Lote
        { wch: 12 }, // Cantidad
        { wch: 15 }  // Kilos Totales
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Resumen por Lote");
      XLSX.writeFile(workbook, `Consolidado_Lotes_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error("Error exporting lot report to excel:", error);
      alert("Error al exportar informe de lotes");
    }
  };

  const handleCopyLotReportToClipboard = (itemsToCopy: any[]) => {
    try {
      let text = "Producto\tLote\tCantidad\tKilos Totales (kg)\n";
      itemsToCopy.forEach(item => {
        text += `${item.product_name}\t${item.lot_number}\t${item.total_quantity}\t${item.total_kilos.toFixed(2)}\n`;
      });

      const totalQty = itemsToCopy.reduce((sum, item) => sum + item.total_quantity, 0);
      const totalKilos = itemsToCopy.reduce((sum, item) => sum + item.total_kilos, 0);
      text += `TOTAL\t\t${totalQty}\t${totalKilos.toFixed(2)}\n`;

      navigator.clipboard.writeText(text);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    } catch (err) {
      console.error("Failed to copy report to clipboard:", err);
      alert("No se pudo copiar al portapapeles");
    }
  };

  const filteredReportItems = reportItems.filter(item => {
    return item.product_name.toLowerCase().includes(reportSearchTerm.toLowerCase()) ||
           item.lot_number.toLowerCase().includes(reportSearchTerm.toLowerCase());
  }).sort((a, b) => a.product_name.localeCompare(b.product_name));

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
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors shadow-sm font-medium text-sm"
          >
            <Plus size={18} />
            <span className="md:inline">Nuevo</span>
          </button>
          <button
            onClick={handleOpenLotReport}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium text-sm"
            title="Consolidar artículos por lotes para facturación"
          >
            <ClipboardList size={18} />
            <span>Informe Lotes</span>
          </button>
          <button
            onClick={handleOpenArticleReport}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium text-sm"
            title="Ver kilos y bultos de un artículo por albarán"
          >
            <ClipboardList size={18} />
            <span>Informe Artículos</span>
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

      {showLotReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Informe de Consolidación por Lote</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Sumatorio agrupado por Producto, Lote y Precio para el período de fechas seleccionado
                </p>
              </div>
              <button onClick={() => setShowLotReport(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {/* Selector de Rango de Fechas */}
              <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Calendar size={16} className="text-indigo-600 shrink-0" />
                    <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">Desde:</span>
                    <input
                      type="date"
                      value={reportStartDate}
                      onChange={(e) => setReportStartDate(e.target.value)}
                      className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none bg-white font-medium text-slate-700 w-full sm:w-auto shadow-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">Hasta:</span>
                    <input
                      type="date"
                      value={reportEndDate}
                      onChange={(e) => setReportEndDate(e.target.value)}
                      className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none bg-white font-medium text-slate-700 w-full sm:w-auto shadow-sm"
                    />
                  </div>
                </div>

                <button
                  onClick={() => loadReportForDates(reportStartDate, reportEndDate)}
                  disabled={loadingReport}
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2 rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors shrink-0"
                >
                  <RefreshCw size={15} className={cn(loadingReport && "animate-spin")} />
                  <span>Calcular Lotes</span>
                </button>
              </div>

              {loadingReport ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <Loader2 className="animate-spin text-indigo-600 animate-duration-1000" size={36} />
                  <p className="text-slate-600 text-sm font-medium">Buscando artículos y agrupando lotes...</p>
                </div>
              ) : reportError ? (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-rose-700 text-sm">
                  {reportError}
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row justify-between gap-3 items-center">
                    <div className="relative w-full sm:w-80">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="text"
                        placeholder="Buscar por producto o lote..."
                        value={reportSearchTerm}
                        onChange={(e) => setReportSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                    
                    <div className="flex gap-2 w-full sm:w-auto justify-end">
                      <button
                        onClick={() => handleCopyLotReportToClipboard(filteredReportItems)}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium border border-slate-200 shadow-sm"
                      >
                        {copiedReport ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                        <span>{copiedReport ? '¡Copiado!' : 'Copiar Portapapeles'}</span>
                      </button>
                      <button
                        onClick={() => handleExportLotReportExcel(filteredReportItems)}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-medium shadow-sm"
                      >
                        <Download size={16} />
                        <span>Exportar Excel</span>
                      </button>
                    </div>
                  </div>

                  <div className="border border-slate-150 rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                          <tr>
                            <th className="px-5 py-3">Producto</th>
                            <th className="px-5 py-3">Lote</th>
                            <th className="px-5 py-3 text-right">Cantidad</th>
                            <th className="px-5 py-3 text-right">Kilos Totales</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredReportItems.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                                No se encontraron artículos que cumplan los criterios.
                              </td>
                            </tr>
                          ) : (
                            filteredReportItems.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                <td className="px-5 py-3.5 font-semibold text-slate-900">{item.product_name}</td>
                                <td className="px-5 py-3.5">
                                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                                    {item.lot_number || 'Sin lote'}
                                  </span>
                                </td>
                                <td className="px-5 py-3.5 text-right text-slate-700">
                                  {item.total_quantity} {item.is_box ? 'cajas' : 'unid.'}
                                </td>
                                <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-400">
                                  {item.total_kilos.toFixed(2)} kg
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {filteredReportItems.length > 0 && (
                          <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-slate-700">
                            <tr className="bg-indigo-50/20 text-slate-800">
                              <td colSpan={2} className="px-5 py-4 text-right font-bold text-indigo-900">
                                TOTAL CONSOLIDADO:
                              </td>
                              <td className="px-5 py-4 text-right">
                                {filteredReportItems.reduce((sum, item) => sum + item.total_quantity, 0)}
                              </td>
                              <td className="px-5 py-4 text-right font-mono font-bold text-slate-400 text-base">
                                {filteredReportItems.reduce((sum, item) => sum + item.total_kilos, 0).toFixed(2)} kg
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 text-right italic">
                    * Sugerencia: Utilice la opción de "Copiar Portapapeles" para pegar el listado tabulado directamente en Microsoft Excel, Google Sheets, o su software de facturación.
                  </p>
                </>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowLotReport(false)}
                className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg transition-colors text-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showArticleReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Informe de Artículos por Albarán</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Cantidades y Kilos de un artículo específico, separados por albarán (pedido)
                </p>
              </div>
              <button onClick={() => setShowArticleReport(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Calendar size={16} className="text-blue-600 shrink-0" />
                    <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">Desde:</span>
                    <input
                      type="date"
                      value={articleReportStartDate}
                      onChange={(e) => setArticleReportStartDate(e.target.value)}
                      className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:outline-none bg-white font-medium text-slate-700 w-full sm:w-auto shadow-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">Hasta:</span>
                    <input
                      type="date"
                      value={articleReportEndDate}
                      onChange={(e) => setArticleReportEndDate(e.target.value)}
                      className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500/20 focus:outline-none bg-white font-medium text-slate-700 w-full sm:w-auto shadow-sm"
                    />
                  </div>
                </div>

                <button
                  onClick={() => loadArticleReportForDates(articleReportStartDate, articleReportEndDate)}
                  disabled={loadingArticleReport}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2 rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors shrink-0"
                >
                  <RefreshCw size={15} className={cn(loadingArticleReport && "animate-spin")} />
                  <span>Obtener Datos</span>
                </button>
              </div>

              {loadingArticleReport ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <Loader2 className="animate-spin text-blue-600 animate-duration-1000" size={36} />
                  <p className="text-slate-600 text-sm font-medium">Cargando albaranes detallados...</p>
                </div>
              ) : articleReportError ? (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-rose-700 text-sm">
                  {articleReportError}
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row justify-between gap-3 items-center">
                    <div className="relative w-full sm:w-80">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        type="text"
                        placeholder="Buscar por artículo EXACTO (ej. Coco)..."
                        value={articleReportSearchTerm}
                        onChange={(e) => setArticleReportSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="border border-slate-150 rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                          <tr>
                            <th className="px-5 py-3">Fecha</th>
                            <th className="px-5 py-3">Albarán ID</th>
                            <th className="px-5 py-3">Cliente</th>
                            <th className="px-5 py-3">Artículo</th>
                            <th className="px-5 py-3 text-right">Bultos</th>
                            <th className="px-5 py-3 text-right">Kilos Netos</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredArticleReportItems.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                                {articleReportSearchTerm ? 'No se encontraron artículos que cumplan los criterios.' : 'Escriba el nombre de un artículo en el buscador para ver sus resultados.'}
                              </td>
                            </tr>
                          ) : (
                            filteredArticleReportItems.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                                <td className="px-5 py-3.5 text-slate-600">{new Date(item.order_date).toLocaleDateString('es-ES')}</td>
                                <td className="px-5 py-3.5 font-mono text-xs text-slate-400">{item.order_id.slice(0, 8)}</td>
                                <td className="px-5 py-3.5 text-slate-800">{item.customer_name}</td>
                                <td className="px-5 py-3.5 font-semibold text-blue-900">{item.product_name}</td>
                                <td className="px-5 py-3.5 text-right text-slate-700">
                                  {item.quantity} {item.is_box ? 'cajas' : 'unid.'}
                                </td>
                                <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-600">
                                  {item.kilos.toFixed(2)} kg
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {filteredArticleReportItems.length > 0 && (
                          <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold text-slate-700">
                            <tr className="bg-blue-50/20 text-slate-800">
                              <td colSpan={4} className="px-5 py-4 text-right font-bold text-blue-900">
                                TOTALES ({articleReportSearchTerm}):
                              </td>
                              <td className="px-5 py-4 text-right text-blue-700">
                                {filteredArticleReportItems.reduce((sum, item) => sum + item.quantity, 0)} bultos
                              </td>
                              <td className="px-5 py-4 text-right font-mono font-bold text-blue-700 text-base">
                                {filteredArticleReportItems.reduce((sum, item) => sum + item.kilos, 0).toFixed(2)} kg
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowArticleReport(false)}
                className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg transition-colors text-sm"
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
                    <td className="px-6 py-4 text-right font-mono font-medium text-slate-400">
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
                  <td className="px-6 py-4 text-right font-mono font-bold text-slate-400">
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
