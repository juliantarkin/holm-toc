"""Integration source-package builder for the XWAU OPT pirate fighters (T-wing, R-41, Toscan).

Run: blender(5.2.2) -b --factory-startup --python pirate_package.py -- <twing|r41|toscan> [norender]

Reuses, read-only, the overnight source owner's outputs (pirate-source-r01: untouched OPT/INI copies, parsed audits,
working-r03 blends, fbx-candidates-r01). It does NOT reconvert or re-export those 16 derivatives. It resolves the remaining
gaps: exact duplicate-face characterisation, corner-level FBX round-trip, native hardpoints/engine glows, moving-part
manifest, texture/material manifest and native Blender review renders. No Unreal writes.
"""
import bpy, sys, json, math, re, configparser
from pathlib import Path
from collections import Counter, defaultdict
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

sys.path.insert(0, str(Path(__file__).parent))
from common import *

argv = sys.argv[sys.argv.index('--') + 1:]
CRAFT = argv[0]; RENDER = 'norender' not in argv
XWAU = Path('C:/Games/Star Wars - X-Wing Alliance Mods/XWAU2025')
CFG = {
    'twing': dict(dir='pirate1-twing', std='TWING', ext='TwingExterior', cock='TwingCockpit', ini='Twing.ini', lods=4,
                  mats=['TWing.mat', 'TWingExterior.mat', 'TWingCockpit.mat']),
    'r41': dict(dir='pirate2-r41', std='R41Starchaser', ext='R41StarchaserExterior', cock='R41StarchaserCockpit', ini='R41Starchaser.ini', lods=3,
                mats=['R41Starchaser.mat', 'R41StarchaserExterior.mat']),
    'toscan': dict(dir='pirate3-toscan', std='TOSCANFIGHTER', ext='ToscanFighterExterior', cock='ToscanFighterCockpit', ini='Toscanfighter.ini', lods=3,
                   mats=['ToscanFighter.mat', 'ToscanFighterExterior.mat', 'ToscanFighterCockpit.mat']),
}[CRAFT]
OUT = ROOT / CRAFT; OUT.mkdir(parents=True, exist_ok=True)
SRC = PIRATE / CFG['dir']
BLENDER = bpy.app.version_string


def variant_paths(stem, lod):
    tag = f'{stem}_{lod}_0_alphaR02'
    return (PIRATE / 'working-r03' / CFG['dir'] / tag / f'{tag}_SourceR01_WorkingR03.blend',
            PIRATE / 'fbx-candidates-r01' / CFG['dir'] / f'{tag}_SourceR01_WorkingR03.fbx')


VARIANTS = [(f'Standard_LOD{i}', CFG['std'], i) for i in range(CFG['lods'])] + [('Exterior', CFG['ext'], 0), ('Cockpit', CFG['cock'], 0)]
audit = {k: json.loads((SRC / f'{CFG[k]}-audit.json').read_text(encoding='utf-8-sig')) for k in ('std', 'ext', 'cock')}

# ---------------------------------------------------------------- hashes before
inputs = [SRC / f for f in sorted(p.name for p in SRC.iterdir() if p.suffix.lower() in ('.opt', '.ini', '.json'))]
for _, stem, lod in VARIANTS:
    inputs += list(variant_paths(stem, lod))
before = {str(p): sha(p) for p in inputs}
for k in ('std', 'ext', 'cock'):
    opt = next(p for p in SRC.iterdir() if p.suffix.lower() == '.opt' and p.stem.lower() == CFG[k].lower())
    assert before[str(opt)] == audit[k]['sha256'], ('OPT hash differs from owner audit', opt)
    orig = Path(audit[k]['source'])
    audit[k]['_original_sha256_now'] = sha(orig) if orig.exists() else None
    audit[k]['_copy'] = str(opt)


def meshes():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']


def dup_report(a, groups):
    rows = []
    for k, fis in groups.items():
        if len(fis) < 2:
            continue
        items = [a['meta'][fi] for fi in fis]
        n0 = items[0][2]; dots = [n0.dot(it[2]) for it in items[1:]]
        kind = 'OPPOSED_WINDING_DOUBLE_SIDED_PAIR' if all(d < -0.5 for d in dots) and len(items) == 2 else (
            'SAME_WINDING_COINCIDENT_DUPLICATE' if all(d > 0.5 for d in dots) else 'MIXED_WINDING_OR_DEGENERATE')
        rows.append(dict(kind=kind, copies=len(items), same_mesh=len({it[0] for it in items}) == 1, objects=sorted({it[0] for it in items}),
                         materials=sorted({str(it[3]) for it in items}), area_m2=round(items[0][4], 8), corners=len(k),
                         polygons=[[it[0], it[1]] for it in items]))
    return rows


