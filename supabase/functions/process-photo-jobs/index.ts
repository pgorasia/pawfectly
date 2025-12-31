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

function computeNextRun(attempts: number): number {
  // Exponential backoff: 1m, 2m, 4m, ... capped at 30m
  const seconds = Math.min(60 * Math.pow(2, Math.max(0, attempts - 1)), 30 * 60)
  return Date.now() + seconds * 1000
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

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  // Allow override via body/query; default 10
  let limit = 10
  try {
    const url = new URL(req.url)
    const q = url.searchParams.get("limit")
    if (q) limit = Math.max(1, Math.min(50, parseInt(q, 10)))
  } catch (_) {}

  try {
    const workerId = `edge:${crypto.randomUUID?.() ?? Math.random().toString(16).slice(2)}`
    const { data: jobs, error: claimErr } = await supabaseAdmin.rpc("claim_photo_validation_jobs", {
      p_limit: limit,
      p_worker: workerId,
    })

    if (claimErr) {
      console.error("[process-photo-jobs] claim_photo_validation_jobs error:", claimErr)
      return json({ error: claimErr.message }, 500)
    }

    const claimed = Array.isArray(jobs) ? jobs : []
    if (claimed.length === 0) {
      return json({ ok: true, claimed: 0, processed: 0, errors: 0 })
    }

    let processed = 0
    let errors = 0

    for (const job of claimed) {
      try {
        // Basic sanity: photo might have been deleted
        if (!job.photo_id || !job.storage_path || !job.bucket_type) {
          await supabaseAdmin
            .from("photo_validation_jobs")
            .update({ status: "error", last_error: "Malformed job payload" })
            .eq("id", job.id)
          errors++
          continue
        }

        // Call validate-photo (single source of truth for moderation logic)
        const validateUrl = `${supabaseUrl}/functions/v1/validate-photo`
        const resp = await fetch(validateUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(internalSecret ? { "x-pawfectly-secret": internalSecret } : {}),
          },
          body: JSON.stringify({
            id: job.photo_id,
            user_id: job.user_id,
            storage_path: job.storage_path,
            bucket_type: job.bucket_type,
            target_type: job.target_type,
            status: "pending",
            dog_slot: job.dog_slot ?? null,
          }),
        })

        if (!resp.ok) {
          const text = await resp.text().catch(() => "")
          throw new Error(`validate-photo failed (${resp.status}): ${text}`)
        }

        // Mark job done
        await supabaseAdmin
          .from("photo_validation_jobs")
          .update({ status: "done", last_error: null })
          .eq("id", job.id)

        processed++
      } catch (e) {
        console.error("[process-photo-jobs] job error:", job?.id, e)

        const attempts = typeof job.attempts === "number" ? job.attempts : 1
        const nextRunAt = new Date(computeNextRun(attempts)).toISOString()

        await supabaseAdmin
          .from("photo_validation_jobs")
          .update({
            status: "queued",
            last_error: String(e),
            next_run_at: nextRunAt,
            locked_at: null,
            locked_by: null,
          })
          .eq("id", job.id)

        errors++
      }
    }

    return json({ ok: true, claimed: claimed.length, processed, errors })
  } catch (e) {
    console.error("[process-photo-jobs] fatal:", e)
    return json({ error: String(e) }, 500)
  }
})
