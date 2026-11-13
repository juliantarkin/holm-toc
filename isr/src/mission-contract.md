# Mission foundation contract — release 0.1

Scope: increments 0–1 of the ISR Process Demonstrator plan. New Mission page with an actual deterministic lifecycle journal. No hidden-target search, sensing simulation, retasking, relay simulation, waypoint editor or weapon behavior in this release. Keep lab state isolated. All scenario values fictional.

## Files and ownership

- mission-engine.js and tmp/isr_mission_engine_qa.cjs: engine agent.
- mission.html, mission-style.css, mission-app.js: UI agent.
- mission-catalogue.js: catalogue agent.
- shell.html, navigation.js, build script, existing tracker/fleet badges, integration tests and publication: root.

## Catalogue interface

Expose `window.ISRStockCatalogue` and CommonJS export for node tests. Deep-freeze definitions.
`version`, `profiles` (array of records), `get(id)` (undefined for unknown).
Record fields: id, name, kind, motionClass, payloads (array of {name,modes,products}), communications {los,blos,relay}, roles (strings), availability ('demo'|'planned'), note.
IDs: scout, observer, surveyor, listener, finch, relay, beacon, lookout, haven.
Only scout and observer are executable fixture profiles for now. Others are visible stock catalogue definitions with Planned status, not selectable launchable assets. Beacon station keeping and relay behavior remain planned.
Label EO/IR as visible/thermal camera; FMV is a product. Passive RF modes COMINT/ELINT. BLOS alone does not imply relay.

## Engine interface

Pure IIFE exposed as `window.ISRMission` and CommonJS export. No DOM, timers, Date.now, Math.random, network or ISRModel/Fleet dependencies. `version`, `schemaVersion`, `tickSeconds=1`, `createRun({seed=42,scenarioId='lifecycle-v1'}={})`.

Engine owns private state; return no mutable references to internal state or catalogue. Snapshot/event reads never advance ticks, consume randomness or emit events. Fixed stable ordering and IDs. Scenario is an internal frozen definition; invalid seed/scenario fails clearly.

Returned run methods:
- `start()` — starts once; records mission start and both accepted fixture assignments at tick 0; launches Scout at tick 0. Subsequent calls are no-ops.
- `advance(ticks)` — positive integer fixed ticks; no-op before start/after complete. May accept 0. Limit unreasonable requests. Execute every crossed lifecycle boundary in stable order.
- `snapshot()` — detached data as below.
- `events()` — detached ordered actual events only, no future rows.
- `exportRun()` — detached portable JSON record with schemaVersion, engineVersion, scenarioId, seed, tick, input commands, actual events and snapshot. Record user advancement as simulation time, not frame batches (frame count must not contaminate deterministic results). Include detached coordinateFrame metadata for axes, units, height datum and absent geographic anchor. No promise of import/replay in this increment.

Snapshot shape:
{runId,scenarioId,scenarioName,seed,tick,timeS,durationS,started,completed,assets:[...],eventCount,plan:[{assetId,launchS,stationS,returnS,recoverS,readyS}]}
Asset fields:
{id,callsign,stockId,state,role,task,payloadStatus,communicationsStatus,elapsedFlightS,flightBudgetS,remainingFlightS,reserveS,nextEvent:{type,label,timeS}|null,position:{x,y,z},headingDeg:number|null,groundSpeedMps}
State values ready, outbound, on_station, returning, servicing. End is ready again.
CommunicationsStatus is `ideal` with explanatory UI label 'Ideal link · exercise assumption'; no modeled radio connectivity claim.
PayloadStatus standby/collecting/stowed. 'Collecting' means a scheduled payload mode, not simulated target detection.

Fixture:
- Two assets SCOUT 01 (scout) and OBSERVER 01 (observer), independent fixed sorties.
- Scenario horizon 360 seconds; all useful phases happen within that horizon. Exact timeline chosen/documented by engine agent, with a sample: Scout launch 0, station 40, return 160, recover 200, ready 260; Observer launch 60, station 100, return 250, recover 300, ready 360.
- Budget/reserve must remain internally consistent, with explicit illustrative remaining-flight accounting. Readiness restores available full budget only when service ends, not at landing.
- Simple fixed route interpolation may be provided strictly to illustrate lifecycle progress; label schematic in UI. No sensor target reference and no hidden object exists.
- Emit mission_started, assignment_accepted, launch, on_station, collection_started, collection_stopped, return, recovered, servicing, ready, mission_completed as appropriate. Event at matching tick only; no duplicates. Reserve warning optional only if semantically correct.

Event shape: {id,runId,tick,timeS,sequence,type,family,severity,assetId:null|string,actor,label,detail,causeId:null|string,source:'scenario'|'operator'|'lifecycle',audience:'operator'}. Families mission,command,lifecycle,payload. Reference IDs for causes must resolve to an earlier/same-tick event or recorded input.

## UI interface

Root inserts page `<main id='missionPage' hidden>` from mission.html, styles and scripts after catalogue/engine. No element IDs conflict with existing app. CSS selectors scoped to .mission-page / #missionPage / .mission-*; no generic overrides.

Expose `window.ISRMissionUI`:
- `activate()` renders/resizes without stepping/resetting.
- `setPlaying(boolean)` (true starts an unstarted run, false pauses).
- `get playing()`, `get run()`, `get state()` suitable for integration QA (read-only copies where relevant).
- `get activeView()` optional.

Listen to isr:page detail.page. On leaving mission, pause (no elapsed catch-up). Root also pauses lab clocks on entry. One mission clock drives all mission subviews. Switching mission Overview/Activity view does not pause/reset/duplicate events. Browser visibility hidden pauses.

Controls: start/pause, restart same seed, step +1s (paused), advance to next event (paused, actually simulates crossed ticks), playback rates 1/5/20/60, seed input applied on explicit new run (strict integer parsing), JSON run/journal download. No scrub backwards or fake replay. Restart explicitly clears this exercise's activity after preserving ability to export.

Mission page: 'Lifecycle exercise' heading with 'Foundation · 0–1' badge; brief explains sequence; progress/time display; two live asset cards with stock payload/comms labels; compact planned timeline (distinct from actual journal); Activity section/filter by asset and family; event details/cause inspection; visible stock catalogue (demo vs planned); concise roadmap for next increments. Show no data-collection success, target contact or operational coverage claims.

Use existing light theme/teal-navy palette. Desktop and mobile responsive. No external dependencies/fonts/assets. Real buttons/labels, keyboard support, modest aria-live only for user actions and summary (not per animation tick). Empty activity: 'Start the exercise to record actual events.' Future plan rows never appear in Activity.
