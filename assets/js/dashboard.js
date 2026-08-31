// ============ Dashboard de Afiliados — USPP Satipo (uso interno) ============

let DATA = [];
let MANIFEST = {};
let MAPA = null;
let MARCADORES = new Map();
let ORDEN_ACTUAL = "afiliados";
let CHARTS = {};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmt = (n) => new Intl.NumberFormat("es-PE").format(n || 0);

/* ---- Capa base con respaldo automático (mismo patrón que el mapa público) ---- */
function agregarCapaBaseConRespaldo(mapa){
  const PRINCIPAL = { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    opciones: { attribution: '&copy; Esri, Maxar, Earthstar Geographics', maxZoom: 18 } };
  const ETIQUETAS = { url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    opciones: { maxZoom: 18, pane: "shadowPane" } };
  const RESPALDO = { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    opciones: { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 } };

  let fallos = 0, yaCambio = false;
  const capaPrincipal = L.tileLayer(PRINCIPAL.url, PRINCIPAL.opciones);
  const capaEtiquetas = L.tileLayer(ETIQUETAS.url, ETIQUETAS.opciones);
  capaPrincipal.on("tileerror", () => {
    fallos++;
    if (fallos >= 3 && !yaCambio){
      yaCambio = true;
      mapa.removeLayer(capaPrincipal); mapa.removeLayer(capaEtiquetas);
      L.tileLayer(RESPALDO.url, RESPALDO.opciones).addTo(mapa);
    }
  });
  capaPrincipal.addTo(mapa);
  capaEtiquetas.addTo(mapa);
}

function iconoPara(item){
  const esPunto = item.es_punto_digitacion;
  const sinPoblacion = item.total_afiliados === 0;
  let color = "#4A90CC";
  if (esPunto) color = "#E49C30";
  else if (sinPoblacion) color = "#8B8890";
  else if (item.total_afiliados > 3000) color = "#CC3054";

  const size = esPunto ? 20 : Math.max(10, Math.min(26, 8 + Math.sqrt(item.total_afiliados) / 6));
  const cls = esPunto ? "marker-punto" : "marker-normal";
  return L.divIcon({
    className: "", html: `<div class="${cls}" style="width:${size}px;height:${size}px;background:${color}"></div>`,
    iconSize: [size, size], iconAnchor: [size/2, size/2]
  });
}

async function init(){
  const [resD, resM] = await Promise.all([
    fetch("data/resumen_establecimientos.json?ts=" + Date.now()),
    fetch("data/manifest.json?ts=" + Date.now())
  ]);
  DATA = await resD.json();
  MANIFEST = await resM.json();

  $("fechaCorte").textContent = "Corte: " + (MANIFEST.generado || "—");
  $("kpiTotal").textContent = fmt(MANIFEST.total_afiliados);
  $("kpiEstabs").textContent = MANIFEST.establecimientos_con_afiliados + " / " + MANIFEST.total_establecimientos;
  $("kpiSinAdscripcion").textContent = (MANIFEST.establecimientos_sin_afiliados || []).length;
  $("kpiSinAdscripcionSub").textContent = (MANIFEST.establecimientos_sin_afiliados || []).join(", ") || "—";
  $("kpiPuntos").textContent = DATA.filter(d => d.es_punto_digitacion).length;

  MAPA = L.map("mapa", { scrollWheelZoom: true });
  agregarCapaBaseConRespaldo(MAPA);

  if (!DATA.length){
    MAPA.setView([-11.37, -74.36], 9); // centro aproximado de la provincia de Satipo
    $("lista").innerHTML = `<div style="padding:24px 16px;text-align:center;color:var(--muted);font-size:12.5px">
      Aún no hay datos cargados.<br><br>
      Corre <code>consolidar.py</code> apuntando a tu carpeta de Excel de afiliados
      y recarga esta página.
    </div>`;
    $("contador").textContent = "Sin datos";
    $("ficha").innerHTML = `<div class="ficha-vacia">⚠️ Corre <code>consolidar.py</code> primero para generar los datos.</div>`;
    return;
  }

  const bounds = L.latLngBounds(DATA.map(x => [x.lat, x.lng]));
  MAPA.fitBounds(bounds, { padding: [30, 30] });

  DATA.forEach(item => {
    const marker = L.marker([item.lat, item.lng], { icon: iconoPara(item) });
    marker.bindTooltip(`${item.nombre} — ${fmt(item.total_afiliados)} afiliados`, { direction: "top" });
    marker.on("click", () => seleccionar(item));
    marker.addTo(MAPA);
    MARCADORES.set(item.codigo_renaes, marker);
  });

  renderLista();
  $("buscador").addEventListener("input", renderLista);
  document.querySelectorAll(".panel-orden button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".panel-orden button").forEach(b => b.classList.remove("activo"));
      btn.classList.add("activo");
      ORDEN_ACTUAL = btn.dataset.orden;
      renderLista();
    });
  });
}