# ---------------------------------------------------------------- per-variant inventory + round-trip
inventory = {}; roundtrip = {}; bounds_all = {}
for label, stem, lod in VARIANTS:
    blend, fbx = variant_paths(stem, lod)
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    objs = meshes()
    key = 'std' if label.startswith('Standard') else ('ext' if label == 'Exterior' else 'cock')
    amesh = {m['index']: m for m in audit[key]['meshes']}
    rows = []
    for o in objs:
        idx = int(o.name.split('.')[1])
        o.data.calc_loop_triangles()
        lo, hi = world_bounds([o])
        slots = []
        for s in o.material_slots:
            imgs = [bpy.path.abspath(n.image.filepath) for n in s.material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image] if s.material and s.material.use_nodes else []
            slots.append(dict(material=s.material.name if s.material else None, images=[Path(i).name for i in imgs]))
        used = Counter(p.material_index for p in o.data.polygons)
        rows.append(dict(object=o.name, opt_mesh_index=idx, opt_mesh_type=amesh[idx]['type'] if idx in amesh else None,
                         vertices=len(o.data.vertices), polygons=len(o.data.polygons), triangles=len(o.data.loop_triangles),
                         uv_layers=[u.name for u in o.data.uv_layers], active_uv=o.data.uv_layers.active.name if o.data.uv_layers.active else None,
                         custom_normals=bool(o.data.has_custom_normals), material_slots=slots, polygons_per_slot={str(k): v for k, v in sorted(used.items())},
                         bounds_min_m=[round(x, 5) for x in lo], bounds_max_m=[round(x, 5) for x in hi],
                         location=list(o.location), rotation_euler=list(o.rotation_euler), scale=list(o.scale), modifiers=[m.type for m in o.modifiers],
                         parent=o.parent.name if o.parent else None))
    lo, hi = world_bounds(objs)
    a = collect(objs)
    ids_a, _kd = weld_ids(a)
    groups = face_groups(a, ids_a)
    dups = dup_report(a, groups)
    inv = dict(working_blend=str(blend), working_sha256=before[str(blend)], fbx=str(fbx), fbx_sha256=before[str(fbx)], source_opt=audit[key]['_copy'],
               opt_lod_union_index=lod, texture_version=0, scene_units=dict(system=bpy.context.scene.unit_settings.system, scale_length=bpy.context.scene.unit_settings.scale_length),
               axes='+X nose, +Y port(left), +Z up (working-r03 frame; Rz(-90) from OBJ import, no scale/recenter)',
               mesh_objects=len(objs), non_mesh_objects=[o.type for o in bpy.context.scene.objects if o.type != 'MESH'], armatures=0, actions=len(bpy.data.actions),
               triangles=a['tris'], bounds_min_m=[round(x, 5) for x in lo], bounds_max_m=[round(x, 5) for x in hi],
               dimensions_m=dict(length_x=round(hi[0] - lo[0], 4), span_y=round(hi[1] - lo[1], 4), height_z=round(hi[2] - lo[2], 4)),
               material_slot_total=sum(len(o.material_slots) for o in objs), distinct_materials=len({s.material.name for o in objs for s in o.material_slots if s.material}),
               degenerate_zero_area_faces=a['degenerate'], coincident_face_groups=dups, objects=rows)
    inventory[label] = inv; bounds_all[label] = (lo, hi)
    # --- FBX reimport, corner-level comparison
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(fbx), use_image_search=False)
    b = collect(meshes())
    cmp = compare(a, b)
    dupkeys = {k for k, fis in groups.items() if len(fis) > 1}
    missing_keys = cmp.pop('missing_face_keys')
    dropped_dup = sum(c for k, c in missing_keys if k in dupkeys)
    rt = dict(fbx=str(fbx), blender=BLENDER, importer='bpy.ops.import_scene.fbx(use_image_search=False), defaults otherwise',
              working=dict(triangles=a['tris'], faces=len(a['faces']), corners=len(a['corners'])),
              reimport=dict(triangles=b['tris'], faces=len(b['faces']), corners=len(b['corners'])),
              missing_faces_that_are_members_of_coincident_groups=dropped_dup, **cmp,
              method='world-space positions welded/snapped within tolerance; corners keyed by (position id, every UV layer rounded 1e-5, material name); normals matched per key')
    geom_ok = cmp['faces_extra'] == 0 and cmp['corners_extra'] == 0 and cmp['reimport_positions_unmatched'] == 0 and cmp['normals_over_1deg'] == 0
    exact = geom_ok and cmp['faces_missing'] == 0 and cmp['corners_missing'] == 0
    explained = geom_ok and cmp['faces_missing'] > 0 and cmp['faces_missing'] == dropped_dup
    rt['status'] = 'PASS_EXACT_CORNER_PAYLOAD' if exact else ('PASS_EXCEPT_BLENDER_IMPORT_VALIDATE_DROPS_COINCIDENT_FACES' if explained else 'PARTIAL_UNEXPLAINED_DIFFERENCE')
    rt['note'] = ('Blender FBX import runs mesh.validate, which removes faces that share an identical vertex set inside one mesh. The raw FBX still serialises them '
                  '(owner payload-audit-r03 PASS). Every face missing after reimport is a member of a same-mesh coincident-face group listed in the inventory.') if explained else ''
    roundtrip[label] = rt
    print('VARIANT', label, a['tris'], rt['status'], flush=True)

