"""Assemble per-craft handoff manifests and the full Markdown handoff from the generated JSON receipts (system Python)."""
import json, hashlib, datetime
from pathlib import Path
from collections import Counter

ROOT = Path('C:/Games/Multi Agent System/holm-toc/artifacts/claude-ship-prep-r01')
PIR = 'C:/Games/Multi Agent System/holm-toc/artifacts/overnight-sprint-r01/pirate-source-r01'
OWNER = 'Claude Code background session / claude-fable-5-2 (Fable 5.2)'
NOW = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
J = lambda p: json.loads(Path(p).read_text(encoding='utf-8'))
CR = {'twing': ('T-wing Interceptor', 'https://app.notion.com/p/3e836ffbe800811cb05fdca817613383', 'https://trello.com/c/xp5C1qML', 'https://trello.com/c/EevzljnA', 'pirate1-twing'),
      'r41': ('R-41 Starchaser', 'https://app.notion.com/p/3e836ffbe80081db8623e023c06f8190', 'https://trello.com/c/YvdTaahj', 'https://trello.com/c/Lc4FTXjs', 'pirate2-r41'),
      'toscan': ('Toscan 8-Q Fighter', 'https://app.notion.com/p/3e836ffbe8008191aeefd9373e9cbf01', 'https://trello.com/c/S4EWxGFE', 'https://trello.com/c/yrGWFCQi', 'pirate3-toscan')}
VISUAL = {
 'twing': 'Inspected contact sheets (exterior 7 views, markers, LODs, cockpit, gear-hidden, INI-rotated). Rest pose is the FLIGHT configuration: gear retracted, hatches and canopy closed, clean underside. Three engines, nose twin lasers and mid-hull torpedo markers sit on the visible hardware. The INI-rotated diagnostic deploys gear/hatches/canopy but some parts swing above the hull, so the sign/units assumption for the INI angles is NOT confirmed.',
 'r41': 'Inspected contact sheets (exterior 7 views, markers, LODs, cockpit). Rest pose is the flight configuration; the INI lists no gear, hatch or S-foil meshes. Four engine-glow markers sit on the four nozzles, laser markers on the wingtip cannon tips, ion markers on the chin guns, torpedo markers beside the nose (0.84 m from the nearest Standard LOD0 vertex, so MEDIUM).',
 'toscan': 'Inspected contact sheets (exterior 7 views, markers, LODs, cockpit). Rest pose is the flight configuration; the INI lists no gear, hatch or S-foil meshes. Four laser markers sit on the ends of the vertical wingtip fins, two ion markers on the nose guns, two engine markers on the nozzles. The two Torpedo hardpoints are IDENTICAL in the source (both port side) - a source quirk, not a conversion fault. Dock hardpoints float above/below the hull by design.'}
md = []
def w(s=''):
    md.append(s)

w('# Sprint fighter Blender source preparation R01 - handoff')
w(f'Owner: {OWNER}. Generated {NOW}. Offline source preparation only: no Unreal import, Blueprint, build, cook or Content/Source/Config write. Nothing here is a flyable ship.')
w()
w('## BLUF')
w('- T-wing, R-41 and Toscan: integration source packages are complete for Blender scope. The overnight owner\'s 16 FBX derivatives were NOT reconverted; the open "8 PASS / 8 PARTIAL" Blender reimport result is now explained and closed at corner level (see Duplicate faces).')
w('- X-wing T-65C A2 (scope corrected by Jamie during this task): Experiment58 already has a playable BP_XWing_Player on SM_XWing_T65. Nothing was replaced, duplicated or reimported. This package is an OPTIONAL articulation source: rigid split parts for the four S-foil panels and the landing gear, with a measured hinge manifest. Landing-gear geometry DOES exist in the Squadrons source.')
w('- Remaining work is Unreal receiving, owned by the current editor owner (overnight Sol agent), plus design decisions listed under Decisions for Jamie.')
w()
w('## Existing workflows and assets considered')
w('- WF-SHIP-IMPORT: starfighter-asset-pipeline.md, starfighter-complete-sop-20261002.md, execution-pack-20261002.md, z95-worked-example.md, registry-stage-rule-20261021.md, squadrons-source-lods-addendum-20261020.md (all read in full). Reused: source custody/hash rule, +X nose working frame, static FBX preset (-Y forward, Z up, FBX_SCALE_NONE, apply unit, no smoothing, no tangents), no auto x100, no merge/decimate/UV repack.')
w('- Pirate source packet artifacts/overnight-sprint-r01/pirate-source-r01 (verified GPT-6.1 Sol owner): custody copies, audits, converted-r01, blender-source-r02, working-r03, fbx-candidates-r01, payload-audit-r03. REUSED read-only; hashes equal before and after.')
w('- X-wing: artifacts/xwing-squadrons (25 Sep LOD0 intake) and artifacts/craft-lod-batch-r1 (LOD0-3 static import, derived combat pose, hinge 2.15 m / 18 deg, gear removal boxes). REUSED: transform, hinge, gear masks, slot names. Not redone: the static production import.')
w('- Rejected: historical Z-95 preset import_mesh_lods=false for the pirates/X-wing (they have source LODs); any skeleton for OPT craft (source has none).')
w()

