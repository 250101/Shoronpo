// ── Estado global ────────────────────────────────────────────
let currentData=[], historico={quincenas:[],productos:[]}, conciliaciones={}, currentSemana=null;
let activeFilter='all', sortCol='impacto', sortAsc=false, searchTerm='';
let gaugeInst=null, histInst=null, histOnlyInst=null, scatterInst=null, panelChartInst=null;

// ── Conexión ─────────────────────────────────────────────────
async function retryConnection(){
  document.getElementById('btnReconectar').style.display='none';
  document.getElementById('connLabel').textContent='Reconectando...';
  await testConnection();
}

async function testConnection(){
  const dot=document.getElementById('connDot');
  dot.className='conn-dot loading';
  document.getElementById('connLabel').textContent='Conectando...';
  showLoading('Conectando con la base de datos...');
  try{
    const {error}=await supabaseClient.from('inventory_periods').select('id',{head:true,count:'exact'});
    if(error) throw error;
    dot.className='conn-dot ok';
    document.getElementById('connLabel').textContent='Base de datos conectada';
    await fetchHistorico();
    showNotice('Base de datos conectada. Histórico cargado.','ok');
  }catch(e){
    dot.className='conn-dot err';
    document.getElementById('connLabel').textContent='Sin conexión';
    showNotice('No se pudo conectar: '+e.message,'err');
  }finally{
    hideLoading();
  }
}

async function fetchHistorico(){
  try{
    const {data:periods,error}=await supabaseClient.from('inventory_periods').select(`
      id,label,recorded_at,
      inventory_lines(id,theoretical_quantity,actual_quantity,deviation_quantity,deviation_pct,theoretical_cost,actual_cost,impact,deviation_status,
        products(name,family,unit),
        inventory_reconciliations(id,cause,quantity,comment,occurred_at)
      )
    `).eq('status','CLOSED').order('recorded_at');
    if(error) throw error;
    const metricEntries=await Promise.all((periods||[]).map(async period=>{
      const {data,error}=await supabaseClient.rpc('get_inventory_period_metrics',{p_period_id:period.id});
      if(error){console.warn('Métricas backend:',error.message);return [period.id,null];}
      return [period.id,Array.isArray(data)?data[0]:data];
    }));
    const metricsByPeriod=Object.fromEntries(metricEntries);
    historico={quincenas:[],productos:[]};conciliaciones={};
    (periods||[]).forEach(period=>{
      const lines=period.inventory_lines||[];
      const counts={COINCIDE:0,LEVE:0,ELEVADA:0};let totalImpact=0;
      lines.forEach(line=>{
        counts[line.deviation_status]=(counts[line.deviation_status]||0)+1;
        if(line.deviation_status!=='COINCIDE') totalImpact+=Number(line.impact)||0;
        const product={id:line.id,lineId:line.id,quincena:period.label,fecha:period.recorded_at,
          familia:line.products?.family||'',producto:line.products?.name||'',unidad:line.products?.unit||'',
          cantTeo:Number(line.theoretical_quantity),cantReal:Number(line.actual_quantity),desv:Number(line.deviation_quantity),
          pct:Number(line.deviation_pct),costeTeo:Number(line.theoretical_cost),costeReal:Number(line.actual_cost),
          impacto:Number(line.impact),estado:line.deviation_status};
        historico.productos.push(product);
        const explicaciones=(line.inventory_reconciliations||[]).map(row=>({
          id:row.id,causa:row.cause,cantidad:Number(row.quantity),unidad:product.unidad,
          comentario:row.comment||'',fecha:row.occurred_at
        }));
        const explicado=explicaciones.reduce((sum,row)=>sum+row.cantidad,0);
        const pendiente=Math.max(0,Math.abs(product.desv)-explicado);
        conciliaciones[product.producto+'||'+period.label]={
          estado:pendiente<=0.01?'CONCILIADA':explicado>0?'PARCIAL':'PENDIENTE',explicaciones
        };
      });
      historico.quincenas.push({id:period.id,quincena:period.label,fecha:period.recorded_at,total:lines.length,
        coincide:counts.COINCIDE||0,leve:counts.LEVE||0,elevada:counts.ELEVADA||0,impacto:totalImpact,
        metrics:metricsByPeriod[period.id]||null});
    });
    recalcularImpactosHistorico();saveConciliaciones();renderHistPreview();renderNavVisibility();
    renderCompararSelector();actualizarSelectorSemana();
    if(currentSemana&&historico.quincenas.some(item=>item.quincena===currentSemana)) cambiarSemanaVista(currentSemana);
    else if(currentData.length) renderAll(); else cargarUltimaSemana();
  }catch(e){console.warn('fetchHistorico:',e);}
}

// ── Historial preview en landing ─────────────────────────────
function renderHistPreview(){
  const qs=historico.quincenas;
  const el=document.getElementById('histPreviewContent');
  const cnt=document.getElementById('histPreviewCount');
  if(!qs||!qs.length){
    el.innerHTML='<div class="hist-preview-empty">No hay semanas guardadas todavía</div>';
    cnt.textContent='';
    return;
  }
  const sorted=[...qs].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  cnt.textContent=`(${sorted.length} semana${sorted.length!==1?'s':''})`;
  el.innerHTML=`<table class="atbl">
    <thead><tr><th>Semana</th><th>Total</th><th>Elevada</th><th>Coincide</th><th>€</th></tr></thead>
    <tbody>${sorted.slice(0,6).map(q=>`
      <tr>
        <td style="font-weight:700">${escapeHtml(q.quincena)}</td>
        <td>${q.total}</td>
        <td><span class="pill p-red">${q.elevada}</span></td>
        <td><span class="pill p-green">${q.coincide}</span></td>
        <td style="font-weight:600">€${parseFloat(q.impacto||0).toFixed(0)}</td>
      </tr>`).join('')}
    </tbody>
  </table>${sorted.length>6?`<div style="font-size:11px;color:var(--text3);margin-top:8px;text-align:center">+${sorted.length-6} más — ir a ⚙️ Semanas</div>`:''}`;
}

// ── Mostrar histórico solo (sin semana cargada) ─────────────
function renderHistOnly(){
  if(!historico.quincenas||!historico.quincenas.length) return;
  document.getElementById('mainNav').style.display='flex';
  document.getElementById('execOnlyHist').style.display='block';
  const sorted=[...historico.quincenas].sort((a,b)=>new Date(a.fecha)-new Date(b.fecha));
  const ctx=document.getElementById('histChartOnly').getContext('2d');
  if(histOnlyInst) histOnlyInst.destroy();
  histOnlyInst=new Chart(ctx,{
    type:'bar',
    data:{
      labels:sorted.map(q=>q.quincena),
      datasets:[
        {label:'Elevada',data:sorted.map(q=>parseInt(q.elevada)||0),backgroundColor:'rgba(230,57,70,.8)',borderRadius:4,stack:'s'},
        {label:'Leve',data:sorted.map(q=>parseInt(q.leve)||0),backgroundColor:'rgba(244,162,37,.8)',borderRadius:4,stack:'s'},
        {label:'Coincide',data:sorted.map(q=>parseInt(q.coincide)||0),backgroundColor:'rgba(34,197,94,.8)',borderRadius:4,stack:'s'},
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'bottom',labels:{font:{size:11},boxWidth:10,padding:16}}},
      scales:{x:{stacked:true,grid:{display:false},ticks:{color:'var(--text3)',font:{size:11}}},
        y:{stacked:true,grid:{color:'var(--border)'},ticks:{color:'var(--text3)',font:{size:11}},beginAtZero:true}}
    }
  });
  document.getElementById('histCardOnly').style.display='block';
}

function renderNavVisibility(){
  if(canViewInventory()&&historico.quincenas&&historico.quincenas.length>0){
    document.getElementById('mainNav').style.display='flex';
  }
}