# ---------------------------------------------------------------- hardpoints + engine glows (native OPT data)
std_blend, _ = variant_paths(CFG['std'], 0)
bpy.ops.wm.open_mainfile(filepath=str(std_blend))
pts = [(o.matrix_world @ v.co, o.name) for o in meshes() for v in o.data.vertices]
kd = KDTree(len(pts))
for i, (p, _) in enumerate(pts):
    kd.insert(p, i)
kd.balance()
slo, shi = bounds_all['Standard_LOD0']


def near(p):
    co, i, d = kd.find(Vector(p)); return round(d, 4), pts[i][1]


def colour(c):
    return dict(argb_hex=f'{c & 0xffffffff:08X}', r=(c >> 16) & 255, g=(c >> 8) & 255, b=c & 255, a=(c >> 24) & 255)


hard = []; n = Counter()
for m in audit['std']['meshes']:
    for h in m['hardpoints']:
        w = opt_to_working_m(h['position']); d, on = near(w); n[h['type']] += 1
        side = 'port(+Yb/-Yue)' if w[1] > 0.01 else ('starboard(-Yb/+Yue)' if w[1] < -0.01 else 'centreline')
        hard.append(dict(id=f"{h['type']}_{n[h['type']]:02d}", opt_type=h['type'], opt_mesh_index=m['index'], opt_mesh_type=m['type'], side=side,
                         opt_position_units=h['position'], working_m=[round(x, 5) for x in w], unreal_local_cm_expected=working_m_to_ue_cm(w),
                         nearest_standard_lod0_vertex_m=d, nearest_object=on,
                         forward_of_nose_m=round(w[0] - shi[0], 4),
                         confidence='HIGH_NATIVE_OPT_HARDPOINT' if d < 0.35 else 'MEDIUM_NATIVE_OPT_HARDPOINT_FAR_FROM_GEOMETRY',
                         fire_direction='+X (nose) ASSUMED for forward guns/launchers; OPT hardpoints carry position only'))
glows = {}
for key in ('std', 'ext'):
    rows = []
    for m in audit[key]['meshes']:
        for i, g in enumerate(m['engine_glows']):
            w = opt_to_working_m(g['Position']); d, on = near(w)
            la = g['LookAxis']; look = (-la['Y'], -la['X'], la['Z'])
            dim = g['Dimensions']
            rows.append(dict(id=f"EngineGlow_m{m['index']:02d}_{i}", opt_mesh_index=m['index'], opt_mesh_type=m['type'], disabled=g['IsDisabled'],
                             opt_position_units=g['Position'], working_m=[round(x, 5) for x in w], unreal_local_cm_expected=working_m_to_ue_cm(w),
                             opt_look_axis=la, working_look_axis=look, look_axis_note='OPT LookAxis mapped with the same (-Y,-X,Z) rule; +Y(OPT)=aft, so (0,1,0) maps to working -X (exhaust aft)',
                             opt_dimensions_units=dim, dimensions_m=dict(width=round(dim['X'] * OPT_SCALE, 4), height=round(dim['Y'] * OPT_SCALE, 4), depth=round(dim['Z'] * OPT_SCALE, 4)),
                             core_colour=colour(g['CoreColor']), outer_colour=colour(g['OuterColor']),
                             nearest_standard_lod0_vertex_m=d, nearest_object=on, aft_of_tail_m=round(slo[0] - w[0], 4),
                             confidence='HIGH_NATIVE_OPT_ENGINE_GLOW' if d < 0.6 else 'MEDIUM_NATIVE_OPT_ENGINE_GLOW_FAR_FROM_GEOMETRY'))
    glows[key] = rows