summary_rows = []
for craft, (title, reg, sprint, canon, pdir) in CR.items():
    inv = J(ROOT / craft / 'inventory.json')['variants']; rt = J(ROOT / craft / 'roundtrip.json')['variants']
    hp = J(ROOT / craft / 'hardpoints.json'); mv = J(ROOT / craft / 'moving-parts.json'); tx = J(ROOT / craft / 'texture-manifest.json')['models']
    sh = J(ROOT / craft / 'source-hashes.json')
    ext = inv['Exterior']; std0 = inv['Standard_LOD0']
    dupk = Counter((g['kind'], 'same mesh' if g['same_mesh'] else 'across meshes') for v in inv.values() for g in v['coincident_face_groups'])
    gates = {
        'source_preserved_hashed': 'PASS', 'bounds_axes_units': 'PASS (measured); approved-size comparison NOT_AVAILABLE (Registry Real-world length empty)',
        'inventory_lods_parts_slots_uv': 'PASS', 'inspected_working_blend': 'PASS (owner working-r03, reopened and inventoried here)',
        'export_fbx': 'PASS (owner fbx-candidates-r01, reused by hash)',
        'fbx_roundtrip_geometry_uv_normals_material': 'PASS' if all(v['status'].startswith('PASS') for v in rt.values()) else 'PARTIAL',
        'texture_channel_manifest': 'PASS for supplied channels; roughness/normal/metallic maps NOT SUPPLIED by source',
        'hardpoints': 'PASS (native OPT nodes, geometry-checked)' if craft != 'r41' else 'PASS lasers/ions/engines; torpedo MEDIUM',
        'native_blender_images': 'PASS (front/side/rear/top/three-quarter x2/underside, LOD chain, cockpit, markers)',
        'moving_parts': 'PASS manifest; INI angle sign/units UNVERIFIED' if craft == 'twing' else 'N/A - INI lists none (pilot head only)',
        'unreal_any_stage': 'NOT_RUN'}
    man = dict(craft=title, package_revision='claude-ship-prep-r01', generated_utc=NOW, owner=OWNER, registry=reg, trello_sprint=sprint, trello_canonical=canon,
               status='BLENDER_SOURCE_PACKAGE_READY_FOR_RECEIVING_OFFER; UNREAL_NOT_RUN; NOT_A_FLYABLE_SHIP', gates=gates,
               source_custody=f'{PIR}/{pdir}', package_folder=str(ROOT / craft),
               files=dict(inventory='inventory.json', roundtrip='roundtrip.json', hardpoints='hardpoints.json', moving_parts='moving-parts.json', textures='texture-manifest.json',
                          hashes='source-hashes.json', renders='renders/', review_sheets='review/'),
               import_payload={k: dict(fbx=v['fbx'], sha256=v['fbx_sha256'], working_blend=v['working_blend'], triangles=v['triangles'], objects=v['mesh_objects'],
                                       material_slots=v['material_slot_total'], dimensions_m=v['dimensions_m']) for k, v in inv.items()},
               recommended_receiving=dict(
                   lod_chain='PROPOSED: Standard_LOD0..N are the source-authored LOD chain of the gameplay model (same mesh indices, shrinking part sets). Exterior is the higher-detail hero model with a larger texture set; '
                             'using Exterior as LOD0 above the Standard chain is a receiving decision because its slots/textures differ. Import each FBX separately and add lower LODs by index (import_lod), never one material across slots.',
                   static_import='FbxFactory static, combine_meshes=true for the opponent hull, import_materials/textures=false, convert_scene/unit=true, uniform scale 1, normals=import, Mikk tangents, Nanite off; '
                                 'expected Unreal size = dimensions_m x 100 cm with +X nose.',
                   materials='one material per OPT texture slot name (e.g. TWING_Tex00002); base colour sRGB; *_alpha masks linear grayscale (LINEAR_GRAYSCALE sampler); *_illum masks drive emissive; constant roughness (no source map).',
                   double_sided='coincident opposed-winding face pairs are intentional two-sided geometry; keep them (do not weld/remove degenerate-duplicate triangles on import) or use a two-sided material on those slots.',
                   sockets='create from hardpoints.json unreal_local_cm_expected ONLY after confirming one socket against an imported vertex (Y sign).',
                   cockpit='Cockpit FBX is a separate interior model in its own OPT frame; not aligned or tested against the exterior here.'),
               unresolved_gaps=['Unreal mesh/LOD/material import, collision, sockets, Blueprint child, stats, emitters, visual and functional/network tests: all NOT_RUN',
                                'Approved physical length not in Registry; XWA-native OPT scale (0.024414062 m/unit) used unchanged',
                                'Chirality (port/starboard) follows OPT +X = starboard; no readable marking was checked for mirror in Blender',
                                'No roughness/normal/metallic maps in source; XWAU .mat scalars recorded only'] +
                               (['INI moving-part angle sign/units unverified; landed pose not produced as a derivative'] if craft == 'twing' else []) +
                               (['Torpedo hardpoints 0.84 m from nearest Standard LOD0 vertex - verify launcher position visually'] if craft == 'r41' else []) +
                               (['Source has two identical Torpedo hardpoints (both port); mirror the second at receiving only with Jamie/owner agreement'] if craft == 'toscan' else []),
               visual_review=VISUAL[craft])
    (ROOT / craft / 'handoff-manifest.json').write_text(json.dumps(man, indent=1), encoding='utf-8')
    w(f'## {title}')
    w(f'Registry {reg} | sprint card {sprint} | canonical card {canon} | package `{ROOT / craft}`')
    w()
    w(f'- Source custody (untouched, hashes equal before/after): `{PIR}/{pdir}` - Standard, Exterior and Cockpit OPT plus INI. Install originals still match the custody copies: {all(x["matches_custody_copy"] for x in sh["original_install_sources"])}.')
    w(f'- Frame/units: metres, +X nose, +Y port, +Z up; OPT scale 0.024414062 m/unit, no extra scale, no recentre. Exterior {ext["dimensions_m"]["length_x"]} x {ext["dimensions_m"]["span_y"]} x {ext["dimensions_m"]["height_z"]} m (L x span x H).')
    w('- Variants (triangles / objects / material slots / FBX corner round-trip):')
    for k, v in inv.items():
        w(f'  - {k}: {v["triangles"]} / {v["mesh_objects"]} / {v["material_slot_total"]} / {rt[k]["status"]} (faces missing after Blender reimport {rt[k]["faces_missing"]}, max normal deviation {rt[k]["normal_max_deviation_deg"]} deg)')
    w(f'- Rig: none in source. Every OPT mesh stays a separate object named `.NNN.Type` (split-part payload); one UV layer `UVMap`; custom normals kept.')
    w(f'- Coincident faces: {dict((f"{a}, {b}", c) for (a, b), c in dupk.items())}. All are opposed-winding two-sided pairs. Zero-area faces: {sum(v["degenerate_zero_area_faces"] for v in inv.values())} across variants.')
    w('- Weapon hardpoints (Standard OPT, working m -> expected Unreal cm, distance to nearest LOD0 vertex, confidence):')
    for h in hp['weapon_hardpoints']:
        w(f'  - {h["id"]} mesh {h["opt_mesh_index"]} {h["side"]}: {h["working_m"]} -> {h["unreal_local_cm_expected"]}, {h["nearest_standard_lod0_vertex_m"]} m, {h["confidence"]}')
    w('- Engine glows (Standard OPT):')
    for g in hp['engine_glows_standard']:
        w(f'  - {g["id"]}: {g["working_m"]} -> {g["unreal_local_cm_expected"]}, size {g["dimensions_m"]["width"]} m, core {g["core_colour"]["argb_hex"]}, look {g["working_look_axis"]}, {g["confidence"]}')
    w(f'  - Exterior OPT carries {len(hp["engine_glows_exterior"])} glow nodes and no weapon hardpoints.')
    parts = [p for p in mv['parts']]
    w(f'- Moving parts from INI ({len(parts)}): ' + ('; '.join(f'mesh {p["opt_mesh_index"]} {p["label"]} [{p["ini_section"]}] raw {p["ini_angle_raw"]} pivot {p.get("pivot_working_m")} axis {p.get("rotation_axis_working")}' for p in parts) or 'none'))
    for label, m in tx.items():
        tex = m['textures']
        w(f'- Textures {label}: {m["texture_count"]} OPT textures, {sum(1 for t in tex if "opacity_mask" in t["derived_png"])} with alpha mask, {sum(1 for t in tex if "illumination_mask" in t["derived_png"])} with illumination mask; XWAU material file {Path(m["xwau_mat_file"]).name if m["xwau_mat_file"] else "none"} default {m["xwau_default_material"]}.')
    w(f'- Visual review: {VISUAL[craft]}')
    w('- Gates: ' + '; '.join(f'{k} = {v}' for k, v in gates.items()))
    w('- Unresolved: ' + '; '.join(man['unresolved_gaps']))
    w()
    summary_rows.append((title, gates))

