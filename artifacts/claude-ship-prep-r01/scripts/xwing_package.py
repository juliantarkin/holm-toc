"""X-wing T-65C A2 integration source package (Squadrons source, all four supplied LODs, split-part S-foil payload).

Run: blender(5.2.2) -b --factory-startup --python xwing_package.py -- [norender]

Existing work reused (read-only): artifacts/xwing-squadrons (first LOD0 intake, 25 Sep) and artifacts/craft-lod-batch-r1
(LOD0-3 static import + derived fixed "combat open" pose already saved in Experiment58 as SM_XWing_T65). This package does NOT
redo that static import. Its demonstrated gap is articulation: the production mesh is a single fixed-pose static mesh, and the
Squadrons dump FBX carries no armature, weights or actions. This script therefore keeps the source closed/landed pose intact and
splits it by faces only (no vertex moved, no UV/normal change) into rigid parts - four S-foil panels, fixed wing root, fuselage,
droid, glass and landing gear - with a measured hinge manifest. The hinge line and 18 degree open angle are the ones already
accepted in the production combat pose (craft-lod-batch-r1 prepare_craft_lods.py wing_open), not a new invention.
"""
import bpy, bmesh, sys, json, math
from pathlib import Path
from collections import Counter, defaultdict
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

sys.path.insert(0, str(Path(__file__).parent))
from common import *

RENDER = 'norender' not in sys.argv
OUT = ROOT / 'xwing-t65c'; OUT.mkdir(parents=True, exist_ok=True)
SQ = Path('C:/Games/Game Assets/Star Wars/Squadrons')
SRC_DIR = SQ / 'Vehicles/Rebellion/X-Wing T-65'
SRC_FBX = SRC_DIR / 'veh_reb_flex_xwingt65_mesh.fbx'
DRIVE = SQ / 'DriveSourceR01/!Source/SWS/Game/Environments/Vehicles/Rebel/Flex/XwingT65'
ATLAS = DRIVE / 'Textures/T_Veh_Reb_Flex_XwingT65_LOD_CS.tga'
PRIOR = Path('C:/Games/Multi Agent System/holm-toc/artifacts/craft-lod-batch-r1')
PRIOR_OPEN = PRIOR / 'prepared/xwing_open/SM_XWing_T65_LOD0.fbx'
BLENDER = bpy.app.version_string

# Hinge and masks, reused from craft-lod-batch-r1/scripts/prepare_craft_lods.py (values there are in pre-scale import units; x100 = metres)
X0 = 0.0215 * 100      # hinge line distance from centreline, metres
ZC = 0.0003 * 100      # hinge line height, metres
OPEN_DEG = 18.0
GEAR_BOXES_OLD = [[-0.0030, 0.0030, -0.0395, -0.0295, -0.0190, -0.0066], [0.0100, 0.0185, 0.0205, 0.0335, -0.0190, -0.0108], [-0.0185, -0.0100, 0.0205, 0.0335, -0.0190, -0.0108],
                  [-0.0008, 0.0008, -0.0395, -0.0295, -0.0066, -0.0025], [-0.0010, 0.0010, -0.0345, -0.0310, -0.0066, -0.0038],
                  [0.0125, 0.0165, 0.0285, 0.0330, -0.0108, -0.0068], [-0.0165, -0.0125, 0.0285, 0.0330, -0.0108, -0.0068]]
# old import frame (x, y, z) -> working (-y, x, z) * 100
GEAR_BOXES = [dict(x=(-b[3] * 100, -b[2] * 100), y=(b[0] * 100, b[1] * 100), z=(b[4] * 100, b[5] * 100)) for b in GEAR_BOXES_OLD]
SLOT = [('Droid', 'Droid'), ('Fuselage', 'Fuselage'), ('Window', 'Glass'), ('Wing1', 'Wing')]
TEX = {'Fuselage': 'Veh_Reb_Flex_XwingT65_Fuselage', 'Wing': 'Veh_Reb_Flex_XwingT65_Wing', 'Droid': 'T_Veh_Reb_Flex_XwingT65_Droid'}

