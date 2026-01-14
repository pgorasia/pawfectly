import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pawfectly-secret",
}

function json(res: unknown, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  // Optional: lock down to internal callers
  const internalSecret = Deno.env.get("PAWFECTLY_INTERNAL_SECRET")
  if (internalSecret) {
    const provided = req.headers.get("x-pawfectly-secret")
    if (provided !== internalSecret) {
      return json({ error: "Unauthorized" }, 401)
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: "missing_env" }, 500)
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  // Allow override via query; default 200
  let limit = 200
  try {
    const url = new URL(req.url)
    const q = url.searchParams.get("limit")
    if (q) limit = Math.max(1, Math.min(500, parseInt(q, 10)))
  } catch (_) {}

  try {
    const { data, error } = await supabaseAdmin.rpc("auto_resolve_cross_lane_connections", {
      p_limit: limit,
    })

    if (error) {
      console.error("[auto-resolve-cross-lane] rpc error:", error)
      return json({ ok: false, error: error.message }, 500)
    }

    return json(data ?? { ok: true, processed: 0 })
  } catch (e) {
    console.error("[auto-resolve-cross-lane] fatal:", e)
    return json({ ok: false, error: String(e) }, 500)
  }
})
