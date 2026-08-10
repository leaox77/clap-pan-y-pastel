import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './AuthContext'

const SucursalContext = createContext(null)

export function SucursalProvider({ children }) {
  const { role, sucursalId } = useAuth()
  const [sucursales, setSucursales] = useState([])
  const [sucursalActivaId, setSucursalActivaId] = useState(null)

  useEffect(() => {
    if (!role) return
    if (role === 'cajero') {
      setSucursalActivaId(sucursalId)
      return
    }
    supabase.from('sucursales').select('*').eq('activo', true).order('nombre').then(({ data }) => {
      setSucursales(data ?? [])
      if (data?.length > 0) setSucursalActivaId(prev => prev ?? data[0].id)
    })
  }, [role, sucursalId])

  const sucursalActiva = sucursales.find(s => s.id === sucursalActivaId) ?? null

  return (
    <SucursalContext.Provider value={{ sucursalActivaId, sucursalActiva, sucursales, setSucursalActivaId }}>
      {children}
    </SucursalContext.Provider>
  )
}

export const useSucursal = () => useContext(SucursalContext)