src_files = sorted(p for p in SRC_DIR.iterdir() if p.is_file()) + [ATLAS]
before = {str(p): sha(p) for p in src_files}


def meshes():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']


def tri(o):
    o.data.calc_loop_triangles(); return len(o.data.loop_triangles)


# ------------------------------------------------------------------ 1. untouched source representation
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.ops.import_scene.fbx(filepath=str(SRC_FBX), use_image_search=False)
bpy.context.view_layer.update()
src_inv = []
for o in sorted(bpy.context.scene.objects, key=lambda o: o.name):
    r = dict(name=o.name, type=o.type, parent=o.parent.name if o.parent else None, location=list(o.location), rotation_euler=[round(x, 6) for x in o.rotation_euler],
             scale=[round(x, 6) for x in o.scale], matrix_world_determinant=round(o.matrix_world.determinant(), 12))
    if o.type == 'MESH':
        lo, hi = world_bounds([o])
        r.update(triangles=tri(o), vertices=len(o.data.vertices), polygons=len(o.data.polygons), uv_layers=[u.name for u in o.data.uv_layers],
                 active_uv=o.data.uv_layers.active.name if o.data.uv_layers.active else None, material_slots=[s.material.name if s.material else None for s in o.material_slots],
                 custom_normals=bool(o.data.has_custom_normals), vertex_groups=[g.name for g in o.vertex_groups], modifiers=[m.type for m in o.modifiers],
                 shape_keys=bool(o.data.shape_keys), world_bounds_min=[round(x, 6) for x in lo], world_bounds_max=[round(x, 6) for x in hi],
                 color_attributes=[a.name for a in o.data.color_attributes])
    src_inv.append(r)
src_summary = dict(armatures=[o.name for o in bpy.context.scene.objects if o.type == 'ARMATURE'], actions=[a.name for a in bpy.data.actions],
                   materials=[m.name for m in bpy.data.materials], images=[i.name for i in bpy.data.images],
                   scene_units=dict(system=bpy.context.scene.unit_settings.system, scale_length=bpy.context.scene.unit_settings.scale_length))
SRC_BLEND = OUT / 'XWing_T65C_SquadronsSource_R01.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(SRC_BLEND))

# ------------------------------------------------------------------ 2. working frame (proven recipe: x100, Rz+90, no recentre)
groups = defaultdict(list)
for o in meshes():
    pn = o.parent.name if o.parent else ''
    assert pn[-4:-1] == 'lod', (o.name, pn)
    groups[int(pn[-1])].append(o)
rot = Matrix.Rotation(math.pi / 2, 4, 'Z')
for lod, objs in groups.items():
    for o in objs:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = Matrix.Scale(100, 4) @ rot @ mw
bpy.context.view_layer.update()
for o in meshes():
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in [o for o in bpy.context.scene.objects if o.type == 'EMPTY']:
    bpy.data.objects.remove(o, do_unlink=True)
bpy.context.view_layer.update()


def slot_for(name):
    return next((s for sub, s in SLOT if sub in name), None)