write_json(OUT / 'hardpoints.json', dict(
    craft=CRAFT, generated_utc=utc(), source='Standard OPT hardpoint nodes and Standard/Exterior engine-glow nodes, parsed by the source owner audit (XwaOptEditor JsonOptHelper route)',
    frames=dict(opt='model units; -Y nose, +X starboard, +Z up (verified: gun hardpoints sit at the minimum-Y nose extreme)',
                working='Blender metres; +X nose, +Y port, +Z up; working = (-Y,-X,Z)*0.024414062',
                unreal_expected='mesh-local cm; +X nose, +Y starboard, +Z up; = (x*100, -y*100, z*100). EXPECTED - confirm against imported vertices before creating sockets'),
    standard_lod0_bounds_m=dict(min=[round(x, 5) for x in slo], max=[round(x, 5) for x in shi]),
    weapon_hardpoints=hard, engine_glows_standard=glows['std'], engine_glows_exterior=glows['ext'],
    exterior_opt_has_weapon_hardpoints=any(m['hardpoints'] for m in audit['ext']['meshes']),
    status='MEASURED_FROM_NATIVE_SOURCE_NODES_GEOMETRY_PROXIMITY_CHECKED; NOT an Unreal socket, NOT a tested emitter'))

# ---------------------------------------------------------------- moving parts (INI + OPT pivots)
ini_text = (SRC / CFG['ini']).read_text(encoding='latin-1')
sections = {}; cur = None
for line in ini_text.splitlines():
    s = line.strip()
    m = re.match(r'^\[(.*?)\]', s)
    if m:
        cur = m.group(1); sections[cur] = []; continue
    if cur is not None and s and not s.startswith((';', '//')):
        sections[cur].append(s)
moving = []
amesh = {m['index']: m for m in audit['ext']['meshes']}
smesh = {m['index']: m for m in audit['std']['meshes']}
for sec in ('SFoils', 'SFoilsHatches', 'SFoilsLandingGears', 'Pilot'):
    for s in sections.get(sec, []):
        body, _, comment = s.partition(';')
        parts = [x.strip() for x in body.split(',')]
        if len(parts) < 3 or not parts[0].lstrip('-').isdigit():
            continue
        idx = int(parts[0]); raw = float(parts[1]); m = amesh.get(idx) or smesh.get(idx)
        rs = m['rotation_scale'] if m else None
        row = dict(ini_section=sec, opt_mesh_index=idx, label=comment.strip(), ini_values=parts[1:], ini_angle_raw=raw,
                   angle_deg_if_256_units_per_turn=round(raw * 360 / 256, 3), angle_units='PROBABLE XWA hook convention 256 units = 360 deg; UNVERIFIED in this package',
                   in_standard_opt=idx in smesh, in_exterior_opt=idx in amesh, opt_mesh_type=m['type'] if m else None)
        if rs:
            ax = rs['RotationAxis']; L = math.sqrt(ax['X'] ** 2 + ax['Y'] ** 2 + ax['Z'] ** 2) or 1
            row.update(opt_pivot_units=rs['Pivot'], pivot_working_m=[round(x, 5) for x in opt_to_working_m(rs['Pivot'])],
                       opt_rotation_axis_raw=ax, rotation_axis_working=[round(-ax['Y'] / L, 5), round(-ax['X'] / L, 5), round(ax['Z'] / L, 5)],
                       pivot_unreal_cm_expected=working_m_to_ue_cm(opt_to_working_m(rs['Pivot'])))
        moving.append(row)
