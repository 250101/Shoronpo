import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {'content-type':'application/json','cache-control':'no-store'},
})

async function safeEqual(left: string, right: string) {
  const encoder = new TextEncoder()
  const [a,b] = await Promise.all([
    crypto.subtle.digest('SHA-256',encoder.encode(left)),
    crypto.subtle.digest('SHA-256',encoder.encode(right)),
  ])
  const aa=new Uint8Array(a),bb=new Uint8Array(b)
  let difference=0
  for(let i=0;i<aa.length;i+=1) difference|=aa[i]^bb[i]
  return difference===0
}

type Alert = {
  id:number
  alert_type:string
  block:string|null
  severity:string
  status:string
  message:string
  detected_at:string
  resolved_at:string|null
  telegram_notified_at:string|null
}

function madridTime(value:string|null){
  if(!value) return '—'
  return new Intl.DateTimeFormat('es-ES',{
    timeZone:'Europe/Madrid',dateStyle:'short',timeStyle:'short',
  }).format(new Date(value))
}

function alertText(alert:Alert,resolved=false,environment='production'){
  const subject=alert.block??'CONECTOR TSPOONLAB'
  const prefix=`[${environment.toUpperCase()}]`
  if(resolved) return `${prefix} ✅ Shoronpo recuperado\n${subject}\nEl incidente fue resuelto.\nRecuperado: ${madridTime(alert.resolved_at)}`
  return `${prefix} ${alert.severity==='CRITICAL'?'🚨':'⚠️'} Shoronpo — ${alert.severity==='CRITICAL'?'Alerta crítica':'Advertencia'}\n${subject}\n${alert.message}\nDetectado: ${madridTime(alert.detected_at)}`
}

async function sendTelegram(token:string,chatId:string,text:string){
  const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true}),
  })
  if(!response.ok) throw new Error(`TELEGRAM_${response.status}`)
  const result=await response.json()
  if(!result?.ok) throw new Error('TELEGRAM_REJECTED')
}

Deno.serve(async request=>{
  if(request.method!=='POST') return json({error:'METHOD_NOT_ALLOWED'},405)
  const expected=Deno.env.get('SHORONPO_SYNC_TRIGGER_SECRET')??''
  const supplied=request.headers.get('x-shoronpo-sync-key')??''
  if(!expected||!supplied||!(await safeEqual(expected,supplied))) return json({error:'UNAUTHORIZED'},401)

  const token=Deno.env.get('TELEGRAM_BOT_TOKEN')??''
  const chatId=Deno.env.get('TELEGRAM_CHAT_ID')??''
  const environment=Deno.env.get('SHORONPO_ENVIRONMENT')??'production'
  if(!token||!chatId) return json({error:'TELEGRAM_NOT_CONFIGURED'},503)

  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{
    auth:{persistSession:false,autoRefreshToken:false},
  })
  const [opened,resolved]=await Promise.all([
    db.from('system_alerts').select('id,alert_type,block,severity,status,message,detected_at,resolved_at,telegram_notified_at').eq('scope','LIVE').eq('status','OPEN').is('telegram_notified_at',null).order('detected_at').limit(10),
    db.from('system_alerts').select('id,alert_type,block,severity,status,message,detected_at,resolved_at,telegram_notified_at').eq('scope','LIVE').eq('status','RESOLVED').not('telegram_notified_at','is',null).is('telegram_resolution_notified_at',null).order('resolved_at').limit(10),
  ])
  if(opened.error||resolved.error) return json({
    error:'ALERT_READ_FAILED',
    detail:opened.error?.message??resolved.error?.message??'UNKNOWN_DATABASE_ERROR',
  },500)

  let sent=0
  const deliver=async(alert:Alert,resolution:boolean)=>{
    const claimToken=crypto.randomUUID()
    const staleBefore=new Date(Date.now()-10*60*1000).toISOString()
    const claim=await db.from('system_alerts')
      .update({telegram_claim_token:claimToken,telegram_claimed_at:new Date().toISOString()})
      .eq('id',alert.id).eq('scope','LIVE')
      .or(`telegram_claimed_at.is.null,telegram_claimed_at.lt.${staleBefore}`)
      .select('id').maybeSingle()
    if(claim.error) throw new Error('DELIVERY_CLAIM_FAILED')
    if(!claim.data) return false
    try{
      await sendTelegram(token,chatId,alertText(alert,resolution,environment))
      const values=resolution
        ? {telegram_resolution_notified_at:new Date().toISOString(),telegram_claim_token:null,telegram_claimed_at:null}
        : {telegram_notified_at:new Date().toISOString(),telegram_claim_token:null,telegram_claimed_at:null}
      const {error}=await db.from('system_alerts').update(values).eq('id',alert.id).eq('telegram_claim_token',claimToken)
      if(error) throw new Error('DELIVERY_STATE_WRITE_FAILED')
      return true
    }catch(error){
      await db.from('system_alerts').update({telegram_claim_token:null,telegram_claimed_at:null}).eq('id',alert.id).eq('telegram_claim_token',claimToken)
      throw error
    }
  }

  for(const alert of (opened.data??[]) as Alert[]){
    try{if(await deliver(alert,false)) sent+=1}
    catch(error){return json({ok:false,sent,error:error instanceof Error?error.message:'TELEGRAM_FAILED'},502)}
  }
  for(const alert of (resolved.data??[]) as Alert[]){
    try{if(await deliver(alert,true)) sent+=1}
    catch(error){return json({ok:false,sent,error:error instanceof Error?error.message:'TELEGRAM_FAILED'},502)}
  }
  return json({ok:true,sent})
})
