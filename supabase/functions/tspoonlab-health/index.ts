import { createClient } from 'npm:@supabase/supabase-js@2'
import { TspoonlabClient, TspoonlabError } from '../_shared/tspoonlab-client.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
})

async function safeEqual(left: string, right: string) {
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ])
  const aa = new Uint8Array(a)
  const bb = new Uint8Array(b)
  let difference = 0
  for (let index = 0; index < aa.length; index += 1) difference |= aa[index] ^ bb[index]
  return difference === 0
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const triggerSecret = Deno.env.get('SHORONPO_SYNC_TRIGGER_SECRET') ?? ''
  const suppliedSecret = request.headers.get('x-shoronpo-sync-key') ?? ''
  if (!triggerSecret || !suppliedSecret || !(await safeEqual(triggerSecret, suppliedSecret))) {
    return json({ error: 'UNAUTHORIZED' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const checkedAt = new Date().toISOString()

  const persistStatus = async (values: Record<string, unknown>) => {
    const { error } = await supabase.from('tspoonlab_connector_status').upsert({
      singleton: true,
      ...values,
      updated_at: checkedAt,
    })
    return error === null
  }

  try {
    const token = Deno.env.get('TSPOONLAB_REMEMBERME') ?? ''
    const client = new TspoonlabClient(token, { timezone: 'Europe/Madrid' })
    await client.healthCheck()

    const persisted = await persistStatus({
      status: 'HEALTHY',
      last_checked_at: checkedAt,
      last_success_at: checkedAt,
      last_error_code: null,
    })
    if (!persisted) return json({ ok: false, status: 'STATUS_WRITE_FAILED', checkedAt }, 500)
    return json({ ok: true, status: 'HEALTHY', checkedAt })
  } catch (error) {
    const code = error instanceof TspoonlabError ? error.code : 'INVALID_RESPONSE'
    const allowed = new Set(['AUTH_EXPIRED', 'FORBIDDEN', 'RATE_LIMITED', 'UPSTREAM_ERROR', 'NETWORK_ERROR', 'INVALID_RESPONSE'])
    const status = allowed.has(code) ? code : 'INVALID_RESPONSE'

    const persisted = await persistStatus({
      status,
      last_checked_at: checkedAt,
      last_error_code: status,
    })
    if (!persisted) return json({ ok: false, status: 'STATUS_WRITE_FAILED', checkedAt }, 500)

    // No registrar el error original: podria contener detalles de red o del proveedor.
    return json({ ok: false, status, checkedAt }, status === 'AUTH_EXPIRED' ? 401 : 503)
  }
})
