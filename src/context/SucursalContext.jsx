import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './AuthContext'

const SucursalContext = createContext(null)

export function SucursalProvider({ children }) {
  const { role, sucursalId, loading: authLoading } = useAuth()

  const [sucursales, setSucursales] = useState([])
  const [sucursalActivaId, setSucursalActivaId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function cargarSucursales() {
      if (authLoading) return

      if (!role) {
        setSucursales([])
        setSucursalActivaId(null)
        setLoading(false)
        return
      }

      setLoading(true)

      /*
       * CAJERO
       *
       * Un cajero nunca puede elegir otra sucursal.
       * La sucursal activa siempre es la de su perfil.
       */
      if (role === 'cajero') {
        if (!cancelled) {
          setSucursales([])
          setSucursalActivaId(sucursalId ?? null)
          setLoading(false)
        }

        return
      }

      /*
       * ADMINISTRADOR / PROPIETARIA
       *
       * Pueden trabajar con cualquiera de las
       * sucursales activas.
       */
      const { data, error } = await supabase
        .from('sucursales')
        .select('*')
        .eq('activo', true)
        .order('nombre', { ascending: true })

      if (cancelled) return

      if (error) {
        console.error('Error cargando sucursales:', error)
        setSucursales([])
        setSucursalActivaId(null)
        setLoading(false)
        return
      }

      const lista = data ?? []

      setSucursales(lista)

      /*
       * Si la sucursal activa actual ya no existe
       * o quedó inactiva, seleccionar la primera.
       */
      setSucursalActivaId(actual => {
        if (actual && lista.some(s => s.id === actual)) {
          return actual
        }

        return lista[0]?.id ?? null
      })

      setLoading(false)
    }

    cargarSucursales()

    return () => {
      cancelled = true
    }
  }, [role, sucursalId, authLoading])

  /*
   * Seguridad adicional:
   * un cajero nunca puede establecer manualmente
   * una sucursal diferente.
   */
  function cambiarSucursal(id) {
    if (role === 'cajero') {
      setSucursalActivaId(sucursalId ?? null)
      return
    }

    const existe = sucursales.some(s => s.id === id)

    if (!existe) {
      console.warn('Sucursal no válida:', id)
      return
    }

    setSucursalActivaId(id)
  }

  const sucursalActiva =
    sucursales.find(s => s.id === sucursalActivaId) ?? null

  return (
    <SucursalContext.Provider
      value={{
        sucursales,
        sucursalActivaId,
        sucursalActiva,
        setSucursalActivaId: cambiarSucursal,
        loading,
      }}
    >
      {children}
    </SucursalContext.Provider>
  )
}

export function useSucursal() {
  return useContext(SucursalContext)
}