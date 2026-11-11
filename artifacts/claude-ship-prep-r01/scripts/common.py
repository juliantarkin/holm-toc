"""Shared helpers for claude-ship-prep-r01 (Blender background scripts). Read-only on every input.

Owner: Claude Code (claude-fable-5-2), 11 Nov 2026. Offline source preparation only; no Unreal writes.
"""
import hashlib, json, struct, datetime
from pathlib import Path
from collections import Counter

ROOT = Path('C:/Games/Multi Agent System/holm-toc/artifacts/claude-ship-prep-r01')
PIRATE = Path('C:/Games/Multi Agent System/holm-toc/artifacts/overnight-sprint-r01/pirate-source-r01')
OPT_SCALE = 0.024414062  # metres per OPT unit, from the source-owner audit JSON (scale_factor)


def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def utc():
    return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def write_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=1), encoding='utf-8')


def q(v, n=5):
    return tuple(round(float(x), n) for x in v)


def corner_multiset(objects, pos_digits=5, uv_digits=5, nrm_digits=3):
    """World-space per-corner payload: (position, normal, every UV layer, material name) as a multiset.
    Also returns the per-face multiset of sorted corner positions (winding-insensitive) and winding-sensitive keys."""
    corners = Counter(); faces = Counter(); faces_w = Counter(); tris = 0
    for o in objects:
        me = o.data
        mw = o.matrix_world
        n3 = mw.to_3x3().inverted_safe().transposed()
        uvs = [l.data for l in me.uv_layers]
        mats = [s.material.name if s.material else None for s in o.material_slots] or [None]
        cn = me.corner_normals
        for p in me.polygons:
            tris += len(p.vertices) - 2
            mat = mats[p.material_index] if p.material_index < len(mats) else None
            keys = []
            for li in p.loop_indices:
                vi = me.loops[li].vertex_index
                pos = q(mw @ me.vertices[vi].co, pos_digits)
                nrm = q((n3 @ cn[li].vector).normalized(), nrm_digits)
                uv = tuple(q(u[li].uv, uv_digits) for u in uvs)
                corners[(pos, nrm, uv, mat)] += 1
                keys.append(pos)
            faces[tuple(sorted(keys))] += 1
            # canonical rotation keeps winding
            i = keys.index(min(keys))
            faces_w[tuple(keys[i:] + keys[:i])] += 1
    return corners, faces, faces_w, tris


# ---------------------------------------------------------------------------------------------------------------
# Tolerance-based payload comparison. (The first, rounding-only attempt produced false differences: float32 noise
# after an FBX trip flips 1e-5 rounding boundaries. That attempt is preserved in logs/twing-norender.log.)
def collect(objects):
    """Raw world-space per-corner payload: dict(pos, corners=[(pos_index, normal, uv_tuple, material)], faces, meta, tris, degenerate)."""
    pos = []; corners = []; faces = []; meta = []; corner_area = []; tris = 0; degenerate = 0
    for o in objects:
        me = o.data; mw = o.matrix_world; n3 = mw.to_3x3().inverted_safe().transposed()
        uvs = [l.data for l in me.uv_layers]
        mats = [s.material.name if s.material else None for s in o.material_slots] or [None]
        cn = me.corner_normals
        base = len(pos)
        pos.extend(mw @ v.co for v in me.vertices)
        for p in me.polygons:
            tris += len(p.vertices) - 2
            mat = mats[p.material_index] if p.material_index < len(mats) else None
            f = []
            for li in p.loop_indices:
                uv = tuple(q(u[li].uv, 5) for u in uvs)
                f.append(len(corners)); corner_area.append(p.area)
                corners.append((base + me.loops[li].vertex_index, (n3 @ cn[li].vector).normalized(), uv, mat))
            faces.append(tuple(f)); meta.append((o.name, p.index, (n3 @ p.normal).normalized(), mat, p.area))
            if p.area < 1e-10:
                degenerate += 1
    return dict(pos=pos, corners=corners, faces=faces, meta=meta, corner_area=corner_area, tris=tris, degenerate=degenerate)