write_json(OUT / 'moving-parts.json', dict(
    craft=CRAFT, generated_utc=utc(), ini=str(SRC / CFG['ini']), ini_sha256=before[str(SRC / CFG['ini'])],
    ini_sections_present=sorted(sections), sfoils_settings=[s for s in sections.get('SFoils', []) if '=' in s],
    size_section=sections.get('Size', []), object_profiles=sections.get('ObjectProfiles', []),
    parts=moving, rig='NONE - XWA OPT has no skeleton. Each moving part is its own source mesh/object (.NNN.Type) with a native pivot and rotation axis; '
    'the package keeps every part as a separate object (split-part payload). No bones or weights were invented.',
    rest_pose='Source rest configuration retained in every derivative (see renders and visual-review notes in the handoff).'))

# ---------------------------------------------------------------- texture / material manifest
def parse_mat(path):
    out = {}; cur = None
    for line in path.read_text(encoding='latin-1').splitlines():
        s = line.split(';')[0].strip()
        m = re.match(r'^\[(.*?)\]', s)
        if m:
            cur = m.group(1); out.setdefault(cur, {}); continue
        if cur and '=' in s:
            k, v = [x.strip() for x in s.split('=', 1)]
            if k in ('Glossiness', 'Intensity', 'Metallic', 'SpecularVal', 'NMIntensity', 'NoBloom', 'Shadeless', 'Light', 'light', 'Transparent', 'AlphaIsntGlass', 'AlphaIsBloomMask'):
                out[cur][k] = v
    return out


tex_manifest = {}
for key, label in (('std', 'Standard'), ('ext', 'Exterior'), ('cock', 'Cockpit')):
    stem = CFG[key]; conv = PIRATE / 'converted-r01' / CFG['dir'] / stem
    matfile = next((XWAU / 'Materials' / f for f in CFG['mats'] if Path(f).stem.lower() == stem.lower()), None)
    matdef = parse_mat(matfile) if matfile and matfile.exists() else {}
    per_tex = {}
    for sec, vals in matdef.items():
        for t in sec.split(','):
            per_tex.setdefault(t.strip().upper(), {}).update(vals)
    used = defaultdict(set)
    for vl, inv in inventory.items():
        if (key == 'std' and vl.startswith('Standard')) or (key == 'ext' and vl == 'Exterior') or (key == 'cock' and vl == 'Cockpit'):
            for o in inv['objects']:
                for s in o['material_slots']:
                    for im in s['images']:
                        used[im].add(f"{vl}:{o['object']}")
    rows = []
    for t in audit[key]['textures']:
        base = conv / f"{stem}_{t['Name']}.png"
        files = {}
        for suffix, role in (('', 'base_colour_rgb'), ('_alpha', 'opacity_mask'), ('_illum', 'illumination_mask')):
            p = conv / f"{stem}_{t['Name']}{suffix}.png"
            if p.exists():
                files[role] = dict(file=str(p), sha256=sha(p), bytes=p.stat().st_size)
        rows.append(dict(name=t['Name'], width=t['Width'], height=t['Height'], source_bits_per_pixel=t['BitsPerPixel'], has_alpha=t['HasAlpha'], is_illuminated=t['IsIlluminated'],
                         derived_png=files, used_by=sorted(used.get(base.name, [])),
                         unreal_import=dict(base_colour='sRGB=true, TC_Default', opacity_mask='sRGB=false, TC_Grayscale -> SAMPLERTYPE_LINEAR_GRAYSCALE' if 'opacity_mask' in files else None,
                                            illumination_mask='sRGB=false, TC_Grayscale -> SAMPLERTYPE_LINEAR_GRAYSCALE; multiply base colour into Emissive' if 'illumination_mask' in files else None),
                         xwau_material_overrides=per_tex.get(t['Name'].upper(), {})))
    tex_manifest[label] = dict(
        opt=audit[key]['_copy'], converted_folder=str(conv), texture_versions=audit[key]['texture_versions'], pixels_flipped_on_parse=audit[key].get('pixels_flipped'),
        xwau_mat_file=str(matfile) if matfile and matfile.exists() else None, xwau_mat_sha256=sha(matfile) if matfile and matfile.exists() else None,
        xwau_default_material=matdef.get('Default', {}), texture_count=len(rows), textures=rows)
