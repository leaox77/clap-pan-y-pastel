import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'
import { useSucursal } from '../context/SucursalContext'
import Modal from '../components/Modal'

const TIPOS = {
  merma_danado: 'Dañado',
  merma_vencido: 'Vencido',
  merma_consumo_interno: 'Consumo interno',
  merma_degustacion: 'Degustación',
  merma_donacion: 'Donación',
  merma_regalo: 'Regalo',
  merma_diferencia: 'Diferencia',
}

export default function Mermas() {
  const toast = useToast()
  const { sucursalActivaId } = useSucursal()

  const [mermas, setMermas] = useState([])
  const [productos, setProductos] = useState([])
  const [modal, setModal] = useState(false)

  const [form, setForm] = useState({
    producto_id: '',
    tipo: 'merma_danado',
    cantidad: '',
    nota: '',
  })

  // Función para obtener fecha de Bolivia
function getBoliviaDateString() {
  const now = new Date()
  const boliviaTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000) - 4 * 3600000)
  return boliviaTime.toISOString().split('T')[0]
}

const [filtroFecha, setFiltroFecha] = useState(getBoliviaDateString())

  useEffect(() => {
    if (!sucursalActivaId) {
      setMermas([])
      setProductos([])
      return
    }

    fetchData()
  }, [filtroFecha, sucursalActivaId])

  async function fetchData() {
    if (!sucursalActivaId) return

    /*
     * =========================================================
     * MERMAS
     * =========================================================
     *
     * "tipo" es un ENUM de PostgreSQL.
     *
     * NO usamos:
     * .filter('tipo', 'like', 'merma%')
     *
     * porque LIKE no funciona directamente con el ENUM.
     *
     * Usamos .in() con los tipos de merma.
     */

    const qMermas = supabase
      .from('inventario_movimientos')
      .select(`
        id,
        tipo,
        cantidad,
        nota,
        fecha,
        producto_id,
        sucursal_id,
        productos (
          nombre
        )
      `)
      .in('tipo', Object.keys(TIPOS))
      .eq('sucursal_id', sucursalActivaId)
      .gte('fecha', `${filtroFecha}T00:00:00`)
      .lte('fecha', `${filtroFecha}T23:59:59`)
      .order('fecha', { ascending: false })

    /*
     * =========================================================
     * PRODUCTOS DE LA SUCURSAL
     * =========================================================
     *
     * IMPORTANTE:
     * El stock ya NO viene de productos.stock_actual.
     *
     * Ahora viene de:
     * inventario_sucursal.stock_actual
     *
     * y se filtra por la sucursal activa.
     */

    const qProductos = supabase
      .from('inventario_sucursal')
      .select(`
        id,
        producto_id,
        sucursal_id,
        stock_actual,
        stock_minimo,
        productos (
          id,
          nombre,
          activo_en_pos
        )
      `)
      .eq('sucursal_id', sucursalActivaId)

    const [
      { data: mv, error: errorMermas },
      { data: inventario, error: errorProductos },
    ] = await Promise.all([
      qMermas,
      qProductos,
    ])

    if (errorMermas) {
      console.error('Mermas error:', errorMermas)
      toast(errorMermas.message, 'err')
      return
    }

    if (errorProductos) {
      console.error('Productos error:', errorProductos)
      toast(errorProductos.message, 'err')
      return
    }

    /*
     * Normalizamos los productos para que el resto
     * del componente pueda trabajar directamente
     * con id, nombre y stock_actual.
     */

    const productosNormalizados = (inventario ?? [])
      .filter((row) => row.productos)
      .map((row) => ({
        id: row.productos.id,
        nombre: row.productos.nombre,
        activo_en_pos: row.productos.activo_en_pos,
        stock_actual: row.stock_actual ?? 0,
        stock_minimo: row.stock_minimo ?? 0,
        inventario_id: row.id,
        producto_id: row.producto_id,
        sucursal_id: row.sucursal_id,
      }))
      .sort((a, b) =>
        String(a.nombre ?? '').localeCompare(
          String(b.nombre ?? ''),
          'es'
        )
      )

    setMermas(mv ?? [])
    setProductos(productosNormalizados)
  }

  async function registrar() {
    if (!sucursalActivaId) {
      toast('No hay una sucursal seleccionada', 'err')
      return
    }

    if (!form.producto_id) {
      toast('Selecciona un producto', 'err')
      return
    }

    const cantidad = Number(form.cantidad)

    if (Number.isNaN(cantidad) || cantidad <= 0) {
      toast('La cantidad debe ser mayor a 0', 'err')
      return
    }

    /*
     * Verificamos el stock de ESTA sucursal antes
     * de registrar la merma.
     */

    const producto = productos.find(
      (p) => p.id === form.producto_id
    )

    if (!producto) {
      toast('Producto no encontrado en esta sucursal', 'err')
      return
    }

    const stockActual = Number(
      producto.stock_actual ?? 0
    )

    if (cantidad > stockActual) {
      toast(
        `Stock insuficiente. Disponible: ${stockActual}`,
        'err'
      )
      return
    }

    /*
     * La función RPC debe recibir la sucursal para
     * modificar únicamente inventario_sucursal.
     */

    const { error } = await supabase.rpc(
      'registrar_merma',
      {
        p_producto_id: form.producto_id,
        p_sucursal_id: sucursalActivaId,
        p_subtipo: form.tipo,
        p_cantidad: cantidad,
        p_nota: form.nota?.trim() || null,
      }
    )

    if (error) {
      console.error('Registrar merma error:', error)
      toast(error.message, 'err')
      return
    }

    toast('Merma registrada', 'ok')

    setModal(false)

    setForm({
      producto_id: '',
      tipo: 'merma_danado',
      cantidad: '',
      nota: '',
    })

    await fetchData()
  }

  const resumen = mermas.reduce(
    (acc, m) => {
      acc[m.tipo] =
        (acc[m.tipo] ?? 0) +
        Math.abs(Number(m.cantidad))

      return acc
    },
    {}
  )

  const totalUnidades = mermas.reduce(
    (s, m) =>
      s + Math.abs(Number(m.cantidad)),
    0
  )

  return (
    <div
      className="toolbar-wrap"
      style={{ marginBottom: 24 }}
    >
      {/* HEADER */}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            flex: 1,
          }}
        >
          Mermas y pérdidas
        </h2>

        <input
          type="date"
          className="form-input"
          style={{ width: 'auto' }}
          value={filtroFecha}
          onChange={(e) =>
            setFiltroFecha(e.target.value)
          }
        />

        <button
          className="btn-primary"
          onClick={() => setModal(true)}
          disabled={!sucursalActivaId}
        >
          + Registrar merma
        </button>
      </div>

      {/* CONTENIDO */}

      <div className="grid-2">
        {/* LISTA */}

        <div>
          <div
            style={{
              background: 'var(--err-bg)',
              borderRadius: 10,
              padding: '12px 18px',
              marginBottom: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: 'var(--err)',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 13 }}>
              Total unidades perdidas
            </span>

            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              {totalUnidades}
            </span>
          </div>

          <div
            className="card"
            style={{ overflow: 'hidden' }}
          >
            <div className="table-scroll">
              <table className="clap-table">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Producto</th>
                    <th>Tipo</th>
                    <th>Cantidad</th>
                    <th>Nota</th>
                  </tr>
                </thead>

                <tbody>
                  {mermas.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          textAlign: 'center',
                          color:
                            'var(--text-soft)',
                          padding: 28,
                        }}
                      >
                        Sin mermas registradas
                      </td>
                    </tr>
                  ) : (
                    mermas.map((m) => (
                      <tr key={m.id}>
                        <td
                          style={{
                            color:
                              'var(--text-soft)',
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          {new Date(
                            m.fecha
                          ).toLocaleTimeString(
                            'es-BO',
                            {
                              hour: '2-digit',
                              minute: '2-digit',
                            }
                          )}
                        </td>

                        <td
                          style={{
                            fontWeight: 600,
                          }}
                        >
                          {m.productos?.nombre ??
                            'Sin nombre'}
                        </td>

                        <td>
                          <span className="badge-err">
                            {TIPOS[m.tipo] ??
                              m.tipo}
                          </span>
                        </td>

                        <td
                          style={{
                            fontWeight: 700,
                            color:
                              'var(--err)',
                          }}
                        >
                          {Math.abs(
                            Number(
                              m.cantidad
                            )
                          )}
                        </td>

                        <td
                          style={{
                            color:
                              'var(--text-soft)',
                          }}
                        >
                          {m.nota || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RESUMEN */}

        <div
          className="card"
          style={{
            padding: 20,
            alignSelf: 'start',
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 14,
            }}
          >
            Por tipo
          </h3>

          {Object.entries(resumen).length ===
          0 ? (
            <p
              style={{
                color:
                  'var(--text-soft)',
                fontSize: 13,
              }}
            >
              Sin mermas hoy
            </p>
          ) : (
            Object.entries(resumen).map(
              ([tipo, cant]) => (
                <div
                  key={tipo}
                  style={{
                    display: 'flex',
                    justifyContent:
                      'space-between',
                    padding: '7px 0',
                    borderBottom:
                      '1px solid var(--silver-light)',
                    fontSize: 13,
                  }}
                >
                  <span>
                    {TIPOS[tipo] ?? tipo}
                  </span>

                  <span
                    style={{
                      fontWeight: 600,
                      color:
                        'var(--err)',
                    }}
                  >
                    {cant} unid.
                  </span>
                </div>
              )
            )
          )}
        </div>
      </div>

      {/* MODAL */}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Registrar merma o pérdida"
      >
        <label className="form-label">
          Producto
        </label>

        <select
          className="form-input form-select"
          style={{ marginBottom: 12 }}
          value={form.producto_id}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              producto_id:
                e.target.value,
            }))
          }
        >
          <option value="">
            Seleccionar...
          </option>

          {productos.map((p) => (
            <option
              key={p.id}
              value={p.id}
            >
              {p.nombre} (stock:{' '}
              {p.stock_actual})
            </option>
          ))}
        </select>

        <label className="form-label">
          Motivo
        </label>

        <select
          className="form-input form-select"
          style={{ marginBottom: 12 }}
          value={form.tipo}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              tipo: e.target.value,
            }))
          }
        >
          {Object.entries(TIPOS).map(
            ([k, v]) => (
              <option
                key={k}
                value={k}
              >
                {v}
              </option>
            )
          )}
        </select>

        <label className="form-label">
          Cantidad
        </label>

        <input
          className="form-input"
          type="number"
          min="0.01"
          step="0.01"
          style={{ marginBottom: 12 }}
          value={form.cantidad}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              cantidad:
                e.target.value,
            }))
          }
          placeholder="0"
        />

        <label className="form-label">
          Nota (opcional)
        </label>

        <input
          className="form-input"
          style={{ marginBottom: 20 }}
          value={form.nota}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              nota: e.target.value,
            }))
          }
          placeholder="Descripción del motivo"
        />

        <div
          style={{
            display: 'flex',
            gap: 10,
          }}
        >
          <button
            className="btn-secondary"
            style={{ flex: 1 }}
            onClick={() =>
              setModal(false)
            }
          >
            Cancelar
          </button>

          <button
            className="btn-danger"
            style={{ flex: 1 }}
            disabled={
              !form.producto_id ||
              !form.cantidad ||
              Number(form.cantidad) <= 0
            }
            onClick={registrar}
          >
            Registrar pérdida
          </button>
        </div>
      </Modal>
    </div>
  )
}