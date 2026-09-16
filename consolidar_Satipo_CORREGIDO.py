"""
Consolidador de AFILIADOS POR ESTABLECIMIENTO — USPP Satipo (uso interno)
===========================================================================
⚠️  HERRAMIENTA DE USO INTERNO — NUNCA subir esta carpeta (ni /data ni /exports)
    a un repositorio público ni a un hosting público (GitHub Pages, etc.).
    Contiene datos personales reales (DNI, nombres, fecha de nacimiento) de
    los asegurados de la provincia de Satipo. Solo debe correr localmente,
    vía XAMPP en la red interna, para personal autorizado.

Qué hace:
  1) Lee "establecimientos.xls" (el mismo del mapa público) para tener
     nombre, distrito, categoría, coordenadas, etc. de los 91 establecimientos.
  2) Lee todos los Excel de afiliados en AFILIADOS_DIR (exportados del SIS).
  3) Cruza cada afiliado con su establecimiento por CÓDIGO RENAES (no por
     nombre — hay establecimientos con el mismo nombre en distritos distintos,
     ej. dos "BUENOS AIRES" uno en Coviriali y otro en Mazamari).
  4) Genera:
       data/resumen_establecimientos.json  -> agregados por establecimiento
                                               (para el dashboard/mapa)
       exports/<codigo>_<nombre>.xlsx      -> un Excel por establecimiento
                                               con el detalle de sus afiliados
       data/manifest.json                  -> metadatos generales
"""
import os
import re
import json
import unicodedata
from datetime import datetime
from collections import defaultdict, Counter

import pandas as pd
import xlrd

# ==========================
# CONFIG — AJUSTA ESTA RUTA
# ==========================
AFILIADOS_DIR = r"D:\ANALISIS DE DATOS\AFILIADOS BASE"   # <-- carpeta donde guardas los Excel de afiliados (AFILIADOS-SATIPO-AGOSTO*.xlsx)
ESTABLECIMIENTOS_XLS = os.path.join(os.path.dirname(__file__), "establecimientos.xls")
OUT_DIR = os.path.join(os.path.dirname(__file__), "data")
EXPORTS_DIR = os.path.join(os.path.dirname(__file__), "exports")

os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(EXPORTS_DIR, exist_ok=True)

# Puntos de digitación (mismos que en el mapa público — ver mapa.html)
PUNTOS_DIGITACION = {
    "RIO NEGRO": "Centro de Salud Rio Negro",
    "UNION CAPIRI": "Centro de Salud Unión Capiri",
    "COVIRIALI": "Centro de Salud Coviriali",
    "MARIPOSA": "Puesto de Salud Mariposa",
    "CENTRO DE SALUD MENTAL COMUNITARIO SATIPO": "Centro de Salud Mental Comunitario Satipo",
    "HOSPITAL DE APOYO MANUEL HIGA ARAKAKI": "Hospital Manuel Ángel Higa Arakaki",
    "MAZAMARI": "Centro de Salud Mazamari",
    "LLAYLLA": "Centro de Salud Llaylla",
    "PUERTO OCOPA": "Centro de Salud Puerto Ocopa",
    "SAN VICENTE DE CANAAN": "Centro de Salud San Vicente de Canaán",
    "VALLE ESMERALDA": "Centro de Salud Valle Esmeralda",
}
CLASIF_LABEL = {
    "PUESTOS DE SALUD O POSTAS DE SALUD": "Puesto de Salud",
    "CENTROS DE SALUD O CENTROS MEDICOS": "Centro de Salud",
    "CENTROS DE SALUD CON CAMAS DE INTERNAMIENTO": "Centro de Salud (con camas)",
    "HOSPITALES O CLINICAS DE ATENCION GENERAL": "Hospital",
}

COLUMNAS_AAFILIADOS = ['Provincia','Distrito','afi_identity','RED','MICRO_RED','COD_IPRESS','COD_RENAES',
    'CATEGORIA_IPRESS','NOMBRE_IPRESS','FORM_SEGURO','NUM_SEGURO','FECHA_AFIL','PLAN_BENEFICIO','GRUPO_POBLACIONAL',
    'NRO_DNI','APE_PATERNO','APE_MATERNO','NOMBRES','SEXO','EDAD','FECHA_NAC','Estado','UBIGEO','año_afil','mes_afil',
    'dia_afil','año_nac','mes_nac','dia_nac','conteo','G_ETAREO','PLANSEG']