def make_mat(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    img = None
    if name in TEX:
        img = SRC_DIR / (TEX[name] + ('_Default_C.tga' if name == 'Droid' else '_C.tga'))
    elif name == 'XWing_LOD_Atlas':
        img = ATLAS
    if img and img.exists():
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(str(img), check_existing=True)
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    elif name == 'Glass':
        bsdf.inputs['Base Color'].default_value = (.02, .03, .04, 1); bsdf.inputs['Roughness'].default_value = .1
    bsdf.inputs['Roughness'].default_value = .55 if name != 'Glass' else .1
    return m


def in_gear(c):
    return any(b['x'][0] <= c.x <= b['x'][1] and b['y'][0] <= c.y <= b['y'][1] and b['z'][0] <= c.z <= b['z'][1] for b in GEAR_BOXES)


def classify(o, slot, c, is_atlas):
    if in_gear(c):
        return 'LandingGear'
    if slot == 'Wing' or is_atlas:
        if abs(c.y) > X0:
            return 'SFoil_' + ('Upper' if c.z > ZC else 'Lower') + ('Port' if c.y > 0 else 'Starboard')
        return 'WingRootFixed' if slot == 'Wing' else 'HullFixed'
    return slot


lod_inventory = {}; split_check = {}; part_objects = defaultdict(dict)
for lod in sorted(groups):
    objs = groups[lod]; is_atlas = lod == 3
    rows = []
    for o in objs:
        slot = 'XWing_LOD_Atlas' if is_atlas else slot_for(o.name)
        assert slot, o.name
        o.data.materials.clear(); o.data.materials.append(make_mat(slot))
        for p in o.data.polygons:
            p.material_index = 0
        ref = collect([o])
        mw = o.matrix_world
        member = defaultdict(list); straddle = 0
        for p in o.data.polygons:
            c = mw @ p.center
            part = classify(o, slot, c, is_atlas)
            member[part].append(p.index)
            if part.startswith('SFoil') or part in ('WingRootFixed', 'HullFixed'):
                ys = [abs((mw @ o.data.vertices[v].co).y) for v in p.vertices]
                if (slot == 'Wing' or is_atlas) and min(ys) <= X0 < max(ys):
                    straddle += 1
        lo, hi = world_bounds([o])
        rows.append(dict(source_object=o.name, slot=slot, triangles=tri(o), uv_layers=[u.name for u in o.data.uv_layers], custom_normals=bool(o.data.has_custom_normals),
                         bounds_min_m=[round(x, 5) for x in lo], bounds_max_m=[round(x, 5) for x in hi],
                         faces_per_part={k: len(v) for k, v in sorted(member.items())}, faces_straddling_hinge_plane=straddle))
        made = []
        for part, faces in member.items():
            me = o.data.copy(); keep = set(faces)
            # carry the evaluated source corner normals through the split as data, then re-apply them as custom normals
            # (deleting neighbour faces otherwise changes how stored custom normals decode on the cut boundary)
            att = me.attributes.new('src_n', 'FLOAT_VECTOR', 'CORNER')
            att.data.foreach_set('vector', [c for cn in o.data.corner_normals for c in cn.vector])
            bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
            bm.to_mesh(me); bm.free(); me.update()
            vals = [tuple(d.vector) for d in me.attributes['src_n'].data]
            me.attributes.remove(me.attributes['src_n']); me.normals_split_custom_set(vals); me.update()
            name = f'XW_LOD{lod}_{part}'
            if name in bpy.data.objects:      # e.g. LandingGear faces coming from two source objects: keep separate, suffix by slot
                name = f'XW_LOD{lod}_{part}_{slot}'
            me.name = name; no = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(no)
            no.matrix_world = o.matrix_world.copy(); made.append(no); part_objects[lod][name] = no
        bpy.context.view_layer.update()
        cmp = compare(ref, collect(made)); cmp.pop('missing_face_keys')
        ok = all(cmp[k] == 0 for k in ('faces_missing', 'faces_extra', 'corners_missing', 'corners_extra', 'reimport_positions_unmatched', 'normals_over_1deg'))
        split_check[o.name] = dict(status='PASS_SPLIT_IS_EXACT_FACE_PARTITION' if ok else 'FAIL', **cmp)
        bpy.data.objects.remove(o, do_unlink=True)
    lo, hi = world_bounds(list(part_objects[lod].values()))
    lod_inventory[str(lod)] = dict(source_objects=rows, triangles=sum(r['triangles'] for r in rows), bounds_min_m=[round(x, 5) for x in lo], bounds_max_m=[round(x, 5) for x in hi],
                                   dimensions_m=dict(length_x=round(hi[0] - lo[0], 4), span_y=round(hi[1] - lo[1], 4), height_z=round(hi[2] - lo[2], 4)),
                                   parts={n: dict(triangles=tri(o), material=o.material_slots[0].material.name) for n, o in sorted(part_objects[lod].items())})
    print('LOD', lod, lod_inventory[str(lod)]['triangles'], {k: v['status'] for k, v in split_check.items()}, flush=True)

# collections per LOD
for lod, parts in part_objects.items():
    col = bpy.data.collections.new(f'XWing_T65C_LOD{lod}'); bpy.context.scene.collection.children.link(col)
    for o in parts.values():
        for c in list(o.users_collection):
            c.objects.unlink(o)
        col.objects.link(o)
bpy.context.view_layer.update()

# ------------------------------------------------------------------ 3. hinge manifest + hardpoint candidates (LOD0)
def hinge(part):
    side = 1 if 'Port' in part else -1; up = 1 if 'Upper' in part else -1
    return Vector((0, side * X0, ZC)), side * up * OPEN_DEG


def open_matrix(part, deg=None):
    p, a = hinge(part); a = a if deg is None else math.copysign(deg, a)
    return Matrix.Translation(p) @ Matrix.Rotation(math.radians(a), 4, 'X') @ Matrix.Translation(-p)


def cluster(o, axis_sign, band):
    pts = [o.matrix_world @ v.co for v in o.data.vertices]
    ext = max(p.x * axis_sign for p in pts)
    sel = [p for p in pts if p.x * axis_sign > ext - band]
    c = sum(sel, Vector()) / len(sel)
    return c, len(sel), ext * axis_sign


hinges = []; cands = []
for name, o in sorted(part_objects[0].items()):
    if 'SFoil' not in name:
        continue
    part = name.split('_', 2)[2]
    p, a = hinge(part); M = open_matrix(part)
    lo, hi = world_bounds([o])
    hinges.append(dict(part=part, objects_per_lod=[f'XW_LOD{l}_{part}' for l in sorted(part_objects) if f'XW_LOD{l}_{part}' in part_objects[l]],
                       pivot_working_m=[round(x, 4) for x in p], axis_working=[1, 0, 0], open_angle_deg_right_hand_about_working_plusX=a, closed_angle_deg=0.0,
                       pivot_unreal_cm_expected=working_m_to_ue_cm(p), motion='upper panels tips rise, lower panels tips drop; hinge line parallel to the nose axis',
                       closed_bounds_min_m=[round(x, 4) for x in lo], closed_bounds_max_m=[round(x, 4) for x in hi]))
    tip, n1, _ = cluster(o, +1, 0.02)
    for kind, c, n, band, conf, note in (
            ('laser_muzzle', tip, n1, 0.02, 'HIGH_GEOMETRY_CANNON_TIP', 'forward-most vertex ring of this S-foil panel (cannon barrel tip)'),):
        co = M @ c
        cands.append(dict(id=f'{kind}_{part.replace("SFoil_", "")}', kind=kind, part=part, confidence=conf, basis=note, vertices_in_cluster=n, band_m=band,
                          closed_pose_working_m=[round(x, 4) for x in c], closed_pose_unreal_cm_expected=working_m_to_ue_cm(c),
                          open18_pose_working_m=[round(x, 4) for x in co], open18_pose_unreal_cm_expected=working_m_to_ue_cm(co),
                          direction='+X (nose)' if kind == 'laser_muzzle' else '-X (aft)'))
# engine nozzles: they sit INBOARD of the production hinge line, in the fixed wing-root part, so they do not move with these panels
root = part_objects[0]['XW_LOD0_WingRootFixed']; rp = [root.matrix_world @ v.co for v in root.data.vertices]; aft = min(p.x for p in rp)
for sy, sn in ((1, 'Port'), (-1, 'Starboard')):
    for sz, un in ((1, 'Upper'), (-1, 'Lower')):
        sel = [p for p in rp if p.x < aft + 0.05 and p.y * sy > 0 and (p.z - ZC) * sz > 0]
        c = sum(sel, Vector()) / len(sel)
        cands.append(dict(id=f'engine_exhaust_{un}{sn}', kind='engine_exhaust', part='WingRootFixed', confidence='HIGH_GEOMETRY_NOZZLE_RIM_CENTROID',
                          basis='centroid of the aft-most 5 cm vertex ring of the engine nozzle', vertices_in_cluster=len(sel), band_m=0.05,
                          ring_extent_m=dict(y=[round(min(p.y for p in sel), 3), round(max(p.y for p in sel), 3)], z=[round(min(p.z for p in sel), 3), round(max(p.z for p in sel), 3)]),
                          closed_pose_working_m=[round(x, 4) for x in c], closed_pose_unreal_cm_expected=working_m_to_ue_cm(c),
                          open18_pose_working_m=[round(x, 4) for x in c], open18_pose_unreal_cm_expected=working_m_to_ue_cm(c),
                          moves_with_sfoils=False, direction='-X (aft)'))
prior_tips = dict(closed_ue_cm=dict(upper=[242.1, 491.2, 46.5], lower=[242.2, 490.6, -38.2]),
                  open_registry_ue_cm=dict(upper=[242.1, 464.2, 129.7], lower=[242.2, 464.4, -121.4]),
                  source='craft-lod-batch-r1 prepare_craft_lods.py and the Ship Registry Sockets field (absolute Y, sign by side)')
for c in cands:
    if c['kind'] == 'laser_muzzle':
        k = 'upper' if 'Upper' in c['part'] else 'lower'
        for pose, ref in (('closed', prior_tips['closed_ue_cm'][k]), ('open18', prior_tips['open_registry_ue_cm'][k])):
            v = c[f'{pose}_pose_unreal_cm_expected']
            c[f'{pose}_delta_vs_prior_cm'] = [round(v[0] - ref[0], 2), round(abs(v[1]) - ref[1], 2), round(v[2] - ref[2], 2)]

# ------------------------------------------------------------------ 4. verify the open pose against the production-accepted open mesh
open_check = dict(status='NOT_RUN', reason='prior open FBX missing')
if PRIOR_OPEN.exists():
    wing_pts = []
    for name, o in part_objects[0].items():
        if 'SFoil' in name:
            M = open_matrix(name.split('_', 2)[2])
            wing_pts += [(M @ (o.matrix_world @ v.co), abs((o.matrix_world @ v.co).y) > X0) for v in o.data.vertices]
    existing = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(PRIOR_OPEN), use_image_search=False)
    new = [o for o in bpy.data.objects if o not in existing]
    pp = [o.matrix_world @ v.co for o in new if o.type == 'MESH' for v in o.data.vertices]
    prior_scale = 100.0 if max(abs(c) for p in pp for c in p) < 1.0 else 1.0
    pp = [p * prior_scale for p in pp]
    kd = KDTree(len(pp))
    for i, p in enumerate(pp):
        kd.insert(p, i)
    kd.balance()
    d_out = [kd.find(p)[2] for p, outboard in wing_pts if outboard]; d_in = [kd.find(p)[2] for p, outboard in wing_pts if not outboard]
    open_check = dict(prior_reimport_scale_normalisation=prior_scale, prior_fbx=str(PRIOR_OPEN), prior_fbx_sha256=sha(PRIOR_OPEN), sfoil_vertices_outboard_of_hinge=len(d_out), max_distance_m=round(max(d_out), 6),
                      over_1mm=sum(d > 0.001 for d in d_out), sfoil_vertices_inboard_of_hinge_plane=len(d_in), inboard_max_distance_m=round(max(d_in), 6) if d_in else 0,
                      note='Rotating the split panels rigidly by 18 deg about the hinge reproduces the production open-pose LOD0 vertices outboard of the hinge. '
                           'Vertices of straddling faces that lie inboard of the hinge plane were NOT rotated in the production mesh (it stretched those faces); as rigid parts they move with the panel.',
                      status='PASS' if max(d_out) < 0.001 else 'PARTIAL')
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)