// ── Gestión de semanas ──────────────────────────────────────
function renderGestion(){
  const el=document.getElementById('gestionContent');
  const qs=historico.quincenas;
  if(!qs||!qs.length){
    el.innerHTML='<div class="empty"><div class="empty-icon">📭</div><div>No hay semanas guardadas todavía</div></div>';
    return;
  }
  const sorted=[...qs].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  el.innerHTML=`
    <table class="atbl">
      <thead><tr><th>Semana</th><th>Fecha guardado</th><th>Total prods.</th><th>🟢 Coincide</th><th>🟡 Leve</th><th>🔴 Elevada</th><th>Impacto €</th></tr></thead>
      <tbody>${sorted.map(q=>`
        <tr>
          <td style="font-weight:700">${escapeHtml(q.quincena)}</td>
          <td style="color:var(--text3)">${q.fecha?new Date(q.fecha).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Madrid'}):'-'}</td>
          <td>${q.total}</td>
          <td><span class="pill p-green">${q.coincide}</span></td>
          <td><span class="pill p-amber">${q.leve}</span></td>
          <td><span class="pill p-red">${q.elevada}</span></td>
          <td style="font-weight:600">€ ${parseFloat(q.impacto||0).toFixed(0)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="gestion-info">
      <strong>Para eliminar una semana:</strong> solicitá la operación a un administrador. Los períodos cerrados no se eliminan desde esta pantalla para preservar la auditoría.
    </div>`;
}

// ── Reset dashboard ───────────────────────────────────────────
function resetDashboard(){
  if(!confirm('¿Seguro que querés limpiar el inventario actual?\nEl histórico de la base de datos no se borra.')) return;
  currentData=[];
  activeFilter='all'; sortCol='impacto'; sortAsc=false; searchTerm='';
  document.getElementById('landingSection').style.display='block';
  document.getElementById('healthWrap').style.display='none';
  document.getElementById('execOnlyHist').style.display='none';
  document.getElementById('qbadge').style.display='none';
  document.getElementById('qbadge').textContent='';
  if(document.getElementById('top5Card')) document.getElementById('top5Card').style.display='none';
  document.getElementById('qCard').style.display='none';
  document.getElementById('qCharts').style.display='none';
  document.getElementById('qEmpty').style.display='block';
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-executive').classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.querySelector('.nav-tab').classList.add('active');
  renderHistPreview();
  if(historico.quincenas&&historico.quincenas.length) renderHistOnly();
  showNotice('Inventario limpiado. El histórico sigue disponible.','inf');
}

// ── Estado ───────────────────────────────────────────────────
function getEstado(pct){const a=Math.abs(pct);return a<=0.02?'COINCIDE':a<=0.15?'LEVE':'ELEVADA';}

// El impacto económico representa exclusivamente el valor de la desviación física.
// Prioridad: coste unitario teórico; si no existe, coste unitario real.
function calcularImpactoDesviacion(cantTeo,cantReal,desv,costeTeo,costeReal){
  const qt=parseFloat(cantTeo)||0, qr=parseFloat(cantReal)||0;
  const ct=parseFloat(costeTeo)||0, cr=parseFloat(costeReal)||0;
  const desvLeida=parseFloat(desv);
  const diferencia=Number.isFinite(desvLeida)&&Math.abs(desvLeida)>0.000001
    ? Math.abs(desvLeida)
    : Math.abs(qr-qt);
  let costeUnitario=0;
  if(Math.abs(qt)>0.000001&&Math.abs(ct)>0.000001) costeUnitario=Math.abs(ct/qt);
  else if(Math.abs(qr)>0.000001&&Math.abs(cr)>0.000001) costeUnitario=Math.abs(cr/qr);
  return Math.round(diferencia*costeUnitario*100)/100;
}

function recalcularImpactosHistorico(){
  const impactoPorSemana={};
  (historico.productos||[]).forEach(p=>{
    p.impacto=calcularImpactoDesviacion(p.cantTeo,p.cantReal,p.desv,p.costeTeo,p.costeReal);
    if(p.estado!=='COINCIDE'){
      const semana=String(p.quincena);
      impactoPorSemana[semana]=(impactoPorSemana[semana]||0)+p.impacto;
    }
  });
  (historico.quincenas||[]).forEach(q=>{
    q.impacto=Math.round((impactoPorSemana[String(q.quincena)]||0)*100)/100;
  });
}

// ── Parse Excel ──────────────────────────────────────────────
function parseXLSX(file){
  return new Promise((res,rej)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const wb=XLSX.read(e.target.result,{type:'array'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        let hi=-1;
        for(let i=0;i<rows.length;i++){
          const r=rows[i].map(c=>String(c).trim());
          if(r.includes('Familia')&&r.includes('Producto')&&r.includes('% desviación')){hi=i;break;}
        }
        if(hi<0){rej('No encontré columnas esperadas.');return;}
        const h=rows[hi].map(c=>String(c).trim());
        const idx=k=>h.indexOf(k);
        const iF=idx('Familia'),iP=idx('Producto'),iU=idx('Unidad');
        const iCT=idx('Cant. teórica'),iCR=idx('Cant. real');
        const iCD=idx('Cant. desviación'),iPD=idx('% desviación');
        const iKT=idx('Coste teórico'),iKR=idx('Coste real');
        const data=[];
        for(let i=hi+1;i<rows.length;i++){
          const r=rows[i];
          const prod=String(r[iP]||'').trim();
          if(!prod) continue;
          const pct=parseFloat(r[iPD])||0;
          const ct=parseFloat(r[iKT])||0;
          const cr=parseFloat(r[iKR])||0;
          const cantTeo=parseFloat(r[iCT])||0;
          const cantReal=parseFloat(r[iCR])||0;
          const desv=parseFloat(r[iCD])||0;
          data.push({familia:String(r[iF]||'').trim()||'Sin categoría',producto:prod,
            unidad:String(r[iU]||'').trim(),cantTeo,cantReal,desv,pct,
            costeTeo:ct,costeReal:cr,
            impacto:calcularImpactoDesviacion(cantTeo,cantReal,desv,ct,cr),
            estado:getEstado(pct)});
        }
        res(data);
      }catch(err){rej('Error: '+err.message);}
    };
    reader.onerror=()=>rej('No se pudo leer el archivo.');
    reader.readAsArrayBuffer(file);
  });
}

// ── Health Score ─────────────────────────────────────────────
function calcHealth(data){
  const tot=data.length; if(!tot) return 0;
  const resumen=getConcResumen(data);
  // Conciliadas cuentan como resueltas para el health score
  const elevPend=resumen.pendientes.filter(d=>d.estado==='ELEVADA').length;
  const elevParc=resumen.parciales.filter(d=>d.estado==='ELEVADA').length*0.5;
  const levePend=resumen.pendientes.filter(d=>d.estado==='LEVE').length;
  const leveParc=resumen.parciales.filter(d=>d.estado==='LEVE').length*0.5;
  return Math.max(0,Math.round(100-((elevPend+elevParc)/tot*60)-((levePend+leveParc)/tot*25)));
}

function resolveHealthScore(data){
  const legacy=calcHealth(data);
  const period=historico.quincenas.find(q=>q.quincena===currentSemana);
  const backend=Number(period?.metrics?.health_score);
  if(!Number.isFinite(backend)) return legacy;
  if(backend!==legacy) console.warn('Paridad health score:',{backend,legacy,period:currentSemana});
  return backend;
}

async function refreshPeriodMetrics(label){
  const period=historico.quincenas.find(q=>q.quincena===label);
  if(!period?.id) return;
  const {data,error}=await supabaseClient.rpc('get_inventory_period_metrics',{p_period_id:period.id});
  if(error){console.warn('No se pudieron refrescar las métricas backend:',error.message);return;}
  period.metrics=Array.isArray(data)?data[0]:data;
}

function renderGauge(score){
  const ctx=document.getElementById('gaugeChart').getContext('2d');
  if(gaugeInst) gaugeInst.destroy();
  const color=score>=80?'#22c55e':score>=60?'#f4a225':'#e63946';
  gaugeInst=new Chart(ctx,{type:'doughnut',data:{datasets:[{data:[score,100-score],
    backgroundColor:[color,'rgba(255,255,255,.15)'],borderWidth:0,circumference:240,rotation:240}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{enabled:false}},cutout:'78%'}});
  document.getElementById('healthNum').textContent=score;
  document.getElementById('healthGrade').textContent=score>=90?'Excelente 🌟':score>=75?'Bueno ✅':score>=60?'Regular ⚠️':'Crítico 🔴';
}

// ── KPIs ─────────────────────────────────────────────────────
function renderKPIs(data){
  const tot=data.length,coin=data.filter(d=>d.estado==='COINCIDE').length;
  const leve=data.filter(d=>d.estado==='LEVE').length,elev=data.filter(d=>d.estado==='ELEVADA').length;
  const imp=data.reduce((s,d)=>s+(d.estado!=='COINCIDE'?d.impacto:0),0);
  const acc=Math.round(coin/tot*100);
  // Penúltima semana para comparar tendencias
  const sortedForKpi=[...historico.quincenas].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  const prevQ=sortedForKpi.length>1?sortedForKpi[1]:null;

  function trend(cur,prev,higherIsBad){
    if(!prevQ||prev===null||prev===undefined||isNaN(prev)||isNaN(cur)) return '';
    const d=Math.round(cur-prev);
    if(Math.abs(d)<1) return '<div class="kpi-trend neutral">= Sin cambio</div>';
    const cls=(higherIsBad?d>0:d<0)?'down-bad':'up-good';
    return `<div class="kpi-trend ${cls}">${d>0?'↑ +':'↓ '}${Math.abs(d)}</div>`;
  }

  const resumen=getConcResumen(data);
  const impConc=getImpactoConc(data);
  const pendCount=resumen.pendientes.length+resumen.parciales.length;
  const concCount=resumen.conciliadas.length;

  document.getElementById('kpiGrid').innerHTML=`
    <div class="kpi-card blue"><div class="kpi-label">Precisión</div><div class="kpi-val blue">${acc}%</div><div class="kpi-sub">${coin} de ${tot} productos coinciden</div>${prevQ?trend(acc,Math.round(parseInt(prevQ.coincide)/parseInt(prevQ.total)*100),false):''}</div>
    <div class="kpi-card red"><div class="kpi-label">Desvío elevado</div><div class="kpi-val red">${elev}</div><div class="kpi-sub">+15% de diferencia</div>${prevQ?trend(elev,parseInt(prevQ.elevada),true):''}</div>
    <div class="kpi-card amber"><div class="kpi-label">Desvío leve</div><div class="kpi-val amber">${leve}</div><div class="kpi-sub">2–15% de diferencia</div>${prevQ?trend(leve,parseInt(prevQ.leve),true):''}</div>
    <div class="kpi-card green"><div class="kpi-label">Coinciden</div><div class="kpi-val green">${coin}</div><div class="kpi-sub">${acc}% del total</div>${prevQ?trend(coin,parseInt(prevQ.coincide),false):''}</div>
    <div class="kpi-card purple">
      <div class="kpi-label">Impacto económico</div>
      <div class="kpi-val purple">€${imp.toFixed(0)}</div>
      <div class="kpi-sub" style="display:flex;flex-direction:column;gap:2px;margin-top:6px">
        <span style="color:var(--red)">🔴 €${impConc.sinExplicar.toFixed(0)} sin explicar</span>
        ${impConc.explicado>0?`<span style="color:#22c55e">🟢 €${impConc.explicado.toFixed(0)} conciliado</span>`:''}
      </div>
      ${prevQ?trend(Math.round(imp),Math.round(parseFloat(prevQ.impacto)||0),true):''}
    </div>
    ${pendCount>0||concCount>0?`
    <div class="kpi-card" style="border-top:3px solid #1877F2">
      <div class="kpi-label">Investigación</div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px;font-size:12px">
        ${resumen.pendientes.length>0?`<span style="color:var(--red)">🔴 ${resumen.pendientes.length} pendiente${resumen.pendientes.length!==1?'s':''}</span>`:''}
        ${resumen.parciales.length>0?`<span style="color:var(--amber)">🟠 ${resumen.parciales.length} parcial${resumen.parciales.length!==1?'es':''}</span>`:''}
        ${resumen.conciliadas.length>0?`<span style="color:#22c55e">🟢 ${resumen.conciliadas.length} conciliada${resumen.conciliadas.length!==1?'s':''}</span>`:''}
      </div>
    </div>`:''}
  `;
}

// ── Comparación ───────────────────────────────────────────────
function renderComparacion(data){
  if(!historico.quincenas||!historico.quincenas.length){document.getElementById('compHero').style.display='none';return;}
  const sortedQ=[...historico.quincenas].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  // Usar el penúltimo inventario para comparar (el último es el recién cargado)
  const prevQ=sortedQ.length>1?sortedQ[1]:sortedQ[0];
  const prevProds=historico.productos.filter(p=>p.quincena===prevQ.quincena);
  const curElev=data.filter(d=>d.estado==='ELEVADA').length;
  const curCoin=data.filter(d=>d.estado==='COINCIDE').length;
  const curImp=data.reduce((s,d)=>s+(d.estado!=='COINCIDE'?d.impacto:0),0);
  const curAcc=Math.round(curCoin/data.length*100);
  const prevElev=parseInt(prevQ.elevada)||0,prevImp=parseFloat(prevQ.impacto)||0;
  const prevCoin=parseInt(prevQ.coincide)||0,prevAcc=Math.round(prevCoin/(parseInt(prevQ.total)||1)*100);

  function delta(cur,prev,bad,eur){
    const d=cur-prev;
    if(Math.abs(d)<0.5) return '<div class="comp-delta neu">Sin cambio</div>';
    const cls=(bad?d>0:d<0)?'bad':'good';
    return `<div class="comp-delta ${cls}">${d>0?'↑ +':'↓ '}${eur?'€ '+Math.abs(d).toFixed(0):Math.abs(d)}</div>`;
  }

  document.getElementById('compVs').innerHTML=`<span class="comp-badge">Actual</span><span style="opacity:.6;font-size:14px">→</span><span class="comp-badge" style="opacity:.7">vs ${escapeHtml(prevQ.quincena)}</span>`;
  document.getElementById('compGrid').innerHTML=`
    <div class="comp-card"><div class="comp-card-label">Precisión</div><div class="comp-card-val">${curAcc}%</div>${delta(curAcc,prevAcc,false,false)}</div>
    <div class="comp-card"><div class="comp-card-label">Desvíos elevados</div><div class="comp-card-val">${curElev}</div>${delta(curElev,prevElev,true,false)}</div>
    <div class="comp-card"><div class="comp-card-label">Coinciden</div><div class="comp-card-val">${curCoin}</div>${delta(curCoin,prevCoin,false,false)}</div>
    <div class="comp-card"><div class="comp-card-label">Impacto €</div><div class="comp-card-val">€${curImp.toFixed(0)}</div>${delta(curImp,prevImp,true,true)}</div>
  `;

  const prevSet=new Set(prevProds.filter(p=>p.estado==='ELEVADA').map(p=>p.producto));
  const curSet=new Set(data.filter(d=>d.estado==='ELEVADA').map(d=>d.producto));
  document.getElementById('recurWrap').innerHTML=
    [...curSet].filter(p=>prevSet.has(p)).map(p=>`<span class="rtag rtag-recur">🔁 ${escapeHtml(p)}</span>`).join('')+
    [...curSet].filter(p=>!prevSet.has(p)).map(p=>`<span class="rtag rtag-new">⬆️ ${escapeHtml(p)}</span>`).join('')+
    [...prevSet].filter(p=>!curSet.has(p)).map(p=>`<span class="rtag rtag-fixed">✅ ${escapeHtml(p)}</span>`).join('')||
    '<span style="font-size:12px;opacity:.7">Sin desvíos elevados recurrentes 🎉</span>';

  document.getElementById('compHero').style.display='block';
}

// ── Alertas ───────────────────────────────────────────────────
function renderAlertas(data){
  const alerts=[];
  const prodHist={};
  historico.productos.forEach(p=>{if(!prodHist[p.producto])prodHist[p.producto]=[];prodHist[p.producto].push(p);});
  const elevadosActuales=new Set(data.filter(d=>d.estado==='ELEVADA').map(d=>d.producto));
  Object.entries(prodHist).forEach(([prod,hist])=>{
    if(!elevadosActuales.has(prod)) return;
    const elevadas=hist.filter(h=>h.estado==='ELEVADA').length;
    if(elevadas>=2) alerts.push({type:'critical',icon:'🚨',label:`${prod} (${elevadas}x)`,tooltip:`Lleva ${elevadas} inventarios con desvío elevado. Requiere investigación urgente.`});
  });
  const acc=Math.round(data.filter(d=>d.estado==='COINCIDE').length/data.length*100);
  if(acc<60) alerts.push({type:'critical',icon:'⚠️',label:`Precisión: ${acc}%`,tooltip:'Menos del 60% de los productos coinciden con el stock teórico.'});
  else if(acc>=85) alerts.push({type:'good',icon:'✅',label:`Precisión: ${acc}%`,tooltip:'La mayoría de los productos están dentro del rango aceptable.'});
  const famImp={};
  data.forEach(d=>{if(d.estado!=='COINCIDE') famImp[d.familia]=(famImp[d.familia]||0)+d.impacto;});
  const topFam=Object.entries(famImp).sort((a,b)=>b[1]-a[1])[0];
  if(topFam&&topFam[1]>0) alerts.push({type:'warn',icon:'📦',label:topFam[0],tooltip:`Mayor impacto: €${topFam[1].toFixed(0)} en desvíos esta semana.`});
  if(historico.quincenas.length>0){
    const sortedQ=[...historico.quincenas].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
    const prevQ=sortedQ.length>1?sortedQ[1]:null;
    if(prevQ){
      const curImp=data.reduce((s,d)=>s+(d.estado!=='COINCIDE'?d.impacto:0),0);
      const prevImp=parseFloat(prevQ.impacto)||0;
      const pctDiff=prevImp>0?Math.round(((curImp-prevImp)/prevImp)*100):0;
      if(curImp>prevImp&&pctDiff>10) alerts.push({type:'warn',icon:'📈',label:`Impacto +${pctDiff}%`,tooltip:`El impacto subió ${pctDiff}% vs ${prevQ.quincena}. De €${prevImp.toFixed(0)} a €${curImp.toFixed(0)}.`});
      else if(curImp<prevImp) alerts.push({type:'good',icon:'📉',label:`Impacto -${Math.abs(pctDiff)}%`,tooltip:`El impacto bajó vs ${prevQ.quincena}. De €${prevImp.toFixed(0)} a €${curImp.toFixed(0)}.`});
    }
  }
  if(!alerts.length) alerts.push({type:'good',icon:'🎉',label:'Todo bajo control',tooltip:'No se detectaron alertas críticas en este inventario.'});
  const strip=document.getElementById('alertsGrid');
  strip.className='alerts-strip';
  strip.innerHTML=alerts.map(a=>`<div class="alert-badge ${a.type}">${a.icon} ${escapeHtml(a.label)}<div class="alert-tooltip">${escapeHtml(a.tooltip)}</div></div>`).join('');
  document.getElementById('alertCount').textContent=`(${alerts.length})`;
  document.getElementById('alertsSection').style.display='block';
}

function renderTreemap(data){
  const famImp={};
  data.forEach(d=>{famImp[d.familia]=(famImp[d.familia]||0)+d.impacto;});
  const sorted=Object.entries(famImp).sort((a,b)=>b[1]-a[1]);
  const max=sorted[0]?.[1]||1;
  const colors=['#e63946','#f4a225','#1877F2','#8b5cf6','#22c55e','#0891b2','#dc2626','#7c3aed'];
  document.getElementById('treemapChart').innerHTML=sorted.map(([fam,imp],i)=>
    `<div class="treemap-cell" style="background:${colors[i%colors.length]};opacity:${0.6+0.4*(imp/max)}" title="${escapeHtml(fam)}: €${imp.toFixed(0)}">
      <div class="treemap-name">${escapeHtml(fam)}</div><div class="treemap-val">€${imp.toFixed(0)}</div></div>`).join('');
  document.getElementById('treemapCard').style.display='block';
}

// ── Scatter ───────────────────────────────────────────────────
function renderScatter(data){
  const ctx=document.getElementById('scatterChart').getContext('2d');
  if(scatterInst) scatterInst.destroy();
  const pts=data.filter(d=>d.estado!=='COINCIDE').map(d=>({x:Math.abs(d.pct*100),y:d.impacto,label:d.producto,estado:d.estado}));
  scatterInst=new Chart(ctx,{type:'scatter',data:{datasets:[{data:pts.map(p=>({x:p.x,y:p.y})),
    backgroundColor:pts.map(p=>p.estado==='ELEVADA'?'rgba(230,57,70,.7)':'rgba(244,162,37,.7)'),pointRadius:7,pointHoverRadius:10}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},
      tooltip:{callbacks:{label:ctx=>{const p=pts[ctx.dataIndex];return[p.label,`% desv: ${p.x.toFixed(1)}%`,`Impacto: €${p.y.toFixed(2)}`];}}}},
      scales:{x:{title:{display:true,text:'% Desviación',color:'var(--text3)',font:{size:11}},grid:{color:'var(--border)'},ticks:{color:'var(--text3)'}},
        y:{title:{display:true,text:'Impacto €',color:'var(--text3)',font:{size:11}},grid:{color:'var(--border)'},ticks:{color:'var(--text3)'}}}
    }});
  document.getElementById('scatterCard').style.display='block';
}

// ── Histórico chart ───────────────────────────────────────────
let histOffset=0;
const HIST_PAGE=8;
function histScroll(dir){
  const total=historico.quincenas.length;
  histOffset=Math.max(0,Math.min(histOffset+dir*HIST_PAGE,Math.max(0,total-HIST_PAGE)));
  renderHistChart();
}
function renderHistChart(){
  if(!historico.quincenas.length){document.getElementById('histCard').style.display='none';return;}
  const sorted=[...historico.quincenas].sort((a,b)=>new Date(a.fecha)-new Date(b.fecha));
  const total=sorted.length;
  if(total>HIST_PAGE && histOffset===0) histOffset=Math.max(0,total-HIST_PAGE);
  const slice=sorted.slice(histOffset,histOffset+HIST_PAGE);
  const navLabel=document.getElementById('histNavLabel');
  if(navLabel) navLabel.textContent=total<=HIST_PAGE?total+' semanas':(histOffset+1)+'–'+Math.min(histOffset+HIST_PAGE,total)+' de '+total;
  const ctx=document.getElementById('histChart').getContext('2d');
  if(histInst) histInst.destroy();
  histInst=new Chart(ctx,{type:'bar',data:{
    labels:slice.map(q=>q.quincena),
    datasets:[
      {label:'Elevada',data:slice.map(q=>parseInt(q.elevada)||0),backgroundColor:'rgba(230,57,70,.8)',borderRadius:4,stack:'s'},
      {label:'Leve',data:slice.map(q=>parseInt(q.leve)||0),backgroundColor:'rgba(244,162,37,.8)',borderRadius:4,stack:'s'},
      {label:'Coincide',data:slice.map(q=>parseInt(q.coincide)||0),backgroundColor:'rgba(34,197,94,.8)',borderRadius:4,stack:'s'},
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'bottom',labels:{font:{size:11},boxWidth:10,padding:16}}},
      scales:{x:{stacked:true,grid:{display:false},ticks:{color:'var(--text3)',font:{size:11}}},
        y:{stacked:true,grid:{color:'var(--border)'},ticks:{color:'var(--text3)',font:{size:11}},beginAtZero:true}}
    }});
  document.getElementById('histCard').style.display='block';
}

// ── Barras semana ───────────────────────────────────────────
function renderBars(data){
  const sorted=[...data].filter(d=>d.estado!=='COINCIDE').sort((a,b)=>b.impacto-a.impacto).slice(0,8);
  const max=sorted[0]?.impacto||1;
  document.getElementById('barChart').innerHTML=sorted.map(d=>{
    const w=Math.round((d.impacto/max)*100);
    const pct=(d.pct>=0?'+':'')+(d.pct*100).toFixed(1)+'%';
    const col=d.estado==='ELEVADA'?'var(--red)':'var(--amber)';
    return `<div class="bar-row"><div class="bar-name" title="${escapeHtml(d.producto)}">${escapeHtml(d.producto)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:0%;background:${col}" data-w="${w}"></div></div>
      <div class="bar-pct" style="color:${col}">${pct}</div></div>`;
  }).join('')||'<div class="empty"><div class="empty-icon">🎉</div>Sin desvíos significativos</div>';
  requestAnimationFrame(()=>document.querySelectorAll('.bar-fill').forEach(el=>el.style.width=el.dataset.w+'%'));
}

// ── Familias ──────────────────────────────────────────────────
function renderFamilias(data){
  const map={};
  data.forEach(d=>{if(!map[d.familia])map[d.familia]={total:0,elevada:0,leve:0};
    map[d.familia].total++;if(d.estado==='ELEVADA')map[d.familia].elevada++;else if(d.estado==='LEVE')map[d.familia].leve++;});
  document.getElementById('famBody').innerHTML=Object.entries(map).sort((a,b)=>b[1].elevada-a[1].elevada).map(([fam,v])=>`
    <tr><td>${escapeHtml(fam)}</td><td>${v.total}</td><td>${v.elevada}</td>
    <td>${v.elevada>0?'<span class="pill p-red">Elevada</span>':v.leve>0?'<span class="pill p-amber">Leve</span>':'<span class="pill p-green">OK</span>'}</td></tr>`).join('');
}

// ── Detalle ───────────────────────────────────────────────────
function renderDetail(data){
  let filtered=activeFilter==='all'?data:data.filter(d=>d.estado===activeFilter);
  if(searchTerm) filtered=filtered.filter(d=>d.producto.toLowerCase().includes(searchTerm)||d.familia.toLowerCase().includes(searchTerm));
  const sorted=[...filtered].sort((a,b)=>sortAsc?(a[sortCol]>b[sortCol]?1:-1):(a[sortCol]<b[sortCol]?1:-1));
  const prodHist={};
  historico.productos.forEach(p=>{if(!prodHist[p.producto])prodHist[p.producto]=[];prodHist[p.producto].push(p);});
  document.getElementById('detailBody').innerHTML=sorted.map(d=>{
    const pct=(d.pct>=0?'+':'')+(d.pct*100).toFixed(1)+'%';
    const dot=d.estado==='ELEVADA'?'d-red':d.estado==='LEVE'?'d-amber':'d-green';
    const pill=d.estado==='ELEVADA'?'p-red':d.estado==='LEVE'?'p-amber':'p-green';
    const lab=d.estado==='ELEVADA'?'Elevada':d.estado==='LEVE'?'Leve':'Coincide';
    const hist=prodHist[d.producto]||[];
    const histBadge=hist.length>0?`<span class="pill p-blue" style="cursor:pointer" data-action="open-panel" data-product="${actionValue(d.producto)}">📊 ${hist.length} reg.</span>`:'<span style="color:var(--text3);font-size:11px">—</span>';
    const concBadge=d.estado!=='COINCIDE'?badgeConc(d.producto,'actual'):'<span style="color:var(--text3);font-size:11px">—</span>';
    return `<tr><td style="font-weight:600">${escapeHtml(d.producto)}</td><td>${escapeHtml(d.familia)}</td><td>${escapeHtml(d.unidad)}</td>
      <td>${d.cantTeo.toFixed(2)}</td><td>${d.cantReal.toFixed(2)}</td>
      <td><span class="dot ${dot}"></span>${pct}</td>
      <td style="font-weight:600">€${d.impacto.toFixed(2)}</td>
      <td><span class="pill ${pill}">${lab}</span></td>
      <td>${concBadge}</td><td>${histBadge}</td></tr>`;
  }).join('')||'<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:1.5rem">Sin resultados</td></tr>';
}

// ── Rankings ──────────────────────────────────────────────────
function renderRankings(){
  const allProds=historico.productos;
  if(!allProds.length){document.getElementById('rankEmpty').style.display='block';document.getElementById('rankCards').style.display='none';return;}
  document.getElementById('rankEmpty').style.display='none';document.getElementById('rankCards').style.display='grid';
  const map={};
  allProds.forEach(p=>{if(!map[p.producto])map[p.producto]={producto:p.producto,familia:p.familia,registros:[],impTotal:0,elevadas:0,quincenas:new Set()};
    map[p.producto].registros.push(p);map[p.producto].impTotal+=(parseFloat(p.impacto)||0);
    if(p.estado==='ELEVADA')map[p.producto].elevadas++;map[p.producto].quincenas.add(p.quincena);});
  const prods=Object.values(map);
  const totalQ=historico.quincenas.length;

  const row=(p,i,val,extra)=>`<tr><td style="font-weight:700;color:var(--text3)">#${i+1}</td>
    <td style="font-weight:600;cursor:pointer;color:var(--blue)" data-action="open-panel" data-product="${actionValue(p.producto)}">${escapeHtml(p.producto)}</td>
    <td>${val}</td><td>${extra}</td></tr>`;

  document.getElementById('rankImpactoBody').innerHTML=[...prods].sort((a,b)=>b.impTotal-a.impTotal).slice(0,8).map((p,i)=>row(p,i,`€${p.impTotal.toFixed(0)}`,p.quincenas.size)).join('');
  document.getElementById('rankRecurBody').innerHTML=[...prods].filter(p=>p.elevadas>0).sort((a,b)=>b.elevadas-a.elevadas).slice(0,8).map((p,i)=>row(p,i,`<span class="pill p-red">${p.elevadas}</span>`,Math.round(p.elevadas/totalQ*100)+'%')).join('');

  const byTend=[...prods].filter(p=>p.registros.length>=2).map(p=>{
    const regs=[...p.registros].sort((a,b)=>new Date(a.fecha||0)-new Date(b.fecha||0));
    const last=regs[regs.length-1],prev=regs[regs.length-2];
    const delta=Math.abs(parseFloat(last.pct)||0)-Math.abs(parseFloat(prev.pct)||0);
    return {...p,delta,lastPct:parseFloat(last.pct)||0};
  }).sort((a,b)=>b.delta-a.delta).slice(0,8);
  document.getElementById('rankPeorBody').innerHTML=byTend.map((p,i)=>row(p,i,`<span style="color:var(--red);font-weight:700">↑${(p.delta*100).toFixed(1)}%</span>`,`${(p.lastPct*100).toFixed(1)}%`)).join('');

  const byStable=[...prods].filter(p=>p.quincenas.size>=2).map(p=>({...p,acc:Math.round(p.registros.filter(r=>r.estado==='COINCIDE').length/p.registros.length*100)})).sort((a,b)=>b.acc-a.acc).slice(0,8);
  document.getElementById('rankEstableBody').innerHTML=byStable.map((p,i)=>row(p,i,`<span class="pill p-green">${p.acc}%</span>`,p.quincenas.size)).join('');
}

// ── Evolución productos ───────────────────────────────────────
function renderProductos(){
  const allProds=historico.productos;
  if(!allProds.length){document.getElementById('prodEmpty').style.display='block';document.getElementById('prodCard').style.display='none';return;}
  document.getElementById('prodEmpty').style.display='none';document.getElementById('prodCard').style.display='block';
  const map={};
  allProds.forEach(p=>{if(!map[p.producto])map[p.producto]={producto:p.producto,familia:p.familia,registros:[]};
    map[p.producto].registros.push({quincena:p.quincena,fecha:p.fecha,pct:parseFloat(p.pct)||0,impacto:parseFloat(p.impacto)||0,estado:p.estado});});
  renderProdTable(Object.values(map));
}

function renderProdTable(prods,search=''){
  let filtered=search?prods.filter(p=>p.producto.toLowerCase().includes(search)||p.familia.toLowerCase().includes(search)):prods;
  document.getElementById('prodBody').innerHTML=filtered.map(p=>{
    const regs=[...p.registros].sort((a,b)=>new Date(a.fecha||0)-new Date(b.fecha||0));
    const avgPct=regs.reduce((s,r)=>s+Math.abs(r.pct),0)/regs.length;
    const impAcum=regs.reduce((s,r)=>s+r.impacto,0);
    const last=regs[regs.length-1],prev=regs.length>1?regs[regs.length-2]:null;
    const trend=prev?Math.abs(last.pct)-Math.abs(prev.pct)>0.01?'↑ Empeorando':Math.abs(last.pct)-Math.abs(prev.pct)<-0.01?'↓ Mejorando':'= Estable':'—';
    const trendColor=trend.startsWith('↑')?'var(--red)':trend.startsWith('↓')?'var(--green)':'var(--text3)';
    const pill=last.estado==='ELEVADA'?'p-red':last.estado==='LEVE'?'p-amber':'p-green';
    const lab=last.estado==='ELEVADA'?'Elevada':last.estado==='LEVE'?'Leve':'Coincide';
    const keyLast=p.producto+'||'+last.quincena;
    const concLast=conciliaciones[keyLast]||{estado:'PENDIENTE',explicaciones:[]};
    let estadoCell=`<span class="pill ${pill}">${lab}</span>`;
    if(last.estado!=='COINCIDE'){
      const concCls=concLast.estado==='CONCILIADA'?'conc-conciliada':concLast.estado==='PARCIAL'?'conc-parcial':'conc-pendiente';
      const concIcon=concLast.estado==='CONCILIADA'?'🟢':concLast.estado==='PARCIAL'?'🟠':'🔴';
      const concLbl=concLast.estado==='CONCILIADA'?'Conciliada':concLast.estado==='PARCIAL'?'Parcial':'Pendiente';
      estadoCell+=` <span class="conc-badge ${concCls}" style="font-size:10px">${concIcon} ${concLbl}</span>`;
    }
    return `<tr><td style="font-weight:700;cursor:pointer;color:var(--blue)" data-action="open-panel" data-product="${actionValue(p.producto)}">${escapeHtml(p.producto)}</td>
      <td>${escapeHtml(p.familia)}</td><td><span class="pill p-blue">${regs.length}</span></td>
      <td>${(avgPct*100).toFixed(1)}%</td><td style="font-weight:600">€${impAcum.toFixed(0)}</td>
      <td style="font-weight:600;color:${trendColor}">${trend}</td>
      <td>${estadoCell}</td></tr>`;
  }).join('')||'<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:1.5rem">Sin resultados</td></tr>';
}

// ── Panel lateral ─────────────────────────────────────────────
function openPanel(nombre){
  const hist=historico.productos.filter(p=>p.producto===nombre);
  const cur=currentData.find(d=>d.producto===nombre);
  if(!window.panelOffset) window.panelOffset={};
  document.getElementById('panelName').textContent=nombre;
  document.getElementById('panelFamilia').textContent=hist[0]?.familia||cur?.familia||'—';

  // Enriquecer registros con estado de conciliación
  const allRegs=[...hist.map(p=>{
    const key=p.producto+'||'+p.quincena;
    const conc=conciliaciones[key]||{estado:'PENDIENTE',explicaciones:[]};
    return {
      quincena:p.quincena, fecha:p.fecha,
      pct:parseFloat(p.pct)||0, impacto:parseFloat(p.impacto)||0,
      estado:p.estado, concEstado:conc.estado,
      explicaciones:conc.explicaciones
    };
  })];

  // Only add 'Actual' point if viewing an unsaved/new upload (currentSemana is null)
  if(cur && !currentSemana){
    const keyActual=cur.producto+'||actual';
    const concActual=conciliaciones[keyActual]||{estado:'PENDIENTE',explicaciones:[]};
    if(!allRegs.find(r=>r.quincena==='Actual')){
      allRegs.push({
        quincena:'Actual', fecha:new Date().toISOString(),
        pct:cur.pct, impacto:cur.impacto,
        estado:cur.estado, concEstado:concActual.estado,
        explicaciones:concActual.explicaciones
      });
    }
  }

  const sorted=[...allRegs].sort((a,b)=>new Date(a.fecha||0)-new Date(b.fecha||0));
  const elevadas=allRegs.filter(r=>r.estado==='ELEVADA').length;
  const conciliadas=allRegs.filter(r=>r.concEstado==='CONCILIADA').length;
  const impAcum=allRegs.reduce((s,r)=>s+r.impacto,0);
  const avgPct=allRegs.reduce((s,r)=>s+Math.abs(r.pct),0)/allRegs.length;

  document.getElementById('panelKpis').innerHTML=`
    <div class="panel-kpi"><div class="panel-kpi-label">Registros</div><div class="panel-kpi-val" style="color:var(--blue)">${allRegs.length}</div></div>
    <div class="panel-kpi"><div class="panel-kpi-label">Desvíos elevados</div><div class="panel-kpi-val" style="color:var(--red)">${elevadas}</div></div>
    <div class="panel-kpi"><div class="panel-kpi-label">Conciliados</div><div class="panel-kpi-val" style="color:#22c55e">${conciliadas}</div></div>
    <div class="panel-kpi"><div class="panel-kpi-label">% Desv. prom.</div><div class="panel-kpi-val" style="color:var(--amber)">${(avgPct*100).toFixed(1)}%</div></div>`;

  // Color de puntos según conciliación: verde=conciliado, amarillo=parcial, rojo=pendiente, gris=coincide
  function puntColor(r){
    if(r.estado==='COINCIDE') return '#22c55e';
    if(r.concEstado==='CONCILIADA') return '#22c55e';
    if(r.concEstado==='PARCIAL') return '#f4a225';
    return r.estado==='ELEVADA'?'#e63946':'#f4a225';
  }

  // Borde del punto más grueso si está conciliado
  function puntRadius(r){
    return r.concEstado==='CONCILIADA'?7:5;
  }

  const ctx=document.getElementById('panelChart').getContext('2d');
  if(panelChartInst) panelChartInst.destroy();
  // Show last 8 entries max, with navigation
  const PANEL_PAGE=8;
  if(!window.panelOffset) window.panelOffset={};
  if(window.panelOffset[nombre]===undefined) window.panelOffset[nombre]=Math.max(0,sorted.length-PANEL_PAGE);
  const pOffset=window.panelOffset[nombre];
  const pSlice=sorted.slice(pOffset, pOffset+PANEL_PAGE);

  panelChartInst=new Chart(ctx,{type:'line',data:{
    labels:pSlice.map(r=>r.quincena),
    datasets:[{
      label:'% Desviación',
      data:pSlice.map(r=>parseFloat((r.pct*100).toFixed(2))),
      borderColor:'rgba(24,119,242,.4)',
      backgroundColor:'rgba(24,119,242,.05)',
      fill:true, tension:.4,
      pointRadius:sorted.map(r=>puntRadius(r)),
      pointHoverRadius:9,
      pointBackgroundColor:sorted.map(r=>puntColor(r)),
      pointBorderColor:pSlice.map(r=>r.concEstado==='CONCILIADA'?'#22c55e':'rgba(24,119,242,.4)'),
      pointBorderWidth:pSlice.map(r=>r.concEstado==='CONCILIADA'?2:1),
    }]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{
          label:c=>{
            const r=sorted[c.dataIndex];
            const concLbl=r.concEstado==='CONCILIADA'?' ✓ Conciliada':r.concEstado==='PARCIAL'?' ◑ Parcial':r.estado!=='COINCIDE'?' ○ Pendiente':'';
            return `${c.parsed.y.toFixed(2)}%${concLbl}`;
          }
        }}},
      scales:{
        x:{grid:{display:false},ticks:{color:'var(--text3)',font:{size:10}}},
        y:{grid:{color:'var(--border)'},ticks:{color:'var(--text3)',font:{size:10}}}
      }
    }});

  // Leyenda del gráfico
  const totalEntries=sorted.length;
  const showNav=totalEntries>PANEL_PAGE;
  const navHtml=showNav?`
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
      <button data-action="panel-nav" data-product="${actionValue(nombre)}" data-direction="-1" style="font-size:11px;padding:3px 8px;border-radius:4px;border:0.5px solid var(--border);background:var(--surface);cursor:pointer">←</button>
      <span style="font-size:11px;color:var(--text3)">${pOffset+1}–${Math.min(pOffset+PANEL_PAGE,totalEntries)} de ${totalEntries}</span>
      <button data-action="panel-nav" data-product="${actionValue(nombre)}" data-direction="1" style="font-size:11px;padding:3px 8px;border-radius:4px;border:0.5px solid var(--border);background:var(--surface);cursor:pointer">→</button>
    </div>`:'';
  const legendHtml=navHtml+`
    <div style="display:flex;gap:12px;font-size:10px;color:var(--text3);margin-top:4px;margin-bottom:12px;flex-wrap:wrap">
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;margin-right:4px;vertical-align:middle"></span>Conciliado / Coincide</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#f4a225;margin-right:4px;vertical-align:middle"></span>Parcial / Leve</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#e63946;margin-right:4px;vertical-align:middle"></span>Pendiente / Elevada</span>
    </div>`;

  // Tabla histórica con estado de conciliación
  const tablaRows=[...sorted].reverse().map(r=>{
    const pill=r.estado==='ELEVADA'?'p-red':r.estado==='LEVE'?'p-amber':'p-green';
    const lab=r.estado==='ELEVADA'?'Elevada':r.estado==='LEVE'?'Leve':'Coincide';
    let concCell='<span style="color:var(--text3);font-size:11px">—</span>';
    if(r.estado!=='COINCIDE'){
      const concCls=r.concEstado==='CONCILIADA'?'conc-conciliada':r.concEstado==='PARCIAL'?'conc-parcial':'conc-pendiente';
      const concIcon=r.concEstado==='CONCILIADA'?'🟢':r.concEstado==='PARCIAL'?'🟠':'🔴';
      const concLbl=r.concEstado==='CONCILIADA'?'Conciliada':r.concEstado==='PARCIAL'?'Parcial':'Pendiente';
      const semanaEsc=actionValue(r.quincena);
      const productoEsc=actionValue(nombre);
      concCell=`<span class="conc-badge ${concCls}" data-action="open-reconciliation" data-product="${productoEsc}" data-week="${semanaEsc}">${concIcon} ${concLbl}</span>`;
    }
    return `<tr>
      <td>${escapeHtml(r.quincena)}</td>
      <td>${(r.pct>=0?'+':'')+(r.pct*100).toFixed(1)}%</td>
      <td>€${r.impacto.toFixed(2)}</td>
      <td><span class="pill ${pill}">${lab}</span></td>
      <td>${concCell}</td>
    </tr>`;
  }).join('');

  // Solo conservar la investigación si pertenece al mismo producto.
  const panelBody=document.getElementById('panelBody');
  const oldConc=document.getElementById('concSection');
  const preserveConc=oldConc&&oldConc.dataset.producto===nombre;
  panelBody.innerHTML=legendHtml+`
    <table class="panel-hist-table" style="width:100%">
      <thead><tr>
        <th>Semana</th><th>% Desv.</th><th>Impacto €</th><th>Desvío</th><th>Investigación</th>
      </tr></thead>
      <tbody>${tablaRows}</tbody>
    </table>`;
  if(preserveConc) panelBody.appendChild(oldConc);

  document.getElementById('panelOverlay').style.display='block';
  document.getElementById('panel').style.display='block';
  document.getElementById('panel').classList.add('panel-enter');
}
function panelNav(nombre, dir){
  if(!window.panelOffset) window.panelOffset={};
  const sorted=[...historico.productos.filter(p=>p.producto===nombre)].sort((a,b)=>new Date(a.fecha||0)-new Date(b.fecha||0));
  const total=sorted.length;
  const PANEL_PAGE=8;
  const cur=window.panelOffset[nombre]||0;
  window.panelOffset[nombre]=Math.max(0,Math.min(cur+dir*PANEL_PAGE, Math.max(0,total-PANEL_PAGE)));
  openPanel(nombre);
}
function closePanel(){document.getElementById('panelOverlay').style.display='none';document.getElementById('panel').style.display='none';}

// ── Filtros ───────────────────────────────────────────────────
function setFilter(f,btn){activeFilter=f;document.querySelectorAll('.fbtn').forEach(b=>b.className='fbtn');btn.classList.add(f==='all'?'f-all':f==='ELEVADA'?'f-red':f==='LEVE'?'f-amber':'f-green');renderDetail(currentData);}
function searchDetail(v){searchTerm=v.toLowerCase();renderDetail(currentData);}
function searchProductos(v){const map={};historico.productos.forEach(p=>{if(!map[p.producto])map[p.producto]={producto:p.producto,familia:p.familia,registros:[]};map[p.producto].registros.push({quincena:p.quincena,fecha:p.fecha,pct:parseFloat(p.pct)||0,impacto:parseFloat(p.impacto)||0,estado:p.estado});});renderProdTable(Object.values(map),v.toLowerCase());}
function sortTable(col){if(sortCol===col)sortAsc=!sortAsc;else{sortCol=col;sortAsc=false;}renderDetail(currentData);}

function formatMadridDate(value){
  return value?new Date(value).toLocaleString('es-ES',{timeZone:'Europe/Madrid',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

// Codifica identificadores interpolados en atributos de acción.
function actionValue(value){
  return encodeURIComponent(String(value??'')).replace(/'/g,'%27');
}

async function renderSystemStatus(){
  const target=document.getElementById('systemStatusContent');
  target.innerHTML='<div class="empty"><span class="spinner"></span> Consultando sincronizaciones…</div>';
  const fields='block,status,trigger_type,records_processed,started_at,finished_at,error_code';
  const blocks=['STOCK','PRODUCTION','ORDER'];
  const [recentResponse,alertsResponse,...blockResponses]=await Promise.all([
    supabaseClient.from('tspoon_sync_runs').select(fields).order('started_at',{ascending:false}).limit(30),
    supabaseClient.from('system_alerts').select('alert_type,block,severity,message,detected_at').eq('status','OPEN').order('detected_at',{ascending:false}),
    ...blocks.map(block=>supabaseClient.from('tspoon_sync_runs').select(fields).eq('block',block).order('started_at',{ascending:false}).limit(1).maybeSingle())
  ]);
  const {data:runs,error}=recentResponse;
  if(error){target.innerHTML=`<div class="empty" style="color:var(--red)">No se pudo consultar el estado: ${escapeHtml(error.message)}</div>`;return;}
  let connector=null;
  if(hasRole('ADMINISTRADOR')){
    const response=await supabaseClient.from('tspoonlab_connector_status')
      .select('status,last_checked_at,last_success_at,last_error_code').eq('singleton',true).maybeSingle();
    connector=response.data;
  }
  const latest=Object.fromEntries(blocks.map((block,index)=>[block,blockResponses[index].data]));
  const cards=blocks.map(block=>{
    const run=latest[block];
    if(!run) return `<div class="kpi-card"><div class="kpi-label">${block}</div><div class="kpi-val" style="font-size:18px;color:var(--text3)">Sin datos</div></div>`;
    const age=Date.now()-new Date(run.started_at).getTime();
    const healthy=run.status==='SUCCEEDED'&&age<8*60*60*1000;
    const color=healthy?'#22c55e':run.status==='FAILED'?'var(--red)':'var(--amber)';
    const label=healthy?'Operativo':run.status==='FAILED'?'Falló':'Atrasado';
    return `<div class="kpi-card"><div class="kpi-label">${block}</div><div class="kpi-val" style="font-size:18px;color:${color}">${label}</div><div class="kpi-sub">${formatMadridDate(run.started_at)} · ${run.records_processed||0} registros${run.error_code?` · ${escapeHtml(run.error_code)}`:''}</div></div>`;
  }).join('');
  const connectorHtml=connector?`<div class="gestion-info"><strong>Conector tSpoonLab:</strong> ${escapeHtml(connector.status)} · última respuesta correcta ${formatMadridDate(connector.last_success_at)}${connector.last_error_code?` · error ${escapeHtml(connector.last_error_code)}`:''}</div>`:'';
  const failed=(runs||[]).filter(run=>run.status==='FAILED').slice(0,5);
  const alerts=alertsResponse.data||[];
  const alertsHtml=alerts.length?`<div class="gestion-info" style="border-color:var(--red-b);background:var(--red-bg)"><strong>🚨 ${alerts.length} incidente${alerts.length===1?'':'s'} activo${alerts.length===1?'':'s'}:</strong><ul style="margin:8px 0 0 18px">${alerts.map(alert=>`<li>${escapeHtml(alert.block||'CONECTOR')}: ${escapeHtml(alert.message)} <span style="color:var(--text3)">(${formatMadridDate(alert.detected_at)})</span></li>`).join('')}</ul></div>`:'<div class="gestion-info" style="border-color:#b6f0cf;background:#edfff4"><strong>✓ Sin incidentes activos.</strong> Las comprobaciones automáticas están funcionando.</div>';
  target.innerHTML=`${alertsHtml}<div class="kpi-grid" style="margin:18px 0">${cards}</div>${connectorHtml}
    <div class="card-title" style="margin-top:20px">Últimas ejecuciones</div>
    <div class="tbl-wrap"><table class="atbl"><thead><tr><th>Bloque</th><th>Inicio</th><th>Estado</th><th>Registros</th><th>Origen</th></tr></thead><tbody>
    ${(runs||[]).slice(0,12).map(run=>`<tr><td>${escapeHtml(run.block)}</td><td>${formatMadridDate(run.started_at)}</td><td><span class="pill ${run.status==='SUCCEEDED'?'p-green':run.status==='FAILED'?'p-red':'p-amber'}">${escapeHtml(run.status)}</span></td><td>${run.records_processed||0}</td><td>${escapeHtml(run.trigger_type)}</td></tr>`).join('')||'<tr><td colspan="5">Sin ejecuciones registradas</td></tr>'}
    </tbody></table></div>${failed.length?`<div class="gestion-info" style="border-color:var(--red-b)"><strong>Atención:</strong> hay ${failed.length} fallo${failed.length===1?'':'s'} reciente${failed.length===1?'':'s'} en las últimas 30 ejecuciones.</div>`:''}`;
}

// ── Nav ───────────────────────────────────────────────────────
function showView(id,tab){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('view-'+id).classList.add('active');
  tab.classList.add('active');
  if(id==='productos') renderProductos();
  if(id==='rankings') renderRankings();
  if(id==='gestion') renderGestion();
  if(id==='comparar') renderCompararSelector();
  if(id==='sistema') renderSystemStatus();
}

// ── Render all ────────────────────────────────────────────────
function renderTop5(data){
  const elevados=[...data].filter(d=>d.estado==='ELEVADA').sort((a,b)=>b.impacto-a.impacto);
  const leves=[...data].filter(d=>d.estado==='LEVE').sort((a,b)=>b.impacto-a.impacto);
  const todos=[...elevados,...leves].slice(0,8);
  if(!todos.length){document.getElementById('top5Card').style.display='none';return;}
  const prodHist={};
  historico.productos.forEach(p=>{if(!prodHist[p.producto])prodHist[p.producto]=0;if(p.estado==='ELEVADA')prodHist[p.producto]++;});

  // Summary row
  const resumen=getConcResumen(data);
  const impConc=getImpactoConc(data);
  const summaryHtml=`
    <div style="display:flex;gap:12px;flex-wrap:wrap;padding:10px 14px;background:var(--bg);border-radius:8px;margin-bottom:14px;font-size:12px;align-items:center">
      <span style="font-weight:600;color:var(--text2)">Investigación:</span>
      ${resumen.pendientes.length>0?`<span style="color:var(--red)">🔴 ${resumen.pendientes.length} pendiente${resumen.pendientes.length!==1?'s':''}</span>`:''}
      ${resumen.parciales.length>0?`<span style="color:var(--amber)">🟠 ${resumen.parciales.length} parcial${resumen.parciales.length!==1?'es':''}</span>`:''}
      ${resumen.conciliadas.length>0?`<span style="color:#22c55e">🟢 ${resumen.conciliadas.length} conciliada${resumen.conciliadas.length!==1?'s':''}</span>`:''}
      <span style="margin-left:auto;color:var(--text3)">€${impConc.sinExplicar.toFixed(0)} sin explicar · €${impConc.explicado.toFixed(0)} conciliado</span>
    </div>`;

  document.getElementById('top5Content').innerHTML=summaryHtml+`
    <table class="atbl">
      <thead><tr>
        <th>Producto</th><th>Familia</th><th>% Desviación</th>
        <th>Impacto €</th><th>Desvío</th><th>Investigación</th><th>Recurrencia</th>
      </tr></thead>
      <tbody>${todos.map(d=>{
        const pill=d.estado==='ELEVADA'?'p-red':'p-amber';
        const lab=d.estado==='ELEVADA'?'Elevada':'Leve';
        const veces=prodHist[d.producto]||0;
        const recur=veces>=2?`<span class="pill p-red">🔁 ${veces}x</span>`:veces===1?`<span class="pill p-amber">1x</span>`:'<span style="color:var(--text3);font-size:11px">Nuevo</span>';
        const pct=(d.pct>=0?'+':'')+(d.pct*100).toFixed(1)+'%';
        const key=concKey(d.producto);
        const conc=conciliaciones[key]||{estado:'PENDIENTE',explicaciones:[]};
        const desvAbs=Math.abs(d.desv);
        const expCant=conc.explicaciones.reduce((s,e)=>s+e.cantidad,0);
        const pctExp=desvAbs>0?Math.min(100,Math.round(expCant/desvAbs*100)):0;
        const concIcon=conc.estado==='CONCILIADA'?'🟢':conc.estado==='PARCIAL'?'🟠':'🔴';
        const concLbl=conc.estado==='CONCILIADA'?'Conciliada':conc.estado==='PARCIAL'?`Parcial (${pctExp}%)`:'Pendiente';
        const concCls=conc.estado==='CONCILIADA'?'conc-conciliada':conc.estado==='PARCIAL'?'conc-parcial':'conc-pendiente';
        const rowBg=conc.estado==='CONCILIADA'?'background:#edfff4':conc.estado==='PARCIAL'?'background:#fffbec':'';
        return `<tr style="${rowBg}">
          <td style="font-weight:700">${escapeHtml(d.producto)}</td>
          <td>${escapeHtml(d.familia)}</td>
          <td style="font-weight:700;color:${d.estado==='ELEVADA'?'var(--red)':'var(--amber)'}">${pct}</td>
          <td style="font-weight:700">€${d.impacto.toFixed(2)}</td>
          <td><span class="pill ${pill}">${lab}</span></td>
          <td><span class="conc-badge ${concCls}" data-action="open-reconciliation" data-product="${actionValue(d.producto)}" data-week="current">${concIcon} ${concLbl}</span></td>
          <td>${recur}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>`;
  document.getElementById('top5Card').style.display='block';
}

function renderAll(){
  if(!currentData.length) return;
  const data=currentData;
  document.getElementById('landingSection').style.display='none';
  document.getElementById('execOnlyHist').style.display='none';
  renderGauge(resolveHealthScore(data));
  renderKPIs(data);
  renderComparacion(data);
  renderAlertas(data);
  renderTop5(data);
  renderTreemap(data);
  renderScatter(data);
  renderHistChart();
  renderBars(data);
  renderFamilias(data);
  renderDetail(data);
  document.getElementById('healthWrap').style.display='block';
  document.getElementById('qCard').style.display='block';
  document.getElementById('qCharts').style.display='grid';
  document.getElementById('qEmpty').style.display='none';
  document.getElementById('mainNav').style.display='flex';
}

// ── Cerrar semana ───────────────────────────────────────────
async function cerrarQuincena(){
  if(!canManageInventory()){showNotice('Tu rol tiene acceso de solo lectura.','err');return;}
  if(!currentData.length){showNotice('Primero cargá un export.','err');return;}
  const q=prompt('Nombre de la semana (ej: Q1 Jul 2026):');
  if(!q) return;
  if(!confirm(`¿Guardás la semana "${q}" en la base de datos?`)) return;
  const btn=document.getElementById('btnCerrar');
  const bar=document.getElementById('progressBar'),fill=document.getElementById('progressFill');
  btn.innerHTML='<span class="spinner"></span> Guardando...';btn.disabled=true;bar.style.display='block';
  try{
    const location=authenticatedUser?.locations?.find(item=>item.type==='OBRADOR'&&item.is_active);
    if(!location) throw new Error('Tu usuario no tiene un obrador activo asignado.');
    fill.style.width='35%';
    const lines=currentData.map(item=>({product_name:item.producto,theoretical_quantity:item.cantTeo,
      actual_quantity:item.cantReal,theoretical_cost:item.costeTeo,actual_cost:item.costeReal}));
    const {error}=await supabaseClient.rpc('close_inventory_period',{
      p_location_id:location.id,p_label:q,p_recorded_at:new Date().toISOString(),p_lines:lines
    });
    if(error) throw error;
    fill.style.width='100%';
    showNotice(`Semana "${q}" guardada correctamente.`,'ok');
    document.getElementById('qbadge').textContent=q;document.getElementById('qbadge').style.display='block';
    currentSemana=q;
    await fetchHistorico();
    actualizarSelectorSemana();
    const sel=document.getElementById('semanaSelector');
    if(sel) sel.value=q;
  }catch(e){showNotice('Error: '+e.message,'err');}
  finally{btn.innerHTML='✓ Cerrar semana';btn.disabled=false;setTimeout(()=>{bar.style.display='none';fill.style.width='0%';},2000);}
}

// ── Procesar archivo ──────────────────────────────────────────
async function processFile(file){
  if(!canManageInventory()){showNotice('Tu rol no puede cargar inventarios.','err');return;}
  showNotice('Leyendo archivo...','inf');
  try{
    const data=await parseXLSX(file);
    if(!data.length){showNotice('No se encontraron productos.','err');return;}
    currentData=data;currentSemana=null;activeFilter='all';sortCol='impacto';sortAsc=false;searchTerm='';
    document.querySelectorAll('.fbtn').forEach(b=>b.className='fbtn');
    const allBtn=document.querySelector('.fbtn');if(allBtn) allBtn.classList.add('f-all');
    renderAll();
    showNotice(`${data.length} productos cargados.`,'ok');
  }catch(err){showNotice('Error: '+err,'err');}
}

document.getElementById('fileInput').addEventListener('change',e=>{if(e.target.files[0])processFile(e.target.files[0]);});
const zone=document.getElementById('uploadZone');
zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag')});
zone.addEventListener('dragleave',()=>zone.classList.remove('drag'));
zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag');if(e.dataTransfer.files[0])processFile(e.dataTransfer.files[0])});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePanel();});

// ── Selector de semana ────────────────────────────────────
function actualizarSelectorSemana(){
  const qs=historico.quincenas;
  if(!qs||!qs.length) return;
  const sorted=[...qs].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  const sel=document.getElementById('semanaSelector');
  sel.innerHTML=sorted.map(q=>`<option value="${escapeHtml(q.quincena)}">${escapeHtml(q.quincena)}</option>`).join('');
  const wrap=document.getElementById('semanaSelectWrap');
  wrap.style.display='flex';
}

function cambiarSemanaVista(semana){
  currentSemana=semana;
  const prods=historico.productos.filter(p=>p.quincena===semana);
  if(!prods.length){showNotice('No hay datos para esta semana.','err');return;}
  currentData=prods.map(p=>({
    id:p.id,lineId:p.lineId,familia:p.familia, producto:p.producto, unidad:p.unidad||'',
    cantTeo:parseFloat(p.cantTeo)||0, cantReal:parseFloat(p.cantReal)||0,
    desv:parseFloat(p.desv)||0, pct:parseFloat(p.pct)||0,
    costeTeo:parseFloat(p.costeTeo)||0, costeReal:parseFloat(p.costeReal)||0,
    impacto:parseFloat(p.impacto)||0, estado:p.estado||getEstado(parseFloat(p.pct)||0)
  }));
  document.getElementById('landingSection').style.display='none';
  renderAll();
  showNotice(`Viendo semana: ${semana}`,'inf');
}

function cargarUltimaSemana(){
  const qs=historico.quincenas;
  if(!qs||!qs.length) return;
  const sorted=[...qs].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  cambiarSemanaVista(sorted[0].quincena);
}

// ── Comparar semanas ────────────────────────────────────────
let compBarInst=null, compImpInst=null;

function renderCompararSelector(){
  const qs=historico.quincenas;
  if(!qs||!qs.length){
    document.getElementById('compararEmpty').style.display='block';
    document.getElementById('compararSelector').style.display='none';
    return;
  }
  document.getElementById('compararEmpty').style.display='none';
  document.getElementById('compararSelector').style.display='block';
  const sorted=[...qs].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  const opts=sorted.map(q=>`<option value="${escapeHtml(q.quincena)}">${escapeHtml(q.quincena)}</option>`).join('');
  document.getElementById('selectA').innerHTML=opts;
  document.getElementById('selectB').innerHTML=opts;
  // Default: A=penúltima, B=última
  if(sorted.length>=2){
    document.getElementById('selectA').value=sorted[1].quincena;
    document.getElementById('selectB').value=sorted[0].quincena;
  }
}

function ejecutarComparacion(){
  const qA=document.getElementById('selectA').value;
  const qB=document.getElementById('selectB').value;
  if(qA===qB){showNotice('Elegí dos semanas diferentes.','err');return;}

  const prodsA=historico.productos.filter(p=>p.quincena===qA);
  const prodsB=historico.productos.filter(p=>p.quincena===qB);
  const metA=historico.quincenas.find(q=>q.quincena===qA);
  const metB=historico.quincenas.find(q=>q.quincena===qB);

  if(!prodsA.length||!prodsB.length){showNotice('No hay datos para una de las semanas seleccionadas.','err');return;}

  // KPIs
  const elevA=parseInt(metA.elevada)||0, elevB=parseInt(metB.elevada)||0;
  const leveA=parseInt(metA.leve)||0, leveB=parseInt(metB.leve)||0;
  const coinA=parseInt(metA.coincide)||0, coinB=parseInt(metB.coincide)||0;
  const impA=parseFloat(metA.impacto)||0, impB=parseFloat(metB.impacto)||0;
  const totA=parseInt(metA.total)||1, totB=parseInt(metB.total)||1;
  const accA=Math.round(coinA/totA*100), accB=Math.round(coinB/totB*100);

  function kpiCard(label,valA,valB,unit,higherIsBad){
    const diff=valB-valA;
    const formatValue=value=>unit==='€'?'€'+value:value+(unit||'');
    const diffUnit=unit==='€'?' €':(unit||'');
    const diffStr=diff===0?'Sin cambio':(diff>0?'+':'')+diff+diffUnit;
    const cls=diff===0?'comp-change-neu':(higherIsBad?diff>0:diff<0)?'comp-change-bad':'comp-change-good';
    return `<div class="kpi-card" style="border-top:none;border-left:4px solid var(--blue)">
      <div class="comp-kpi-label">${label}</div>
      <div class="comp-kpi-vals">
        <div><div style="font-size:11px;color:var(--text3);margin-bottom:2px">${qA}</div><div class="comp-kpi-val-a">${formatValue(valA)}</div></div>
        <div class="comp-kpi-arrow">→</div>
        <div><div style="font-size:11px;color:var(--text3);margin-bottom:2px">${qB}</div><div class="comp-kpi-val-b">${formatValue(valB)}</div></div>
      </div>
      <div class="${cls}" style="font-size:12px;margin-top:8px">${diffStr}</div>
    </div>`;
  }

  document.getElementById('compararKpis').innerHTML=
    kpiCard('Precisión',accA,accB,'%',false)+
    kpiCard('Desvíos elevados',elevA,elevB,'',true)+
    kpiCard('Desvíos leves',leveA,leveB,'',true)+
    kpiCard('Coinciden',coinA,coinB,'',false)+
    kpiCard('Impacto €',Math.round(impA),Math.round(impB),'€',true);

  // Gráfico barras lado a lado
  const ctxBar=document.getElementById('compBarChart').getContext('2d');
  if(compBarInst) compBarInst.destroy();
  compBarInst=new Chart(ctxBar,{type:'bar',
    data:{labels:['Elevada','Leve','Coincide'],datasets:[
      {label:qA,data:[elevA,leveA,coinA],backgroundColor:['rgba(230,57,70,.7)','rgba(244,162,37,.7)','rgba(34,197,94,.7)'],borderRadius:4},
      {label:qB,data:[elevB,leveB,coinB],backgroundColor:['rgba(230,57,70,.4)','rgba(244,162,37,.4)','rgba(34,197,94,.4)'],borderRadius:4,borderDash:[4,4]},
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'bottom',labels:{font:{size:11},boxWidth:10}}},
      scales:{x:{grid:{display:false},ticks:{color:'var(--text3)'}},y:{grid:{color:'var(--border)'},ticks:{color:'var(--text3)'},beginAtZero:true}}
    }});

  // Gráfico impacto por familia
  const famA={}, famB={};
  prodsA.forEach(p=>{ famA[p.familia]=(famA[p.familia]||0)+(parseFloat(p.impacto)||0); });
  prodsB.forEach(p=>{ famB[p.familia]=(famB[p.familia]||0)+(parseFloat(p.impacto)||0); });
  const fams=[...new Set([...Object.keys(famA),...Object.keys(famB)])].sort();
  const ctxImp=document.getElementById('compImpChart').getContext('2d');
  if(compImpInst) compImpInst.destroy();
  compImpInst=new Chart(ctxImp,{type:'bar',
    data:{labels:fams,datasets:[
      {label:qA,data:fams.map(f=>famA[f]||0),backgroundColor:'rgba(24,119,242,.7)',borderRadius:4},
      {label:qB,data:fams.map(f=>famB[f]||0),backgroundColor:'rgba(139,92,246,.7)',borderRadius:4},
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'bottom',labels:{font:{size:11},boxWidth:10}}},
      scales:{x:{grid:{display:false},ticks:{color:'var(--text3)',font:{size:10}}},y:{grid:{color:'var(--border)'},ticks:{color:'var(--text3)'},beginAtZero:true}}
    }});

  // Tabla productos que cambiaron de estado
  const mapA={}, mapB={};
  prodsA.forEach(p=>mapA[p.producto]=p);
  prodsB.forEach(p=>mapB[p.producto]=p);
  const allProds=[...new Set([...Object.keys(mapA),...Object.keys(mapB)])];

  const rows=allProds.map(prod=>{
    const a=mapA[prod], b=mapB[prod];
    const estadoA=a?a.estado:'—', estadoB=b?b.estado:'—';
    const pctA=a?(parseFloat(a.pct)*100).toFixed(1)+'%':'—';
    const pctB=b?(parseFloat(b.pct)*100).toFixed(1)+'%':'—';
    const impA2=a?'€'+(parseFloat(a.impacto)||0).toFixed(2):'—';
    const impB2=b?'€'+(parseFloat(b.impacto)||0).toFixed(2):'—';
    const cambiaron=estadoA!==estadoB;
    let cambio='', cambioClass='comp-change-neu';
    if(!a) { cambio='Nuevo ↑'; cambioClass='comp-change-bad'; }
    else if(!b) { cambio='Eliminado'; cambioClass='comp-change-neu'; }
    else if(estadoA==='ELEVADA'&&estadoB!=='ELEVADA') { cambio='Mejoró ✅'; cambioClass='comp-change-good'; }
    else if(estadoA!=='ELEVADA'&&estadoB==='ELEVADA') { cambio='Empeoró 🔴'; cambioClass='comp-change-bad'; }
    else if(estadoA==='LEVE'&&estadoB==='COINCIDE') { cambio='Mejoró ✅'; cambioClass='comp-change-good'; }
    else if(estadoA==='COINCIDE'&&estadoB==='LEVE') { cambio='Empeoró 🟡'; cambioClass='comp-change-bad'; }
    else { cambio='Sin cambio'; }

    const pillA=estadoA==='ELEVADA'?'p-red':estadoA==='LEVE'?'p-amber':estadoA==='COINCIDE'?'p-green':'';
    const pillB=estadoB==='ELEVADA'?'p-red':estadoB==='LEVE'?'p-amber':estadoB==='COINCIDE'?'p-green':'';
    const fam=a?.familia||b?.familia||'—';

    return {cambiaron, html:`<tr style="${cambiaron?'background:var(--blue-ll)':''}">
      <td style="font-weight:600">${escapeHtml(prod)}</td>
      <td>${escapeHtml(fam)}</td>
      <td>${pillA?`<span class="pill ${pillA}">${estadoA}</span>`:estadoA}</td>
      <td>${pillB?`<span class="pill ${pillB}">${estadoB}</span>`:estadoB}</td>
      <td>${pctA}</td><td>${pctB}</td>
      <td>${impA2}</td><td>${impB2}</td>
      <td class="${cambioClass}" style="font-weight:700">${cambio}</td>
    </tr>`};
  });

  // Primero los que cambiaron, después los que no
  const sorted=[...rows.filter(r=>r.cambiaron),...rows.filter(r=>!r.cambiaron)];
  document.getElementById('compararTabla').innerHTML=sorted.map(r=>r.html).join('')||
    '<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:1.5rem">Sin datos</td></tr>';

  document.getElementById('compararResult').style.display='block';
}

// ── Helpers UI ────────────────────────────────────────────────
function showNotice(msg,type='ok'){const n=document.getElementById('notice');n.textContent=msg;n.className='notice '+type;n.style.display='block';if(type!=='err')setTimeout(()=>n.style.display='none',4000);}
function showLoading(txt){document.getElementById('loadingText').textContent=txt||'Cargando...';document.getElementById('loadingOverlay').classList.add('show');}
function hideLoading(){document.getElementById('loadingOverlay').classList.remove('show');}

// ── Conciliación ──────────────────────────────────────────────
function buildAllRows(){
  const rows=[];
  Object.entries(conciliaciones).forEach(([key,conc])=>{
    const parts=key.split('||');
    const producto=parts[0], semana=parts[1]||'';
    const prod=currentData.find(d=>d.producto===producto);
    const histProd=historico.productos.find(p=>p.producto===producto&&p.quincena===semana);
    (conc.explicaciones||[]).forEach(e=>{
      rows.push({semana, producto,
        familia: prod?prod.familia:(histProd?histProd.familia:''),
        causa: e.causa||'', cantidad: e.cantidad||0,
        unidad: e.unidad||(prod?prod.unidad:(histProd?histProd.unidad:'')),
        comentario: e.comentario||'', fecha: e.fecha||''
      });
    });
  });
  return rows;
}

async function addExpToDatabase(semana, producto, exp){
  const histProd=historico.productos.find(p=>p.producto===producto&&p.quincena===semana);
  if(!histProd?.lineId) throw new Error('No se encontró la línea de inventario en la base de datos.');
  const {error}=await supabaseClient.from('inventory_reconciliations').insert({
    id:exp.id,inventory_line_id:histProd.lineId,cause:exp.causa,quantity:exp.cantidad,
    comment:exp.comentario||null,occurred_at:exp.fecha
  });
  if(error) throw error;
}

async function delExpFromDatabase(semana, producto, exp){
  if(!exp.id) throw new Error('La conciliación no tiene ID.');
  const {error}=await supabaseClient.from('inventory_reconciliations').delete().eq('id',exp.id);
  if(error) throw error;
}

function loadConciliaciones(){
  try{const s=localStorage.getItem('shoronpo_conc');if(s) conciliaciones=JSON.parse(s);}catch(e){}
}

function saveConciliaciones(){
  try{localStorage.setItem('shoronpo_conc',JSON.stringify(conciliaciones));}catch(e){}
}

function getConcKey(producto, semana){
  return producto+'||'+(semana||'actual');
}

function getEstadoConc(producto, semana){
  const key=getConcKey(producto,semana);
  return conciliaciones[key]||{estado:'PENDIENTE',explicaciones:[]};
}

function badgeConc(producto, semana){
  const c=getEstadoConc(producto,semana);
  const cls=c.estado==='CONCILIADA'?'conc-conciliada':c.estado==='PARCIAL'?'conc-parcial':'conc-pendiente';
  const lbl=c.estado==='CONCILIADA'?'Conciliada':c.estado==='PARCIAL'?'Parcial':'Pendiente';
  const icon=c.estado==='CONCILIADA'?'🟢':c.estado==='PARCIAL'?'🟠':'🔴';
  return `<span class="conc-badge ${cls}" data-action="open-reconciliation" data-product="${actionValue(producto)}" data-week="${actionValue(semana||'actual')}">${icon} ${lbl}</span>`;
}

function abrirConciliacion(producto, semana){
  const realSemana=semana==='actual'?(currentSemana||'actual'):semana;
  const histProd=historico.productos.find(p=>p.producto===producto&&String(p.quincena)===String(realSemana));
  const currentProd=currentData.find(d=>d.producto===producto);
  const source=histProd||currentProd;
  if(!source) return;
  const prod={
    ...source,
    cantTeo:parseFloat(source.cantTeo)||0,
    cantReal:parseFloat(source.cantReal)||0,
    desv:parseFloat(source.desv)||0,
    pct:parseFloat(source.pct)||0,
    impacto:parseFloat(source.impacto)||0
  };
  const key=getConcKey(producto,realSemana);
  if(!conciliaciones[key]) conciliaciones[key]={estado:'PENDIENTE',explicaciones:[]};
  const conc=conciliaciones[key];
  // Use cantTeo-cantReal for desvAbs since desv can be 0 due to parsing
  const desvAbs=Math.abs(prod.desv)||Math.abs(prod.cantTeo-prod.cantReal);
  const unidad=prod.unidad||'u';
  const unidadHtml=escapeHtml(unidad);
  const explicado=conc.explicaciones.reduce((s,e)=>s+e.cantidad,0);
  const pendiente=Math.max(0,desvAbs-explicado);
  const pct=desvAbs>0?Math.round(Math.min(100,explicado/desvAbs*100)):0;
  const barColor=pct>=100?'#22c55e':pct>0?'#f4a225':'#e63946';

  document.getElementById('panelName').textContent=producto;
  document.getElementById('panelFamilia').textContent=prod.familia;
  document.getElementById('panelKpis').innerHTML=`
    <div class="panel-kpi"><div class="panel-kpi-label">Esperado</div><div class="panel-kpi-val" style="color:var(--blue)">${Math.abs(prod.cantTeo).toFixed(2)} ${unidadHtml}</div></div>
    <div class="panel-kpi"><div class="panel-kpi-label">Encontrado</div><div class="panel-kpi-val" style="color:var(--red)">${Math.abs(prod.cantReal).toFixed(2)} ${unidadHtml}</div></div>
    <div class="panel-kpi"><div class="panel-kpi-label">Diferencia</div><div class="panel-kpi-val" style="color:var(--red)">${prod.desv>0?'+':''}${prod.desv.toFixed(2)} ${unidadHtml}</div></div>
    <div class="panel-kpi"><div class="panel-kpi-label">Valor diferencia</div><div class="panel-kpi-val" style="color:var(--purple)">€${prod.impacto.toFixed(2)}</div></div>`;

  const causas=['Salida no registrada','Entrada no registrada','Producción no cargada',
    'Producción cargada incorrectamente','Merma no registrada','Movimiento incorrecto',
    'Error de conteo','Error de unidad','Pérdida física confirmada','Otra causa'];

  const histRows=conc.explicaciones.map((e,i)=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:0.5px solid var(--border);font-size:12px">
      <div><span style="color:var(--text2)">${escapeHtml(e.causa)}</span>${e.comentario?`<div style="font-size:10px;color:var(--text3);margin-top:1px">${escapeHtml(e.comentario)}</div>`:''}</div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <span style="font-weight:600">${e.cantidad.toFixed(2)} ${unidadHtml}</span>
        ${canReconcile()?`<button data-action="delete-explanation" data-product="${actionValue(producto)}" data-week="${actionValue(semana)}" data-index="${i}" style="font-size:10px;padding:2px 6px;border-radius:4px;border:0.5px solid var(--red-b);background:var(--red-bg);color:var(--red-text);cursor:pointer">✕</button>`:''}
      </div>
    </div>`).join('');

  const concSection=document.createElement('div');
  concSection.id='concSection';
  concSection.dataset.producto=producto;
  concSection.dataset.semana=realSemana;
  concSection.innerHTML=`
    <div style="margin:16px 0 10px;padding-top:12px;border-top:0.5px solid var(--border)">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Investigación y conciliación</div>
      <div style="background:var(--bg);border-radius:8px;padding:12px;margin-bottom:10px;border:0.5px solid var(--border)">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px">
          <span style="color:var(--text2)">Diferencia original</span>
          <span style="font-weight:600">${desvAbs.toFixed(2)} ${unidadHtml}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">
          <span style="color:var(--text2)">Ya explicamos</span>
          <span style="font-weight:600;color:#f4a225">${explicado.toFixed(2)} ${unidadHtml}</span>
        </div>
        <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;margin-bottom:6px">
          <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px">
          <span style="color:var(--text2)">Queda por investigar</span>
          <span style="font-weight:600;color:${pendiente>0.01?'var(--red)':'#22c55e'}">${pendiente.toFixed(2)} ${unidadHtml}</span>
        </div>
      </div>
      ${histRows?`<div style="margin-bottom:10px">${histRows}</div>`:''}
      ${pendiente>0.01&&canReconcile()?`
      <div style="background:var(--surface2);border:0.5px solid var(--border);border-radius:8px;padding:12px">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px">Agregar explicación</div>
        <div style="margin-bottom:8px">
          <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:3px">Causa</label>
          <select id="concCausa" style="width:100%;font-size:12px;padding:6px 8px;border:0.5px solid var(--border2);border-radius:6px;background:var(--surface)">
            <option value="">Seleccionar causa...</option>
            ${causas.map(c=>`<option>${c}</option>`).join('')}
          </select>
        </div>
        <div style="margin-bottom:8px">
          <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:3px">Cantidad (máx. ${pendiente.toFixed(2)} ${unidadHtml})</label>
          <div style="display:flex;align-items:center;gap:8px">
            <input id="concCantidad" type="number" min="0.01" max="${pendiente.toFixed(2)}" step="0.01" placeholder="0.00" style="width:90px;font-size:12px;padding:6px 8px;border:0.5px solid var(--border2);border-radius:6px;background:var(--surface)">
            <span style="font-size:12px;color:var(--text3)">${unidadHtml}</span>
          </div>
        </div>
        <div style="margin-bottom:10px">
          <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:3px">Comentario (opcional)</label>
          <textarea id="concComentario" rows="2" style="width:100%;font-size:12px;padding:6px 8px;border:0.5px solid var(--border2);border-radius:6px;background:var(--surface);resize:none;box-sizing:border-box"></textarea>
        </div>
        <div id="concError" style="font-size:11px;color:var(--red);margin-bottom:6px;display:none"></div>
        <button data-action="save-explanation" data-product="${actionValue(producto)}" data-week="${actionValue(semana)}" style="width:100%;padding:8px;font-size:12px;font-weight:600;border-radius:6px;border:none;background:#1877F2;color:#fff;cursor:pointer">Agregar explicación</button>
      </div>`
      :'<div style="text-align:center;padding:12px;font-size:13px;color:#22c55e;font-weight:600">✓ Diferencia completamente explicada</div>'}
    </div>`;

  const old=document.getElementById('concSection');
  if(old) old.remove();
  document.getElementById('panelBody').appendChild(concSection);
  document.getElementById('panelOverlay').style.display='block';
  document.getElementById('panel').style.display='block';
  document.getElementById('panel').classList.add('panel-enter');
}

async function guardarExplicacion(producto, semana){
  if(!canReconcile()){showNotice('Tu rol tiene acceso de solo lectura.','err');return;}
  const causa=document.getElementById('concCausa')?.value;
  const cantStr=document.getElementById('concCantidad')?.value;
  const comentario=document.getElementById('concComentario')?.value||'';
  const errEl=document.getElementById('concError');
  if(errEl) errEl.style.display='none';
  if(!causa){if(errEl){errEl.textContent='Seleccioná una causa.';errEl.style.display='block';}return;}
  const cant=parseFloat(cantStr);
  if(!cant||cant<=0){if(errEl){errEl.textContent='Ingresá una cantidad válida.';errEl.style.display='block';}return;}
  const prod=currentData.find(d=>d.producto===producto);
  if(!prod) return;
  // FIX 1: Use real semana name, not 'actual'
  const realSemana=semana==='actual'?(currentSemana||'actual'):semana;
  const key=getConcKey(producto,realSemana);
  if(!conciliaciones[key]) conciliaciones[key]={estado:'PENDIENTE',explicaciones:[]};
  const conc=conciliaciones[key];
  // FIX 2: desvAbs with proper fallback
  const desvAbs=Math.abs(prod.desv)||Math.abs(prod.cantTeo-prod.cantReal);
  const explicado=conc.explicaciones.reduce((s,e)=>s+e.cantidad,0);
  const pendiente=Math.max(0,desvAbs-explicado);
  const cantR=Math.round(cant*100)/100;
  const pendienteR=Math.round(pendiente*100)/100;
  if(cantR>pendienteR+0.01){
    if(errEl){errEl.textContent=`No podés explicar más de ${pendienteR.toFixed(2)} ${prod.unidad||'u'}.`;errEl.style.display='block';}
    return;
  }
  const exp={
    id:(crypto.randomUUID?crypto.randomUUID():'conc-'+Date.now()+'-'+Math.random().toString(16).slice(2)),
    causa,cantidad:cantR,unidad:prod.unidad||'',comentario,fecha:new Date().toISOString()
  };
  conc.explicaciones.push(exp);
  const nuevoExplicado=conc.explicaciones.reduce((s,e)=>s+e.cantidad,0);
  const nuevoPendiente=Math.max(0,desvAbs-nuevoExplicado);
  conc.estado=nuevoPendiente<=0.01?'CONCILIADA':nuevoExplicado>0?'PARCIAL':'PENDIENTE';
  saveConciliaciones();
  try{
    await addExpToDatabase(realSemana, producto, exp);
    await refreshPeriodMetrics(realSemana);
    showNotice('Explicación guardada en la base de datos.','ok');
  }catch(e){
    // Revertir la interfaz si la base de datos no confirmó el guardado.
    conc.explicaciones=conc.explicaciones.filter(item=>item.id!==exp.id);
    const rollbackTotal=conc.explicaciones.reduce((s,e)=>s+e.cantidad,0);
    conc.estado=rollbackTotal>0?'PARCIAL':'PENDIENTE';
    saveConciliaciones();
    showNotice('No se guardó la explicación: '+e.message,'err');
  }
  if(currentData.length){
    renderGauge(resolveHealthScore(currentData));
    renderKPIs(currentData);
    renderTop5(currentData);
    renderAlertas(currentData);
    renderDetail(currentData);
  }
  const panelNameEl=document.getElementById('panelName');
  if(panelNameEl&&panelNameEl.textContent===producto) openPanel(producto);
  abrirConciliacion(producto,realSemana);
}


async function borrarExplicacion(producto, semana, idx){
  if(!canReconcile()){showNotice('Tu rol tiene acceso de solo lectura.','err');return;}
  const key=getConcKey(producto,semana);
  if(!conciliaciones[key]) return;
  const removedExp=conciliaciones[key].explicaciones.splice(idx,1)[0];
  // Recalculate estado
  const prod=currentData.find(d=>d.producto===producto);
  if(prod){
    const desvAbs=Math.abs(prod.desv)||Math.abs(prod.cantTeo-prod.cantReal);
    const expCant=conciliaciones[key].explicaciones.reduce((s,e)=>s+e.cantidad,0);
    const pendiente=Math.max(0,desvAbs-expCant);
    conciliaciones[key].estado=pendiente<=0.01?'CONCILIADA':expCant>0?'PARCIAL':'PENDIENTE';
  }
  saveConciliaciones();
  try{
    await delExpFromDatabase(semana, producto, removedExp);
    await refreshPeriodMetrics(semana);
    showNotice('Explicación eliminada de la base de datos.','ok');
  }catch(e){
    // Restaurar en su posición si la base de datos no confirmó la eliminación.
    conciliaciones[key].explicaciones.splice(idx,0,removedExp);
    if(prod){
      const desvAbs=Math.abs(prod.desv)||Math.abs(prod.cantTeo-prod.cantReal);
      const expCant=conciliaciones[key].explicaciones.reduce((s,item)=>s+item.cantidad,0);
      conciliaciones[key].estado=Math.max(0,desvAbs-expCant)<=0.01?'CONCILIADA':'PARCIAL';
    }
    saveConciliaciones();
    showNotice('No se eliminó la explicación: '+e.message,'err');
  }
  if(currentData.length){
    renderGauge(resolveHealthScore(currentData));
    renderKPIs(currentData);
    renderTop5(currentData);
    renderAlertas(currentData);
    renderDetail(currentData);
  }
  abrirConciliacion(producto,semana);
}

// ── Helpers de conciliación ────────────────────────────────────
function concKey(producto){ return producto+'||'+(currentSemana||'actual'); }

function getConcResumen(data){
  // Devuelve resumen de conciliaciones para el dataset actual
  const pendientes=[], parciales=[], conciliadas=[];
  data.forEach(d=>{
    if(d.estado==='COINCIDE') return;
    const key=concKey(d.producto);
    const conc=conciliaciones[key]||{estado:'PENDIENTE',explicaciones:[]};
    if(conc.estado==='CONCILIADA') conciliadas.push(d);
    else if(conc.estado==='PARCIAL') parciales.push(d);
    else pendientes.push(d);
  });
  return {pendientes, parciales, conciliadas};
}

function getImpactoConc(data){
  // Calcula impacto sin explicar vs explicado
  let sinExplicar=0, explicado=0;
  data.forEach(d=>{
    if(d.estado==='COINCIDE') return;
    const key=concKey(d.producto);
    const conc=conciliaciones[key]||{estado:'PENDIENTE',explicaciones:[]};
    const desvAbs=Math.abs(d.desv)||Math.abs(d.cantTeo-d.cantReal);
    const expCant=conc.explicaciones.reduce((s,e)=>s+e.cantidad,0);
    const pctExp=desvAbs>0?Math.min(1,expCant/desvAbs):0;
    explicado+=d.impacto*pctExp;
    sinExplicar+=d.impacto*(1-pctExp);
  });
  return {sinExplicar, explicado};
}

// ── Autenticación Supabase (Fase 2) ───────────────────────────
const INITIAL_AUTH_FLOW_TYPE=new URLSearchParams(location.hash.replace(/^#/,''))?.get('type')||'';
const SUPABASE_URL='https://htuearldqvzqohoxwmdp.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_KZKbJob8_QwdWs3VUPVKgw_6IVK0LQV';
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
let authenticatedUser=null;
let passwordRecoveryMode=INITIAL_AUTH_FLOW_TYPE==='invite'||INITIAL_AUTH_FLOW_TYPE==='recovery';
let pendingMfaFactorId='';

function hasRole(...roles){
  return roles.some(role=>authenticatedUser?.roles?.includes(role));
}

function canViewInventory(){return hasRole('ADMINISTRADOR','DIRECCION','OBRADOR');}
function canManageInventory(){return hasRole('ADMINISTRADOR','OBRADOR');}
function canReconcile(){return hasRole('ADMINISTRADOR','OBRADOR');}

function applyRoleUi(){
  const mayView=canViewInventory(),mayWrite=canManageInventory();
  document.querySelectorAll('[data-write-action]').forEach(el=>el.style.display=mayWrite?'':'none');
  document.querySelectorAll('#mainNav .nav-tab').forEach(el=>el.style.display=mayView?'':'none');
  document.getElementById('roleDenied').style.display=mayView?'none':'block';
  document.getElementById('landingSection').style.display=mayView?'':'none';
  document.getElementById('adminUsersCard').hidden=!hasRole('ADMINISTRADOR');
  if(!mayView) document.getElementById('mainNav').style.display='none';
}

function adminUserMessage(message,type=''){
  const element=document.getElementById('adminUserMessage');
  element.textContent=message;
  element.className=`admin-user-message ${type}`.trim();
}

async function inviteAdminUser(event){
  event.preventDefault();
  const form=event.currentTarget;
  adminUserMessage('');
  if(!hasRole('ADMINISTRADOR')){adminUserMessage('No tenés permisos para administrar usuarios.','err');return;}
  const button=document.getElementById('adminUserSubmit');
  button.disabled=true;button.textContent='Enviando…';
  try{
    const {data:assurance,error:assuranceError}=await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if(assuranceError) throw assuranceError;
    if(assurance.currentLevel!=='aal2'){
      await requireAdminMfa({roles:authenticatedUser.roles});
      adminUserMessage('Verificá Microsoft Authenticator y luego volvé a enviar la invitación.','err');
      return;
    }
    const {data:sessionData,error:sessionError}=await supabaseClient.auth.getSession();
    if(sessionError||!sessionData.session) throw new Error('SESSION_EXPIRED');
    const response=await fetch(`${SUPABASE_URL}/functions/v1/admin-users`,{
      method:'POST',
      headers:{
        apikey:SUPABASE_PUBLISHABLE_KEY,
        Authorization:`Bearer ${sessionData.session.access_token}`,
        'content-type':'application/json'
      },
      body:JSON.stringify({
        displayName:document.getElementById('adminUserName').value.trim(),
        email:document.getElementById('adminUserEmail').value.trim().toLowerCase(),
        role:document.getElementById('adminUserRole').value
      })
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data?.error||`HTTP_${response.status}`);
    if(!data?.ok) throw new Error(data?.error||'INVITE_FAILED');
    form.reset();
    adminUserMessage('Invitación enviada y rol asignado correctamente.','ok');
  }catch(error){
    const messages={
      MFA_ADMIN_REQUIRED:'Volvé a verificar Microsoft Authenticator para administrar usuarios.',
      SESSION_EXPIRED:'La sesión venció. Volvé a ingresar antes de crear usuarios.',
      INVALID_INPUT:'Revisá el nombre, el email y el rol.',
      EMAIL_RATE_LIMIT:'Supabase alcanzó temporalmente el límite de correos. Configuraremos SMTP propio antes de operar invitaciones.',
      EMAIL_ALREADY_EXISTS:'Ese email ya tiene una cuenta. Podés asignarle el rol desde la gestión de usuarios existentes.',
      INVITE_FAILED:'No se pudo enviar la invitación. Verificá si el email ya existe.',
      INVITED_WITHOUT_ROLE:'La invitación fue enviada, pero el rol no pudo asignarse. Revisalo en Supabase.'
    };
    adminUserMessage(messages[error?.message]||'No se pudo crear el usuario. Reintentá en unos segundos.','err');
    console.error('Admin user invitation failed',{message:error?.message});
  }finally{button.disabled=false;button.textContent='Enviar invitación';}
}

function authMessage(message){
  const el=document.getElementById('authError');
  el.textContent=message||'';el.style.display=message?'block':'none';
}

function passwordResetMessage(message){
  const el=document.getElementById('passwordResetError');
  el.textContent=message||'';el.style.display=message?'block':'none';
}

function mfaMessage(message){
  const el=document.getElementById('mfaError');
  el.textContent=message||'';el.style.display=message?'block':'none';
}

function showOnlyAuthForm(formId){
  for(const id of ['authForm','passwordResetForm','mfaForm']) document.getElementById(id).hidden=id!==formId;
  document.getElementById('authGate').classList.remove('hidden');
}

function showPasswordReset(){
  passwordRecoveryMode=true;
  showOnlyAuthForm('passwordResetForm');
  passwordResetMessage('');
}

async function requireAdminMfa(access){
  if(!access.roles.includes('ADMINISTRADOR')) return true;
  const {data:assurance,error:assuranceError}=await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if(assuranceError) throw assuranceError;
  if(assurance.currentLevel==='aal2') return true;

  let factor;
  const {data:factors,error:factorsError}=await supabaseClient.auth.mfa.listFactors();
  if(factorsError) throw factorsError;
  factor=(factors.totp||[]).find(item=>item.status==='verified');
  const setup=document.getElementById('mfaSetup');
  if(factor){
    setup.hidden=true;
    document.getElementById('mfaTitle').textContent='Verificar identidad';
    document.getElementById('mfaDescription').textContent='Ingresá el código actual de Microsoft Authenticator para continuar como administrador.';
  }else{
    for(const staleFactor of (factors.totp||[]).filter(item=>item.status!=='verified')){
      await supabaseClient.auth.mfa.unenroll({factorId:staleFactor.id}).catch(()=>{});
    }
    const {data:enrollment,error:enrollError}=await supabaseClient.auth.mfa.enroll({
      factorType:'totp',
      friendlyName:`Shoronpo admin ${Date.now()}`
    });
    if(enrollError) throw enrollError;
    factor=enrollment;
    setup.hidden=false;
    document.getElementById('mfaTitle').textContent='Proteger cuenta administradora';
    document.getElementById('mfaDescription').textContent='Escaneá el código con Microsoft Authenticator y escribí el código de seis dígitos.';
    document.getElementById('mfaQr').src=enrollment.totp.qr_code;
    document.getElementById('mfaSecret').textContent=enrollment.totp.secret;
  }
  pendingMfaFactorId=factor.id;
  document.getElementById('mfaCode').value='';
  mfaMessage('');
  showOnlyAuthForm('mfaForm');
  return false;
}

const AUTHORIZATION_RETRY_DELAYS_MS=[0,350,900];

function isTransientAuthorizationError(error){
  const status=Number(error?.status||0);
  const message=String(error?.message||'').toLowerCase();
  return !status||status===408||status===429||status>=500||message.includes('fetch')||message.includes('network')||message.includes('timeout');
}

async function authorizationQuery(label,queryFactory){
  let lastError=null;
  for(let attempt=0;attempt<AUTHORIZATION_RETRY_DELAYS_MS.length;attempt++){
    const delay=AUTHORIZATION_RETRY_DELAYS_MS[attempt];
    if(delay) await new Promise(resolve=>setTimeout(resolve,delay));
    const result=await queryFactory();
    if(!result.error) return result.data;
    lastError=result.error;
    if(!isTransientAuthorizationError(lastError)) break;
  }
  console.error(`Authorization query failed: ${label}`,{
    code:lastError?.code,
    status:lastError?.status,
    message:lastError?.message
  });
  const error=new Error('No pudimos cargar tus permisos. Reintentá en unos segundos.');
  error.name='AuthorizationLoadError';
  error.cause=lastError;
  throw error;
}

async function loadAuthorization(user){
  const [profile,roleRows,locationRows]=await Promise.all([
    authorizationQuery('profile',()=>supabaseClient.from('profiles').select('display_name,is_active').eq('user_id',user.id).single()),
    authorizationQuery('roles',()=>supabaseClient.from('user_roles').select('roles!inner(code)').eq('user_id',user.id)),
    authorizationQuery('locations',()=>supabaseClient.from('locations').select('id,code,name,type,is_active').order('code'))
  ]);
  if(!profile?.is_active) throw new Error('Tu usuario está desactivado.');
  const roles=(roleRows||[]).map(row=>row.roles?.code).filter(Boolean);
  if(!roles.length) throw new Error('Tu usuario no tiene un rol asignado.');
  return {profile,roles,locations:locationRows||[]};
}

async function activateSession(session){
  if(!session?.user){document.getElementById('authGate').classList.remove('hidden');return false;}
  if(session.user.user_metadata?.must_set_password===true){showPasswordReset();return false;}
  const access=await loadAuthorization(session.user);
  if(!(await requireAdminMfa(access))) return false;
  authenticatedUser={...session.user,...access};
  document.getElementById('authIdentity').textContent=access.profile.display_name||session.user.email;
  document.getElementById('authRole').textContent=access.roles.join(' · ');
  document.getElementById('authUser').classList.add('show');
  document.getElementById('authGate').classList.add('hidden');
  applyRoleUi();
  await testConnection();
  return true;
}

document.getElementById('authForm').addEventListener('submit',async event=>{
  event.preventDefault();authMessage('');
  const button=document.getElementById('authSubmit');button.disabled=true;button.textContent='Validando…';
  try{
    const {data,error}=await supabaseClient.auth.signInWithPassword({
      email:document.getElementById('authEmail').value.trim(),
      password:document.getElementById('authPassword').value
    });
    if(error) throw error;
    await activateSession(data.session);
    document.getElementById('authPassword').value='';
  }catch(error){
    if(error?.name!=='AuthorizationLoadError') await supabaseClient.auth.signOut().catch(()=>{});
    authMessage(error?.message==='Invalid login credentials'?'Email o contraseña incorrectos.':(error?.message||'No se pudo iniciar sesión.'));
  }finally{button.disabled=false;button.textContent='Ingresar';}
});

document.getElementById('passwordResetForm').addEventListener('submit',async event=>{
  event.preventDefault();passwordResetMessage('');
  const password=document.getElementById('newPassword').value;
  const confirmation=document.getElementById('confirmPassword').value;
  if(password.length<12){passwordResetMessage('La contraseña debe tener al menos 12 caracteres.');return;}
  if(password!==confirmation){passwordResetMessage('Las contraseñas no coinciden.');return;}
  const button=document.getElementById('passwordResetSubmit');button.disabled=true;button.textContent='Guardando…';
  try{
    const {error}=await supabaseClient.auth.updateUser({password,data:{must_set_password:false}});
    if(error) throw error;
    passwordRecoveryMode=false;
    document.getElementById('newPassword').value='';
    document.getElementById('confirmPassword').value='';
    history.replaceState({},document.title,location.pathname);
    const {data:{session}}=await supabaseClient.auth.getSession();
    if(!session) throw new Error('La contraseña se actualizó. Iniciá sesión nuevamente.');
    await activateSession(session);
    document.getElementById('passwordResetForm').hidden=true;
    document.getElementById('authForm').hidden=false;
  }catch(error){passwordResetMessage(error?.message||'No se pudo actualizar la contraseña.');}
  finally{button.disabled=false;button.textContent='Guardar contraseña';}
});

document.getElementById('mfaForm').addEventListener('submit',async event=>{
  event.preventDefault();mfaMessage('');
  const code=document.getElementById('mfaCode').value.trim();
  if(!/^\d{6}$/.test(code)){mfaMessage('Ingresá el código de seis dígitos.');return;}
  const button=document.getElementById('mfaSubmit');button.disabled=true;button.textContent='Verificando…';
  try{
    const {error}=await supabaseClient.auth.mfa.challengeAndVerify({factorId:pendingMfaFactorId,code});
    if(error) throw error;
    pendingMfaFactorId='';
    const {data:{session}}=await supabaseClient.auth.getSession();
    if(!session) throw new Error('La sesión expiró. Iniciá sesión nuevamente.');
    await activateSession(session);
  }catch(error){
    mfaMessage(error?.message||'El código no pudo verificarse.');
  }finally{button.disabled=false;button.textContent='Verificar y continuar';}
});

supabaseClient.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'||INITIAL_AUTH_FLOW_TYPE==='invite'||session?.user?.user_metadata?.must_set_password===true) showPasswordReset();
  if(event==='SIGNED_OUT'&&!passwordRecoveryMode){
    showOnlyAuthForm('authForm');
  }
});

async function logout(){
  await supabaseClient.auth.signOut();authenticatedUser=null;
  document.getElementById('authUser').classList.remove('show');
  document.getElementById('authGate').classList.remove('hidden');
}

async function initializeApp(){
  try{
    const hashParams=new URLSearchParams(location.hash.replace(/^#/,''));
    if(hashParams.get('error')){
      const description=hashParams.get('error_description')?.replace(/\+/g,' ');
      authMessage(description==='Email link is invalid or has expired'
        ?'El enlace venció o ya fue utilizado. Solicitá uno nuevo desde Supabase.'
        :(description||'El enlace de acceso no es válido.'));
      history.replaceState({},document.title,location.pathname);
    }
    const {data:{session}}=await supabaseClient.auth.getSession();
    if(session&&!passwordRecoveryMode) await activateSession(session);
  }catch(error){
    if(error?.name!=='AuthorizationLoadError') await supabaseClient.auth.signOut().catch(()=>{});
    authMessage(error?.message||'No se pudo validar la sesión.');
  }
}


function decodeActionValue(value){
  try{return decodeURIComponent(value||'');}catch{return '';}
}

document.addEventListener('click',event=>{
  const control=event.target.closest('[data-action]');
  if(!control) return;
  const action=control.dataset.action;
  const product=decodeActionValue(control.dataset.product);
  const week=control.dataset.week==='current'?(currentSemana||'actual'):decodeActionValue(control.dataset.week);
  if(action==='retry-connection') retryConnection();
  else if(action==='logout') logout();
  else if(action==='show-password-reset') showPasswordReset();
  else if(action==='cancel-mfa') logout();
  else if(action==='show-view') showView(control.dataset.view,control);
  else if(action==='choose-file') document.getElementById('fileInput').click();
  else if(action==='history-scroll') histScroll(Number(control.dataset.direction));
  else if(action==='reset-dashboard') resetDashboard();
  else if(action==='close-week') cerrarQuincena();
  else if(action==='set-filter') setFilter(control.dataset.filter,control);
  else if(action==='sort-table') sortTable(control.dataset.column);
  else if(action==='refresh-history') fetchHistorico().then(()=>{renderGestion();showNotice('Histórico actualizado.','ok')}).catch(error=>showNotice(error.message,'err'));
  else if(action==='compare') ejecutarComparacion();
  else if(action==='refresh-system') renderSystemStatus();
  else if(action==='close-panel') closePanel();
  else if(action==='open-panel') openPanel(product);
  else if(action==='panel-nav') panelNav(product,Number(control.dataset.direction));
  else if(action==='open-reconciliation') abrirConciliacion(product,week);
  else if(action==='delete-explanation') borrarExplicacion(product,week,Number(control.dataset.index));
  else if(action==='save-explanation') guardarExplicacion(product,week);
});

document.getElementById('semanaSelector').addEventListener('change',event=>cambiarSemanaVista(event.target.value));
document.getElementById('detailSearch').addEventListener('input',event=>searchDetail(event.target.value));
document.getElementById('productSearch').addEventListener('input',event=>searchProductos(event.target.value));
document.getElementById('adminUserForm').addEventListener('submit',inviteAdminUser);

initializeApp();