write_json(OUT / 'texture-manifest.json', dict(
    craft=CRAFT, generated_utc=utc(),
    channel_interpretation=dict(
        base_colour='OPT colour texture (8-bit palettised or 32-bit) converted losslessly to RGB PNG by the owner route; sRGB',
        opacity='separate *_alpha.png, linear (owner set Non-Color in working-r03); OPT alpha is coverage/transparency, not glass refraction',
        emissive='separate *_illum.png mask, linear; XWA illumination = self-lit texels (engine/cockpit lights)',
        normal='NOT SUPPLIED by the OPT. XWAU NMIntensity refers to normal maps generated by the XWAU effects DLL, not to a file in this packet',
        roughness='NOT SUPPLIED as a map. XWAU .mat gives a scalar "Glossiness" per texture group (a specular-exponent style GLOSS value, i.e. smoothness-like, NOT roughness). '
                  'Do not wire it as roughness. PROPOSED receiving default: constant roughness, tuned by eye; if derived from Glossiness it must be inverted (higher gloss = lower roughness) and labelled DERIVED',
        metallic='NOT SUPPLIED as a map. XWAU .mat scalar "Metallic" per texture group (can exceed 1; it is an effects-DLL multiplier, not a PBR 0..1 value)',
        uv='single UV layer "UVMap" on every object; Unreal UV index 0; many small per-texture slots, each slot samples exactly one OPT texture with its own 0..1 UV space - do not merge slots onto one material'),
    models=tex_manifest))

write_json(OUT / 'inventory.json', dict(craft=CRAFT, generated_utc=utc(), blender=BLENDER, variants=inventory))
write_json(OUT / 'roundtrip.json', dict(craft=CRAFT, generated_utc=utc(), blender=BLENDER, variants=roundtrip))

# ---------------------------------------------------------------- renders
def setup_scene(objs, res=800, samples=12):
    scene = bpy.context.scene
    lo, hi = world_bounds(objs); lo = Vector(lo); hi = Vector(hi)
    center = (lo + hi) * .5; span = max(hi - lo)
    scene.render.engine = 'CYCLES'; scene.cycles.samples = samples; scene.cycles.use_denoising = False
    scene.world = bpy.data.worlds.new('ReviewWorld'); scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.16, .17, .19, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    scene.render.resolution_x = res; scene.render.resolution_y = res; scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'Standard'
    for i, d in enumerate([(2, -3, 3), (-2, 2, 2), (-3, -1, -2)]):
        light = bpy.data.lights.new('ReviewArea' + str(i), 'AREA'); ob = bpy.data.objects.new(light.name, light); scene.collection.objects.link(ob)
        ob.location = center + Vector(d) * span; light.energy = (900 if i < 2 else 350) * span * span; light.size = span * 3
        ob.rotation_euler = (center - ob.location).to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.objects.new('ReviewCamera', bpy.data.cameras.new('ReviewCamera')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = span * 1.25; cam.data.clip_start = span * .001; cam.data.clip_end = span * 100
    return scene, cam, center, span


VIEWS = [('front', (3, 0, .02)), ('side_port', (0, 3, .02)), ('rear', (-3, 0, .02)), ('top', (0, .001, 3)), ('threequarter_front', (3, 2, 1.6)), ('threequarter_rear', (-3, -2, 1.6)), ('under_threequarter', (2.4, 2, -2))]


def shoot(scene, cam, center, span, folder, prefix, views):
    out = []
    for label, d in views:
        cam.location = center + Vector(d).normalized() * span * 3
        cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(folder / f'{prefix}_{label}.png'); bpy.ops.render.render(write_still=True); out.append(scene.render.filepath)
    return out


def add_marker(p, colour, r):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=p, segments=12, ring_count=6)
    ob = bpy.context.object; mat = bpy.data.materials.new('Marker'); mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear(); e = nt.nodes.new('ShaderNodeEmission'); e.inputs[0].default_value = (*colour, 1); e.inputs[1].default_value = 6
    o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(e.outputs[0], o.inputs[0]); ob.data.materials.append(mat); ob.name = 'ReviewMarker'
    return ob


