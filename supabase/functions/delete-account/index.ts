import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(res: unknown, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Recursively list all files under a prefix in a bucket
async function listAllFilesRecursive(
  storage: ReturnType<typeof createClient>["storage"],
  bucket: string,
  rootPrefix: string
): Promise<string[]> {
  const files: string[] = []
  const stack: string[] = [rootPrefix]

  while (stack.length) {
    const prefix = stack.pop()!

    // paginate just in case
    const limit = 1000
    let offset = 0

    while (true) {
      const { data, error } = await storage.from(bucket).list(prefix, {
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      })

      if (error) throw new Error(`storage_list_failed:${prefix}:${error.message}`)
      const entries = data ?? []
      if (entries.length === 0) break

      for (const e of entries) {
        // Supabase list returns folders + files; folders have no id/metadata (commonly).
        // We treat "id present" as file; otherwise as folder.
        const isFile = (e as any).id != null
        const nextPath = prefix ? `${prefix}/${e.name}` : e.name

        if (isFile) files.push(nextPath)
        else stack.push(nextPath)
      }

      if (entries.length < limit) break
      offset += limit
    }
  }

  return files
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

  const authHeader = req.headers.get("Authorization") ?? ""
  if (!authHeader) return json({ ok: false, error: "missing_authorization" }, 401)

  // user-scoped client to validate JWT
  const supabaseUserClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await supabaseUserClient.auth.getUser()
  if (userErr || !userData?.user) return json({ ok: false, error: "not_authenticated" }, 401)

  const userId = userData.user.id

  // admin client for privileged operations
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const bucket = "photos"
  const userPrefix = `users/${userId}`

  try {
    // 1) List all files under users/<uuid> in the photos bucket
    const filePaths = await listAllFilesRecursive(supabaseAdmin.storage, bucket, userPrefix)

    // 2) Delete files in batches of 1000 (remove() limit) :contentReference[oaicite:6]{index=6}
    for (const batch of chunk(filePaths, 1000)) {
      const { error } = await supabaseAdmin.storage.from(bucket).remove(batch)
      if (error) {
        return json({ ok: false, error: `storage_remove_failed:${error.message}` }, 500)
      }
    }

    // 3) Delete DB rows
    const { error: dbErr } = await supabaseAdmin.rpc("hard_delete_user_data", { p_user_id: userId })
    if (dbErr) return json({ ok: false, error: `db_delete_failed:${dbErr.message}` }, 500)

    // 4) Delete auth user (service_role required) :contentReference[oaicite:7]{index=7}
    const { error: authDelErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (authDelErr) return json({ ok: false, error: `auth_delete_failed:${authDelErr.message}` }, 500)

    return json({ ok: true })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