def weld_ids(a, tol=5e-5):
    """One id per distinct world position of payload a (positions closer than tol share an id). Returns (ids, kdtree)."""
    from mathutils.kdtree import KDTree
    kd = KDTree(len(a['pos']))
    for i, p in enumerate(a['pos']):
        kd.insert(p, i)
    kd.balance()
    ids = [None] * len(a['pos'])
    for i, p in enumerate(a['pos']):
        if ids[i] is None:
            for _, j, _ in kd.find_range(p, tol):
                if ids[j] is None:
                    ids[j] = i
    return ids, kd


def face_groups(a, ids):
    """Faces grouped by their (winding-insensitive) welded vertex-id set."""
    from collections import defaultdict
    groups = defaultdict(list)
    for fi, f in enumerate(a['faces']):
        groups[tuple(sorted(str(ids[a['corners'][c][0]]) for c in f))].append(fi)
    return groups


def acos_deg(d):
    import math
    return math.degrees(math.acos(max(-1.0, min(1.0, d))))


def compare(a, b, tol=5e-5):
    """Compare reimported payload b against reference a. Positions of b are snapped to a's welded ids."""
    ids_a, kd = weld_ids(a, tol)
    ids_b = []; max_snap = 0.0; unmatched = 0
    for p in b['pos']:
        co, j, d = kd.find(p)
        if d <= tol * 4:
            ids_b.append(ids_a[j]); max_snap = max(max_snap, d)
        else:
            ids_b.append('unmatched%d' % len(ids_b)); unmatched += 1
    fa = Counter(tuple(sorted(str(ids_a[a['corners'][c][0]]) for c in f)) for f in a['faces'])
    fb = Counter(tuple(sorted(str(ids_b[b['corners'][c][0]]) for c in f)) for f in b['faces'])
    ca = Counter(); cb = Counter(); na = {}; nb = {}
    for ci, (pid, n, uv, mat) in enumerate(a['corners']):
        k = (str(ids_a[pid]), uv, mat); ca[k] += 1; na.setdefault(k, []).append((n, a['corner_area'][ci]))
    for pid, n, uv, mat in b['corners']:
        k = (str(ids_b[pid]), uv, mat); cb[k] += 1; nb.setdefault(k, []).append(n)
    worst = 0.0; over = 0; over_zero_area = 0; compared = 0
    for k, la in na.items():
        lb = list(nb.get(k, []))
        for n, area in la:
            if not lb:
                break
            j = max(range(len(lb)), key=lambda i: n.dot(lb[i]))
            dev = acos_deg(n.dot(lb[j])); compared += 1
            if area < 1e-9:
                over_zero_area += dev > 1.0
            else:
                worst = max(worst, dev); over += dev > 1.0
            lb.pop(j)
    miss_f = fa - fb; extra_f = fb - fa
    return dict(position_tolerance_m=tol * 4, max_position_snap_m=max_snap, reimport_positions_unmatched=unmatched,
                faces_missing=sum(miss_f.values()), faces_extra=sum(extra_f.values()), missing_face_keys=list(miss_f.items()),
                corners_missing=sum((ca - cb).values()), corners_extra=sum((cb - ca).values()),
                normals_compared=compared, normal_max_deviation_deg=round(worst, 4), normals_over_1deg=over,
                normals_over_1deg_on_zero_area_faces_ignored=over_zero_area)


def world_bounds(objects):
    lo = [1e30] * 3; hi = [-1e30] * 3
    for o in objects:
        mw = o.matrix_world
        for v in o.data.vertices:
            w = mw @ v.co
            for i in range(3):
                lo[i] = min(lo[i], w[i]); hi[i] = max(hi[i], w[i])
    return lo, hi


def opt_to_working_m(p):
    """OPT model units -> working-frame metres (+X nose, +Y left, +Z up). DERIVED by the source owner (working-r03 receipt):
    (-Y, -X, Z) * scale. Verified here against geometry (hardpoint-to-mesh distances)."""
    return (-p['Y'] * OPT_SCALE, -p['X'] * OPT_SCALE, p['Z'] * OPT_SCALE)


def working_m_to_ue_cm(p):
    """Working Blender metres (+X nose, +Y left, +Z up) -> expected Unreal mesh-local cm (+X nose, +Y right, +Z up).
    FBX import flips Y. EXPECTED mapping, to be confirmed at Unreal receiving (socket-vs-vertex check)."""
    return (round(p[0] * 100, 2), round(-p[1] * 100, 2), round(p[2] * 100, 2))