# ------------------------------------------------------------------ 5. save working blend, export one split-part FBX per LOD, round-trip
WORK_BLEND = OUT / 'XWing_T65C_SplitParts_Working_R01.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(WORK_BLEND))
FBX_ARGS = dict(use_selection=True, object_types={'MESH'}, global_scale=1, apply_unit_scale=True, apply_scale_options='FBX_SCALE_NONE', use_space_transform=True,
                bake_space_transform=False, axis_forward='-Y', axis_up='Z', use_mesh_modifiers=True, mesh_smooth_type='OFF', use_tspace=False, bake_anim=False,
                add_leaf_bones=False, path_mode='ABSOLUTE')
exports = {}
(OUT / 'fbx').mkdir(exist_ok=True)
for lod in sorted(part_objects):
    objs = list(part_objects[lod].values())
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    f = OUT / 'fbx' / f'SM_XWing_T65C_SplitParts_LOD{lod}_R01.fbx'
    bpy.ops.export_scene.fbx(filepath=str(f), **FBX_ARGS)
    exports[lod] = dict(fbx=str(f), sha256=sha(f), bytes=f.stat().st_size, objects=sorted(o.name for o in objs), ref=collect(objs))
work_sha = sha(WORK_BLEND)
rt = {}
for lod, e in exports.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=e['fbx'], use_image_search=False)
    imp = meshes(); b = collect(imp)
    cmp = compare(e['ref'], b); mk = cmp.pop('missing_face_keys')
    ok = all(cmp[k] == 0 for k in ('faces_missing', 'faces_extra', 'corners_missing', 'corners_extra', 'reimport_positions_unmatched', 'normals_over_1deg'))
    rt[str(lod)] = dict(fbx=e['fbx'], sha256=e['sha256'], objects_exported=len(e['objects']), objects_reimported=len(imp),
                        reimport_object_names_match=sorted(o.name for o in imp) == e['objects'], uv_layers_reimported=sorted({tuple(u.name for u in o.data.uv_layers) for o in imp}),
                        working=dict(triangles=e['ref']['tris'], faces=len(e['ref']['faces']), corners=len(e['ref']['corners'])),
                        reimport=dict(triangles=b['tris'], faces=len(b['faces']), corners=len(b['corners'])), **cmp,
                        status='PASS_EXACT_CORNER_PAYLOAD' if ok else 'PARTIAL_DIFFERENCE')
    del e['ref']
    print('ROUNDTRIP', lod, rt[str(lod)]['status'], flush=True)