# ==========================
# HELPERS
# ==========================
def slug(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s[:60] if s else "sn"

def to_cod(v):
    """Normaliza un código (Código Único / COD_RENAES) a entero, quitando ceros a la izquierda y letras."""
    s = re.sub(r"\D", "", str(v))
    return int(s) if s else None

def cargar_establecimientos():
    wb = xlrd.open_workbook(ESTABLECIMIENTOS_XLS)
    sh = wb.sheet_by_index(0)
    headers = [sh.cell_value(0, c) for c in range(sh.ncols)]
    rows = [{headers[c]: sh.cell_value(r, c) for c in range(sh.ncols)} for r in range(1, sh.nrows)]

    estabs = {}
    for r in rows:
        cod = to_cod(r['Código Único'])
        nombre = str(r['Nombre del establecimiento']).strip()
        nombre_up = nombre.upper()
        es_punto = nombre_up in PUNTOS_DIGITACION or (nombre_up == "MAZAMARI" and r['Categoria'] == 'I-4')
        estabs[cod] = {
            "codigo_renaes": cod,
            "nombre": nombre.title() if nombre.isupper() else nombre,
            "clasificacion": CLASIF_LABEL.get(r['Clasificación'], str(r['Clasificación']).title()),
            "categoria": r['Categoria'],
            "distrito": str(r['Distrito']).strip().title(),
            "direccion": str(r['Dirección']).strip().title(),
            "microrred": str(r['Microrred']).title() if r['Microrred'] != 'NO PERTENECE A NINGUNA MICRORED' else None,
            "lat": float(r['NORTE']),
            "lng": float(r['ESTE']),
            "es_punto_digitacion": bool(es_punto),
            "etiqueta_punto": PUNTOS_DIGITACION.get(nombre_up, "") if es_punto else ""
        }
    return estabs

def leer_afiliados_excel(path):
    wb = pd.ExcelFile(path)
    df = wb.parse(wb.sheet_names[0])
    return df


def convertir_fecha(valor):
    """Convierte fechas provenientes de Excel o texto sin romper si pandas
    ya las leyó como datetime.

    Acepta: fechas datetime/Timestamp, seriales de Excel y fechas en texto.
    Devuelve pandas.NaT cuando el valor no es una fecha válida.
    """
    if pd.isna(valor):
        return pd.NaT

    # Pandas/Excel ya entregó una fecha.
    if isinstance(valor, (pd.Timestamp, datetime)):
        return pd.Timestamp(valor)

    # Excel puede entregar fechas como número serial (días desde 1899-12-30).
    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        return pd.to_datetime(
            valor, unit='D', origin='1899-12-30', errors='coerce'
        )

    # Texto: dejamos que pandas detecte el formato.
    return pd.to_datetime(valor, errors='coerce')

# ==========================
# MAIN
# ==========================
def main():
    print("📍 Cargando establecimientos.xls...")
    estabs = cargar_establecimientos()
    print(f"   {len(estabs)} establecimientos cargados.")

    if not os.path.isdir(AFILIADOS_DIR):
        print(f"❌ No encuentro la carpeta {AFILIADOS_DIR}")
        print("   Ajusta la variable AFILIADOS_DIR al inicio de este archivo y vuelve a correr.")
        return

    archivos = [f for f in os.listdir(AFILIADOS_DIR) if f.lower().endswith((".xlsx", ".xls"))]
    if not archivos:
        print("❌ No hay archivos Excel de afiliados en", AFILIADOS_DIR)
        return

    # Si hay más de un archivo, deduplicamos por afi_identity quedándonos con
    # el más reciente (por si guardas exportaciones mensuales que se solapan).
    vistos = {}
    total_filas = 0

    for i, fn in enumerate(sorted(archivos), 1):
        path = os.path.join(AFILIADOS_DIR, fn)
        print(f"📄 [{i}/{len(archivos)}] Leyendo: {fn}")
        try:
            df = leer_afiliados_excel(path)
        except Exception as e:
            print("   ⚠️ No pude leer:", fn, "->", e)
            continue
        total_filas += len(df)
        for _, row in df.iterrows():
            afi_id = row.get('afi_identity')
            key = afi_id if pd.notna(afi_id) else f"__sinid__{fn}__{_}"
            vistos[key] = row.to_dict()

    print(f"\nTotal filas leídas: {total_filas}  |  Afiliados únicos tras deduplicar: {len(vistos)}")

    # ---- Agregación por establecimiento ----
    agregados = defaultdict(lambda: {
        "total": 0, "sexo": Counter(), "grupo_etareo": Counter(),
        "grupo_poblacional": Counter(), "plan": Counter(), "por_anio_afil": Counter(), "por_mes_afil_2026": Counter(),
        "detalle": []
    })
    sin_match = Counter()

    for row in vistos.values():
        cod = to_cod(row.get('COD_RENAES'))
        ag = agregados[cod]
        ag["total"] += 1
        ag["sexo"][row.get('SEXO')] += 1
        ag["grupo_etareo"][row.get('G_ETAREO')] += 1
        ag["grupo_poblacional"][row.get('GRUPO_POBLACIONAL')] += 1
        ag["plan"][row.get('PLANSEG') or row.get('PLAN_BENEFICIO')] += 1
        anio = row.get('año_afil')
        if pd.notna(anio):
            ag["por_anio_afil"][int(anio)] += 1
        mes = row.get('mes_afil')
        if pd.notna(anio) and pd.notna(mes) and int(float(anio)) == 2026:
            try:
                ag["por_mes_afil_2026"][int(float(mes))] += 1
            except Exception:
                pass
        ag["detalle"].append(row)
        if cod not in estabs:
            sin_match[row.get('NOMBRE_IPRESS')] += 1

    if sin_match:
        print("\n⚠️ Afiliados con código RENAES que no encontré en establecimientos.xls:")
        for nombre, n in sin_match.most_common():
            print(f"   {nombre}: {n} afiliados (revisar)")

    # ---- Generar resumen para el dashboard ----
    resumen = []
    for cod, meta in estabs.items():
        ag = agregados.get(cod)
        item = dict(meta)
        if ag:
            item["total_afiliados"] = ag["total"]
            item["sexo"] = dict(ag["sexo"])
            item["grupo_etareo"] = dict(ag["grupo_etareo"])
            item["grupo_poblacional"] = dict(ag["grupo_poblacional"].most_common(8))
            item["por_anio_afil"] = dict(sorted(ag["por_anio_afil"].items()))
            item["por_mes_afil_2026"] = {str(k): int(v) for k,v in sorted(ag["por_mes_afil_2026"].items())}
            item["tiene_export"] = True
        else:
            item["total_afiliados"] = 0
            item["sexo"] = {}
            item["grupo_etareo"] = {}
            item["grupo_poblacional"] = {}
            item["por_anio_afil"] = {}
            item["por_mes_afil_2026"] = {}
            item["tiene_export"] = False
        item["archivo_export"] = f"{cod}_{slug(meta['nombre'])}.xlsx" if ag else None
        resumen.append(item)

    resumen.sort(key=lambda x: -x["total_afiliados"])

    with open(os.path.join(OUT_DIR, "resumen_establecimientos.json"), "w", encoding="utf-8") as f:
        json.dump(resumen, f, ensure_ascii=False, indent=1)

    # ---- Exportar un Excel por establecimiento ----
    print("\n📊 Generando Excel por establecimiento...")
    COLS_EXPORT = ['NRO_DNI','APE_PATERNO','APE_MATERNO','NOMBRES','SEXO','EDAD','FECHA_NAC',
                   'G_ETAREO','GRUPO_POBLACIONAL','PLAN_BENEFICIO','FECHA_AFIL','Distrito','UBIGEO']
    for cod, ag in agregados.items():
        if cod is None or cod not in estabs:
            continue
        meta = estabs[cod]
        detalle_df = pd.DataFrame(ag["detalle"])
        cols_presentes = [c for c in COLS_EXPORT if c in detalle_df.columns]
        detalle_df = detalle_df[cols_presentes].copy()

        # DNI limpio (sin ".0", como texto para no perder ceros a la izquierda)
        if 'NRO_DNI' in detalle_df.columns:
            detalle_df['NRO_DNI'] = detalle_df['NRO_DNI'].apply(
                lambda v: str(int(v)).zfill(8) if pd.notna(v) else "")

        # Fechas: pueden venir como serial de Excel, datetime o texto.
        # La función convertir_fecha detecta automáticamente el tipo.
        for col_fecha in ('FECHA_NAC', 'FECHA_AFIL'):
            if col_fecha in detalle_df.columns:
                detalle_df[col_fecha] = (
                    detalle_df[col_fecha]
                    .apply(convertir_fecha)
                    .dt.strftime('%d/%m/%Y')
                )

        detalle_df = detalle_df.sort_values(by=['APE_PATERNO','APE_MATERNO'], na_position='last')
        fname = f"{cod}_{slug(meta['nombre'])}.xlsx"
        detalle_df.to_excel(os.path.join(EXPORTS_DIR, fname), index=False, sheet_name="Afiliados")

    print(f"   {len(agregados)} archivos generados en {EXPORTS_DIR}")

    # ---- Manifest ----
    manifest = {
        "generado": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_afiliados": len(vistos),
        "total_establecimientos": len(estabs),
        "establecimientos_con_afiliados": sum(1 for r in resumen if r["total_afiliados"] > 0),
        "establecimientos_sin_afiliados": [r["nombre"] for r in resumen if r["total_afiliados"] == 0],
        "origen": AFILIADOS_DIR
    }
    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print("\n==========================")
    print("✅ CONSOLIDACIÓN TERMINADA")
    print("Total afiliados:", len(vistos))
    print("Establecimientos con afiliados:", manifest["establecimientos_con_afiliados"], "/", len(estabs))
    print("Sin afiliados:", manifest["establecimientos_sin_afiliados"])
    print("Salida resumen:", OUT_DIR)
    print("Salida exports:", EXPORTS_DIR)
    print("==========================")

if __name__ == "__main__":
    main()