# ---------------------------------------------------------------- X-wing
x = ROOT / 'xwing-t65c'
inv = J(x / 'inventory.json'); rt = J(x / 'roundtrip.json'); art = J(x / 'articulation.json'); sh = J(x / 'source-hashes.json')
oc = art['open_pose_check_against_production_mesh']
xg = {'existing_actor_untouched': 'PASS (read-only inspection only)', 'source_preserved_hashed': 'PASS', 'source_inventory_lods_parts_uv': 'PASS',
      'gear_geometry_present_in_source': 'PASS - present at LOD0-2 (3 struts with feet), 2 faces at LOD3; removed from the production mesh',
      'split_is_exact_face_partition': 'PASS' if all(v['status'].startswith('PASS') for v in inv['split_partition_check'].values()) else 'FAIL',
      'split_part_fbx_roundtrip': 'PASS' if all(v['status'].startswith('PASS') for v in rt['lods'].values()) else 'PARTIAL',
      'hinge_reproduces_production_open_pose': f'{oc["status"]} - {oc["sfoil_vertices_outboard_of_hinge"] - oc["over_1mm"]} of {oc["sfoil_vertices_outboard_of_hinge"]} panel vertices within 1 mm, worst {oc["max_distance_m"]} m',
      'muzzle_alignment_through_motion': 'PASS in Blender (tips within 1.6 cm of the Registry sockets in both poses); Unreal NOT_RUN',
      'engine_alignment_through_motion': 'PASS by construction - nozzles are in the fixed wing root and do not move with the production hinge',
      'source_rig_or_animation': 'FAIL/ABSENT - dump FBX has no armature, weights, shape keys or actions', 'unreal_articulation_any_stage': 'NOT_RUN'}
