import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'

const ROLES = ['cajero', 'administrador', 'propietaria']
const ROLE_BADGE = { cajero: 'badge-info', administrador: 'badge-warn', propietaria: 'badge-ok' }

export default function Usuarios() {
  const toast = useToast()
  const [usuarios, setUsuarios] = useState([])
  const [sucursales, setSucursales] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'cajero', sucursal_id: '' })
  const [enviando, setEnviando] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const [{ data: u }, { data: s }] = await Promise.all([
      supabase.from('profiles').select('*, sucursales(nombre)').order('created_at'),
      supabase.from('sucursales').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    setUsuarios(u ?? [])
    setSucursales(s ?? [])
  }

  async function crearUsuario() {
    setEnviando(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    setEnviando(false)
    if (!res.ok) { toast(json.error ?? 'Error', 'err'); return }
    toast('Usuario creado', 'ok')
    setModal(false)
    setForm({ full_name: '', email: '', password: '', role: 'cajero', sucursal_id: '' })
    fetchData()
  }

  async function toggleActivo(id, activo) {
    await supabase.from('profiles').update({ active: !activo }).eq('id', id)
    toast(`Usuario ${activo ? 'desactivado' : 'activado'}`, 'ok')
    fetchData()
  }

  async function cambiarSucursal(id, sucursalId) {
    await supabase.from('profiles').update({ sucursal_id: sucursalId || null }).eq('id', id)
    toast('Sucursal actualizada', 'ok')
    fetchData()
  }

  return (
    <div className="page-wrap">
      <div className="toolbar-wrap" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>Usuarios del sistema</h2>
        <button className="btn-primary" onClick={() => setModal(true)}>+ Nuevo usuario</button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-scroll">
          <table className="clap-table">
            <thead><tr><th>Nombre</th><th>Rol</th><th>Sucursal</th><th>Estado</th><th>Creado</th><th>Acciones</th></tr></thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                        {u.full_name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      {u.full_name}
                    </div>
                  </td>
                  <td><span className={ROLE_BADGE[u.role] ?? 'badge-info'}>{u.role}</span></td>
                  <td>
                    {u.role === 'cajero' ? (
                      <select className="form-input form-select" style={{ fontSize: 12, padding: '4px 28px 4px 8px' }}
                        value={u.sucursal_id ?? ''}
                        onChange={e => cambiarSucursal(u.id, e.target.value)}>
                        <option value="">Sin asignar</option>
                        {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                    ) : (
                      <span style={{ color: 'var(--text-soft)', fontSize: 12 }}>Todas</span>
                    )}
                  </td>
                  <td><span className={u.active ? 'badge-ok' : 'badge-err'}>{u.active ? 'Activo' : 'Inactivo'}</span></td>
                  <td style={{ color: 'var(--text-soft)', fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(u.created_at).toLocaleDateString('es-BO')}</td>
                  <td>
                    <button onClick={() => toggleActivo(u.id, u.active)}
                      className={u.active ? 'btn-secondary' : 'btn-primary'}
                      style={{ padding: '4px 12px', fontSize: 11, whiteSpace: 'nowrap', color: u.active ? 'var(--err)' : undefined }}>
                      {u.active ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Crear usuario">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="form-label">Nombre completo</label>
            <input className="form-input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="María González" />
          </div>
          <div>
            <label className="form-label">Correo electrónico</label>
            <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="maria@panaderia.com" />
          </div>
          <div>
            <label className="form-label">Contraseña inicial</label>
            <input className="form-input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Mínimo 8 caracteres" />
          </div>
          <div>
            <label className="form-label">Rol</label>
            <select className="form-input form-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value, sucursal_id: e.target.value !== 'cajero' ? '' : f.sucursal_id }))}>
              {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
          {form.role === 'cajero' && (
            <div>
              <label className="form-label">Sucursal asignada <span style={{ color: 'var(--err)' }}>*</span></label>
              <select className="form-input form-select" value={form.sucursal_id} onChange={e => setForm(f => ({ ...f, sucursal_id: e.target.value }))}>
                <option value="">Seleccionar sucursal...</option>
                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
              <p style={{ fontSize: 11, color: 'var(--err)', marginTop: 4 }}>Los cajeros deben tener sucursal asignada para usar el sistema.</p>
            </div>
          )}
          <div style={{ background: 'var(--bg-soft)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--text-soft)' }}>
            <strong>Cajero:</strong> Ventas, caja, inventario y gastos de su sucursal —
            <strong> Administrador/Propietaria:</strong> Acceso total a todas las sucursales
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setModal(false)}>Cancelar</button>
          <button className="btn-primary" style={{ flex: 1 }}
            disabled={enviando || !form.email || !form.password || !form.full_name || (form.role === 'cajero' && !form.sucursal_id)}
            onClick={crearUsuario}>
            {enviando ? 'Creando...' : 'Crear usuario'}
          </button>
        </div>
      </Modal>
    </div>
  )
}