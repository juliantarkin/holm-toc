#!/usr/bin/env node
'use strict';
// Run with: node isr_mission_engine_qa.cjs [path/to/mission-engine.js]
// Tests only the public API and independent fixture expectations.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const candidates = process.argv[2] ? [path.resolve(process.argv[2])] : [
  path.resolve(__dirname, '../src/mission-engine.js'),
  path.resolve(__dirname, 'isr_explorer_src/mission-engine.js')
];
const sourcePath = candidates.find(file => fs.existsSync(file));
if (!sourcePath) throw new Error('Mission engine source was not found: ' + candidates.join(', '));
const source = fs.readFileSync(sourcePath, 'utf8');
const report = {sourcePath, checks: 0, failures: [], cases: [], timeline: []};
function check(ok, message, detail) {
  report.checks += 1;
  if (!ok) report.failures.push({message, detail});
}
function equal(actual, expected, message) {
  check(JSON.stringify(actual) === JSON.stringify(expected), message, {actual, expected});
}
function throws(fn, message) {
  let error;
  try { fn(); } catch (e) { error = e; }
  check(!!error && /seed|scenario|options|advance/i.test(error.message), message, error && error.message);
}
function allFinite(value, at = 'root') {
  if (typeof value === 'number') check(Number.isFinite(value), at + ' is finite');
  else if (Array.isArray(value)) value.forEach((item, index) => allFinite(item, at + '[' + index + ']'));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => allFinite(item, at + '.' + key));
}
function loadEngine() {
  const forbidden = name => () => { throw new Error('Forbidden dependency: ' + name); };
  const math = Object.create(Math); math.random = forbidden('Math.random');
  const context = {Math: math, Date: class {constructor() {throw new Error('Forbidden Date');} static now() {throw new Error('Forbidden Date.now');}},
    setTimeout: forbidden('setTimeout'), setInterval: forbidden('setInterval'),
    requestAnimationFrame: forbidden('requestAnimationFrame'), fetch: forbidden('fetch'),
    module: {exports: {}}};
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, {timeout: 3000, filename: sourcePath});
  check(context.ISRMission === context.module.exports, 'Browser and CommonJS use the same API');
  return context.ISRMission;
}
const expectedPlan = [
  {assetId: 'scout-01', launchS: 0, stationS: 40, returnS: 160, recoverS: 200, readyS: 260},
  {assetId: 'observer-01', launchS: 60, stationS: 100, returnS: 250, recoverS: 300, readyS: 360}
];
const expectedEvents = [
  [0, 'mission_started', null],
  [0, 'assignment_accepted', 'scout-01'],
  [0, 'assignment_accepted', 'observer-01'],
  [0, 'launch', 'scout-01'],
  [40, 'on_station', 'scout-01'],
  [40, 'collection_started', 'scout-01'],
  [60, 'launch', 'observer-01'],
  [100, 'on_station', 'observer-01'],
  [100, 'collection_started', 'observer-01'],
  [160, 'collection_stopped', 'scout-01'],
  [160, 'return', 'scout-01'],
  [200, 'recovered', 'scout-01'],
  [200, 'servicing', 'scout-01'],
  [250, 'collection_stopped', 'observer-01'],
  [250, 'return', 'observer-01'],
  [260, 'ready', 'scout-01'],
  [300, 'recovered', 'observer-01'],
  [300, 'servicing', 'observer-01'],
  [360, 'ready', 'observer-01'],
  [360, 'mission_completed', null]
];