function filtrarYOrdenar(){
  const q = $("buscador").value.trim().toLowerCase();
  let arr = DATA.filter(d => !q || d.nombre.toLowerCase().includes(q) || d.distrito.toLowerCase().includes(q));
  if (ORDEN_ACTUAL === "alfabetico") arr = [...arr].sort((a,b) => a.nombre.localeCompare(b.nombre));
  else if (ORDEN_ACTUAL === "puntos") arr = [...arr].sort((a,b) => (b.es_punto_digitacion - a.es_punto_digitacion) || (b.total_afiliados - a.total_afiliados));
  else arr = [...arr].sort((a,b) => b.total_afiliados - a.total_afiliados);
  return arr;
}

function renderLista(){
  const arr = filtrarYOrdenar();
  $("contador").textContent = `${arr.length} establecimiento${arr.length===1?"":"s"}`;
  $("lista").innerHTML = arr.map(item => `
    <div class="item ${item.total_afiliados===0?'item-cero':''}" data-cod="${item.codigo_renaes}">
      <div>
        <div class="item-nombre">${esc(item.nombre)}</div>
        <div class="item-sub">${esc(item.distrito)} · ${esc(item.clasificacion)}</div>
        ${item.es_punto_digitacion ? `<span class="item-badge">⭐ Punto de digitación</span>` : ""}
      </div>
      <div class="item-num">${fmt(item.total_afiliados)}</div>
    </div>`).join("");

  $("lista").querySelectorAll(".item").forEach(el => {
    el.addEventListener("click", () => {
      const item = DATA.find(d => String(d.codigo_renaes) === el.dataset.cod);
      if (item) seleccionar(item);
    });
  });
}

function marcarActivo(cod){
  document.querySelectorAll(".item").forEach(el => el.classList.remove("activo"));
  const el = document.querySelector(`.item[data-cod="${cod}"]`);
  if (el){ el.classList.add("activo"); el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
}

function seleccionar(item){
  marcarActivo(item.codigo_renaes);
  MAPA.flyTo([item.lat, item.lng], 13, { duration: 0.6 });
  const marker = MARCADORES.get(item.codigo_renaes);
  if (marker) marker.openTooltip();
  renderFicha(item);
}

function renderFicha(item){
  const badgePunto = item.es_punto_digitacion ? `<span class="ficha-badge-punto">⭐ ${esc(item.etiqueta_punto)}</span>` : "";
  const btnDescarga = item.tiene_export
    ? `<a class="btn-descargar" href="exports/${encodeURIComponent(item.archivo_export)}" download>⬇️ Descargar Excel de afiliados</a>`
    : `<button class="btn-descargar deshabilitado" disabled>Sin afiliados registrados</button>`;

  $("ficha").innerHTML = `
    <div class="ficha-head">
      <div>
        <div class="ficha-nombre">${esc(item.nombre)}</div>
        <div class="ficha-meta">${esc(item.distrito)} · ${esc(item.clasificacion)} ${item.categoria ? "· Categoría " + esc(item.categoria) : ""}${item.microrred ? " · Microrred " + esc(item.microrred) : ""}</div>
        ${badgePunto}
      </div>
      ${btnDescarga}
    </div>
    <div class="ficha-total"><b>${fmt(item.total_afiliados)}</b><span>Afiliados adscritos</span></div>
    <div class="graficos">
      <div class="grafico-card"><h4>Por sexo</h4><canvas id="chartSexo"></canvas></div>
      <div class="grafico-card"><h4>Por grupo etáreo</h4><canvas id="chartEtareo"></canvas></div>
      <div class="grafico-card"><h4>Afiliación por año</h4><canvas id="chartAnio"></canvas></div>
    </div>
  `;

  Object.values(CHARTS).forEach(c => c && c.destroy());

  const coloresBase = ["#1B4A6E","#4A90CC","#E49C30","#CC3054","#6D4FC2","#0E9F6E","#8B8890"];

  CHARTS.sexo = new Chart($("chartSexo"), {
    type: "doughnut",
    data: { labels: Object.keys(item.sexo).map(k => k==="M"?"Masculino":k==="F"?"Femenino":(k||"S/D")),
      datasets: [{ data: Object.values(item.sexo), backgroundColor: coloresBase }] },
    options: { plugins: { legend: { position: "bottom", labels: { font: { size: 10 } } } } }
  });

  const etareoLabels = Object.keys(item.grupo_etareo);
  CHARTS.etareo = new Chart($("chartEtareo"), {
    type: "bar",
    data: { labels: etareoLabels, datasets: [{ data: Object.values(item.grupo_etareo), backgroundColor: "#1B4A6E" }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { font: { size: 9 } } } } }
  });

  const anios = Object.keys(item.por_anio_afil);
  CHARTS.anio = new Chart($("chartAnio"), {
    type: "line",
    data: { labels: anios, datasets: [{ data: Object.values(item.por_anio_afil), borderColor: "#E49C30", backgroundColor: "rgba(228,156,48,.15)", fill: true, tension: .3 }] },
    options: { plugins: { legend: { display: false } } }
  });
}

init();
