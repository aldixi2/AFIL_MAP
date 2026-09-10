// Dashboard de Afiliados — USPP Satipo
let DATA = [], MANIFEST = {}, MAPA = null, MARCADORES = new Map(), CHARTS = {};
const $ = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('es-PE').format(Number(n) || 0);
const pct = (n,t) => t ? (Number(n)*100/Number(t)) : 0;
const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

const PALETTE = ['#586fb4','#55b7df','#a8cb3b','#f5a444','#dc3388','#7d63bb','#6dbd8a','#9aa5b9','#ef7b72','#8a76c4'];
const AGE_LABELS = {'1.NIÑO':'0 a 11 años','2.ADOLESCENTE':'12 a 17 años','3.JOVEN':'18 a 29 años','4.ADULTO':'30 a 59 años','5.ADULTO MAYOR':'60 a más'};

function agregarCapaBaseConRespaldo(mapa){
  const principal=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors',maxZoom:19});
  principal.addTo(mapa);
}
function iconoPara(item){
  let color='#4a90cc';
  if(item.es_punto_digitacion) color='#f5a444';
  else if(item.total_afiliados>3000) color='#dc3388';
  const size=item.es_punto_digitacion?19:Math.max(9,Math.min(25,8+Math.sqrt(item.total_afiliados)/6));
  const cls=item.es_punto_digitacion?'marker-punto':'marker-normal';
  return L.divIcon({className:'',html:`<div class="${cls}" style="width:${size}px;height:${size}px;background:${color}"></div>`,iconSize:[size,size],iconAnchor:[size/2,size/2]});
}
function destruirCharts(){Object.values(CHARTS).forEach(c=>c?.destroy());CHARTS={};}
function datosFiltrados(){
  const d=$('filtroDistrito').value;
  return d==='Todos'?DATA:DATA.filter(x=>x.distrito===d);
}
function aggregate(arr,key){
  const out={}; arr.forEach(x=>Object.entries(x[key]||{}).forEach(([k,v])=>out[k]=(out[k]||0)+Number(v||0))); return out;
}
function ordenarObjeto(obj,descending=true){
  return Object.entries(obj).sort((a,b)=>descending?b[1]-a[1]:a[0].localeCompare(b[0],'es')).reduce((o,[k,v])=>(o[k]=v,o),{});
}
function chartBase(type,id,labels,data,extra={}){
  const ctx=$(id); if(!ctx)return null;
  return new Chart(ctx,{type,data:{labels,datasets:[{data,...extra}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.label}: ${fmt(c.raw)} (${pct(c.raw,data.reduce((a,b)=>a+Number(b||0),0)).toFixed(1)}%)`}}},...extra.options}});
}
function renderDashboard(){
  const arr=datosFiltrados(), total=arr.reduce((s,x)=>s+Number(x.total_afiliados||0),0);
  $('kpiTotal').textContent=fmt(total); $('totalSub').textContent=$('filtroDistrito').value==='Todos'?'Provincia de Satipo':'Distrito de '+$('filtroDistrito').value;
  const sx=aggregate(arr,'sexo'); $('sexF').textContent=`${fmt(sx.Femenino||0)} (${pct(sx.Femenino,total).toFixed(1)}%)`; $('sexM').textContent=`${fmt(sx.Masculino||0)} (${pct(sx.Masculino,total).toFixed(1)}%)`;
  destruirCharts();
  CHARTS.sexo=new Chart($('chartSexo'),{type:'doughnut',data:{labels:['Mujer','Hombre'],datasets:[{data:[sx.Femenino||0,sx.Masculino||0],backgroundColor:['#dc3388','#586fb4'],borderWidth:0}]},options:{cutout:'58%',plugins:{legend:{position:'bottom',labels:{font:{size:9},boxWidth:8,padding:8}},tooltip:{callbacks:{label:c=>`${c.label}: ${fmt(c.raw)} (${pct(c.raw,total).toFixed(1)}%)`}}}}});

  const age=aggregate(arr,'grupo_etareo'), ageKeys=Object.keys(AGE_LABELS); CHARTS.edad=new Chart($('chartEdad'),{type:'bar',data:{labels:ageKeys.map(k=>AGE_LABELS[k]),datasets:[{data:ageKeys.map(k=>age[k]||0),backgroundColor:PALETTE,borderRadius:3}]},options:{indexAxis:'y',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${fmt(c.raw)} (${pct(c.raw,total).toFixed(1)}%)`}}},scales:{x:{ticks:{font:{size:9},callback:v=>fmt(v)},grid:{color:'#edf0f6'}},y:{ticks:{font:{size:9}},grid:{display:false}}}}});

  const popObj=ordenarObjeto(aggregate(arr,'grupo_poblacional')); const popEntries=Object.entries(popObj); const topPop=popEntries.slice(0,7), otherPop=popEntries.slice(7).reduce((s,[,v])=>s+v,0); if(otherPop)topPop.push(['Otros',otherPop]);
  const popLabels=topPop.map(([k])=>k.replace(/\s*\(.*?\)/g,'').replace(/\s+/g,' ').trim()); const popVals=topPop.map(([,v])=>v);
  CHARTS.pop=new Chart($('chartPoblacion'),{type:'bar',data:{labels:popLabels,datasets:[{data:popVals,backgroundColor:PALETTE,borderRadius:4}]},options:{indexAxis:'y',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${fmt(c.raw)} (${pct(c.raw,total).toFixed(1)}%)`}}},scales:{x:{ticks:{font:{size:9},callback:v=>fmt(v)},grid:{color:'#edf0f6'}},y:{ticks:{font:{size:9}},grid:{display:false}}}}});
  CHARTS.popMini=new Chart($('chartPoblacionMini'),{type:'bar',data:{labels:topPop.slice(0,5).map(([k])=>k.replace(/\s*\(.*?\)/g,'').slice(0,19)),datasets:[{data:topPop.slice(0,5).map(([,v])=>v),backgroundColor:PALETTE,borderRadius:3}]},options:{indexAxis:'y',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmt(c.raw)}}},scales:{x:{display:false},y:{ticks:{font:{size:8}},grid:{display:false}}}}});

  const dist={}; arr.forEach(x=>dist[x.distrito]=(dist[x.distrito]||0)+Number(x.total_afiliados||0)); const distObj=ordenarObjeto(dist); const de=Object.entries(distObj); const dl=de.map(([k])=>k), dv=de.map(([,v])=>v);
  CHARTS.dist=new Chart($('chartDistrito'),{type:'bar',data:{labels:dl,datasets:[{data:dv,backgroundColor:PALETTE,borderRadius:4}]},options:{indexAxis:'y',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${fmt(c.raw)} (${pct(c.raw,total).toFixed(1)}%)`}}},scales:{x:{ticks:{font:{size:9},callback:v=>fmt(v)},grid:{color:'#edf0f6'}},y:{ticks:{font:{size:9}},grid:{display:false}}}}});
  CHARTS.distMini=new Chart($('chartDistritoMini'),{type:'bar',data:{labels:de.slice(0,6).map(([k])=>k),datasets:[{data:de.slice(0,6).map(([,v])=>v),backgroundColor:PALETTE,borderRadius:3}]},options:{indexAxis:'y',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmt(c.raw)}}},scales:{x:{display:false},y:{ticks:{font:{size:8}},grid:{display:false}}}}});

  const years=aggregate(arr,'por_anio_afil'), yk=Object.keys(years).sort((a,b)=>Number(a)-Number(b)); CHARTS.anio=new Chart($('chartAnio'),{type:'line',data:{labels:yk,datasets:[{data:yk.map(y=>years[y]),borderColor:'#586fb4',backgroundColor:'rgba(88,111,180,.12)',fill:true,tension:.28,pointRadius:2.5,pointBackgroundColor:'#586fb4'}]},options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmt(c.raw)}}},scales:{x:{ticks:{font:{size:9}},grid:{display:false}},y:{ticks:{font:{size:9},callback:v=>fmt(v)},grid:{color:'#edf0f6'}}}}});
}
function llenarDistritos(){
  const vals=[...new Set(DATA.map(x=>x.distrito).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  vals.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;$('filtroDistrito').appendChild(o)});
}
function renderDetalle(item){
  const btn=item.tiene_export?`<a href="exports/${encodeURIComponent(item.archivo_export)}" download>⬇ Excel</a>`:'';
  $('detalle').className='side-detail'; $('detalle').innerHTML=`<div class="side-name">${esc(item.nombre)}</div><div class="side-meta">${esc(item.distrito)} · ${esc(item.clasificacion)}${item.categoria?' · '+esc(item.categoria):''}</div><div class="side-total">${fmt(item.total_afiliados)} <span style="font-size:10px;font-family:var(--f);font-weight:500;color:var(--muted)">afiliados</span></div><div class="side-actions">${btn}<button onclick="cerrarDetalle()">Cerrar</button></div>`;
}
function cerrarDetalle(){$('detalle').className='side-detail empty';$('detalle').textContent='Selecciona un establecimiento en el mapa para ver el detalle.'}
window.cerrarDetalle=cerrarDetalle;
function construirMapa(){
  MAPA=L.map('mapa',{scrollWheelZoom:true}); agregarCapaBaseConRespaldo(MAPA);
  if(!DATA.length){MAPA.setView([-11.37,-74.36],9);return}
  MAPA.fitBounds(L.latLngBounds(DATA.map(x=>[x.lat,x.lng])),{padding:[22,22]});
  DATA.forEach(item=>{
    if(item.lat==null||item.lng==null)return;
    const m=L.marker([item.lat,item.lng],{icon:iconoPara(item)}).addTo(MAPA);
    m.bindPopup(`<div class="popup-name">${esc(item.nombre)}</div><div>${esc(item.distrito)}</div><div class="popup-total">${fmt(item.total_afiliados)}</div><div>afiliados</div>`);
    m.on('click',()=>renderDetalle(item)); MARCADORES.set(String(item.codigo_renaes),m);
  });
}
async function init(){
  try{
    const [rd,rm]=await Promise.all([fetch('data/resumen_establecimientos.json?ts='+Date.now()),fetch('data/manifest.json?ts='+Date.now())]);
    DATA=await rd.json(); MANIFEST=await rm.json();
    const corte=(MANIFEST.generado||'').slice(0,10); if(corte){const [y,m,d]=corte.split('-');$('opCorte').textContent=`${d}/${m}/${y}`;$('corteNota').textContent=`Información al ${d}/${m}/${y}`;}
    llenarDistritos(); construirMapa(); renderDashboard();
    $('filtroDistrito').addEventListener('change',renderDashboard);
    $('limpiarFiltros').addEventListener('click',()=>{$('filtroDistrito').value='Todos';renderDashboard();cerrarDetalle();});
  }catch(err){console.error(err);$('kpiTotal').textContent='Error';$('corteNota').textContent='No se pudo cargar la base consolidada.';}
}
init();
