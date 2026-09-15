import { createClient } from 'npm:@supabase/supabase-js@2'
import { TspoonlabClient, TspoonlabError } from '../_shared/tspoonlab-client.ts'
import { mapStockRow } from '../_shared/tspoonlab-stock.ts'

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

const allowedCodes = new Set(['AUTH_EXPIRED', 'FORBIDDEN', 'RATE_LIMITED', 'UPSTREAM_ERROR', 'NETWORK_ERROR', 'INVALID_RESPONSE'])

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const triggerSecret = Deno.env.get('SHORONPO_SYNC_TRIGGER_SECRET') ?? ''
  const suppliedSecret = request.headers.get('x-shoronpo-sync-key') ?? ''
  if (!triggerSecret || !suppliedSecret || !(await safeEqual(triggerSecret, suppliedSecret))) {
    return json({ error: 'UNAUTHORIZED' }, 401)
  }

  const requestKey = request.headers.get('x-idempotency-key')?.trim() ?? ''
  if (requestKey.length < 8 || requestKey.length > 200) return json({ error: 'INVALID_IDEMPOTENCY_KEY' }, 400)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: existing } = await supabase.from('tspoon_sync_runs').select('id,status,stores_processed,records_processed').eq('request_key', requestKey).maybeSingle()
  if (existing) return json({ ok: existing.status === 'SUCCEEDED', duplicate: true, run: existing })

  const { data: run, error: runError } = await supabase.from('tspoon_sync_runs').insert({
    request_key: requestKey,
    block: 'STOCK',
    status: 'RUNNING',
    trigger_type: 'MANUAL',
  }).select('id').single()
  if (runError || !run) return json({ ok: false, status: 'RUN_CREATE_FAILED' }, 500)

  const capturedAt = new Date().toISOString()
  let storesProcessed = 0
  let recordsProcessed = 0

  try {
    const client = new TspoonlabClient(Deno.env.get('TSPOONLAB_REMEMBERME') ?? '', { timezone: 'Europe/Madrid' })
    const stores = await client.listStores()
    if (stores.length > 100) throw new TspoonlabError('Demasiados almacenes', 'INVALID_RESPONSE')

    for (const storeInput of stores) {
      const store = storeInput as Record<string, unknown>
      if (typeof store.id !== 'string' || !store.id) throw new TspoonlabError('Almacen sin identificador', 'INVALID_RESPONSE')
      const stock = await client.getStock(store.id)
      if (stock.listComponent.length > 10_000) throw new TspoonlabError('Demasiadas existencias', 'INVALID_RESPONSE')
      const rows = stock.listComponent.map(item => mapStockRow(store, item, run.id, capturedAt))
      if (rows.length) {
        const { error } = await supabase.from('tspoon_stock_snapshots').insert(rows)
        if (error) throw new Error('SNAPSHOT_WRITE_FAILED')
      }
      storesProcessed += 1
      recordsProcessed += rows.length
    }

    const { error: healthError } = await supabase.from('tspoonlab_connector_status').update({
      status: 'HEALTHY',
      last_checked_at: capturedAt,
      last_success_at: capturedAt,
      last_error_code: null,
      updated_at: capturedAt,
    }).eq('singleton', true)
    if (healthError) throw new Error('CONNECTOR_STATUS_WRITE_FAILED')

    const { error: finishError } = await supabase.from('tspoon_sync_runs').update({
      status: 'SUCCEEDED', stores_processed: storesProcessed, records_processed: recordsProcessed, finished_at: new Date().toISOString(), error_code: null,
    }).eq('id', run.id)
    if (finishError) return json({ ok: false, status: 'RUN_UPDATE_FAILED', runId: run.id }, 500)
    return json({ ok: true, runId: run.id, storesProcessed, recordsProcessed, capturedAt })
  } catch (error) {
    const candidate = error instanceof TspoonlabError ? error.code : error instanceof Error ? error.message : 'SYNC_FAILED'
    const code = allowedCodes.has(candidate) || candidate === 'SNAPSHOT_WRITE_FAILED' || candidate === 'CONNECTOR_STATUS_WRITE_FAILED' ? candidate : 'SYNC_FAILED'
    await supabase.from('tspoon_sync_errors').insert({ run_id: run.id, code, message: code })
    await supabase.from('tspoon_sync_runs').update({
      status: 'FAILED', stores_processed: storesProcessed, records_processed: recordsProcessed, finished_at: new Date().toISOString(), error_code: code,
    }).eq('id', run.id)
    if (code === 'AUTH_EXPIRED') {
      await supabase.from('tspoonlab_connector_status').update({ status: 'AUTH_EXPIRED', last_checked_at: new Date().toISOString(), last_error_code: code }).eq('singleton', true)
    }
    return json({ ok: false, status: code, runId: run.id }, code === 'AUTH_EXPIRED' ? 401 : 503)
  }
})
