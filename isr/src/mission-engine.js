/* ISR Mission foundation: fictional lifecycle timing only; no sensing or targeting. */
(function (root) {
  'use strict';

  const VERSION = '0.1.0';
  const SCHEMA_VERSION = '1.0';
  const TICK_SECONDS = 1;
  const MAX_ADVANCE_TICKS = 1000000;
  const TAU = Math.PI * 2;

  function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  }

  // Stable order is part of the fixture: SCOUT precedes OBSERVER for same-tick events.
  // Seeds identify a reproducible run; this initial fixed fixture has no random draws.
  const SCENARIO = deepFreeze({
    id: 'lifecycle-v1',
    name: 'Two-aircraft lifecycle exercise',
    durationS: 360,
    assets: [
      {
        id: 'scout-01', callsign: 'SCOUT 01', stockId: 'scout', role: 'Search',
        launchS: 0, stationS: 40, returnS: 160, recoverS: 200, readyS: 260,
        flightBudgetS: 260, reserveS: 40,
        base: {x: -1000, y: -400, z: 0},
        center: {x: 0, y: 0, z: 400}, radiusM: 400
      },
      {
        id: 'observer-01', callsign: 'OBSERVER 01', stockId: 'observer', role: 'Observe',
        launchS: 60, stationS: 100, returnS: 250, recoverS: 300, readyS: 360,
        flightBudgetS: 300, reserveS: 45,
        base: {x: -1000, y: -400, z: 0},
        center: {x: 1200, y: 200, z: 700}, radiusM: 600
      }
    ]
  });

  function validateOptions(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('Mission options must be an object.');
    }
    const seed = options.seed === undefined ? 42 : options.seed;
    if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
      throw new RangeError('Seed must be an integer from 0 through 4294967295.');
    }
    const scenarioId = options.scenarioId === undefined ? SCENARIO.id : options.scenarioId;
    if (scenarioId !== SCENARIO.id) {
      throw new RangeError('Unknown mission scenario: ' + String(scenarioId) + '.');
    }
    return {seed: seed === 0 ? 0 : seed, scenarioId};
  }

  function interpolate(a, b, fraction) {
    return {x: a.x + (b.x - a.x) * fraction,
      y: a.y + (b.y - a.y) * fraction,
      z: a.z + (b.z - a.z) * fraction};
  }

  function straightPose(a, b, elapsedS, durationS) {
    const dx = b.x - a.x, dy = b.y - a.y;
    return {
      position: interpolate(a, b, Math.max(0, Math.min(1, elapsedS / durationS))),
      headingDeg: (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360,
      groundSpeedMps: Math.hypot(dx, dy) / durationS
    };
  }

  function phaseFor(asset, tick, started) {
    if (!started || tick < asset.launchS || tick >= asset.readyS) return 'ready';
    if (tick < asset.stationS) return 'outbound';
    if (tick < asset.returnS) return 'on_station';
    if (tick < asset.recoverS) return 'returning';
    return 'servicing';
  }

  function nextEventFor(asset, tick, started) {
    if (!started || tick < asset.launchS) return {type: 'launch', label: 'Launch', timeS: asset.launchS};
    if (tick < asset.stationS) return {type: 'on_station', label: 'Arrive on station', timeS: asset.stationS};
    if (tick < asset.returnS) return {type: 'return', label: 'Begin recovery transit', timeS: asset.returnS};
    if (tick < asset.recoverS) return {type: 'recovered', label: 'Recover', timeS: asset.recoverS};
    if (tick < asset.readyS) return {type: 'ready', label: 'Service complete', timeS: asset.readyS};
    return null;
  }

  // Schematic phase interpolation, not a flight dynamics or sensor simulation.
  function poseFor(asset, tick, state) {
    const entry = {x: asset.center.x, y: asset.center.y - asset.radiusM, z: asset.center.z};
    if (state === 'outbound') return straightPose(asset.base, entry,
      tick - asset.launchS, asset.stationS - asset.launchS);
    if (state === 'returning') return straightPose(entry, asset.base,
      tick - asset.returnS, asset.recoverS - asset.returnS);
    if (state === 'on_station') {
      const duration = asset.returnS - asset.stationS;
      const angle = TAU * (tick - asset.stationS) / duration;
      return {
        position: {x: asset.center.x + asset.radiusM * Math.sin(angle),
          y: asset.center.y - asset.radiusM * Math.cos(angle), z: asset.center.z},
        headingDeg: ((90 - angle * 180 / Math.PI) % 360 + 360) % 360,
        groundSpeedMps: TAU * asset.radiusM / duration
      };
    }
    return {position: {...asset.base}, headingDeg: null, groundSpeedMps: 0};
  }

  function createRun(options = {}) {
    const {seed, scenarioId} = validateOptions(options);
    const runId = 'mission-' + scenarioId + '-seed-' + seed;
    const startInputId = runId + ':input:start';
    let tick = 0, started = false, completed = false;
    const journal = [];
    const causes = Object.create(null);
    let missionStartedId = null;

    function emit(type, family, asset, label, detail, causeId, source = 'lifecycle') {
      const sequence = journal.length + 1;
      const event = {
        id: runId + ':event:' + String(sequence).padStart(4, '0'),
        runId, tick, timeS: tick * TICK_SECONDS, sequence, type, family,
        severity: 'info', assetId: asset ? asset.id : null,
        actor: asset ? asset.callsign : 'Mission control', label, detail,
        causeId: causeId || null, source, audience: 'operator'
      };
      journal.push(event);
      return event.id;
    }

    function processTick() {
      for (const asset of SCENARIO.assets) {
        const c = causes[asset.id];
        if (tick === asset.launchS) {
          c.launch = emit('launch', 'lifecycle', asset, 'Launch',
            'The fixed sortie begins. Flight budget now decreases with airborne time.', c.assignment);
        }
        if (tick === asset.stationS) {
          c.station = emit('on_station', 'lifecycle', asset, 'On station',
            'The scheduled collection phase begins on the schematic route.', c.launch);
          c.collection = emit('collection_started', 'payload', asset, 'Scheduled collection started',
            'The payload is in its scheduled collecting state. No sensor observations or target detections are simulated.', c.station);
        }
        if (tick === asset.returnS) {
          c.collectionStopped = emit('collection_stopped', 'payload', asset, 'Scheduled collection stopped',
            'The scheduled payload mode ends before recovery transit.', c.collection);
          c.return = emit('return', 'lifecycle', asset, 'Return for recovery',
            'Recovery transit begins. The protected reserve remains available at landing.', c.collectionStopped);
        }
        if (tick === asset.recoverS) {
          const remaining = asset.flightBudgetS - (asset.recoverS - asset.launchS);
          c.recovered = emit('recovered', 'lifecycle', asset, 'Recovered',
            'Recovered with ' + remaining + ' seconds of flight budget remaining; protected reserve is ' + asset.reserveS + ' seconds.', c.return);
          c.servicing = emit('servicing', 'lifecycle', asset, 'Servicing',
            'The landing budget remains visible until the scheduled service interval ends.', c.recovered);
        }
        if (tick === asset.readyS) {
          c.ready = emit('ready', 'lifecycle', asset, 'Ready after service',
            'Service is complete. The full illustrative flight budget is restored.', c.servicing);
        }
      }
      if (tick === SCENARIO.durationS) {
        completed = true;
        const lastAsset = SCENARIO.assets[SCENARIO.assets.length - 1];
        emit('mission_completed', 'mission', null, 'Lifecycle exercise complete',
          'Both assets have recovered, completed service, and returned to ready state.', causes[lastAsset.id].ready);
      }
    }

    function snapshot() {
      return {
        runId, scenarioId, scenarioName: SCENARIO.name, seed,
        tick, timeS: tick * TICK_SECONDS, durationS: SCENARIO.durationS,
        started, completed,
        assets: SCENARIO.assets.map(asset => {
          const state = phaseFor(asset, tick, started);
          const elapsedFlightS = !started || tick < asset.launchS || tick >= asset.readyS ? 0 :
            Math.max(0, Math.min(tick, asset.recoverS) - asset.launchS);
          const pose = poseFor(asset, tick, state);
          return {
            id: asset.id, callsign: asset.callsign, stockId: asset.stockId, state,
            role: asset.role,
            task: !started ? 'Planned fixed lifecycle sortie' : tick < asset.launchS ?
              'Awaiting scheduled launch' : tick >= asset.readyS ? 'Ready for assignment' : 'Fixed lifecycle sortie',
            payloadStatus: state === 'on_station' ? 'collecting' : state === 'ready' ? 'standby' : 'stowed',
            communicationsStatus: 'ideal', elapsedFlightS,
            flightBudgetS: asset.flightBudgetS,
            remainingFlightS: asset.flightBudgetS - elapsedFlightS,
            reserveS: asset.reserveS,
            nextEvent: nextEventFor(asset, tick, started),
            position: pose.position, headingDeg: pose.headingDeg, groundSpeedMps: pose.groundSpeedMps
          };
        }),
        eventCount: journal.length,
        // Planned schedule is deliberately separate from the actual-events journal.
        plan: SCENARIO.assets.map(asset => ({
          assetId: asset.id, launchS: asset.launchS, stationS: asset.stationS,
          returnS: asset.returnS, recoverS: asset.recoverS, readyS: asset.readyS
        }))
      };
    }

    function events() {
      return journal.map(event => ({...event}));
    }

    function inputCommands() {
      if (!started) return [];
      const inputs = [{id: startInputId, type: 'start', tick: 0, timeS: 0}];
      // One normalized time request, not a log of render frames or advance() batch sizes.
      if (tick > 0) inputs.push({id: runId + ':input:advance', type: 'advance_to_tick',
        tick, timeS: tick * TICK_SECONDS, targetTick: tick});
      return inputs;
    }

    function exportRun() {
      return {
        schema: 'isr-mission-run', schemaVersion: SCHEMA_VERSION, engineVersion: VERSION,
        scenarioId, seed, tick,
        coordinateFrame: {
          type: 'local-cartesian',
          axes: {x: 'east', y: 'north', z: 'up'},
          units: {position: 'm', time: 's', groundSpeed: 'm/s', heading: 'degrees clockwise from north'},
          altitudeDatum: 'height above the local flat plane at z=0',
          geographicAnchor: null,
          geometry: 'schematic lifecycle illustration; no flight dynamics'
        },
        inputCommands: inputCommands(), events: events(), snapshot: snapshot()
      };
    }

    function start() {
      if (started) return snapshot();
      started = true;
      missionStartedId = emit('mission_started', 'mission', null, 'Lifecycle exercise started',
        'Two fictional fixed sorties; ideal communications; seed ' + seed + '. This fixture has no randomized outcomes or sensing simulation.', startInputId, 'operator');
      for (const asset of SCENARIO.assets) {
        causes[asset.id] = {assignment: emit('assignment_accepted', 'command', asset, 'Fixed assignment accepted',
          'Launch at ' + asset.launchS + ' seconds; scheduled on station at ' + asset.stationS +
          ' seconds. Future milestones remain plans until their simulation time occurs.', missionStartedId, 'scenario')};
      }
      processTick();
      return snapshot();
    }

    function advance(ticks) {
      if (typeof ticks !== 'number' || !Number.isInteger(ticks) || ticks < 0 || ticks > MAX_ADVANCE_TICKS) {
        throw new RangeError('Advance must be an integer from 0 through ' + MAX_ADVANCE_TICKS + ' ticks.');
      }
      if (!started || completed || ticks === 0) return snapshot();
      const target = Math.min(SCENARIO.durationS, tick + ticks);
      while (tick < target) {
        tick += 1;
        processTick();
      }
      return snapshot();
    }

    return Object.freeze({start, advance, snapshot, events, exportRun});
  }

  const api = Object.freeze({version: VERSION, schemaVersion: SCHEMA_VERSION,
    tickSeconds: TICK_SECONDS, createRun});
  root.ISRMission = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