xman = dict(craft='T-65C A2 X-Wing', package_revision='claude-ship-prep-r01', generated_utc=NOW, owner=OWNER, registry='https://app.notion.com/p/3e736ffbe800819f8c34cc9f12721080',
            trello_sprint='https://trello.com/c/CU60pU0w', trello_canonical='https://trello.com/c/Yhvqcp5w',
            scope='OPTIONAL articulation source for the EXISTING BP_XWing_Player / SM_XWing_T65. Not a replacement mesh. Do not reimport the whole X-wing from this package.',
            status='ARTICULATION_SOURCE_READY_FOR_RECEIVING_OFFER; UNREAL_NOT_RUN', gates=xg, package_folder=str(x),
            existing_actor=dict(blueprint='/Game/SpaceTest/Blueprints/BP_XWing_Player', mesh='/Game/SpaceTest/Meshes/Starfighters/XWing_T65/Squadrons/SM_XWing_T65',
                                mesh_state='4 LODs 64279/22712/3862/1624 triangles, slots Droid/Fuselage/Glass/Wing/XWing_LOD_Atlas, fixed combat pose (outer panels +-18 deg, gear removed, bay flaps flush) - craft-lod-batch-r1 cold-verify-xwing.json',
                                blueprint_scan='read-only string scan of the .uasset: components EngineGlow_L/R, EngineGlow_Upper_L/R, Plume_L/R, PlumeMesh_L/R; NO S-foil or landing-gear component, variable or event names',
                                source_scan='Experiment58/Source: no S-foil or landing-gear logic (one unrelated mention in ShipSoundProfile.h)',
                                sockets='Muzzle_L/R upper tips (242.1, -+464.2, 129.7) cm, Muzzle_Lower_L/R (242.2, -+464.4, -121.4) cm per Registry'),
            files=dict(source_blend='XWing_T65C_SquadronsSource_R01.blend', working_blend='XWing_T65C_SplitParts_Working_R01.blend', fbx='fbx/SM_XWing_T65C_SplitParts_LOD{0..3}_R01.fbx',
                       inventory='inventory.json', roundtrip='roundtrip.json', articulation='articulation.json', hashes='source-hashes.json', renders='renders/', review_sheets='review/'),
            fbx={k: dict(fbx=v['fbx'], sha256=v['sha256'], objects=v['objects_exported'], triangles=v['working']['triangles']) for k, v in rt['lods'].items()},
            articulation=art)
