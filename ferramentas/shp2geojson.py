"""Minimal shapefile (.shp/.dbf) -> GeoJSON converter, no dependencies.
Usage: python3 -I shp2geojson.py <path.shp> <out.geojson> [encoding] [simplify_tol_deg] [decimals]
"""
import json, struct, sys, math


def read_dbf(path, encoding):
    with open(path, 'rb') as f:
        data = f.read()
    nrec, hlen, rlen = struct.unpack('<xxxxIHH', data[:12])
    fields = []
    pos = 32
    while data[pos] != 0x0D:
        name = data[pos:pos + 11].split(b'\x00')[0].decode('ascii', 'replace')
        ftype = chr(data[pos + 11]); flen = data[pos + 16]; fdec = data[pos + 17]
        fields.append((name, ftype, flen, fdec))
        pos += 32
    recs = []
    for i in range(nrec):
        off = hlen + i * rlen
        rec = data[off:off + rlen]
        if rec[:1] == b'*':
            recs.append(None); continue
        p = 1; row = {}
        for name, ftype, flen, fdec in fields:
            raw = rec[p:p + flen]; p += flen
            try:
                s = raw.decode(encoding).strip()
            except UnicodeDecodeError:
                s = raw.decode('latin-1').strip()
            s = s.replace('\x00', '').strip()
            if ftype in 'NF':
                if s in ('', '*' * len(s)):
                    v = None
                else:
                    try:
                        v = float(s)
                        if fdec == 0 and v.is_integer():
                            v = int(v)
                    except ValueError:
                        v = None
            elif ftype == 'D':
                v = f"{s[:4]}-{s[4:6]}-{s[6:8]}" if len(s) == 8 and s.isdigit() else (s or None)
            elif ftype == 'L':
                v = s.upper() in ('Y', 'T')
            else:
                v = s or None
            row[name] = v
        recs.append(row)
    return fields, recs


def ring_area(r):
    a = 0.0
    for i in range(len(r) - 1):
        a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
    return a / 2


def pt_in_ring(pt, ring):
    x, y = pt; inside = False
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]; x2, y2 = ring[i + 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def dp(points, tol):
    if tol <= 0 or len(points) < 5:
        return points
    keep = [False] * len(points); keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        s, e = stack.pop()
        ax, ay = points[s]; bx, by = points[e]
        dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy)
        md, mi = 0, -1
        for i in range(s + 1, e):
            px, py = points[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / L if L else math.hypot(px - ax, py - ay)
            if d > md:
                md, mi = d, i
        if md > tol and mi > 0:
            keep[mi] = True
            stack.append((s, mi)); stack.append((mi, e))
    out = [p for p, k in zip(points, keep) if k]
    return out if len(out) >= 4 else points


def read_shp(path, tol, dec):
    with open(path, 'rb') as f:
        data = f.read()
    pos = 100; geoms = []
    while pos < len(data):
        _, clen = struct.unpack('>II', data[pos:pos + 8]); pos += 8
        rec = data[pos:pos + clen * 2]; pos += clen * 2
        st = struct.unpack('<i', rec[:4])[0]
        if st == 0:
            geoms.append(None); continue
        if st in (1, 11, 21):
            x, y = struct.unpack('<2d', rec[4:20])
            geoms.append({'type': 'Point', 'coordinates': [round(x, dec), round(y, dec)]}); continue
        nparts, npts = struct.unpack('<2i', rec[36:44])
        parts = list(struct.unpack(f'<{nparts}i', rec[44:44 + 4 * nparts]))
        po = 44 + 4 * nparts
        pts = [struct.unpack('<2d', rec[po + 16 * i: po + 16 * i + 16]) for i in range(npts)]
        parts.append(npts)
        rings = [pts[parts[i]:parts[i + 1]] for i in range(nparts)]
        if st in (3, 13, 23):
            lines = [[[round(x, dec), round(y, dec)] for x, y in dp(r, tol)] for r in rings]
            geoms.append({'type': 'MultiLineString', 'coordinates': lines}); continue
        # polygon: shapefile outer rings are clockwise (negative signed area)
        outers, holes = [], []
        for r in rings:
            r = list(r)
            if r[0] != r[-1]:
                r.append(r[0])
            (outers if ring_area(r) < 0 else holes).append(r)
        if not outers:
            outers, holes = holes, []
        polys = [[o] for o in outers]
        for h in holes:
            for poly in polys:
                if pt_in_ring(h[0], poly[0]):
                    poly.append(h); break
        def fmt(r, outer):
            r = dp(r, tol)
            # GeoJSON RFC 7946: outer CCW, holes CW
            if (ring_area(r) > 0) != outer:
                r = r[::-1]
            return [[round(x, dec), round(y, dec)] for x, y in r]
        coords = [[fmt(poly[0], True)] + [fmt(h, False) for h in poly[1:]] for poly in polys]
        if len(coords) == 1:
            geoms.append({'type': 'Polygon', 'coordinates': coords[0]})
        else:
            geoms.append({'type': 'MultiPolygon', 'coordinates': coords})
    return geoms


if __name__ == '__main__':
    shp, out = sys.argv[1], sys.argv[2]
    enc = sys.argv[3] if len(sys.argv) > 3 else 'utf-8'
    tol = float(sys.argv[4]) if len(sys.argv) > 4 else 0
    dec = int(sys.argv[5]) if len(sys.argv) > 5 else 6
    fields, recs = read_dbf(shp[:-4] + '.dbf', enc)
    geoms = read_shp(shp, tol, dec)
    feats = [{'type': 'Feature', 'properties': r, 'geometry': g}
             for r, g in zip(recs, geoms) if r is not None]
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': feats}, f, ensure_ascii=False, separators=(',', ':'))
    print(out, len(feats), 'features;', 'fields:', [x[0] + ':' + x[1] for x in fields])
