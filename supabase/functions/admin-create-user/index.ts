// supabase/functions/admin-create-user/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
Deno.serve(async (req)=>{
  // ============================================
  // CORS / PREFLIGHT
  // ============================================
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders
    });
  }
  if (req.method !== "POST") {
    return jsonResponse({
      error: "Método no permitido"
    }, 405);
  }
  try {
    console.log("=== admin-create-user: inicio ===");
    // ============================================
    // VARIABLES DE ENTORNO
    // ============================================
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl) {
      console.error("Falta SUPABASE_URL");
      return jsonResponse({
        error: "Configuración del servidor incompleta: SUPABASE_URL"
      }, 500);
    }
    if (!supabaseAnonKey) {
      console.error("Falta SUPABASE_ANON_KEY");
      return jsonResponse({
        error: "Configuración del servidor incompleta: SUPABASE_ANON_KEY"
      }, 500);
    }
    if (!serviceRoleKey) {
      console.error("Falta SUPABASE_SERVICE_ROLE_KEY");
      return jsonResponse({
        error: "Configuración del servidor incompleta: SUPABASE_SERVICE_ROLE_KEY"
      }, 500);
    }
    // ============================================
    // AUTORIZACIÓN DEL USUARIO ACTUAL
    // ============================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No se recibió Authorization");
      return jsonResponse({
        error: "No autenticado"
      }, 401);
    }
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError) {
      console.error("Error obteniendo usuario:", userError);
      return jsonResponse({
        error: "No se pudo verificar el usuario autenticado",
        details: userError.message
      }, 401);
    }
    if (!user) {
      console.error("No existe usuario autenticado");
      return jsonResponse({
        error: "Usuario no autenticado"
      }, 401);
    }
    console.log("Usuario autenticado:", user.id);
    // ============================================
    // VERIFICAR PERFIL Y ROL
    // ============================================
    const { data: profile, error: profileError } = await supabaseUser.schema("panaderia").from("profiles").select("role").eq("id", user.id).single();
    if (profileError) {
      console.error("Error obteniendo perfil:", profileError);
      return jsonResponse({
        error: "No se pudo verificar el perfil",
        details: profileError.message
      }, 500);
    }
    console.log("Rol del usuario:", profile?.role);
    if (!profile || ![
      "administrador",
      "propietaria"
    ].includes(profile.role)) {
      console.error("Usuario sin permisos. Rol:", profile?.role);
      return jsonResponse({
        error: "No autorizado"
      }, 403);
    }
    // ============================================
    // LEER DATOS DEL NUEVO USUARIO
    // ============================================
    let body;
    try {
      body = await req.json();
    } catch (error) {
      console.error("Error leyendo JSON:", error);
      return jsonResponse({
        error: "El cuerpo de la petición no es JSON válido"
      }, 400);
    }
    const { email, password, full_name, role, sucursal_id } = body;
    console.log("Datos recibidos:", {
      email,
      full_name,
      role,
      sucursal_id,
      hasPassword: !!password
    });
    // ============================================
    // VALIDACIONES
    // ============================================
    if (!email || !password || !full_name || !role) {
      return jsonResponse({
        error: "Faltan datos obligatorios: email, password, full_name o role"
      }, 400);
    }
    const rolesPermitidos = [
      "administrador",
      "propietaria",
      "cajero"
    ];
    if (!rolesPermitidos.includes(role)) {
      return jsonResponse({
        error: `Rol no válido: ${role}`
      }, 400);
    }
    if (role === "cajero" && !sucursal_id) {
      return jsonResponse({
        error: "Los cajeros requieren sucursal asignada"
      }, 400);
    }
    // ============================================
    // CLIENTE ADMINISTRATIVO
    // ============================================
    const admin = createClient(supabaseUrl, serviceRoleKey);
    // ============================================
    // CREAR USUARIO EN AUTH
    // ============================================
    console.log("Creando usuario en Supabase Auth...");
    const { data: newUser, error: createUserError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (createUserError) {
      console.error("Error creando usuario Auth:", createUserError);
      return jsonResponse({
        error: createUserError.message
      }, 400);
    }
    if (!newUser?.user) {
      console.error("Supabase no devolvió el usuario creado");
      return jsonResponse({
        error: "El usuario fue procesado pero Supabase no devolvió sus datos"
      }, 500);
    }
    console.log("Usuario Auth creado:", newUser.user.id);
    // ============================================
    // CREAR PERFIL
    // ============================================
    console.log("Creando perfil en panaderia.profiles...");
    const { error: profileInsertError } = await admin.schema("panaderia").from("profiles").insert({
      id: newUser.user.id,
      full_name,
      role,
      sucursal_id: sucursal_id || null
    });
    if (profileInsertError) {
      console.error("ERROR INSERTANDO PERFIL:", profileInsertError);
      // Intentar eliminar el usuario de Auth
      // para evitar dejar un usuario sin perfil.
      console.log("Intentando eliminar usuario Auth...");
      const { error: deleteUserError } = await admin.auth.admin.deleteUser(newUser.user.id);
      if (deleteUserError) {
        console.error("No se pudo eliminar usuario Auth:", deleteUserError);
      }
      return jsonResponse({
        error: "No se pudo crear el perfil del usuario",
        details: profileInsertError.message,
        code: profileInsertError.code
      }, 500);
    }
    // ============================================
    // ÉXITO
    // ============================================
    console.log("Perfil creado correctamente");
    console.log("=== admin-create-user: éxito ===");
    return jsonResponse({
      ok: true,
      user_id: newUser.user.id
    });
  } catch (error) {
    console.error("ERROR INESPERADO:", error);
    return jsonResponse({
      error: error instanceof Error ? error.message : "Error interno del servidor"
    }, 500);
  }
});
