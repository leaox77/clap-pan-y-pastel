// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

// sessionStorage en vez de localStorage: la sesión muere al cerrar la pestaña,
// reduciendo la ventana de exposición si hay XSS. No es cifrado real —
// la defensa de fondo es CSP estricta + RLS, no la "ofuscación" del token.
const secureStorage = {
  getItem: (k) => sessionStorage.getItem(k),
  setItem: (k, v) => sessionStorage.setItem(k, v),
  removeItem: (k) => sessionStorage.removeItem(k),
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { storage: secureStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    db: { schema: 'panaderia' } }
)