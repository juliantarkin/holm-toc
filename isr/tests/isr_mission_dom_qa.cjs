#!/usr/bin/env node
'use strict';
// Authored HTML/script integration in the shared offline DOM harness.
// This does not verify browser layout, CSS, touch behavior, or browser focus rendering.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const localFile = path.join(root, 'output/isr_pattern_explorer_mission_v01.html');
const file = process.argv[2] || (fs.existsSync(localFile) ? localFile : path.join(root, 'isr_pattern_explorer.html'));
process.argv[2] = file;
const {harness, report, check, near} = require('./isr_fleet_dom_qa.cjs');
const reportPath = path.join(root, 'tmp/isr_mission_qa/dom_report.json');
report.method = 'Mission integration: Node VM, authored markup, standard DOM shims and shared Canvas2D harness. Browser layout and CSS unverified.';
const json = value => JSON.stringify(value);
const rowIds = list => list.querySelectorAll('[data-mission-event]').map(row => row.dataset.missionEvent);

async function main() {
  const h = harness(), w = h.context, ids = h.ids, ui = w.ISRMissionUI;
  check(!!ui && !!w.ISRMission && !!w.ISRStockCatalogue && !!w.ISRNavigation,
    'Mission catalogue, engine, UI and navigation initialize');
  if (!ui) return;
  const snap = () => ui.run.snapshot(), events = () => ui.run.events();
  const click = id => h.trigger(id, 'click');
  const change = (id, value) => h.trigger(id, 'change', value);
  const input = (id, value) => h.trigger(id, 'input', value);
  const card = id => ids.missionAssetCards.querySelector('[data-mission-asset="' + id + '"]');
  function assertJournal(label) {
    const actual = events(), shown = rowIds(ids.missionJournalList), byId = new Map(actual.map(event => [event.id, event]));
    check(shown.length === actual.length && new Set(shown).size === shown.length && shown.every(id => byId.has(id)),
      label + ': journal contains each actual event once', {actual: actual.length, shown: shown.length});
    check(shown.every(id => byId.get(id).tick <= snap().tick) && rowIds(ids.missionRecentList).every(id => byId.has(id)),
      label + ': journal and recent activity exclude future events');
    check(Number(ids.missionActivityBadge.textContent) === actual.length && snap().eventCount === actual.length,
      label + ': activity badge agrees with the engine');
  }
  async function exportRecord(button = 'missionExport') {
    const count = h.downloads.length;
    click(button);
    const download = h.downloads.at(-1);
    check(h.downloads.length === count + 1 && !!download && /\.json$/.test(download.filename),
      button + ': authored download control produces a JSON file');
    if (h.downloads.length !== count + 1 || !download) throw new Error('Missing Mission download');
    const text = typeof download.data === 'string' ? download.data : await download.data.text();
    const record = JSON.parse(text);
    check(download.mime === 'application/json' && record.schema === 'isr-mission-run',
      button + ': download has the portable run schema');
    return record;
  }

  check(w.ISRNavigation.page === 'patterns' && ids.missionPage.hidden,
    'Mission is isolated and initially hidden');
  check(!snap().started && snap().tick === 0 && events().length === 0,
    'Initial render does not start the exercise or fabricate activity');
  check(ids.missionJournalList.textContent.includes('Start the exercise to record actual events.') &&
    rowIds(ids.missionRecentList).length === 0 && ids.missionPlanRows.querySelectorAll('.mission-plan-row').length === 2,
    'Future planned schedule remains distinct from the empty actual journal');
  check(ids.missionAssetCards.querySelectorAll('[data-mission-asset]').length === 2 &&
    snap().assets.every(asset => card(asset.id).querySelector('[data-field="state"]').dataset.state === asset.state),
    'One live card is created per fixture asset with matching initial state');
  const stock = ids.missionCatalogue.querySelectorAll('[data-availability]');
  check(stock.length === 9 && stock.filter(el => el.dataset.availability === 'demo').length === 2 &&
    stock.filter(el => el.dataset.availability === 'planned').length === 7,
    'Catalogue renders two demo and seven planned profiles');
  check(stock.filter(el => el.dataset.availability === 'planned').every(el =>
    el.textContent.includes('Planned') && el.querySelectorAll('button,input,select').length === 0),
    'Planned catalogue entries are labeled and have no launch controls');
  check(/Video \(FMV\)/.test(ids.missionCatalogue.textContent) && /COMINT/.test(ids.missionCatalogue.textContent) &&
    /ELINT/.test(ids.missionCatalogue.textContent) && /GMTI/.test(ids.missionCatalogue.textContent),
    'Catalogue renders product and operating-mode taxonomy');
  const observerBadges = card('observer-01').querySelectorAll('.mission-pill').map(el => el.textContent);
  const scoutBadges = card('scout-01').querySelectorAll('.mission-pill').map(el => el.textContent);
  check(observerBadges.includes('BLOS equipped') && observerBadges.includes('LOS equipped') &&
    !observerBadges.includes('Relay capable') && scoutBadges.length === 1 && scoutBadges[0] === 'LOS equipped',
    'Live equipment badges preserve the BLOS-versus-relay distinction');
  check(snap().assets.every(asset => card(asset.id).querySelector('[data-field="comms"]').textContent === 'Ideal link · exercise assumption'),
    'Live communications status explicitly describes an exercise assumption');

  const patternConfig = json(w.ISRApp.config), fleetPlan = w.ISRFleetUI.plan;
  w.ISRApp.setTime(17);
  w.ISRApp.setPlaying(true);
  h.nav('mission');
  check(w.ISRNavigation.page === 'mission' && !ids.missionPage.hidden && ids.patternsPage.hidden &&
    ids.schedulePage.hidden && ids.trackerPage.hidden && !w.ISRApp.state.playing,
    'Mission navigation selects one page and pauses Pattern Explorer');
  h.nav('schedule');
  w.ISRFleetUI.setTime(12);
  w.ISRFleetUI.setPlaying(true);
  h.nav('mission');
  check(!w.ISRFleetUI.playing && near(w.ISRFleetUI.timeS, 12) && w.ISRFleetUI.plan === fleetPlan,
    'Entering Mission pauses the fleet without rebuilding or resetting it');
  check(json(w.ISRApp.config) === patternConfig && !snap().started,
    'Page activation preserves lab settings and leaves Mission unstarted');
  const initialRun = ui.run;
  ui.activate(); ui.activate();
  check(ui.run === initialRun && snap().tick === 0 && events().length === 0,
    'Repeated activation is a read-only render');

  click('missionPlay');
  check(ui.playing && snap().started && snap().tick === 0 && events().length === 4 &&
    events().every(event => event.timeS === 0),
    'Start records only mission start, accepted assignments and the tick-zero launch');
  check(!events().some(event => event.type === 'launch' && event.assetId === 'observer-01'),
    'Observer future launch is absent from the actual log at start');
  check(ids.missionStep.disabled && ids.missionNext.disabled,
    'Step and next-event controls lock while playback runs');
  click('missionPlay');
  h.frame(1000); h.frame(1000);
  check(!ui.playing && snap().tick === 0,
    'Pause cancels scheduled Mission animation and prevents clock drift');
  click('missionStep');
  check(snap().tick === 1 && !ui.playing && events().length === 4,
    'Single-step advances exactly one fixed tick without fabricating a boundary');
  click('missionNext');
  check(snap().tick === 40 && !ui.playing && events().length === 6,
    'Next event advances real ticks to the next boundary and records both same-tick events');
  check(card('scout-01').querySelector('[data-field="payload"]').textContent === 'Collecting · scheduled mode' &&
    card('scout-01').querySelector('[data-field="state"]').dataset.state === 'on_station',
    'On-station UI labels scheduled collection without claiming a detected contact');
  assertJournal('At 40 seconds');
  const partial40 = await exportRecord();
  check(json(partial40) === json(ui.run.exportRun()) && partial40.events.every(event => event.tick <= 40),
    'Current export exactly matches the applied engine state and actual journal');

  const beforeViews = json(ui.run.exportRun());
  click('missionActivityTab');
  check(ui.activeView === 'activity' && !ids.missionActivityPanel.hidden && ids.missionOverviewPanel.hidden,
    'Activity view controls select the correct panel');
  click('missionOverviewTab'); click('missionViewActivity');
  check(ui.activeView === 'activity' && json(ui.run.exportRun()) === beforeViews,
    'Overview and Activity switches preserve time, run and event identities');

  change('missionAssetFilter', 'scout-01');
  let expected = events().filter(event => event.assetId === 'scout-01').map(event => event.id).reverse();
  check(json(rowIds(ids.missionJournalList)) === json(expected),
    'Asset filter displays exactly that asset’s actual events');
  change('missionFamilyFilter', 'payload');
  expected = events().filter(event => event.assetId === 'scout-01' && event.family === 'payload').map(event => event.id).reverse();
  check(json(rowIds(ids.missionJournalList)) === json(expected),
    'Asset and family filters compose without creating or deleting engine events');
  change('missionAssetFilter', 'observer-01');
  check(rowIds(ids.missionJournalList).length === 0 && ids.missionJournalList.textContent.includes('No actual events match'),
    'Empty filtered journal explains the absence of matching events');
  click('missionClearFilters');
  check(rowIds(ids.missionJournalList).length === events().length && json(ui.run.exportRun()) === beforeViews,
    'Clearing filters restores all events without changing simulation state');
  const selected = events().find(event => event.type === 'collection_started' && event.assetId === 'scout-01');
  ids.missionJournalList.querySelector('[data-mission-event="' + selected.id + '"]').click();
  check(ui.state.selectedEventId === selected.id && ids.missionEventInspector.textContent.includes(selected.id) &&
    ids.missionEventInspector.textContent.includes(selected.detail),
    'Event selection shows the actual event ID, detail and source metadata');
  const causeButton = ids.missionEventInspector.querySelector('[data-mission-cause]');
  check(!!causeButton && causeButton.dataset.missionCause === selected.causeId,
    'Inspector exposes the real event-cause reference');
  if (causeButton) causeButton.click();
  check(ui.state.selectedEventId === selected.causeId && snap().tick === 40,
    'Following a cause changes inspection only, not simulation time');
  change('missionAssetFilter', 'observer-01');
  ids.missionRecentList.querySelector('[data-mission-event]').click();
  check(ui.activeView === 'activity' && ui.state.assetFilter === 'all' && ui.state.familyFilter === 'all',
    'Selecting recent activity opens its event and clears incompatible filters');

  change('missionRate', 1); click('missionPlay'); h.frame(0); h.frame(1000);
  check(snap().tick === 41 && ui.playing,
    'One-times playback advances one simulation second per elapsed second');
  const liveEvents = json(events()), liveTick = snap().tick;
  click('missionOverviewTab'); click('missionActivityTab');
  check(ui.playing && snap().tick === liveTick && json(events()) === liveEvents,
    'Mission subview switching preserves active playback without duplicate events');
  change('missionRate', 60); h.frame(0); h.frame(1000);
  check(snap().tick === 101 && events().filter(event => event.assetId === 'observer-01' && event.timeS === 100).length === 2,
    'Higher-rate frame crosses multiple lifecycle boundaries with their original timestamps');
  click('missionPlay');
  check(!ui.playing && near(w.ISRFleetUI.timeS, 12) && w.ISRFleetUI.plan === fleetPlan,
    'Mission playback leaves the paused lab clock and plan unchanged');

  const missionBeforeNavigation = json(ui.run.exportRun());
  click('missionPlay'); h.nav('tracker');
  check(!ui.playing && json(ui.run.exportRun()) === missionBeforeNavigation,
    'Leaving Mission pauses it without advancing or resetting the run');
  w.ISRFleetUI.setPlaying(true); h.frame(200); h.frame(200);
  check(w.ISRFleetUI.timeS > 12 && json(ui.run.exportRun()) === missionBeforeNavigation,
    'Fleet playback cannot advance the independent Mission engine');
  h.nav('mission'); h.frame(1000);
  check(!ui.playing && !w.ISRFleetUI.playing && json(ui.run.exportRun()) === missionBeforeNavigation,
    'Returning to Mission preserves state without elapsed-time catch-up');
  click('missionPlay'); h.frame(0);
  h.document.hidden = true; h.document.visibilityState = 'hidden';
  h.document.dispatchEvent(new w.CustomEvent('visibilitychange'));
  h.frame(60000);
  check(!ui.playing && snap().tick === 101,
    'Browser visibility event pauses Mission and prevents hidden-tab advancement');
  h.document.hidden = false; h.document.visibilityState = 'visible';
  h.document.dispatchEvent(new w.CustomEvent('visibilitychange'));
  check(!ui.playing && snap().tick === 101,
    'Restoring browser visibility does not silently resume the Mission clock');

  let boundaries = 0;
  while (!snap().completed && boundaries++ < 12) {
    const prior = snap().tick;
    click('missionNext');
    check(snap().tick > prior && !ui.playing, 'Next-event control progresses while paused at tick ' + prior);
    for (const asset of snap().assets) {
      const fields = card(asset.id);
      check(fields.querySelector('[data-field="state"]').dataset.state === asset.state &&
        near(Number(fields.querySelector('[data-field="budget"]').getAttribute('aria-valuenow')), asset.remainingFlightS),
        'Card state and allowance agree with snapshot for ' + asset.id + ' at ' + snap().tick);
    }
    if (snap().tick === 200) check(Number(card('scout-01').querySelector('[data-field="budget"]').getAttribute('aria-valuenow')) === 60,
      'Landing/servicing display retains the landing balance instead of restoring a full allowance');
  }
  check(snap().completed && snap().tick === 360 && events().length === 20 && snap().assets.every(asset => asset.state === 'ready'),
    'Repeated next-event advances finish both recoveries and servicing with twenty actual events');
  check(ids.missionPlay.disabled && ids.missionStep.disabled && ids.missionNext.disabled && !ui.playing,
    'Completed exercise disables further transport advancement');
  assertJournal('At completion');
  const completed = await exportRecord();
  check(json(completed) === json(ui.run.exportRun()) && completed.inputCommands.length === 2 &&
    completed.inputCommands[1].targetTick === 360 && !!completed.coordinateFrame,
    'Completed JSON includes normalized advancement, current snapshot, journal and coordinate metadata');

  const completedRun = ui.run, completedText = json(completed);
  for (const invalid of ['', '42junk', '3.5', '1e3', '-1', '4294967296', '9007199254740992']) {
    input('missionSeed', invalid); click('missionNew');
    check(ui.run === completedRun && json(ui.run.exportRun()) === completedText && !ids.missionSeedError.hidden &&
      ids.missionSeed.getAttribute('aria-invalid') === 'true',
      'Invalid seed preserves the active run and shows validation: ' + JSON.stringify(invalid));
  }
  input('missionSeed', '7');
  check(snap().seed === 42 && events().length === 20 && /Draft seed/.test(ids.missionSeedHelp.textContent),
    'Editing the seed alone creates a draft without replacing the run');
  click('missionRestart');
  check(snap().seed === 42 && !snap().started && events().length === 0 && !ui.playing && !ids.missionPreviousExport.hidden,
    'Restart uses the applied seed, clears activity and preserves the prior run for export');
  check(json(await exportRecord('missionPreviousExport')) === completedText,
    'Previous-run download preserves the complete pre-restart record');
  h.frame(1000);
  check(snap().tick === 0 && events().length === 0, 'Restart does not leave a stale Mission clock running');
  click('missionNext'); click('missionNext');
  check(snap().tick === 40 && json(ui.run.exportRun()) === json(partial40),
    'Same-seed restart reproduces the exact partial export despite different advancement batches');

  for (const seed of [0, 4294967295, 7]) {
    input('missionSeed', String(seed)); click('missionNew');
    check(snap().seed === seed && snap().tick === 0 && !snap().started && events().length === 0 && ids.missionSeedError.hidden,
      'Explicit New run accepts the valid uint32 seed ' + seed);
  }
  click('missionStep');
  check(snap().seed === 7 && snap().tick === 1 && events().length === 4 && !ui.playing,
    'Stepping an unstarted new run records its start and advances one tick');
  const newExport = await exportRecord();
  check(newExport.seed === 7 && newExport.tick === 1 && newExport.snapshot.seed === 7,
    'Export switches to the explicitly applied new run');
  const detached = ui.state; detached.snapshot.tick = 999; detached.assetFilter = 'fake';
  check(ui.state.snapshot.tick === 1 && ui.state.assetFilter !== 'fake',
    'Read-only UI state inspection cannot mutate the active run or filters');

  const mobile = harness(390);
  mobile.nav('mission');
  check(!mobile.ids.missionPage.hidden && mobile.context.ISRMissionUI.run.events().length === 0 &&
    mobile.ids.missionAssetCards.querySelectorAll('[data-mission-asset]').length === 2,
    'Narrow-viewport initialization retains the same Mission controls and data');
  mobile.trigger('missionPlay', 'click'); mobile.trigger('missionPlay', 'click'); mobile.trigger('missionStep', 'click');
  check(mobile.context.ISRMissionUI.run.snapshot().tick === 1 && !mobile.context.ISRMissionUI.playing,
    'Narrow-viewport start/pause/step uses the same authoritative Mission controller');
  check(report.errors.length === 0, 'No authored-script exceptions or network attempts during Mission integration', report.errors);
  report.evidence.push({partialTick: partial40.tick, partialEvents: partial40.events.length,
    completedTick: completed.tick, completedEvents: completed.events.length,
    catalogueProfiles: stock.length, demoProfiles: 2, plannedProfiles: 7,
    currentSeed: snap().seed, currentTick: snap().tick,
    methodLimit: 'DOM/controller and actual Canvas2D calls only; no browser CSS/layout validation.'});
}

main().catch(error => check(false, 'Mission integration harness exception', String(error.stack || error)))
  .finally(() => {
    fs.mkdirSync(path.dirname(reportPath), {recursive:true});
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({file, checks:report.checks.length, failures:report.failures,
      errors:report.errors, evidence:report.evidence, report:reportPath}, null, 2));
    process.exitCode = report.failures.length ? 1 : 0;
  });
