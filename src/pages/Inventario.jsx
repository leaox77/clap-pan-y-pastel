import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useSucursal } from '../context/SucursalContext'
import Modal from '../components/Modal'

const MERMA_LABELS = { 
  merma_danado: 'Dañado', 
  merma_vencido: 'Vencido', 
  merma_consumo_interno: 'Consumo interno', 
  merma_degustacion: 'Degustación', 
  merma_donacion: 'Donación', 
  merma_regalo: 'Regalo', 
  merma_diferencia: 'Diferencia' 
}

export default function Inventario() {
  const toast = useToast()
  const { role } = useAuth()
  const { sucursalActivaId } = useSucursal()
  const esAdmin = ['administrador', 'propietaria'].includes(role)
  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [tab, setTab] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [modalIngreso, setModalIngreso] = useState(null)
  const [modalMerma, setModalMerma] = useState(null)
  const [modalProd, setModalProd] = useState(false)
  const [modalEditar, setModalEditar] = useState(null)
  const [modalAuditoria, setModalAuditoria] = useState(null)
  const [auditoria, setAuditoria] = useState([])
  const [fIngreso, setFIngreso] = useState({ cantidad: '', nota: '' })
  const [fMerma, setFMerma] = useState({ tipo: 'merma_danado', cantidad: '', nota: '' })
  const [fProd, setFProd] = useState({ nombre: '', precio_venta: '', costo_unitario: '', stock_actual: '', stock_minimo: 2, categoria_id: '', activo_en_pos: true, es_pan: false })
  const [fEditar, setFEditar] = useState({})

  useEffect(() => { 
    if (sucursalActivaId) fetchData(); else setProductos([]) 
  }, [sucursalActivaId])

  async function fetchData() {
    const [{ data: inv, error: invError }, { data: cats, error: catError }] = await Promise.all([
      supabase.from('inventario_sucursal')
        .select('producto_id,stock_actual,stock_minimo,productos!inner(*,categorias(nombre))')
        .eq('sucursal_id', sucursalActivaId),
      supabase.from('categorias').select('*').order('nombre'),
    ])
    
    if (invError) { 
      console.error('Inventario:', invError)
      toast(invError.message, 'err')
      return 
    }
    if (catError) console.error('Categorías:', catError)
    
    const normalizados = (inv ?? [])
      .map(x => ({ 
        ...x.productos, 
        producto_id: x.producto_id, 
        stock_actual: Number(x.stock_actual ?? 0), 
        stock_minimo: Number(x.stock_minimo ?? 0) 
      }))
      .filter(p => p.activo !== false)
      .sort((a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es'))
    
    setProductos(normalizados)
    setCategorias(cats ?? [])
  }

  function abrirEditar(p) {
    setFEditar({ 
      nombre: p.nombre ?? '', 
      precio_venta: p.precio_venta ?? '', 
      costo_unitario: p.costo_unitario ?? '', 
      stock_actual: p.stock_actual ?? 0, 
      stock_minimo: p.stock_minimo ?? 0, 
      activo_en_pos: p.activo_en_pos ?? true, 
      es_pan: p.es_pan ?? false 
    })
    setModalEditar(p)
  }

  async function abrirAuditoria(p) {
    const { data, error } = await supabase
      .from('vista_auditoria_detallada')  // Usar la nueva vista
      .select('*')
      .eq('registro_id', p.id)
      .order('fecha', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Error cargando auditoría:', error)
      toast(error.message, 'err')
      return
    }
    
    setAuditoria(data ?? [])
    setModalAuditoria(p)
  }

  async function guardarEdicion() {
    if (!modalEditar || !sucursalActivaId) return

    // Validar que el stock no sea negativo
    if (Number(fEditar.stock_actual) < 0) {
      toast('El stock no puede ser negativo', 'err')
      return
    }

    const { error } = await supabase.rpc('editar_producto', {
      p_id: modalEditar.id,
      p_nombre: String(fEditar.nombre ?? '').trim(),
      p_precio_venta: Number(fEditar.precio_venta),
      p_costo_unitario: Number(fEditar.costo_unitario || 0),
      p_stock_actual: Number(fEditar.stock_actual),
      p_stock_minimo: Number(fEditar.stock_minimo || 0),
      p_activo_en_pos: !!fEditar.activo_en_pos,
      p_es_pan: !!fEditar.es_pan,
      p_sucursal_id: sucursalActivaId,
    })

    if (error) {
      toast(error.message, 'err')
      return
    }

    toast('Producto actualizado correctamente', 'ok')
    setModalEditar(null)
    setFEditar({})
    await fetchData()
  }

  async function registrarIngreso() {
    if (!sucursalActivaId || !modalIngreso) return

    const cantidad = Number(fIngreso.cantidad)

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      toast('Cantidad inválida', 'err')
      return
    }

    const { error } = await supabase.rpc('registrar_ingreso_inventario', {
      p_producto_id: modalIngreso.id,
      p_sucursal_id: sucursalActivaId,
      p_cantidad: cantidad,
      p_nota: fIngreso.nota?.trim() || null,
    })

    if (error) {
      toast(error.message, 'err')
      return
    }

    toast('Ingreso registrado correctamente', 'ok')
    setModalIngreso(null)
    setFIngreso({ cantidad: '', nota: '' })
    await fetchData()
  }

  async function registrarMerma() {
    if (!sucursalActivaId || !modalMerma) return

    const cantidad = Number(fMerma.cantidad)

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      toast('Cantidad inválida', 'err')
      return
    }

    const { error } = await supabase.rpc('registrar_merma', {
      p_producto_id: modalMerma.id,
      p_sucursal_id: sucursalActivaId,
      p_subtipo: fMerma.tipo,
      p_cantidad: cantidad,
      p_nota: fMerma.nota?.trim() || null,
    })

    if (error) {
      toast(error.message, 'err')
      return
    }

    toast('Merma registrada correctamente', 'ok')
    setModalMerma(null)
    setFMerma({ tipo: 'merma_danado', cantidad: '', nota: '' })
    await fetchData()
  }

  async function crearProducto() {
    if (!fProd.nombre.trim() || Number(fProd.precio_venta) <= 0) { 
      toast('Nombre y precio requeridos', 'err')
      return 
    }

    const { data: nuevo, error } = await supabase
      .from('productos')
      .insert({ 
        nombre: fProd.nombre.trim(), 
        precio_venta: Number(fProd.precio_venta), 
        costo_unitario: Number(fProd.costo_unitario || 0), 
        stock_actual: 0, 
        stock_minimo: Number(fProd.stock_minimo || 2), 
        categoria_id: fProd.categoria_id || null, 
        activo_en_pos: !!fProd.activo_en_pos, 
        es_pan: !!fProd.es_pan 
      })
      .select('id')
      .single()

    if (error) { 
      toast(error.message, 'err')
      return 
    }

    const { error: invError } = await supabase
      .from('inventario_sucursal')
      .insert({ 
        producto_id: nuevo.id, 
        sucursal_id: sucursalActivaId, 
        stock_actual: Number(fProd.stock_actual || 0), 
        stock_minimo: Number(fProd.stock_minimo || 2) 
      })

    if (invError) { 
      toast(invError.message, 'err')
      return 
    }

    toast('Producto creado', 'ok')
    setModalProd(false)
    setFProd({ nombre: '', precio_venta: '', costo_unitario: '', stock_actual: '', stock_minimo: 2, categoria_id: '', activo_en_pos: true, es_pan: false })
    await fetchData()
  }

  const filtrados = productos.filter(p => { 
    const s = Number(p.stock_actual), m = Number(p.stock_minimo)
    if (tab === 'bajo') return s > 0 && s <= m
    if (tab === 'agotado') return s <= 0
    return true 
  }).filter(p => String(p.nombre ?? '').toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <div className="page-wrap">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>Inventario</h2>
        {esAdmin && <button className="btn-secondary" onClick={() => setModalProd(true)}>+ Nuevo producto</button>}
      </div>

      <div className="grid-4" style={{ marginBottom: 20 }}>
        {[
          ['Total', productos.length],
          ['Stock OK', productos.filter(p => p.stock_actual > p.stock_minimo).length],
          ['Bajo', productos.filter(p => p.stock_actual > 0 && p.stock_actual <= p.stock_minimo).length],
          ['Agotados', productos.filter(p => p.stock_actual <= 0).length]
        ].map(([l,v]) => (
          <div key={l} className="card" style={{ padding: '14px 18px' }}>
            <p style={{ fontSize: 11, color: 'var(--text-soft)', textTransform: 'uppercase', marginBottom: 4 }}>{l}</p>
            <p style={{ fontSize: 26, fontWeight: 700 }}>{v}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="form-input" style={{ flex: 1, minWidth: 180 }} placeholder="Buscar producto..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--silver-light)' }}>
          {[
            ['todos','Todos'],
            ['bajo','Bajo stock'],
            ['agotado','Agotados']
          ].map(([k,l]) => (
            <button 
              key={k} 
              onClick={() => setTab(k)} 
              style={{ 
                padding: '8px 16px', 
                border: 'none', 
                background: 'none', 
                cursor: 'pointer', 
                fontSize: 13, 
                fontWeight: 600, 
                color: tab === k ? 'var(--text)' : 'var(--text-soft)', 
                borderBottom: tab === k ? '2px solid var(--yellow-dark)' : '2px solid transparent', 
                marginBottom: -2 
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
        <div className="table-scroll">
          <table className="clap-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Mín.</th>
                <th>Estado</th>
                <th>POS</th>
                <th>Pan</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-soft)', padding: 32 }}>Sin registros</td>
                </tr>
              ) : (
                filtrados.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                    <td style={{ fontWeight: 700 }}>Bs {Number(p.precio_venta).toFixed(2)}</td>
                    <td style={{ fontWeight: 700 }}>{p.stock_actual}</td>
                    <td>{p.stock_minimo}</td>
                    <td>
                      {p.stock_actual <= 0 ? 
                        <span className="badge-err">Agotado</span> : 
                        p.stock_actual <= p.stock_minimo ? 
                          <span className="badge-warn">Bajo</span> : 
                          <span className="badge-ok">OK</span>
                      }
                    </td>
                    <td>{p.activo_en_pos ? <span className="badge-ok">✓</span> : <span className="badge-err">✗</span>}</td>
                    <td>{p.es_pan ? <span className="badge-info">🍞</span> : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setModalIngreso(p)}>+ Stock</button>
                        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11, color: 'var(--warn)' }} onClick={() => setModalMerma(p)}>Merma</button>
                        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11, color: 'var(--info)' }} onClick={() => abrirEditar(p)}>✏ Editar</button>
                        {esAdmin && <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => abrirAuditoria(p)}>📋 Log</button>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Ingreso */}
      <Modal open={!!modalIngreso} onClose={() => setModalIngreso(null)} title={`+ Stock — ${modalIngreso?.nombre}`}>
        <label className="form-label">Cantidad que ingresa</label>
        <input className="form-input" type="number" style={{ marginBottom: 12 }} value={fIngreso.cantidad} onChange={e => setFIngreso(f => ({ ...f, cantidad: e.target.value }))} placeholder="0" />
        <label className="form-label">Nota</label>
        <input className="form-input" style={{ marginBottom: 20 }} value={fIngreso.nota} onChange={e => setFIngreso(f => ({ ...f, nota: e.target.value }))} placeholder="Producción / compra" />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalIngreso(null)}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={!fIngreso.cantidad || Number(fIngreso.cantidad) <= 0} onClick={registrarIngreso}>Registrar</button>
        </div>
      </Modal>

      {/* Modal Merma */}
      <Modal open={!!modalMerma} onClose={() => setModalMerma(null)} title={`Merma — ${modalMerma?.nombre}`}>
        <label className="form-label">Tipo</label>
        <select className="form-input form-select" style={{ marginBottom: 12 }} value={fMerma.tipo} onChange={e => setFMerma(f => ({ ...f, tipo: e.target.value }))}>
          {Object.entries(MERMA_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="form-label">Cantidad</label>
        <input className="form-input" type="number" style={{ marginBottom: 12 }} value={fMerma.cantidad} onChange={e => setFMerma(f => ({ ...f, cantidad: e.target.value }))} placeholder="0" />
        <label className="form-label">Nota</label>
        <input className="form-input" style={{ marginBottom: 20 }} value={fMerma.nota} onChange={e => setFMerma(f => ({ ...f, nota: e.target.value }))} placeholder="Motivo" />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalMerma(null)}>Cancelar</button>
          <button className="btn-danger" style={{ flex: 1 }} disabled={!fMerma.cantidad || Number(fMerma.cantidad) <= 0} onClick={registrarMerma}>Registrar</button>
        </div>
      </Modal>

      {/* Modal Editar */}
      <Modal open={!!modalEditar} onClose={() => setModalEditar(null)} title={`✏ Editar — ${modalEditar?.nombre}`}>
        <label className="form-label">Nombre</label>
        <input className="form-input" style={{ marginBottom: 12 }} value={fEditar.nombre ?? ''} onChange={e => setFEditar(f => ({ ...f, nombre: e.target.value }))} />
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div>
            <label className="form-label">Precio venta</label>
            <input className="form-input" type="number" value={fEditar.precio_venta ?? ''} onChange={e => setFEditar(f => ({ ...f, precio_venta: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Costo unitario</label>
            <input className="form-input" type="number" value={fEditar.costo_unitario ?? ''} onChange={e => setFEditar(f => ({ ...f, costo_unitario: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Stock actual</label>
            <input className="form-input" type="number" value={fEditar.stock_actual ?? ''} onChange={e => setFEditar(f => ({ ...f, stock_actual: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Stock mínimo</label>
            <input className="form-input" type="number" value={fEditar.stock_minimo ?? ''} onChange={e => setFEditar(f => ({ ...f, stock_minimo: e.target.value }))} />
          </div>
        </div>
        <label style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input type="checkbox" checked={!!fEditar.activo_en_pos} onChange={e => setFEditar(f => ({ ...f, activo_en_pos: e.target.checked }))} /> 
          Activo en POS
        </label>
        <label style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input type="checkbox" checked={!!fEditar.es_pan} onChange={e => setFEditar(f => ({ ...f, es_pan: e.target.checked }))} /> 
          Es pan
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalEditar(null)}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} onClick={guardarEdicion}>Guardar</button>
        </div>
      </Modal>

      {/* Modal Auditoría - Con mensajes claros */}
      <Modal open={!!modalAuditoria} onClose={() => setModalAuditoria(null)} title={`📋 Historial — ${modalAuditoria?.nombre}`}>
        {auditoria.length === 0 ? (
          <p style={{ color: 'var(--text-soft)', textAlign: 'center', padding: 20 }}>
            Sin cambios registrados para este producto
          </p>
        ) : (
          auditoria.map(a => (
            <div key={a.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--silver-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                  {a.icono || '📋'} {a.mensaje}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                  {new Date(a.fecha).toLocaleString('es-BO', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              {a.usuario_nombre && (
                <div style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 2 }}>
                  👤 {a.usuario_nombre} {a.usuario_rol ? `(${a.usuario_rol})` : ''}
                </div>
              )}
              {a.detalles && (
                <div style={{ 
                  fontSize: 12, 
                  color: 'var(--text-soft)', 
                  marginTop: 4,
                  padding: '4px 8px',
                  background: 'var(--bg-soft)',
                  borderRadius: 4,
                  fontStyle: 'italic'
                }}>
                  📝 {a.detalles}
                </div>
              )}
            </div>
          ))
        )}
      </Modal>

      {/* Modal Crear Producto */}
      <Modal open={modalProd} onClose={() => setModalProd(false)} title="Nuevo producto">
        <label className="form-label">Nombre</label>
        <input className="form-input" style={{ marginBottom: 12 }} value={fProd.nombre} onChange={e => setFProd(f => ({ ...f, nombre: e.target.value }))} />
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div>
            <label className="form-label">Precio venta</label>
            <input className="form-input" type="number" value={fProd.precio_venta} onChange={e => setFProd(f => ({ ...f, precio_venta: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Costo unitario</label>
            <input className="form-input" type="number" value={fProd.costo_unitario} onChange={e => setFProd(f => ({ ...f, costo_unitario: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Stock inicial</label>
            <input className="form-input" type="number" value={fProd.stock_actual} onChange={e => setFProd(f => ({ ...f, stock_actual: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Stock mínimo</label>
            <input className="form-input" type="number" value={fProd.stock_minimo} onChange={e => setFProd(f => ({ ...f, stock_minimo: e.target.value }))} />
          </div>
        </div>
        <label className="form-label">Categoría</label>
        <select className="form-input form-select" style={{ marginBottom: 12 }} value={fProd.categoria_id} onChange={e => setFProd(f => ({ ...f, categoria_id: e.target.value }))}>
          <option value="">Sin categoría</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <label style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={fProd.activo_en_pos} onChange={e => setFProd(f => ({ ...f, activo_en_pos: e.target.checked }))} /> 
          Activo en POS
        </label>
        <label style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input type="checkbox" checked={fProd.es_pan} onChange={e => setFProd(f => ({ ...f, es_pan: e.target.checked }))} /> 
          Es pan
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModalProd(false)}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={!fProd.nombre.trim() || Number(fProd.precio_venta) <= 0} onClick={crearProducto}>Guardar</button>
        </div>
      </Modal>
    </div>
  )
}