// supabase/functions/admin-create-user/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization")!;
  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabaseUser.auth.getUser();
  const { data: profile } = await supabaseUser.schema("panaderia")
    .from("profiles").select("role").eq("id", user?.id).single();

  if (!profile || !["administrador", "propietaria"].includes(profile.role)) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 403 });
  }

  const { email, password, full_name, role } = await req.json();
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data: newUser, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });

  await admin.schema("panaderia").from("profiles").insert({
    id: newUser.user.id, full_name, role,
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});