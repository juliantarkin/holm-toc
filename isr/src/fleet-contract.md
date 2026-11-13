# Fleet explorer v2 implementation contract

This is an illustrative, offline geometry/resource simulation using invented profiles. No real aircraft specs, threat models, flight-control integrations, or operational recommendations. Preserve original Pattern Explorer. Root owns navigation + tracker. Engine agent owns fleet-engine.js (may add optional footprint=false argument to model.sampleAtTime for efficiency without breaking existing calls). UI agent owns schedule.html, fleet-style.css, fleet-app.js. QA agent owns tests only.

## Global API

`window.ISRFleet` / CommonJS exports:

- `defaults()` => plain fresh config below.
- `plan(config, strategy?)` => plan result, including coverage analysis. Synchronous deterministic.
- `optimize(config, {onProgress, shouldCancel}={})` => Promise best plan. Bounded candidate search, yields between candidates. Best tested, not global optimum. Include baseline first, never worsen rank.
- `snapshot(plan, timeS, {footprints=true}={})` => asset telemetry + current grid counts (can omit counts when expensive).
- `exportJSON(plan)` => string excluding functions; include config, strategy, assumptions, resolution, events, all gap intervals/cell metrics, sorties and aircraft.

All engine times are seconds relative to task start (0). They can be negative for prelaunch and exceed duration for recovery/turnaround. All position units meters; x east, y north, z above flat ground. The task/reference point is origin; base at {-baseDistanceKm*1000,0,0}. Clock display uses config.startMinutes (e.g. 480=08:00), including day +/- offsets.

## Config

```
{
 startMinutes:480,durationMin:480,baseDistanceKm:30,
 mode:'point', // point or area
 areaWidthKm:4,areaHeightKm:4,coverageThresholdPct:90,
 requiredObservers:1,gridSize:11,sampleStepS:30,
 handoverMin:10,setupMin:0,allowPrelaunch:true,
 slots:1,phaseMode:'spread',
 profiles:[
  {profileId:'scout',count:2,enduranceMin:180,reserveMin:20,turnaroundMin:45,transitSpeedMps:28,pattern:'circle',routeOverrides:{}},
  {profileId:'endurance',count:0,enduranceMin:480,reserveMin:40,turnaroundMin:60,transitSpeedMps:65,pattern:'circle',routeOverrides:{}},
  {profileId:'crewed',count:0,enduranceMin:300,reserveMin:30,turnaroundMin:60,transitSpeedMps:110,pattern:'racetrack',routeOverrides:{}},
  {profileId:'vtol',count:0,enduranceMin:60,reserveMin:10,turnaroundMin:20,transitSpeedMps:12,pattern:'hover',routeOverrides:{}}
 ]
}
```

Bounds: fleet <=12 total; duration 0.5–24h; base distance 0–500km; grid 7/11/15; step 15/30/60/120s (cap effective analysis samples at 2880, report actual step). Zero assets is a valid infeasible scenario. Reserve>=endurance, station time<=0, overlap>=station time must be reported, not concealed by reserve changes. Validate numeric values; UI can enforce ranges. Profiles only reuse curated supportedPatterns. routeOverrides may come from current explorer config (altitude/speed/scale/aspect/heading/fov/range/sensorMode/direction) but force target origin.

## Scheduling and geometry

Invented endurance budget expressed in time, not actual fuel burn. Ground turnaround after landing restores a full budget at READY; during turnaround show servicing progress, no claim about battery charge curve. Transit straight line at input speed, including altitude distance; no wind/terrain or departure/arrival flight dynamics. Direct path joins are illustrative. Outbound to actual route entry. Conservative return budget is maximum distance from base to route, divided by transit speed. At departure calculate actual direct return; must land with reserve intact. Flight time includes outbound+setup+station+return. Reserve only subtracted once.

Periodic pattern repeats during station period. Finite search patterns execute ONE pass per sortie, no teleporting/restarting; cap useful station duration at path duration. Hover can remain stationary for budget (ignore original ten-minute demo interval cap). If route bank feasibility fails, flag and exclude that profile from dispatch rather than count impossible coverage.

Strategy `{slots,phaseMode,phaseOffset:0}`; slots represent desired concurrent station assignments, separate from total fleet. PhaseMode aligned/spread, offset fraction of periodic route. Greedy earliest-needed slot; candidate aircraft earliest actual useful arrival (respect ready time), then longer feasible station duration, stable deterministic ID tie break. Use shared aircraft availability across slots, so no overlapping sorties. Next required start = previous end - overlap. Allow prelaunch only for first availability; otherwise first launch >=0. Stop observation by task end, include all later returns/turnaround in plan. On timing infeasibility show gap; never extend endurance to wait for relief. Bounded optimize considers a small documented set of slots and phases, with same analysis resolution for all candidates. Rank task satisfaction time, then longest task gap, then spatial coverage, then flight-hours/sortie cost. Do not modify user reserve/endurance/area to improve result.

Area grid contains cell centers with equal weights. Compute ONE sensor boresight per asset/time, then evaluate all cells against that boresight, FOV cone and range. Never repoint camera independently to each cell. Point mode one cell at origin. Analysis bins use midpoint state; represent gaps as whole bins and prominently label sampled estimates (deterministic at stated resolution, not exact continuous bounds). Task met: point has >=requiredObservers; area fraction of cells with >=requiredObservers reaches coverageThresholdPct. Distinguish no station aircraft, insufficient station count, and sensor-footprint/range/geometry shortfalls. Track never-observed cells and maximum finite-window gaps; no wrap at horizon edges.