write_json(OUT / 'inventory.json', dict(
    craft='xwing-t65c', generated_utc=utc(), blender=BLENDER, source_fbx=str(SRC_FBX), source_fbx_sha256=before[str(SRC_FBX)],
    source_import=dict(objects=src_inv, **src_summary),
    source_findings=dict(rig='NONE in the dump FBX: no armature, vertex groups, shape keys or actions', s_foils='single mesh "Wing1" holds all four panels in the CLOSED pose',
                         landing_gear='modelled deployed (landed) in the source', lods='four LOD empties; LOD3 is a single atlas-mapped object',
                         units='FBX imports through 0.01-scaled, X+90deg empties; world size is 1/100 of physical size'),
    working_frame=dict(transform='Scale(100) @ Rz(+90deg) @ source world matrix, applied to mesh data; no recentre',
                       axes='+X nose, +Y port(left), +Z up, metres', scale_basis='Same factor as the proven Squadrons recipe (Y-wing / craft-lod-batch-r1) whose result was verified numerically against the '
                       'production static mesh. The x100 reverses the importer unit shrink; it is not a size fudge.',
                       split='faces assigned by centroid: gear boxes first, then |y|>2.15 m => S-foil panel (upper if z>0.03 m), else fixed. Vertices are never moved.'),
    lods=lod_inventory, split_partition_check=split_check))
