import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useSucursal } from '../context/SucursalContext'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const { role } = useAuth()
  const { sucursalActivaId } = useSucursal()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { 
    if (sucursalActivaId) {
      fetchData() 
    } else {
      setLoading(false)
    }
  }, [sucursalActivaId])

  // Función para obtener la fecha de Bolivia
  function getBoliviaDate() {
    const now = new Date()
    // Bolivia está en UTC-4
    const boliviaTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000) - 4 * 3600000)
    return boliviaTime
  }

  // Función para obtener la fecha en formato YYYY-MM-DD de Bolivia
  function getBoliviaDateString() {
    const boliviaDate = getBoliviaDate()
    return boliviaDate.toISOString().split('T')[0]
  }

  async function fetchData() {
    // Usar fecha de Bolivia
    const hoyBolivia = getBoliviaDateString()
    
    console.log('Fecha de Bolivia (hoy):', hoyBolivia)

    try {
      // 1. Obtener ventas del día usando fecha de Bolivia - CON GANANCIA
      const { data: ventas, error: ventasError } = await supabase
        .from('ventas')
        .select(`
          id,
          total,
          medio_pago,
          estado,
          fecha,
          usuario_id,
          profiles!ventas_usuario_id_fkey (
            full_name
          ),
          sucursal_id,
          venta_items (
            ganancia,
            subtotal,
            cantidad,
            producto_id
          )
        `)
        .eq('sucursal_id', sucursalActivaId)
        .eq('estado', 'completada')
        .gte('fecha', hoyBolivia)
        .order('fecha', { ascending: false })

      if (ventasError) {
        console.error('Error cargando ventas:', ventasError)
      }

      // 2. Obtener productos con stock desde inventario_sucursal
      const { data: productosConStock, error: stockError } = await supabase
        .from('inventario_sucursal')
        .select(`
          stock_actual,
          stock_minimo,
          productos!inner (
            id,
            nombre,
            activo,
            es_pan
          )
        `)
        .eq('sucursal_id', sucursalActivaId)

      if (stockError) {
        console.error('Error cargando stock:', stockError)
      }

      // 3. Obtener sesión activa
      const { data: sesion, error: sesionError } = await supabase
        .from('caja_sesiones')
        .select(`
          *,
          profiles!usuario_apertura_id (
            full_name
          )
        `)
        .eq('sucursal_id', sucursalActivaId)
        .eq('estado', 'abierta')
        .limit(1)
        .maybeSingle()

      if (sesionError) {
        console.error('Error cargando sesión:', sesionError)
      }

      // 4. Obtener gastos del día usando fecha de Bolivia
      const { data: gastos, error: gastosError } = await supabase
        .from('gastos')
        .select('monto')
        .eq('sucursal_id', sucursalActivaId)
        .gte('fecha', hoyBolivia)

      if (gastosError) {
        console.error('Error cargando gastos:', gastosError)
      }

      // Procesar productos con stock
      const productos = (productosConStock ?? [])
        .map(item => ({
          id: item.productos.id,
          nombre: item.productos.nombre,
          stock_actual: Number(item.stock_actual ?? 0),
          stock_minimo: Number(item.stock_minimo ?? 0),
          activo: item.productos.activo,
          es_pan: item.productos.es_pan
        }))
        .filter(p => p.activo !== false)

      // Procesar ventas - filtrar solo las completadas
      const ventasHoy = (ventas ?? []).filter(v => v.estado === 'completada')
      
      // Procesar gastos
      const gastosHoy = gastos ?? []

      // Calcular totales
      const totalHoy = ventasHoy.reduce((s, v) => s + Number(v.total), 0)
      const gastoTotal = gastosHoy.reduce((s, g) => s + Number(g.monto), 0)
      
      // ============================================================
      // NUEVO: Calcular ganancia total del día
      // ============================================================
      const gananciaTotalDia = ventasHoy.reduce((sum, venta) => {
        const gananciaVenta = (venta.venta_items || []).reduce((s, item) => {
          return s + Number(item.ganancia || 0)
        }, 0)
        return sum + gananciaVenta
      }, 0)
      
      // Productos bajo stock
      const bajo = productos.filter(p => p.stock_actual <= p.stock_minimo && p.stock_actual > 0)
      const agotados = productos.filter(p => p.stock_actual <= 0)

      // Información de panes
      const panInfo = sesion ? { 
        inicial: Number(sesion.total_pan_inicial ?? 0), 
        sobrante: Number(sesion.pan_sobrante_anterior ?? 0) 
      } : null

      // Últimas ventas (máximo 10)
      const ultimas = ventasHoy.slice(0, 10)

      console.log('Ventas cargadas:', ventasHoy.length)
      console.log('Últimas ventas:', ultimas)
      console.log('Ganancia total del día:', gananciaTotalDia)

      setData({ 
        ventas: ventasHoy, 
        totalHoy,
        gananciaTotalDia,  // 👈 NUEVO
        gastoTotal, 
        bajo, 
        agotados,
        sesion, 
        ultimas, 
        panInfo,
        productos,
        fechaBolivia: hoyBolivia
      })
    } catch (error) {
      console.error('Error en fetchData:', error)
    } finally {
      setLoading(false)
    }
}

  if (loading) return <div className="page-wrap" style={{ color: 'var(--text-soft)' }}>Cargando...</div>

  if (!sucursalActivaId) {
    return (
      <div className="page-wrap">
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-soft)' }}>
          <p style={{ fontSize: 18, marginBottom: 10 }}>🏪 Selecciona una sucursal</p>
          <p style={{ fontSize: 14 }}>Para ver el dashboard, debes seleccionar una sucursal activa</p>
        </div>
      </div>
    )
  }

  const { 
    ventas = [], 
    totalHoy = 0, 
    gananciaTotalDia = 0,
    gastoTotal = 0, 
    bajo = [], 
    agotados = [],
    sesion, 
    ultimas = [], 
    panInfo,
    productos = []
  } = data || {}

  // Formatear fecha de Bolivia para mostrar
  const boliviaDate = getBoliviaDate()
  const hoy = boliviaDate.toLocaleDateString('es-BO', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })
  
  const ventasEfectivo = ventas
    .filter(v => v.medio_pago === 'efectivo')
    .reduce((s, v) => s + Number(v.total), 0)
  
  const ventasQR = ventas
    .filter(v => v.medio_pago === 'qr' || v.medio_pago === 'transferencia')
    .reduce((s, v) => s + Number(v.total), 0)

  const totalProductos = productos.length
  const totalBajoStock = bajo.length + agotados.length

  return (
    <div className="page-wrap">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Dashboard</h1>
        <p style={{ color: 'var(--text-soft)', fontSize: 14, textTransform: 'capitalize' }}>{hoy}</p>
      </div>

      {/* Estado del turno */}
      {sesion ? (
        <div style={{ 
          background: 'var(--ok-bg)', 
          borderLeft: '4px solid var(--ok)', 
          borderRadius: 10, 
          padding: '12px 16px', 
          marginBottom: 20, 
          fontSize: 13, 
          color: 'var(--ok)', 
          display: 'flex', 
          alignItems: 'center', 
          gap: 10, 
          flexWrap: 'wrap' 
        }}>
          <span style={{ fontWeight: 700 }}>✓ Turno {sesion.tipo_turno === 'manana' ? '☀️ mañana' : '🌙 tarde'} activo</span>
          {panInfo && <span>— {panInfo.inicial} panes registrados</span>}
          <button 
            onClick={() => navigate('/caja')} 
            style={{ 
              marginLeft: 'auto', 
              background: 'none', 
              border: '1px solid var(--ok)', 
              borderRadius: 6, 
              padding: '4px 12px', 
              cursor: 'pointer', 
              color: 'var(--ok)', 
              fontWeight: 600, 
              fontSize: 12 
            }}
          >
            Ver caja →
          </button>
        </div>
      ) : (
        <div style={{ 
          background: 'var(--warn-bg)', 
          borderLeft: '4px solid var(--warn)', 
          borderRadius: 10, 
          padding: '12px 16px', 
          marginBottom: 20, 
          fontSize: 13, 
          color: 'var(--warn)', 
          display: 'flex', 
          alignItems: 'center', 
          gap: 10 
        }}>
          <span>⚠ No hay turno activo</span>
          <button 
            onClick={() => navigate('/caja')} 
            style={{ 
              marginLeft: 'auto', 
              background: 'none', 
              border: '1px solid var(--warn)', 
              borderRadius: 6, 
              padding: '4px 12px', 
              cursor: 'pointer', 
              color: 'var(--warn)', 
              fontWeight: 600, 
              fontSize: 12 
            }}
          >
            Iniciar turno →
          </button>
        </div>
      )}

      {/* Alerta de stock bajo */}
      {totalBajoStock > 0 && (
        <div style={{ 
          background: 'var(--err-bg)', 
          borderLeft: '4px solid var(--err)', 
          borderRadius: 10, 
          padding: '12px 16px', 
          marginBottom: 20, 
          fontSize: 13, 
          color: 'var(--err)' 
        }}>
          ⚠ <strong>Stock bajo:</strong> {bajo.length > 0 && `${bajo.length} productos con stock bajo`}
          {bajo.length > 0 && agotados.length > 0 && ' · '}
          {agotados.length > 0 && `${agotados.length} productos agotados`}
          {bajo.length > 0 && (
            <span style={{ marginLeft: 8 }}>
              ({bajo.slice(0, 3).map(p => `${p.nombre} (${p.stock_actual})`).join(' · ')}
              {bajo.length > 3 && ` +${bajo.length - 3} más`})
            </span>
          )}
        </div>
      )}

      {/* Métricas */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        {[
          ['Ventas hoy', ventas.length, '', 'info'],
          ['Total del día', `Bs ${totalHoy.toFixed(2)}`, '', 'ok'],
          ['💰 Ganancia', `Bs ${gananciaTotalDia.toFixed(2)}`, '', 'ok'],
          ['Efectivo', `Bs ${ventasEfectivo.toFixed(2)}`, '', 'ok'],
        ].map(([l, v, b, t]) => (
          <div key={l} className="card" style={{ padding: '16px 18px' }}>
            <p style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{l}</p>
            <p style={{ fontSize: 22, fontWeight: 700 }}>{v}</p>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* Acciones rápidas */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Acciones rápidas</h3>
          <div className="grid-2" style={{ gap: 10 }}>
            {[
              { label: '🍞 Vender panes', path: '/ventas' },
              { label: '📦 Inventario', path: '/inventario' },
              { label: '💵 Gastos', path: '/gastos' },
              { label: '📊 Reportes', path: '/reportes', adminOnly: true },
            ].filter(a => !a.adminOnly || role !== 'cajero').map((a, idx) => (
              <button 
                key={a.path} 
                onClick={() => navigate(a.path)}
                className={idx === 0 ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '13px', fontSize: 13, width: '100%' }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stock bajo */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>
            Stock bajo {totalBajoStock > 0 && <span className="badge-warn" style={{ marginLeft: 8 }}>{totalBajoStock}</span>}
          </h3>
          {totalBajoStock === 0 ? (
            <p style={{ color: 'var(--text-soft)', fontSize: 13 }}>✓ Todo el stock OK</p>
          ) : (
            <>
              {bajo.length > 0 && (
                <>
                  <p style={{ fontSize: 11, color: 'var(--text-soft)', marginBottom: 6 }}>⚠ Bajo stock:</p>
                  {bajo.slice(0, 5).map(p => (
                    <div key={p.id} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      padding: '7px 0', 
                      borderBottom: '1px solid var(--silver-light)', 
                      fontSize: 13, 
                      gap: 8 
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                      <span className="badge-warn" style={{ flexShrink: 0 }}>{p.stock_actual}</span>
                    </div>
                  ))}
                </>
              )}
              {agotados.length > 0 && (
                <>
                  <p style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 8, marginBottom: 6 }}>❌ Agotados:</p>
                  {agotados.slice(0, 5).map(p => (
                    <div key={p.id} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      padding: '7px 0', 
                      borderBottom: '1px solid var(--silver-light)', 
                      fontSize: 13, 
                      gap: 8 
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                      <span className="badge-err" style={{ flexShrink: 0 }}>0</span>
                    </div>
                  ))}
                </>
              )}
              {totalBajoStock > 10 && (
                <p style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 8 }}>
                  +{totalBajoStock - 10} productos más con stock bajo
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Últimas ventas */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ 
          padding: '14px 20px', 
          borderBottom: '1px solid var(--silver-light)', 
          fontWeight: 700, 
          fontSize: 15,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>Últimas ventas del día</span>
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-soft)' }}>
            {ultimas.length} ventas · Total: Bs {totalHoy.toFixed(2)}
          </span>
        </div>
        <div className="table-scroll">
          <table className="clap-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Total</th>
                <th>Medio</th>
                <th>Vendedor</th>
                <th>Ganancia</th>
              </tr>
            </thead>
            <tbody>
              {ultimas.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 24 }}>
                    Sin ventas hoy
                  </td>
                </tr>
              ) : (
                ultimas.map(v => {
                  // Calcular ganancia de esta venta
                  const gananciaVenta = (v.venta_items || []).reduce((s, item) => s + Number(item.ganancia || 0), 0)
                  return (
                    <tr key={v.id}>
                      <td style={{ color: 'var(--text-soft)' }}>
                        {new Date(v.fecha).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ fontWeight: 700 }}>Bs {Number(v.total).toFixed(2)}</td>
                      <td>
                        <span className="badge-info" style={{ textTransform: 'capitalize' }}>
                          {v.medio_pago === 'qr' ? '📱 QR' : 
                          v.medio_pago === 'transferencia' ? '🏦 Transferencia' : 
                          '💵 Efectivo'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-soft)' }}>
                        {v.profiles?.full_name ?? '—'}
                      </td>
                      <td style={{ color: 'var(--ok)', fontWeight: 700 }}>
                        Bs {gananciaVenta.toFixed(2)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}