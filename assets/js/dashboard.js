let DATA=[],MANIFEST={},MAPA=null,MARCADORES=new Map(),CHARTS={},SELECTED_CODE='Todos';
const $=id=>document.getElementById(id);
const fmt=n=>new Intl.NumberFormat('es-PE').format(Number(n)||0);
const pct=(n,t)=>t?Number(n)*100/Number(t):0;
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const COLORS={blue:'#5794cf',pink:'#ce3157',orange:'#efa62c',green:'#76b82a',navy:'#273444',purple:'#7967b3'};
const PALETTE=[COLORS.blue,COLORS.pink,COLORS.orange,COLORS.green,COLORS.purple,'#8aa0b8'];
const AGE_LABELS={'1.NIÑO':'0 a 11 años','2.ADOLESCENTE':'12 a 17 años','3.JOVEN':'18 a 29 años','4.ADULTO':'30 a 59 años','5.ADULTO MAYOR':'60 a más'};
const AGE_ICONS=[
`<span class="age-emoji" role="img" aria-label="Bebé">👶</span>`,
`<span class="age-emoji" role="img" aria-label="Niño">🧒</span>`,
`<span class="age-emoji" role="img" aria-label="Persona joven">🧑</span>`,
`<span class="age-emoji" role="img" aria-label="Adulto">👨</span>`,
`<span class="age-emoji" role="img" aria-label="Adulto mayor">👴</span>`
];
Chart.defaults.font.family='Arial,Helvetica,sans-serif';Chart.defaults.font.size=10;Chart.defaults.color='#5d6878';Chart.defaults.devicePixelRatio=Math.max(2,Math.min(3,window.devicePixelRatio||1));
const ageLabelsPlugin={id:'ageLabelsPlugin',afterDatasetsDraw(chart){const {ctx}=chart;chart.data.datasets.forEach((ds,i)=>{const meta=chart.getDatasetMeta(i);const el=meta.data[0];if(!el)return;const p=el.getProps(['x','y','base','height'],true);const left=Math.min(p.x,p.base),right=Math.max(p.x,p.base),w=Math.abs(p.x-p.base);if(w<42)return;const val=Number(ds.data[0]||0),total=currentTotal();const cx=left+w/2;ctx.save();ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='700 10px Arial';ctx.fillText(ds.label,cx,p.y-2);ctx.font='700 11px Arial';ctx.fillText(fmt(val),cx,p.y+11);ctx.font='700 9px Arial';ctx.fillText(pct(val,total).toFixed(1)+'%',cx,p.y+23);ctx.restore();});}};
function aggregate(arr,key){const o={};arr.forEach(x=>Object.entries(x[key]||{}).forEach(([k,v])=>o[k]=(o[k]||0)+Number(v||0)));return o}
function destroy(){Object.values(CHARTS).forEach(c=>c?.destroy());CHARTS={}}
function filtered(){
  const d=$('filtroDistrito').value;
  const e=$('filtroEstablecimiento').value;
  return DATA.filter(x=>(d==='Todos'||x.distrito===d)&&(e==='Todos'||String(x.codigo_renaes)===String(e)));
}
function short(s,n=28){s=String(s||'').replace(/\s*\(.*?\)/g,'').replace(/AFILIACION MASIVA DE OFICIO/i,'AFILIACIÓN MASIVA').replace(/AFILIACION PPDD/i,'AFILIACIÓN PPDD').replace(/ESCOLARES QALI WARMA.*/i,'ESCOLARES QALI WARMA').replace(/NIÑOS ENTRE 0 A 5 AÑOS.*/i,'NIÑOS 0–5 AÑOS').replace(/BENEFICIARIOS DE REPARACIONES EN SALUD/i,'REPARACIONES EN SALUD').replace(/PERSONAS INTERNAS INPE.*/i,'PERSONAS INTERNAS INPE').replace(/VULNERABILIDAD SANITARIA.*/i,'DISCAPACIDAD SEVERA').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1)+'…':s}
const valueLabelsPlugin={id:'valueLabelsPlugin',afterDatasetsDraw(chart){
 const {ctx}=chart; const ds=chart.data.datasets[0]; if(!ds)return; const meta=chart.getDatasetMeta(0);
 ctx.save();ctx.font='700 8px Arial';ctx.fillStyle='#52657f';ctx.textBaseline='middle';
 meta.data.forEach((el,i)=>{const v=Number(ds.data[i]||0); if(!v)return; const p=el.getProps(['x','y'],true); ctx.textAlign='left';ctx.fillText(fmt(v),p.x+5,p.y);});ctx.restore();
}};
function chartOpts(indexAxis='y'){
 return {responsive:true,maintainAspectRatio:false,animation:false,devicePixelRatio:2,indexAxis,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${fmt(c.raw)} (${pct(c.raw,currentTotal()).toFixed(1)}%)`}}},scales:{x:{ticks:{font:{size:9},callback:v=>fmt(v)},grid:{color:'#e7edf4'}},y:{ticks:{font:{size:9}},grid:{display:false}}}};
}
function currentTotal(){return filtered().reduce((s,x)=>s+Number(x.total_afiliados||0),0)}
function normalizeClasificacion(k){
 k=String(k||'').toLowerCase();
 if(k.includes('hospital')) return 'Hospital';
 if(k.includes('centro de salud') && k.includes('camas')) return 'Centro de Salud con camas';
 if(k.includes('centro de salud')) return 'Centro de Salud';
 if(k.includes('puesto de salud')) return 'Puesto de Salud';
 return 'Otros';
}

function renderAgeIcons(age,total){
 const keys=Object.keys(AGE_LABELS);
 $('ageIcons').innerHTML=keys.map((k,i)=>{const v=Number(age[k]||0);return `<div class="age-item" data-age="${k}" style="flex:${Math.max(v,1)}">${AGE_ICONS[i]}<div class="age-label">${AGE_LABELS[k]}</div><div class="age-pct">${fmt(v)} · ${pct(v,total).toFixed(1)}%</div></div>`}).join('');
 $('ageBar').innerHTML=keys.map((k,i)=>{const v=Number(age[k]||0),p=pct(v,total);return `<div class="age-segment" style="flex:${Math.max(v,1)}" data-age="${k}" title="${AGE_LABELS[k]}: ${fmt(v)} afiliados (${p.toFixed(1)}%)"><div class="inside"><b>${AGE_LABELS[k]}</b><strong>${fmt(v)}</strong><small>${p.toFixed(1)}%</small></div></div>`}).join('');
 $('ageBar').querySelectorAll('.age-segment').forEach(el=>el.addEventListener('mouseenter',()=>{const k=el.dataset.age;$('ageIcons').querySelectorAll('.age-item').forEach(x=>x.style.opacity=x.dataset.age===k?'1':'.55');el.style.filter='brightness(1.08)'}));
 $('ageBar').querySelectorAll('.age-segment').forEach(el=>el.addEventListener('mouseleave',()=>{$('ageIcons').querySelectorAll('.age-item').forEach(x=>x.style.opacity='1');el.style.filter=''}));
 $('ageIcons').querySelectorAll('.age-item').forEach(el=>el.addEventListener('mouseenter',()=>{const k=el.dataset.age;const seg=$('ageBar').querySelector(`[data-age="${CSS.escape(k)}"]`);if(seg){seg.style.filter='brightness(1.08)';seg.style.outline='2px solid rgba(39,52,68,.22)'}}));
 $('ageIcons').querySelectorAll('.age-item').forEach(el=>el.addEventListener('mouseleave',()=>{$('ageBar').querySelectorAll('.age-segment').forEach(x=>{x.style.filter='';x.style.outline=''})}));
}
function ageChart(){ return null; }
function animateNumber(el,target){
 const start=Number(el.dataset.value||0), duration=550, t0=performance.now(); el.dataset.value=target;
 function step(t){const p=Math.min(1,(t-t0)/duration),e=1-Math.pow(1-p,3);el.textContent=fmt(Math.round(start+(target-start)*e));if(p<1)requestAnimationFrame(step)}
 requestAnimationFrame(step);
}
function monthlyData(arr){
 const labels=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
 const altas=Array(12).fill(0);
 arr.forEach(x=>{const m=x.por_mes_afil_2026||{};for(let i=1;i<=12;i++)altas[i-1]+=Number(m[String(i)]||0)});
 const acumulado=[];let s=0;altas.forEach(v=>{s+=v;acumulado.push(s)});
 return {labels,altas,acumulado};
}
function renderMonthly(arr){
 const md=monthlyData(arr);
 const corteMonth=8;
 const labels=md.labels.slice(0,corteMonth), altas=md.altas.slice(0,corteMonth), acum=md.acumulado.slice(0,corteMonth);
 const idx=Math.max(0,Math.min(corteMonth-1,new Date().getMonth()));
 const totalMes=altas[idx]||0, totalAcum=acum[idx]||0;
 $('monthlyTotal').textContent=fmt(totalMes);$('monthlyAccum').textContent=fmt(totalAcum);
 const hasMonthly=altas.some(v=>v>0);
 $('chartMensual').style.display=hasMonthly?'block':'none';
 const holder=$('chartMensual').parentElement; let msg=holder.querySelector('.monthly-empty'); if(!hasMonthly){if(!msg){msg=document.createElement('div');msg.className='monthly-empty';holder.appendChild(msg)}msg.textContent='Los cortes mensuales se habilitan al ejecutar la consolidación con la columna mes_afil de la base SIS.'}else if(msg)msg.remove();
 if(CHARTS.mensual)CHARTS.mensual.destroy();
 CHARTS.mensual=new Chart($('chartMensual'),{type:'line',data:{labels,datasets:[
  {label:'Altas del mes',data:altas,borderColor:'#1881d4',backgroundColor:'rgba(24,129,212,.10)',fill:true,tension:.35,pointRadius:3,pointHoverRadius:6,borderWidth:2},
  {label:'Acumulado 2026',data:acum,borderColor:'#76b82a',backgroundColor:'transparent',tension:.35,pointRadius:3,pointHoverRadius:6,borderWidth:2}
 ]},options:{responsive:true,maintainAspectRatio:false,animation:false,devicePixelRatio:2,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmt(c.raw)}`}}},scales:{x:{ticks:{font:{size:8}} ,grid:{display:false}},y:{beginAtZero:true,ticks:{font:{size:8},callback:v=>fmt(v)},grid:{color:'#e7edf4'}}}}});
}
function render(){
 const arr=filtered(),total=arr.reduce((s,x)=>s+Number(x.total_afiliados||0),0);
 animateNumber($('kpiTotal'), total);
 const d=$('filtroDistrito').value,e=$('filtroEstablecimiento').value;
 $('totalSub').textContent=e!=='Todos'?esc(DATA.find(x=>String(x.codigo_renaes)===String(e))?.nombre||'Establecimiento seleccionado'):(d==='Todos'?'Red de Salud Satipo':'Distrito de '+d);
 $('corteNota').textContent=`Información al ${$('opCorte').textContent}`;
 const sx=aggregate(arr,'sexo');
 $('sexF').textContent=`${fmt(sx.Femenino||0)} (${pct(sx.Femenino,total).toFixed(1)}%)`;
 $('sexM').textContent=`${fmt(sx.Masculino||0)} (${pct(sx.Masculino,total).toFixed(1)}%)`;
 $('barF').style.width=`${pct(sx.Femenino||0,total).toFixed(1)}%`; $('barM').style.width=`${pct(sx.Masculino||0,total).toFixed(1)}%`;
 const age=aggregate(arr,'grupo_etareo');renderAgeIcons(age,total);destroy();
 CHARTS.sexo=new Chart($('chartSexo'),{type:'doughnut',data:{labels:['Femenino','Masculino'],datasets:[{data:[sx.Femenino||0,sx.Masculino||0],backgroundColor:[COLORS.pink,COLORS.blue],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,animation:false,devicePixelRatio:2,cutout:'62%',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.label}: ${fmt(c.raw)} (${pct(c.raw,total).toFixed(1)}%)`}}}}});
 ageChart(age,total);
 const dist={};arr.forEach(x=>dist[x.distrito]=(dist[x.distrito]||0)+Number(x.total_afiliados||0));let de=Object.entries(dist).sort((a,b)=>b[1]-a[1]).slice(0,8);
 CHARTS.dist=new Chart($('chartDistrito'),{type:'bar',data:{labels:de.map(([k])=>short(k,18)),datasets:[{data:de.map(([,v])=>v),backgroundColor:PALETTE,borderRadius:6,barThickness:18}]},options:{...chartOpts('y'),onClick:(evt,els)=>{if(els.length){const d=de[els[0].index]?.[0];if(d){$('filtroDistrito').value=d;fillEstablecimientos(d,'Todos');SELECTED_CODE='Todos';cerrarDetalleSinRender();render()}}}},plugins:[valueLabelsPlugin]});
 const pop=aggregate(arr,'grupo_poblacional');let po=Object.entries(pop).sort((a,b)=>b[1]-a[1]).slice(0,6);
 CHARTS.pop=new Chart($('chartPoblacion'),{type:'bar',data:{labels:po.map(([k])=>short(k,23)),datasets:[{data:po.map(([,v])=>v),backgroundColor:PALETTE,borderRadius:6,barThickness:17}]},options:chartOpts('y'),plugins:[valueLabelsPlugin]});
 renderMonthly(arr);
 updateMarkerSelection();
}
function icono(item){let c=COLORS.blue;if(item.es_punto_digitacion)c=COLORS.orange;else if(Number(item.total_afiliados)>3000)c=COLORS.pink;const s=item.es_punto_digitacion?18:Math.max(9,Math.min(24,8+Math.sqrt(Number(item.total_afiliados)||0)/6));return L.divIcon({className:'',html:`<div class="map-dot" style="width:${s}px;height:${s}px;background:${c}"></div>`,iconSize:[s,s],iconAnchor:[s/2,s/2]})}
function detalle(item){const dl=item.tiene_export?`<a href="exports/${encodeURIComponent(item.archivo_export)}" download>⬇ Excel</a>`:'';$('detalle').className='detail';$('detalle').innerHTML=`<div class="dname">${esc(item.nombre)}</div><div class="dmeta">${esc(item.distrito)} · ${esc(item.clasificacion)}${item.categoria?' · '+esc(item.categoria):''}</div><div class="dtotal">${fmt(item.total_afiliados)} <small>afiliados</small></div><div class="actions">${dl}<button onclick="cerrarDetalle()">Cerrar</button></div>`}
function cerrarDetalle(){SELECTED_CODE='Todos';$('filtroEstablecimiento').value='Todos';$('detalle').className='detail empty';$('detalle').textContent='Selecciona un establecimiento en el mapa para ver el detalle y descargar su padrón.';updateMarkerSelection();renderWithoutMapLoop()}window.cerrarDetalle=cerrarDetalle;
function renderWithoutMapLoop(){const old=window.__skipMarkerUpdate;window.__skipMarkerUpdate=true;render();window.__skipMarkerUpdate=old}
function selectEstablecimiento(code){
 SELECTED_CODE=String(code);
 const item=DATA.find(x=>String(x.codigo_renaes)===String(code));
 if(!item)return;
 $('filtroDistrito').value=item.distrito||'Todos';fillEstablecimientos(item.distrito||'Todos',String(code));
 $('filtroEstablecimiento').value=String(code);
 detalle(item);render();
}
function updateMarkerSelection(){
 if(window.__skipMarkerUpdate)return;
 MARCADORES.forEach((m,code)=>{const selected=String(code)===String(SELECTED_CODE);const item=DATA.find(x=>String(x.codigo_renaes)===String(code));if(item)m.setIcon(selected?iconoSeleccionado(item):icono(item));});
}
function iconoSeleccionado(item){const base=icono(item);const el=L.divIcon({className:'',html:`<div class="map-dot selected"></div>`,iconSize:[24,24],iconAnchor:[12,12]});return el}
function mapa(){
 MAPA=L.map('mapa',{scrollWheelZoom:true,zoomControl:true});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors',maxZoom:19}).addTo(MAPA);
 const valid=DATA.filter(x=>x.lat!=null&&x.lng!=null);if(valid.length)MAPA.fitBounds(L.latLngBounds(valid.map(x=>[x.lat,x.lng])),{padding:[18,18]});else MAPA.setView([-11.37,-74.36],9);
 valid.forEach(item=>{const m=L.marker([item.lat,item.lng],{icon:icono(item)}).addTo(MAPA);m.bindTooltip(`<b>${esc(item.nombre)}</b><br>${fmt(item.total_afiliados)} afiliados`,{direction:'top',offset:[0,-8],opacity:.95});m.bindPopup(`<div class="popup-name">${esc(item.nombre)}</div><div>${esc(item.distrito)} · ${esc(item.clasificacion)}</div><div class="popup-total">${fmt(item.total_afiliados)}</div><div>afiliados</div>`);m.on('click',()=>selectEstablecimiento(item.codigo_renaes));MARCADORES.set(String(item.codigo_renaes),m)})
}
function fill(){
 const sel=$('filtroDistrito'),current=sel.value;sel.innerHTML='<option value="Todos">Todos</option>';
 [...new Set(DATA.map(x=>x.distrito).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')).forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;sel.appendChild(o)});
 sel.value=[...sel.options].some(o=>o.value===current)?current:'Todos';fillEstablecimientos(sel.value,$('filtroEstablecimiento')?.value||'Todos');
}
function fillEstablecimientos(distrito='Todos',keep='Todos'){
 const sel=$('filtroEstablecimiento');if(!sel)return;const old=keep||sel.value;sel.innerHTML='<option value="Todos">Todos los establecimientos</option>';
 DATA.filter(x=>distrito==='Todos'||x.distrito===distrito).sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre),'es')).forEach(x=>{const o=document.createElement('option');o.value=x.codigo_renaes;o.textContent=x.nombre;sel.appendChild(o)});
 sel.value=[...sel.options].some(o=>String(o.value)===String(old))?old:'Todos';
}
async function init(){
 try{
  const [a,b]=await Promise.all([fetch('data/resumen_establecimientos.json?ts='+Date.now()),fetch('data/manifest.json?ts='+Date.now())]);DATA=await a.json();MANIFEST=await b.json();
  const corte=(MANIFEST.generado||'').slice(0,10);if(corte){const [y,m,d]=corte.split('-');$('opCorte').textContent=`${d}/${m}/${y}`;$('corteNota').textContent=`Información al ${d}/${m}/${y}`}
  fill();mapa();render();
  $('filtroDistrito').addEventListener('change',()=>{fillEstablecimientos($('filtroDistrito').value,'Todos');SELECTED_CODE='Todos';cerrarDetalleSinRender();render()});
  $('filtroEstablecimiento').addEventListener('change',()=>{const code=$('filtroEstablecimiento').value;SELECTED_CODE=code;const item=DATA.find(x=>String(x.codigo_renaes)===String(code));if(item)detalle(item);else cerrarDetalleSinRender();render()});
  $('limpiarFiltros').addEventListener('click',()=>{$('filtroDistrito').value='Todos';fillEstablecimientos('Todos','Todos');SELECTED_CODE='Todos';cerrarDetalleSinRender();render()});
  window.addEventListener('resize',()=>Object.values(CHARTS).forEach(c=>c.resize()));
 }catch(e){console.error(e);$('kpiTotal').textContent='Error';$('corteNota').textContent='No se pudo cargar la base consolidada.'}
}
function cerrarDetalleSinRender(){$('detalle').className='detail empty';$('detalle').textContent='Selecciona un establecimiento en el mapa para ver el detalle y descargar su padrón.'}
init();