write_json(OUT / 'roundtrip.json', dict(craft='xwing-t65c', generated_utc=utc(), blender=BLENDER, export_preset={k: (sorted(v) if isinstance(v, set) else v) for k, v in FBX_ARGS.items()},
                                        working_blend=str(WORK_BLEND), working_blend_sha256=work_sha, lods=rt))
write_json(OUT / 'articulation.json', dict(
    craft='xwing-t65c', generated_utc=utc(), type='SPLIT_PART_RIGID_PAYLOAD (no skeleton)', derived=True,
    provenance='Hinge line (2.15 m from centreline, z 0.03 m) and 18 deg open angle come from craft-lod-batch-r1 wing_open, which produced the production combat pose. '
               'Squadrons ships S-foil motion through engine-side data that is not in the dump FBX; no source hinge transform was recovered.',
    hinges=hinges, open_pose_check_against_production_mesh=open_check,
    landing_gear=dict(objects=sorted(n for n in part_objects[0] if 'LandingGear' in n), boxes_working_m=GEAR_BOXES,
                      note='Face masks are the seven removal boxes of the production xwing_open recipe. Hide or omit these parts for flight; the production recipe also raised three gear-bay flap regions '
                           'by 1.2 cm (raise_boxes) - that vertex edit is NOT applied here, so the bay flaps sit in their source position.'),
    hardpoint_candidates=cands, prior_reference=prior_tips,
    torpedo_launchers='NOT_MEASURED - no unambiguous launcher aperture could be identified automatically in the Squadrons geometry; the Registry XWAU OPT hardpoints are a different model and only a cross-reference',
    droid='separate rigid part XW_LODn_Droid (LOD0-2); merged into the atlas object at LOD3', cockpit='exterior glass kept as XW_LOD0_Glass; the Squadrons cockpit meshes exist only as XML descriptors in DriveSourceR01 (no mesh FBX) - interior NOT AVAILABLE in this package'))

