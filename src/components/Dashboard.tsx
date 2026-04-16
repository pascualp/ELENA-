import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Stats } from '../types';
import { TrendingUp, Package, Scale, Calendar, PlusCircle, List, Euro, Download } from 'lucide-react';
import { storage } from '../lib/storage';
import * as XLSX from 'xlsx';

interface DashboardProps {
  onAction: (tab: string) => void;
}

export function Dashboard({ onAction }: DashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await storage.getStats();
        setStats(data);
      } catch (error: any) {
        console.error(error);
        setErrorMsg(error.message || 'No se pudo conectar a la base de datos');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const exportDashboard = async () => {
    try {
      const allData = await storage.getAllDataForExport();
      
      const wb = XLSX.utils.book_new();
      
      // Resumen Stats
      if (stats) {
        const wsStats = XLSX.utils.json_to_sheet([
          { "Métrica": "Total Pedidos", "Valor": stats.totalOrders },
          { "Métrica": "Total Kilos", "Valor": stats.totalKilos.toFixed(2) },
          { "Métrica": "Importe Total", "Valor": stats.totalAmount.toFixed(2) + " €" }
        ]);
        XLSX.utils.book_append_sheet(wb, wsStats, "Resumen General");
        
        // Ventas Diarias
        const wsDaily = XLSX.utils.json_to_sheet(
          stats.dailyStats.map(s => ({
            "Fecha": s.date,
            "Pedidos": s.count,
            "Kilos": s.kilos.toFixed(2),
            "Importe (€)": s.amount.toFixed(2)
          }))
        );
        XLSX.utils.book_append_sheet(wb, wsDaily, "Resumen Diario");

        // Top Clientes
        const wsCustomers = XLSX.utils.json_to_sheet(
          stats.topCustomers.map((c, i) => ({
            "Posición": i + 1,
            "Cliente": c.name,
            "Kilos Totales": c.kilos.toFixed(2),
            "Importe Total (€)": c.amount.toFixed(2)
          }))
        );
        XLSX.utils.book_append_sheet(wb, wsCustomers, "Top Clientes");
      }

      // Todos los pedidos detallados
      const wsDetails = XLSX.utils.json_to_sheet(allData);
      XLSX.utils.book_append_sheet(wb, wsDetails, "Todos los Pedidos Detalle");

      XLSX.writeFile(wb, `Informe_Dashboard_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e: any) {
      alert("Error exportando: " + e.message);
    }
  };

  if (loading) return <div className="p-8 text-center">Cargando estadísticas...</div>;
  if (errorMsg) return (
    <div className="p-8 text-center">
      <div className="text-red-500 font-bold mb-2">Error al cargar datos</div>
      <div className="text-slate-600 text-sm max-w-md mx-auto bg-red-50 p-4 rounded-lg border border-red-100">
        {errorMsg}
        <br/><br/>
        <strong>Nota:</strong> Si estás usando la versión gratuita de Supabase, es posible que tu proyecto se haya pausado por inactividad. Ve a <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-blue-600 underline">supabase.com</a> para reactivarlo.
      </div>
    </div>
  );
  if (!stats) return <div className="p-8 text-center text-red-500">Error al cargar datos</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-3xl font-bold text-slate-800">Panel de Control</h2>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={exportDashboard}
            className="flex items-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 px-4 py-2 rounded-xl font-medium transition-colors shadow-sm"
          >
            <Download size={18} />
            <span className="hidden sm:inline">Exportar Informe</span>
            <span className="sm:hidden">Exportar</span>
          </button>
          <button 
            onClick={() => onAction('new-order')}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-medium transition-colors shadow-sm"
          >
            <PlusCircle size={18} />
            <span className="hidden sm:inline">Nuevo Pedido</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
          <button 
            onClick={() => onAction('orders')}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl font-medium transition-colors shadow-sm"
          >
            <List size={18} />
            <span className="hidden sm:inline">Ver Pedidos</span>
            <span className="sm:hidden">Pedidos</span>
          </button>
        </div>
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-4 bg-emerald-100 text-emerald-600 rounded-xl">
            <Euro size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Importe Total</p>
            <p className="text-2xl font-bold text-slate-900">{stats.totalAmount.toFixed(2)}€</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-4 bg-blue-100 text-blue-600 rounded-xl">
            <Package size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Pedidos</p>
            <p className="text-2xl font-bold text-slate-900">{stats.totalOrders}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-4 bg-emerald-100 text-emerald-600 rounded-xl">
            <Scale size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Kilos</p>
            <p className="text-2xl font-bold text-slate-900">{stats.totalKilos.toFixed(2)} kg</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-4 bg-purple-100 text-purple-600 rounded-xl">
            <Calendar size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Actividad (7 días)</p>
            <p className="text-2xl font-bold text-slate-900">{stats.dailyStats.length} días</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-slate-400" />
            Ventas por Día (€)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.dailyStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickFormatter={(value) => new Date(value).toLocaleDateString('es-ES', { weekday: 'short' })} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`${value.toFixed(2)} €`, 'Importe']}
                />
                <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} name="Importe (€)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Package size={20} className="text-slate-400" />
            Pedidos por Día
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.dailyStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickFormatter={(value) => new Date(value).toLocaleDateString('es-ES', { weekday: 'short' })} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} name="Pedidos" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold mb-4">Top 5 Clientes (Volumen)</h3>
          <div className="space-y-4">
            {stats.topCustomers.map((customer, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs flex items-center justify-center font-bold">
                    {index + 1}
                  </span>
                  <span className="text-slate-700 font-medium">{customer.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden hidden md:block">
                    <div 
                      className="h-full bg-emerald-500" 
                      style={{ width: `${(customer.kilos / stats.topCustomers[0].kilos) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono font-bold text-slate-900">{customer.kilos.toFixed(1)} kg</span>
                </div>
              </div>
            ))}
            {stats.topCustomers.length === 0 && (
              <p className="text-center text-slate-400 py-4">Sin datos suficientes</p>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold mb-4">Top 5 Productos (Kilos)</h3>
          <div className="space-y-4">
            {stats.topProducts.map((product, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs flex items-center justify-center font-bold">
                    {index + 1}
                  </span>
                  <span className="text-slate-700 font-medium">{product.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden hidden md:block">
                    <div 
                      className="h-full bg-blue-500" 
                      style={{ width: `${(product.kilos / stats.topProducts[0].kilos) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono font-bold text-slate-900">{product.kilos.toFixed(1)} kg</span>
                </div>
              </div>
            ))}
            {stats.topProducts.length === 0 && (
              <p className="text-center text-slate-400 py-4">Sin datos suficientes</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