## Plan result (stable contract)

```
{
 config, strategy:{slots,phaseMode,phaseOffset},
 durationS, base:{x,y,z},
 timelineStartS,timelineEndS,
 assets:[{id,label,profileId,profileName,color,enduranceS,reserveS,turnaroundS,transitSpeedMps,pattern,scenario,issues:[]}],
 sorties:[{id,assetId,slot,launchS,arrivalS,stationStartS,departS,landS,readyS,phaseS,outboundS,returnS,returnBudgetS,stationS,reserveAtLandingS,entryPosition,exitPosition}],
 events:[{timeS,assetId,sortieId,type,label}], // LAUNCH, ARRIVE, ON_STATION, RETURN, LANDED, READY etc
 cells:[{id,x,y,z,coveredFraction,longestGapS,neverObserved}],
 samples:[{startS,endS,timeS,onStationCount,coveredFraction,met,reason,observingAssetIds:[]}],
 gaps:[{startS,endS,durationS,reasons:[],minCoveredFraction,maxOnStation,edgeCensored}],
 metrics:{satisfiedFraction,totalGapS,longestGapS,meanAreaCoverage,minAreaCoverage,neverObservedCount,sortieCount,totalFlightS,minLandingReserveS},
 resolution:{requestedStepS,effectiveStepS,gridSize,cellCount},
 issues:[{severity:'warning'|'error'|'info',assetId?,message}],
 assumptions:[], optimization?:{tested,total,cancelled,baselineSatisfiedFraction,baselineLongestGapS,description}
}
```

Keep `scenario` functions available in runtime assets, omit them from JSON, or serialize a sanitized scenario config. Include reasons/intervals in JSON. All numerical outputs finite; null for inapplicable min landing reserve with no sorties.

## Snapshot result

```
{timeS,coveredFraction,met,counts:[],assets:[{
 id,label,profileId,profileName,color,state, // READY/QUEUED/OUTBOUND/SETUP/ON_STATION/RETURN/TURNAROUND/UNAVAILABLE
 position:{x,y,z},headingDeg,bankDeg,speedMps,
 distanceToTargetM,distanceToBaseM,
 enduranceRemainingS,energyPct,reserveS,returnTimeS,returnMarginS,
 flightElapsedS,flightTimeToLandingS,
 sortieId:null|id,currentSortie:null|sortie,nextEvent:null|{timeS,type,label},
 sensor:null|{boresight,footprint,...},observingReference:false,
 observedCellCount,taskLabel,issues:[]
}]}
```

Return margin = remaining endurance - current predicted direct recovery time - reserve; do not hide negatives. At station departure use remaining budget correctly; while return interpolated currentpos→base, elapsed budget falls. On ground, remaining is last landing budget until turnaround completes; energyPct denotes modeled endurance fraction, not measured physical fuel/battery. READY gets full. `flightTimeToLandingS` is remaining scheduled flight to land, while enduranceRemainingS is energy-equivalent time. Keep those distinct.

## Schedule UI / shared controller contract

UI agent provides `<section id="schedulePage" class="fleet-page" hidden>...</section>`; root inserts it after existing pattern main. Do not add whole document wrapper/scripts in fragment. Prefix DOM IDs `fleet...`, classes `fleet-...`. JS only initializes after document exists. Root inserts fleet-engine script then fleet-app script then tracker/root navigation.

Expose `window.ISRFleetUI = {get config(),get plan(),get timeS(),get snapshot(), setTime(seconds),setPlaying(bool),rebuild(),activate(),formatClock(seconds),formatDuration(seconds)}`. Dispatch document CustomEvents `fleet:plan` after plan changes and `fleet:time` after snapshot/time changes. Root tracker listens, shares same time, calls setTime/setPlaying. Do not call root navigation directly. Root dispatches `isr:page` detail={page:'patterns'|'schedule'|'tracker'} after nav; pause when patterns, allow fleet playback on schedule/tracker. activate must render hidden-then-shown canvas sizes. Data preview root tracker requires interface read only.

Schedule page: task controls (clock/horizon/base distance/mode/grid rectangle/threshold/min observers/overlap/prelaunch), fleet cards or table with counts + editable budgets/patterns, target slots, build+optimize (with progress/cancel), synthetic scenario presets (feasible point / too far / broad area), KPIs task-satisfaction%, gap time/longest, covered area or unique cells, fleet/sortie count. Timeline all assets and combined task coverage with before-start launches and after-end returns/turnaround visible. Grid map + route/footprint playback. Gap list with cause and click-to-seek, never-seen cells/worst cells. Export schedule JSON. Copy explorer config button applies current ISRApp.config to matching profile, without changing its count/endurance/reserve. Clear model assumptions with numerical resolution; no claims global optimum or exact continuous coverage. Mobile responsive collapsed controls, map/timeline scroll bounded. Build disabled/dirty state prevents showing stale results as current; events remain based on applied config.

Tracker root: third page cards summary active/on station/return/ready counts, top sharedclock+playback/scrub; each summary state/task/energy and expandable all telemetry. UI buttons link to schedule or selectedsortie. No separate timer/plan.
