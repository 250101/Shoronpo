import { createClient } from 'npm:@supabase/supabase-js@2'
import { TspoonlabClient, TspoonlabError } from '../_shared/tspoonlab-client.ts'
import { mapProduction, mapProductionIngredients } from '../_shared/tspoonlab-production.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type':'application/json', 'cache-control':'no-store' } })
async function equal(a:string,b:string){const e=new TextEncoder();const[x,y]=await Promise.all([crypto.subtle.digest('SHA-256',e.encode(a)),crypto.subtle.digest('SHA-256',e.encode(b))]);const aa=new Uint8Array(x),bb=new Uint8Array(y);let d=0;for(let i=0;i<aa.length;i++)d|=aa[i]^bb[i];return d===0}

Deno.serve(async request => {
  if(request.method!=='POST') return json({error:'METHOD_NOT_ALLOWED'},405)
  const expected=Deno.env.get('SHORONPO_SYNC_TRIGGER_SECRET')??''
  const supplied=request.headers.get('x-shoronpo-sync-key')??''
  if(!expected||!supplied||!(await equal(expected,supplied))) return json({error:'UNAUTHORIZED'},401)
  const key=request.headers.get('x-idempotency-key')?.trim()??''
  if(key.length<8||key.length>200) return json({error:'INVALID_IDEMPOTENCY_KEY'},400)
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:old}=await db.from('tspoon_sync_runs').select('id,status,records_processed').eq('request_key',key).maybeSingle()
  if(old) return json({ok:old.status==='SUCCEEDED',duplicate:true,run:old})
  const {data:run,error:createError}=await db.from('tspoon_sync_runs').insert({request_key:key,block:'PRODUCTION',status:'RUNNING',trigger_type:key.startsWith('scheduled-')?'SCHEDULED':'MANUAL'}).select('id').single()
  if(createError||!run) return json({ok:false,status:'RUN_CREATE_FAILED'},500)
  let processed=0
  try{
    const client=new TspoonlabClient(Deno.env.get('TSPOONLAB_REMEMBERME')??'',{timezone:'Europe/Madrid'})
    const summaries=await client.listProductions(12,0,500)
    if(summaries.length>500) throw new TspoonlabError('Demasiadas producciones','INVALID_RESPONSE')
    for(let offset=0;offset<summaries.length;offset+=5){
      const batch=summaries.slice(offset,offset+5)
      const details=await Promise.all(batch.map(x=>client.getProduction(String(x.id??''))))
      for(const detail of details){
        const production=mapProduction(detail,run.id)
        const ingredients=mapProductionIngredients(detail,run.id)
        const {error:pError}=await db.from('tspoon_productions').upsert(production)
        if(pError) throw new Error('PRODUCTION_WRITE_FAILED')
        const {error:dError}=await db.from('tspoon_production_ingredients').delete().eq('production_external_id',production.external_id)
        if(dError) throw new Error('INGREDIENT_DELETE_FAILED')
        if(ingredients.length){const {error:iError}=await db.from('tspoon_production_ingredients').insert(ingredients);if(iError) throw new Error('INGREDIENT_WRITE_FAILED')}
        processed++
      }
    }
    await db.from('tspoon_sync_runs').update({status:'SUCCEEDED',records_processed:processed,finished_at:new Date().toISOString()}).eq('id',run.id)
    return json({ok:true,runId:run.id,productionsProcessed:processed})
  }catch(error){
    const raw=error instanceof TspoonlabError?error.code:error instanceof Error?error.message:'SYNC_FAILED'
    const code=['AUTH_EXPIRED','FORBIDDEN','RATE_LIMITED','UPSTREAM_ERROR','NETWORK_ERROR','INVALID_RESPONSE','PRODUCTION_WRITE_FAILED','INGREDIENT_DELETE_FAILED','INGREDIENT_WRITE_FAILED'].includes(raw)?raw:'SYNC_FAILED'
    await db.from('tspoon_sync_errors').insert({run_id:run.id,code,message:code})
    await db.from('tspoon_sync_runs').update({status:'FAILED',records_processed:processed,finished_at:new Date().toISOString(),error_code:code}).eq('id',run.id)
    return json({ok:false,status:code,runId:run.id},code==='AUTH_EXPIRED'?401:503)
  }
})
