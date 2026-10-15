"""Clean the converted GeoJSON layers for public use.
- removes CPF, file path and layer name (personal / internal data)
- derives FASE from the source layer name
- assigns the municipality by point-in-polygon on the IBGE 2022 boundaries
Usage: python3 -I prep_geo.py <work_dir> <out_dir>
"""
import json, sys, re, os
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from shp2geojson import pt_in_ring

work, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)

FASES = [('FaseIV', 'Fase IV · 2025/26'), ('FaseIII', 'Fase III · 2024/25'),
         ('FaseII', 'Fase II · 2023/24')]


def fase_of(layer):
    for k, v in FASES:
        if k in layer:
            return v
    return 'Fase I · 2022/23'


def rings(geom):
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    return polys


def centroid(geom):
    best, A, cx, cy = None, 0, 0, 0
    for poly in rings(geom):
        r = poly[0]
        a = x = y = 0
        for i in range(len(r) - 1):
            c = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
            a += c; x += (r[i][0] + r[i + 1][0]) * c; y += (r[i][1] + r[i + 1][1]) * c
        if abs(a) > abs(A):
            A, cx, cy = a, x / (3 * a), y / (3 * a)
    return cx, cy


def in_geom(pt, geom):
    for poly in rings(geom):
        if pt_in_ring(pt, poly[0]) and not any(pt_in_ring(pt, h) for h in poly[1:]):
            return True
    return False


mun = json.load(open(f'{work}/municipios.geojson', encoding='utf-8'))
for f in mun['features']:
    p = f['properties']
    if 'CD_MUN' in p:
        f['properties'] = {'cod': p['CD_MUN'], 'nome': p['NM_MUN'], 'area_km2': p.get('AREA_KM2')}


def mun_of(geom):
    pt = centroid(geom)
    for m in mun['features']:
        if in_geom(pt, m['geometry']):
            return m['properties']['nome'], pt
    return None, pt


def clean(text):
    if text is None:
        return None
    text = re.sub(r'\s+', ' ', str(text)).strip()
    return text or None


report = []
for name, extra in (('propriedades', []), ('areas', ['MODELO_SAF'])):
    fc = json.load(open(f'{work}/{name}.geojson', encoding='utf-8'))
    feats = []
    for i, f in enumerate(fc['features']):
        p = f['properties']
        m, (cx, cy) = mun_of(f['geometry'])
        q = {
            'uid': f"{name[0]}{i}",
            'car': clean(p['ID_CAR']),
            'propriedade': clean(p['PROPRIEDAD']),
            'proprietario': clean(p['PROPRIETAR']),
            'municipio': m,
            'regional': clean(p['REGIONAL']).replace('Brasileia', 'Brasiléia') if p['REGIONAL'] else None,
            'local': clean(p['LOCAL']),
            'nucleo': clean(p['NUCLEO']).replace('Brasileia', 'Brasiléia') if p['NUCLEO'] else None,
            'ha': round(p['HECTARES'], 4) if p['HECTARES'] is not None else None,
            'fase': fase_of(p['layer'] or ''),
            'lat': round(cy, 6), 'lon': round(cx, 6),
        }
        if name == 'areas':
            mod = clean(p['MODELO_SAF']) or ''
            q['modelo'] = mod.replace('regeneraçaõ', 'regeneração')
            q['tipo'] = ('Enriquecimento' if mod.lower().startswith('enriquecimento')
                         else 'Povoamento' if mod.lower().startswith('povoamento') else 'SAF')
        if p.get('REGIONAL') and m and clean(p['REGIONAL']).replace('Brasileia', 'Brasiléia') != m:
            report.append((name, q['car'], q['regional'], m))
        feats.append({'type': 'Feature', 'properties': q, 'geometry': f['geometry']})
    if name == 'propriedades':
        # one imóvel per CAR (same polygon repeats across phases) -> list of phases
        merged = {}
        for x in feats:
            q = x['properties']; k = q['car']
            if k in merged:
                fs = merged[k]['properties']['fases']
                if q['fase'] not in fs:
                    fs.append(q['fase']); fs.sort()
            else:
                q['fases'] = [q.pop('fase')]; q['uid'] = 'p' + k
                merged[k] = x
            q.pop('fase', None)
        feats = list(merged.values())
    with open(f'{out}/{name}.geojson', 'w', encoding='utf-8') as fh:
        json.dump({'type': 'FeatureCollection', 'features': feats}, fh, ensure_ascii=False, separators=(',', ':'))
    print(name, len(feats), 'feições; sem município:', sum(1 for x in feats if not x['properties']['municipio']))

with open(f'{out}/municipios.geojson', 'w', encoding='utf-8') as fh:
    json.dump(mun, fh, ensure_ascii=False, separators=(',', ':'))
print('REGIONAL diferente do município geográfico:', report)
