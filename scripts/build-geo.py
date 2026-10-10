import json
import sys
from pathlib import Path

import shapely
from pyproj import Transformer
from shapely import coverage_simplify
from shapely.geometry import shape, Polygon, MultiPolygon
import numpy as np
from shapely.ops import polylabel

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "lib" / "geo"
TOLERANCE_FT = float(sys.argv[1]) if len(sys.argv) > 1 else 100.0
SIZE = 1000
PAD = 12
MIN_RING_AREA = 3.0

to_ft = Transformer.from_crs("EPSG:4326", "EPSG:2263", always_xy=True).transform


def load(name):
    data = json.loads((RAW / name).read_text())
    return [(f["properties"], shapely.transform(shape(f["geometry"]).buffer(0), lambda c: np.column_stack(to_ft(c[:, 0], c[:, 1])))) for f in data["features"]]


def polys(g):
    return list(g.geoms) if isinstance(g, MultiPolygon) else [g]


districts = sorted(load("council.geojson"), key=lambda x: int(x[0]["coundist"]))
boroughs = load("boroughs.geojson")
assert [int(p["coundist"]) for p, _ in districts] == list(range(1, 52))

assigned = {}
split = {}
for props, g in districts:
    d = int(props["coundist"])
    areas = {bp["boroname"]: g.intersection(bg).area for bp, bg in boroughs}
    best = max(areas, key=areas.get)
    assigned[d] = best
    share = {k: round(v / g.area, 3) for k, v in areas.items() if v / g.area > 0.01}
    if len(share) > 1:
        split[d] = share

pieces = []
for props, g in districts:
    d = int(props["coundist"])
    for bp, bg in boroughs:
        piece = g.intersection(bg)
        for part in polys(piece) if piece.geom_type in ("Polygon", "MultiPolygon") else [q for q in getattr(piece, "geoms", []) if q.geom_type == "Polygon"]:
            if part.area > 2500:
                pieces.append((d, bp["boroname"], part))

simplified = coverage_simplify([g for _, _, g in pieces], TOLERANCE_FT)
dgeoms = []
for props, _ in districts:
    d = int(props["coundist"])
    dgeoms.append(shapely.union_all([g for (pd, _, _), g in zip(pieces, simplified) if pd == d]))
bgeoms = []
for bp, _ in boroughs:
    bgeoms.append(shapely.union_all([g for (_, pb, _), g in zip(pieces, simplified) if pb == bp["boroname"]]))

minx, miny, maxx, maxy = shapely.union_all([*dgeoms, *bgeoms]).bounds
scale = (SIZE - 2 * PAD) / max(maxx - minx, maxy - miny)
offx = (SIZE - (maxx - minx) * scale) / 2
offy = (SIZE - (maxy - miny) * scale) / 2


def px(x, y):
    return (round(offx + (x - minx) * scale), round(offy + (maxy - y) * scale))


def ring_path(coords):
    pts = [px(x, y) for x, y in coords]
    out = [pts[0]]
    for p in pts[1:]:
        if p != out[-1]:
            out.append(p)
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()
    if len(out) < 3:
        return None
    area = abs(sum(out[i][0] * out[(i + 1) % len(out)][1] - out[(i + 1) % len(out)][0] * out[i][1] for i in range(len(out)))) / 2
    if area < MIN_RING_AREA:
        return None
    s = f"M{out[0][0]} {out[0][1]}l"
    parts = []
    for i in range(1, len(out)):
        parts.append(f"{out[i][0] - out[i - 1][0]} {out[i][1] - out[i - 1][1]}")
    return s + " ".join(parts).replace(" -", "-") + "Z"


def geom_path(g):
    parts = []
    for p in polys(g):
        r = ring_path(list(p.exterior.coords))
        if r is None:
            continue
        parts.append(r)
        for h in p.interiors:
            hr = ring_path(list(h.coords))
            if hr:
                parts.append(hr)
    return "".join(parts)


council = []
for (props, _), g in zip(districts, dgeoms):
    d = int(props["coundist"])
    biggest = max(polys(g), key=lambda p: p.area)
    lp = polylabel(biggest, tolerance=50)
    lx, ly = px(lp.x, lp.y)
    council.append({"district": d, "borough": assigned[d], "path": geom_path(g), "labelX": lx, "labelY": ly})

order = ["Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"]
bmap = {bp["boroname"]: g for (bp, _), g in zip(boroughs, bgeoms)}
bout = [{"borough": b, "path": geom_path(bmap[b])} for b in order]

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "council-districts.json").write_text(json.dumps(council, separators=(",", ":")) + "\n")
(OUT / "boroughs.json").write_text(json.dumps(bout, separators=(",", ":")) + "\n")

by = {}
for d, b in sorted(assigned.items()):
    by.setdefault(b, []).append(d)
print("tolerance_ft", TOLERANCE_FT, "scale_ft_per_unit", round(1 / scale, 1))
for b in order:
    print(b, by[b])
print("split districts", split)
for f in ("council-districts.json", "boroughs.json"):
    print(f, (OUT / f).stat().st_size)