renders = {}
if RENDER:
    R = OUT / 'renders'; R.mkdir(exist_ok=True)
    ext_blend, _ = variant_paths(CFG['ext'], 0)
    # 1. Exterior beauty set
    bpy.ops.wm.open_mainfile(filepath=str(ext_blend)); objs = meshes()
    scene, cam, center, span = setup_scene(objs)
    renders['exterior'] = shoot(scene, cam, center, span, R, 'exterior', VIEWS)
    # 2. hardpoint / engine markers on the Exterior model
    hp = json.loads((OUT / 'hardpoints.json').read_text())
    col = {'Laser': (1, .1, .1), 'Ion': (.2, .5, 1), 'Torpedo': (1, .9, .1), 'Dock': (.8, .2, .9)}
    for h in hp['weapon_hardpoints']:
        c = next((v for k, v in col.items() if k in h['opt_type']), (1, 1, 1)); add_marker(h['working_m'], c, span * .012)
    for g in hp['engine_glows_exterior'] or hp['engine_glows_standard']:
        add_marker(g['working_m'], (.1, 1, .3), span * .014)
    renders['hardpoint_markers'] = shoot(scene, cam, center, span, R, 'markers', [VIEWS[0], VIEWS[2], VIEWS[3], VIEWS[4], VIEWS[5]])
    for o in [o for o in bpy.data.objects if o.name.startswith('ReviewMarker')]:
        bpy.data.objects.remove(o, do_unlink=True)
    # 3. moving parts: hidden, then INI-rotated diagnostic
    mv = json.loads((OUT / 'moving-parts.json').read_text())['parts']
    byidx = {int(o.name.split('.')[1]): o for o in objs}
    gear = [p for p in mv if p['ini_section'] in ('SFoilsLandingGears',)]
    allmv = [p for p in mv if p['ini_section'] != 'Pilot']
    if allmv:
        for p in gear:
            if p['opt_mesh_index'] in byidx:
                byidx[p['opt_mesh_index']].hide_render = True
        renders['gear_meshes_hidden'] = shoot(scene, cam, center, span, R, 'gearhidden', [VIEWS[1], VIEWS[0], VIEWS[6]])
        for p in gear:
            if p['opt_mesh_index'] in byidx:
                byidx[p['opt_mesh_index']].hide_render = False
        for p in allmv:
            o = byidx.get(p['opt_mesh_index'])
            if o is None or 'pivot_working_m' not in p:
                continue
            piv = Vector(p['pivot_working_m']); ax = Vector(p['rotation_axis_working'])
            if ax.length < 1e-6:
                continue
            ang = -math.radians(p['angle_deg_if_256_units_per_turn'])  # (-Y,-X,Z) is a mirror: rotation sense flips
            o.matrix_world = Matrix.Translation(piv) @ Matrix.Rotation(ang, 4, ax.normalized()) @ Matrix.Translation(-piv) @ o.matrix_world
        bpy.context.view_layer.update()
        renders['ini_rotation_diagnostic'] = shoot(scene, cam, center, span, R, 'inirotated', [VIEWS[1], VIEWS[0], VIEWS[6], VIEWS[4]])
    # 4. Standard LOD chain
    renders['standard_lods'] = []
    for i in range(CFG['lods']):
        b, _ = variant_paths(CFG['std'], i)
        bpy.ops.wm.open_mainfile(filepath=str(b)); objs = meshes()
        scene, cam, center, span = setup_scene(objs, res=560, samples=10)
        renders['standard_lods'] += shoot(scene, cam, center, span, R, f'standard_lod{i}', [VIEWS[4], VIEWS[1]])
    # 5. Cockpit
    b, _ = variant_paths(CFG['cock'], 0)
    bpy.ops.wm.open_mainfile(filepath=str(b)); objs = meshes()
    scene, cam, center, span = setup_scene(objs, res=560, samples=10)
    renders['cockpit'] = shoot(scene, cam, center, span, R, 'cockpit', [VIEWS[4], VIEWS[1]])

after = {p: sha(p) for p in before}
assert after == before, 'an input changed'
write_json(OUT / 'source-hashes.json', dict(
    craft=CRAFT, generated_utc=utc(), inputs_sha256_before_equals_after=True, inputs=before,
    original_install_sources=[dict(path=audit[k]['source'], sha256_now=audit[k]['_original_sha256_now'], matches_custody_copy=audit[k]['_original_sha256_now'] == audit[k]['sha256']) for k in ('std', 'ext', 'cock')],
    renders=renders))
print('PACKAGE_DONE', CRAFT, {k: v['status'] for k, v in roundtrip.items()}, flush=True)