(x / 'handoff-manifest.json').write_text(json.dumps(xman, indent=1), encoding='utf-8')
w('## T-65C A2 X-Wing - articulation source for the existing actor')
w(f'Registry https://app.notion.com/p/3e736ffbe800819f8c34cc9f12721080 | sprint card https://trello.com/c/CU60pU0w | canonical card https://trello.com/c/Yhvqcp5w | package `{x}`')
w()
w('Scope correction (Jamie, 11 Nov 2026, during this task): Experiment58 already has a playable X-wing, BP_XWing_Player on /Game/SpaceTest/Meshes/Starfighters/XWing_T65/Squadrons/SM_XWing_T65. Do not replace, duplicate or reimport it. X-wing work is S-foil open/close and landing-gear deploy/retract on that actor; this split-part FBX set is optional source for articulation only.')
w()
w('### What exists now (read-only inspection)')
for k, v in xman['existing_actor'].items():
    w(f'- {k}: {v}')
w('- Registry row is stale in places (Mesh type "Not imported", Materials "still the three TIE materials") while M_XWing_* materials and textures exist on disk; left unchanged, flagged for the editor owner to reconcile from a live editor read.')
w()
w('### Source findings')
for k, v in inv['source_findings'].items():
    w(f'- {k}: {v}')