# ------------------------------------------------------------------ 6. renders
renders = {}
if RENDER:
    R = OUT / 'renders'; R.mkdir(exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(WORK_BLEND))

    def lod_objs(l):
        return [o for o in meshes() if o.name.startswith(f'XW_LOD{l}_')]

    def only(l):
        for o in meshes():
            o.hide_render = not o.name.startswith(f'XW_LOD{l}_')

    scene = bpy.context.scene
    lo, hi = world_bounds(lod_objs(0)); lo = Vector(lo); hi = Vector(hi); center = (lo + hi) * .5; span = max(hi - lo)
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 12; scene.cycles.use_denoising = False
    scene.world = bpy.data.worlds.new('ReviewWorld'); scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.16, .17, .19, 1)
    scene.render.resolution_x = 800; scene.render.resolution_y = 800; scene.view_settings.view_transform = 'Standard'
    for i, d in enumerate([(2, -3, 3), (-2, 2, 2), (-3, -1, -2)]):
        light = bpy.data.lights.new('ReviewArea' + str(i), 'AREA'); ob = bpy.data.objects.new(light.name, light); scene.collection.objects.link(ob)
        ob.location = center + Vector(d) * span; light.energy = (900 if i < 2 else 350) * span * span; light.size = span * 3
        ob.rotation_euler = (center - ob.location).to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.objects.new('ReviewCamera', bpy.data.cameras.new('ReviewCamera')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = span * 1.25; cam.data.clip_start = span * .001; cam.data.clip_end = span * 100
    VIEWS = [('front', (3, 0, .02)), ('side_port', (0, 3, .02)), ('rear', (-3, 0, .02)), ('top', (0, .001, 3)), ('threequarter_front', (3, 2, 1.6)), ('threequarter_rear', (-3, -2, 1.6)), ('under_threequarter', (2.4, 2, -2))]

    def shoot(prefix, views):
        out = []
        for label, d in views:
            cam.location = center + Vector(d).normalized() * span * 3
            cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
            scene.render.filepath = str(R / f'{prefix}_{label}.png'); bpy.ops.render.render(write_still=True); out.append(scene.render.filepath)
        return out

    def marker(p, colour, r):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=p, segments=12, ring_count=6)
        ob = bpy.context.object; mat = bpy.data.materials.new('Marker'); mat.use_nodes = True
        nt = mat.node_tree; nt.nodes.clear(); e = nt.nodes.new('ShaderNodeEmission'); e.inputs[0].default_value = (*colour, 1); e.inputs[1].default_value = 6
        o2 = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(e.outputs[0], o2.inputs[0]); ob.data.materials.append(mat); ob.name = 'ReviewMarker'

    only(0)
    renders['lod0_source_pose_closed_gear_down'] = shoot('lod0_closed', VIEWS)
    for o in meshes():
        o.hide_render = not (o.name.startswith('XW_LOD0_') and 'LandingGear' in o.name)
    renders['lod0_landing_gear_parts_only'] = shoot('lod0_gearonly', [VIEWS[1], VIEWS[6]])
    only(0)
    for c in cands:
        marker(c['closed_pose_working_m'], (1, .1, .1) if c['kind'] == 'laser_muzzle' else (.1, 1, .3), span * .012)
    renders['lod0_closed_markers'] = shoot('lod0_closed_markers', [VIEWS[0], VIEWS[2], VIEWS[4], VIEWS[5]])
    for o in [o for o in bpy.data.objects if o.name.startswith('ReviewMarker')]:
        bpy.data.objects.remove(o, do_unlink=True)
    # open 18 deg preview, gear hidden (render-only transform; the saved blend keeps the closed pose)
    for l in sorted(part_objects):
        for o in lod_objs(l):
            if 'SFoil' in o.name:
                o.matrix_world = open_matrix(o.name.split('_', 2)[2]) @ o.matrix_world
            if 'LandingGear' in o.name:
                o.hide_render = True
    bpy.context.view_layer.update()
    gear_hidden = [o for o in meshes() if 'LandingGear' in o.name]
    for o in meshes():
        o.hide_render = not o.name.startswith('XW_LOD0_') or 'LandingGear' in o.name
    renders['lod0_open18_gear_hidden'] = shoot('lod0_open18', [VIEWS[0], VIEWS[1], VIEWS[2], VIEWS[4], VIEWS[5], VIEWS[6]])
    for c in cands:
        marker(c['open18_pose_working_m'], (1, .1, .1) if c['kind'] == 'laser_muzzle' else (.1, 1, .3), span * .012)
    renders['lod0_open18_markers'] = shoot('lod0_open18_markers', [VIEWS[0], VIEWS[2], VIEWS[4]])
    for o in [o for o in bpy.data.objects if o.name.startswith('ReviewMarker')]:
        bpy.data.objects.remove(o, do_unlink=True)
    scene.render.resolution_x = 560; scene.render.resolution_y = 560
    renders['lods_open18'] = []
    for l in sorted(part_objects):
        for o in meshes():
            o.hide_render = not o.name.startswith(f'XW_LOD{l}_') or 'LandingGear' in o.name
        renders['lods_open18'] += shoot(f'lod{l}_open18_small', [VIEWS[4], VIEWS[0]])

after = {p: sha(p) for p in before}
assert after == before, 'a source file changed'
write_json(OUT / 'source-hashes.json', dict(craft='xwing-t65c', generated_utc=utc(), sources_sha256_before_equals_after=True, sources=before,
                                            outputs={str(SRC_BLEND): sha(SRC_BLEND), str(WORK_BLEND): sha(WORK_BLEND), **{e['fbx']: e['sha256'] for e in exports.values()}}, renders=renders))
print('XWING_DONE', {k: v['status'] for k, v in rt.items()}, open_check.get('status'), flush=True)