try {
  const M = loadEngine();
  check(M.tickSeconds === 1 && !!M.version && !!M.schemaVersion, 'Versioned one-second engine API');
  const fresh = M.createRun();
  const initial = fresh.exportRun();
  check(initial.snapshot.seed === 42 && !initial.snapshot.started && !initial.snapshot.completed && initial.tick === 0,
    'Fresh run is unstarted at tick zero with default seed');
  equal(initial.events, [], 'Fresh run has no actual or future events');
  equal(initial.inputCommands, [], 'Fresh run has no accepted inputs');
  equal(initial.snapshot.plan, expectedPlan, 'Planned timeline is authoritative and separate');
  equal(initial.coordinateFrame.axes, {x: 'east', y: 'north', z: 'up'}, 'Export declares local axis directions');
  check(initial.coordinateFrame.type === 'local-cartesian' && initial.coordinateFrame.units.position === 'm' &&
    initial.coordinateFrame.units.time === 's' && initial.coordinateFrame.geographicAnchor === null &&
    /height above.*z=0/.test(initial.coordinateFrame.altitudeDatum), 'Export declares units, local height datum and absence of a geographic anchor');
  fresh.advance(50);
  equal(fresh.exportRun(), initial, 'Advance before start does not create activity');
  fresh.advance(0);
  equal(fresh.exportRun(), initial, 'Zero advancement is inert');
  report.cases.push('initial state and planned/actual separation');

  for (const seed of [0, 1, 42, 4294967295]) {
    const a = M.createRun({seed}); a.start(); a.advance(360);
    check(a.snapshot().seed === seed && a.snapshot().completed, 'Seed boundary accepted: ' + seed);
  }
  for (const seed of [-1, 4294967296, 1.5, NaN, Infinity, -Infinity, '42', '', null, {}, true, 42n]) {
    throws(() => M.createRun({seed}), 'Invalid seed rejected: ' + String(seed));
  }
  for (const scenarioId of ['missing', '', 1, null, 'lifecycle-v1 ']) {
    throws(() => M.createRun({scenarioId}), 'Unknown scenario rejected: ' + String(scenarioId));
  }
  for (const options of [null, [], 'bad', 4]) throws(() => M.createRun(options), 'Malformed options rejected');
  const invalidAdvance = M.createRun(); invalidAdvance.start();
  const beforeInvalid = invalidAdvance.exportRun();
  for (const ticks of [-1, 1.1, NaN, Infinity, '1', null, undefined, 1000001]) {
    throws(() => invalidAdvance.advance(ticks), 'Invalid advancement rejected: ' + String(ticks));
    equal(invalidAdvance.exportRun(), beforeInvalid, 'Invalid advancement cannot partially mutate the run');
  }
  report.cases.push('strict seed/scenario/advancement validation');

  const run = M.createRun({seed: 73});
  run.start();
  equal(run.events().map(e => [e.tick, e.type, e.assetId]), expectedEvents.slice(0, 4), 'Start emits ordered tick-zero actual events');
  const startedOnce = run.exportRun(); run.start();
  equal(run.exportRun(), startedOnce, 'Repeated start is idempotent');
  let previous = run.snapshot();
  const remainingAtLand = {};
  for (let tick = 1; tick <= 360; tick += 1) {
    run.advance(1);
    const s = run.snapshot(), events = run.events();
    check(s.tick === tick && s.timeS === tick && s.eventCount === events.length, 'Clock and event count at tick ' + tick);
    check(events.every(e => e.tick <= tick && e.timeS === e.tick), 'No future event at tick ' + tick);
    check(new Set(events.map(e => e.id)).size === events.length, 'No duplicate event IDs at tick ' + tick);
    for (const asset of s.assets) {
      const plan = expectedPlan.find(p => p.assetId === asset.id);
      const old = previous.assets.find(a => a.id === asset.id);
      const expectedState = tick < plan.launchS || tick >= plan.readyS ? 'ready' :
        tick < plan.stationS ? 'outbound' : tick < plan.returnS ? 'on_station' : tick < plan.recoverS ? 'returning' : 'servicing';
      const airborne = ['outbound', 'on_station', 'returning'].includes(asset.state);
      check(asset.state === expectedState, asset.id + ': correct lifecycle at ' + tick);
      check(asset.remainingFlightS >= asset.reserveS && asset.remainingFlightS <= asset.flightBudgetS,
        asset.id + ': protected reserve and bounded resources at ' + tick);
      check(asset.elapsedFlightS + asset.remainingFlightS === asset.flightBudgetS,
        asset.id + ': budget conservation at ' + tick);
      check(asset.payloadStatus === (asset.state === 'on_station' ? 'collecting' : asset.state === 'ready' ? 'standby' : 'stowed'),
        asset.id + ': payload phase at ' + tick);
      check(asset.communicationsStatus === 'ideal', asset.id + ': explicit ideal-link assumption at ' + tick);
      check(asset.nextEvent === null || asset.nextEvent.timeS > tick,
        asset.id + ': next event is still planned at ' + tick);
      check(Object.values(asset.position).every(Number.isFinite) && Number.isFinite(asset.groundSpeedMps) &&
        (asset.headingDeg === null || Number.isFinite(asset.headingDeg)), asset.id + ': finite pose at ' + tick);
      if (airborne) check(asset.groundSpeedMps > 0 && asset.headingDeg >= 0 && asset.headingDeg < 360,
        asset.id + ': airborne schematic motion at ' + tick);
      if (tick === plan.recoverS) {
        remainingAtLand[asset.id] = asset.remainingFlightS;
        check(asset.remainingFlightS === 60 && asset.elapsedFlightS === plan.recoverS - plan.launchS,
          asset.id + ': landing preserves the actual spent budget');
      }
      if (asset.state === 'servicing') check(asset.remainingFlightS === remainingAtLand[asset.id],
        asset.id + ': no early restoration during service at ' + tick);
      if (tick === plan.readyS) check(asset.remainingFlightS === asset.flightBudgetS && asset.elapsedFlightS === 0,
        asset.id + ': full budget restored exactly at ready');
      if (asset.remainingFlightS > old.remainingFlightS) check(tick === plan.readyS,
        asset.id + ': budget increases only on service completion');
    }
    previous = s;
  }
  equal(run.events().map(e => [e.tick, e.type, e.assetId]), expectedEvents, 'Complete exact lifecycle event sequence');
  check(run.snapshot().completed && run.snapshot().assets.every(a => a.state === 'ready' && a.nextEvent === null),
    'Completion leaves both aircraft ready with no pending fixture event');
  const complete = run.exportRun(); run.advance(1000000); run.start();
  equal(run.exportRun(), complete, 'Completion clamps horizon; later calls add nothing');
  report.timeline = run.events().map(e => ({tick: e.tick, type: e.type, assetId: e.assetId, causeId: e.causeId}));
  report.cases.push('every-tick lifecycle/resource/service audit and completion');

  // Several actual advancement partitions, with arbitrary snapshot/render reads in between.
  const partitions = [[360], [20, 40, 60, 100, 140], [39, 1, 19, 1, 39, 1, 60, 40, 50, 10, 40, 60]];
  for (const chunks of partitions) {
    const other = M.createRun({seed: 73}); other.start();
    for (const n of chunks) { other.snapshot(); other.events(); other.exportRun(); other.advance(n); }
    equal(other.exportRun(), complete, 'Batch/frame-independent export for ' + chunks.join('/'));
  }
  const again = M.createRun({seed: 73}); again.start(); again.advance(360);
  equal(again.exportRun(), complete, 'Fresh same-seed run reproduces complete export');
  const separately = M.createRun({seed: 74}); separately.start(); separately.advance(100);
  equal(run.exportRun(), complete, 'Independent runs do not share mutable state');
  check(separately.snapshot().runId !== run.snapshot().runId, 'Different seeds identify different runs');
  report.cases.push('frame/batch independence and run isolation');

  const detached = M.createRun(); detached.start(); detached.advance(101);
  const pristine = detached.exportRun();
  const snap = detached.snapshot();
  snap.assets[0].position.x = 999999; snap.assets[0].remainingFlightS = -999;
  snap.assets[0].nextEvent.timeS = -1; snap.plan[0].launchS = 8888;
  snap.assets.length = 0; snap.plan.push({assetId: 'invented'});
  const eventRead = detached.events(); eventRead[0].label = 'mutated'; eventRead.push({tick: 9999});
  const portable = detached.exportRun();
  portable.events[0].type = 'invented'; portable.snapshot.plan[0].readyS = 0;
  portable.snapshot.assets[0].position.y = 888; portable.inputCommands[0].id = 'changed';
  portable.coordinateFrame.axes.x = 'corrupted'; portable.coordinateFrame.units.position = 'incorrect';
  for (let i = 0; i < 100; i += 1) { detached.snapshot(); detached.events(); detached.exportRun(); }
  equal(detached.exportRun(), pristine, 'Reads and caller mutations cannot change any private state');
  equal(JSON.parse(JSON.stringify(pristine)), pristine, 'Export is detached portable JSON without functions');
  report.cases.push('detached reads, no read side effects, portable export');

  const seen = new Map(complete.inputCommands.map(c => [c.id, {tick: c.tick, sequence: 0}]));
  complete.events.forEach((event, index) => {
    check(event.sequence === index + 1, 'Monotonic event sequence ' + event.sequence);
    const cause = seen.get(event.causeId);
    check(!!cause && cause.tick <= event.tick && (cause.tick < event.tick || cause.sequence < event.sequence),
      'Cause resolves to a prior event/input: ' + event.type, {causeId: event.causeId});
    check(['mission', 'command', 'lifecycle', 'payload'].includes(event.family) &&
      ['scenario', 'operator', 'lifecycle'].includes(event.source) && event.audience === 'operator',
      'Typed event metadata: ' + event.type);
    seen.set(event.id, event);
  });
  check(complete.inputCommands.length === 2 && complete.inputCommands[1].targetTick === 360,
    'Advancement export records canonical simulation time, not frame batch history');
  check(!complete.events.some(e => /detected|contact_report|attack|engage/.test(e.type)),
    'Lifecycle fixture emits no sensor detection or attack outcomes');
  allFinite(complete);
  report.cases.push('causal references, metadata, finite serialization and scope');
} catch (error) {
  check(false, 'Unexpected test exception', String(error.stack || error));
}

console.log(JSON.stringify({sourcePath, checks: report.checks, cases: report.cases,
  failures: report.failures, timeline: report.timeline}, null, 2));
process.exitCode = report.failures.length ? 1 : 0;