w(f'- Source FBX `{inv["source_fbx"]}` SHA256 {inv["source_fbx_sha256"]}; all {len(sh["sources"])} source files hash-equal before and after.')
w('- LODs (triangles, L x span x H m): ' + '; '.join(f'LOD{k} {v["triangles"]}, {v["dimensions_m"]["length_x"]} x {v["dimensions_m"]["span_y"]} x {v["dimensions_m"]["height_z"]}' for k, v in inv['lods'].items()))
w('- UV channels: LOD0-1 UVChannel0-3, LOD2 UVChannel0-4, LOD3 UVChannel0 only (atlas). All preserved through the split and FBX.')
w('- Landing gear: PRESENT in the source. Faces per LOD taken by the production removal boxes: ' + '; '.join(f'LOD{k} ' + str(sum(r['faces_per_part'].get('LandingGear', 0) for r in v['source_objects'])) for k, v in inv['lods'].items()) + '. The source models only the DEPLOYED state; there is no retracted gear geometry, no gear pivots and no gear-bay door hinge data. LOD3 has effectively no gear.')
w('- Squadrons mesh descriptor Veh_Reb_Flex_XwingT65.xml lists 12 PartComponentData entries (destruction parts); no S-foil or gear transform was recovered from the dump. DriveSourceR01 holds only a cockpit skeleton XML, no exterior rig and no cockpit mesh FBX.')
w()
w('### Split-part payload')
w('- Faces only are reassigned; no vertex moved, UVs and corner normals identical (partition check PASS for every source object, FBX corner round-trip PASS for all four LODs).')
for k, v in inv['lods'].items():
    w(f'  - LOD{k}: ' + ', '.join(f'{n.split("_", 2)[2]} {p["triangles"]}' for n, p in v['parts'].items()))
w('- Material slot names equal the production slots (Droid, Fuselage, Glass, Wing, XWing_LOD_Atlas), so existing materials can be reused.')
w('### Hinges (DERIVED, production-accepted values)')
for h in art['hinges']:
    w(f'- {h["part"]}: pivot {h["pivot_working_m"]} m (expected Unreal {h["pivot_unreal_cm_expected"]} cm), axis working +X, open {h["open_angle_deg_right_hand_about_working_plusX"]} deg right-hand about working +X, closed 0.')
w(f'- Check against the production open mesh: {xg["hinge_reproduces_production_open_pose"]}. Faces straddling the hinge plane (LOD0 535, LOD1 228, LOD2 48, LOD3 100) were stretched in the production mesh; as rigid parts they open a small seam at the hinge line.')
w('- IMPORTANT: this hinge is 2.15 m from the centreline, OUTBOARD of the engines (nozzle centres at 1.37 m). It swings the outer wing panels and cannons only; the four engines stay fixed. That matches the current production look but is not the true T-65 mechanism, where each engine moves with its foil about a fuselage hinge. A true hinge needs manual separation of the fused wing-root/engine geometry - not attempted, because it would be invented articulation.')
w('### Hardpoint candidates through motion (expected Unreal cm)')
for c in art['hardpoint_candidates']:
    w(f'- {c["id"]}: closed {c["closed_pose_unreal_cm_expected"]}, open18 {c["open18_pose_unreal_cm_expected"]}, {c["confidence"]}' + (f', delta vs Registry open socket {c["open18_delta_vs_prior_cm"]} cm' if c.get('open18_delta_vs_prior_cm') else ', does not move with the panels'))
w(f'- Torpedo launchers: {art["torpedo_launchers"]}')
w('### Textures')
w('- Squadrons TGA set in the source folder: Fuselage/Wing/Droid _C (base colour, sRGB), _N (normal), _S, _M (metallic), _AO, plus Glass _C/_S and the LOD atlas _CS. _S is treated as SMOOTHNESS (Roughness = 1 - S) by the Y-wing precedent in the Squadrons addendum; DERIVED, not re-proven for the X-wing. Existing production materials were not opened or changed.')
w('### Proposed receiving plan (for the editor owner; nothing below was run)')
w('1. Keep SM_XWing_T65 and BP_XWing_Player. Import the split-part FBX additively to a NEW folder (for example /Game/SpaceTest/Meshes/Starfighters/XWing_T65/Squadrons/Articulated/) with combine_meshes=false, giving one static mesh per part per LOD; attach lower LODs per part by index.')
w('2. In a child or guarded variant of the Blueprint add four S-foil static mesh components under scene components placed at the hinge pivots, plus the fixed parts. Drive one replicated float (0 closed .. 1 open) on the server; rotate the four pivots from it on every peer. Re-parent or re-attach Muzzle_L/R and Muzzle_Lower_L/R to the moving panels so shots originate from the cannon tips in every state; engine glow/plume components stay on the fixed root.')
w('3. Landing gear: only show/hide is supported by source geometry. Treat deploy/retract as a replicated visibility state (optionally with the bay-flap offset the production recipe used). A folding animation needs authored pivots and is a design decision.')
w('4. State proof plan to run with the editor owner: (a) listen host toggles S-foils and gear, client sees the same end state and timing; (b) client-initiated toggle goes through the server and returns to all peers; (c) late joiner arrives with foils open and gear up and sees that state without a replayed transition; (d) muzzle world positions sampled closed/open on host and client equal the manifest within 1 cm and bolts leave the tips; (e) engine glow and plumes unchanged through motion; (f) LOD switch while open shows no part popping; (g) doubled-hull gate - exactly one visible hull set. All NOT_RUN.')
w('- Gates: ' + '; '.join(f'{k} = {v}' for k, v in xg.items()))
w()
w('## Duplicate faces - the 8 PARTIAL reimports explained')
w('The owner\'s raw FBX payload audit passed for all 16 derivatives, but a Blender reimport lost a few faces in 8 of them. Corner-level comparison here (world positions welded within 0.05 mm, every UV layer, material, corner normal) shows:')
w('- 11 of 16 derivatives are exact after reimport. The other 5 differ only by faces that Blender\'s FBX importer strips with mesh.validate: R-41 Standard LOD0 2, R-41 Exterior 2, Toscan Standard LOD0 2, Toscan Standard LOD2 12, Toscan Exterior 2.')
w('- Every stripped face is one half of an opposed-winding coincident pair inside one mesh - deliberate two-sided geometry in the OPT. Pairs that span two meshes survive reimport (T-wing has 13 of those per detailed variant).')
w('- The owner\'s other PARTIAL flags (unique-point counts differing by 1-2) were float rounding in the comparison, not geometry loss.')
w('- Conclusion: the FBX files are correct and complete; Blender reimport is not a valid acceptance test for these faces. Unreal should keep them (they are not degenerate). No cleanup was applied.')
w('- My first comparison attempt used plain rounding and reported false differences; it is preserved in logs/twing-norender.log and was replaced by the tolerance method.')
w()
w('## Decisions for Jamie')
w('1. X-wing S-foil hinge: keep the current outer-panel hinge (engines fixed, matches today\'s production pose, supported by this package) or commission a true fuselage hinge with moving engines (needs manual geometry separation and new engine-emitter handling).')
w('2. X-wing landing gear: show/hide only (supported now) or an authored folding animation.')
w('3. Pirate LOD0 choice: Exterior hero model above the Standard LOD chain, or the Standard chain alone.')
w('4. Toscan second torpedo launcher: mirror the duplicated source hardpoint to starboard, or keep a single launcher position.')
w()
w('## Tested vs untested')
w('- Tested here (Blender 5.2.2 LTS, background, factory startup): source hashes, inventories, bounds, split exactness, FBX corner round-trips, hardpoint proximity, hinge vs production mesh, native renders inspected by me.')
w('- Not tested: anything in Unreal (import, LODs, materials, collision, sockets, Blueprint, stats, emitters, PIE, multiplayer, cook), physical controller feel, Jamie visual acceptance.')
w()
w('## Paths')
w(f'- Package root: `{ROOT}` (twing/, r41/, toscan/, xwing-t65c/, scripts/, logs/). Each craft folder has handoff-manifest.json, the JSON receipts, renders/ and review/ contact sheets.')
w('- Scripts are also committed on branch worktree-claude-ship-prep-r01 under artifacts/claude-ship-prep-r01/scripts/.')
w('- Handoff to the current editor owner (overnight Sol agent) is by formal offer/accept; no editor slot was requested or used.')
(ROOT / 'HANDOFF-R01.md').write_text('\n'.join(md), encoding='utf-8')
print('written', len('\n'.join(md)), 'chars', len(md), 'lines')
