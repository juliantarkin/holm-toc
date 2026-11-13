(function () {
  'use strict';
  const page = document.getElementById('missionPage');
  if (!page) return;
  const $ = id => document.getElementById(id);
  const engine = window.ISRMission;
  const catalogue = window.ISRStockCatalogue;
  const el = {};
  ['Error','Export','Play','Step','Next','Restart','Rate','Seed','New','SeedHelp','SeedError','PreviousExport','ExportHint','Clock','Duration','Progress','RunStatus','NextHint','Announcement','OverviewTab','ActivityTab','ActivityBadge','RunIdentity','OverviewPanel','ActivityPanel','AssetCards','AssetSummary','PlanRows','PlanAxis','PlanNow','RecentList','RecentSummary','ViewActivity','Catalogue','CatalogueCount','AssetFilter','FamilyFilter','ClearFilters','FilteredCount','JournalList','JournalThrough','EventInspector','Version'].forEach(k => { el[k] = $('mission' + k); });
  if (!engine || !catalogue) {
    el.Error.textContent = 'The Mission engine or stock catalogue is unavailable. Reload the complete explorer file.';
    el.Error.hidden = false;
    page.querySelectorAll('button,input,select').forEach(node => { node.disabled = true; });
    return;
  }

  const escapeHTML = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const formatTime = seconds => {
    const n = Math.max(0, Math.floor(Number(seconds) || 0));
    const m = Math.floor(n / 60);
    return String(m).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  };
  const labelState = state => ({ready:'Ready',outbound:'Outbound',on_station:'On station',returning:'Returning',servicing:'Servicing'}[state] || state);
  const familyLabel = family => ({mission:'Mission',command:'Command',lifecycle:'Lifecycle',payload:'Payload'}[family] || family);
  const planeIcon = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M15 3h2l2 10 10 7v3l-10-3-1 6 4 3v1l-6-1-6 1v-1l4-3-1-6-10 3v-3l10-7z"/></svg>';
  let run = engine.createRun({seed:42});
  let snapshot = run.snapshot();
  let recorded = run.events();
  let playing = false;
  let rate = 20;
  let activeView = 'overview';
  let assetFilter = 'all';
  let familyFilter = 'all';
  let selectedEventId = null;
  let inspectorPinned = false;
  let previousExport = null;
  let frameId = null;
  let lastFrame = null;
  let fractionalTicks = 0;
  let lastJournalKey = '';
  let assetViews = new Map();

  function announce(message) { el.Announcement.textContent = message; }

  function linkBadges(profile) {
    const c = profile.communications || {};
    const tags = [];
    if (c.los) tags.push('LOS equipped');
    if (c.blos) tags.push('BLOS equipped');
    if (c.relay) tags.push('Relay capable');
    if (!tags.length) tags.push('No link specified');
    return tags.map(x => '<span class="mission-pill">' + escapeHTML(x) + '</span>').join('');
  }

  function buildAssets() {
    const colors = [{ink:'#087f74',soft:'#e3f3ed'},{ink:'#4b80a9',soft:'#e9f1f7'}];
    el.AssetCards.innerHTML = snapshot.assets.map((asset, index) => {
      const profile = catalogue.get(asset.stockId) || {name:asset.stockId,kind:'Exercise asset',payloads:[],communications:{}};
      const color = colors[index % colors.length];
      const payloadNames = (profile.payloads || []).map(p => p.name).join(' · ') || 'No collection payload';
      return '<article class="mission-asset-card" data-mission-asset="' + escapeHTML(asset.id) + '" style="--mission-asset-color:' + color.ink + ';--mission-asset-soft:' + color.soft + '" aria-label="' + escapeHTML(asset.callsign) + '">' +
        '<div class="mission-asset-header"><div class="mission-asset-icon">' + planeIcon + '</div><div><h4>' + escapeHTML(asset.callsign) + '</h4><p>' + escapeHTML(profile.name) + ' · ' + escapeHTML(profile.kind) + '</p></div><span class="mission-asset-state" data-field="state"></span></div>' +
        '<div class="mission-asset-task" data-field="task"></div><p class="mission-asset-role" data-field="role"></p>' +
        '<div class="mission-asset-capabilities"><div class="mission-capability-row"><span>Payload</span><div><span>' + escapeHTML(payloadNames) + '</span><span class="mission-payload-mode" data-field="payload"></span></div></div><div class="mission-capability-row"><span>Comms</span><div>' + linkBadges(profile) + '<span class="mission-link-assumption" data-field="comms"></span></div></div></div>' +
        '<div class="mission-budget-label"><span>Flight allowance remaining</span><strong data-field="budgetText"></strong></div><div class="mission-budget-track" data-field="budget" role="progressbar" aria-label="' + escapeHTML(asset.callsign) + ' flight allowance remaining"><div class="mission-budget-fill" data-field="budgetFill"></div><span class="mission-reserve-marker" data-field="reserveMarker"></span></div>' +
        '<div class="mission-budget-caption"><span data-field="elapsed"></span><span data-field="reserve"></span></div>' +
        '<div class="mission-asset-next"><div><small>Next planned event</small><span data-field="nextLabel"></span></div><span class="mission-next-time" data-field="nextTime"></span></div></article>';
    }).join('');
    assetViews = new Map();
    el.AssetCards.querySelectorAll('[data-mission-asset]').forEach(card => {
      const fields = {};
      card.querySelectorAll('[data-field]').forEach(node => { fields[node.dataset.field] = node; });
      assetViews.set(card.dataset.missionAsset, fields);
    });
    el.AssetFilter.innerHTML = '<option value="all">All assets</option><option value="__mission__">Mission / unassigned</option>' + snapshot.assets.map(a => '<option value="' + escapeHTML(a.id) + '">' + escapeHTML(a.callsign) + '</option>').join('');
    el.AssetFilter.value = assetFilter;
  }

  function buildPlan() {
    const plan = Array.isArray(snapshot.plan) ? snapshot.plan : [];
    if (!plan.length) {
      el.PlanRows.innerHTML = '<p class="mission-small">Planned timing metadata is unavailable.</p>';
      el.PlanAxis.innerHTML = '';
      return;
    }
    const duration = snapshot.durationS || 1;
    const phases = [{state:'outbound',start:'launchS',end:'stationS',label:'Outbound'},{state:'on_station',start:'stationS',end:'returnS',label:'On station'},{state:'returning',start:'returnS',end:'recoverS',label:'Returning'},{state:'servicing',start:'recoverS',end:'readyS',label:'Servicing'}];
    el.PlanRows.innerHTML = plan.map(row => {
      const asset = snapshot.assets.find(a => a.id === row.assetId);
      const callsign = asset ? asset.callsign : row.assetId;
      const timing = [['Launch','launchS'],['Station','stationS'],['Return','returnS'],['Recover','recoverS'],['Ready','readyS']];
      return '<div class="mission-plan-row"><div class="mission-plan-label">' + escapeHTML(callsign) + '</div><div class="mission-plan-track" role="img" aria-label="' + escapeHTML(callsign + ' planned schedule: ' + timing.map(t => t[0] + ' ' + formatTime(row[t[1]])).join(', ')) + '">' +
        phases.map(p => '<span class="mission-plan-segment mission-phase-' + p.state + '" style="left:' + (row[p.start] / duration * 100) + '%;width:' + ((row[p.end] - row[p.start]) / duration * 100) + '%" title="' + p.label + ': ' + formatTime(row[p.start]) + '–' + formatTime(row[p.end]) + '"></span>').join('') +
        '<span class="mission-plan-cursor" aria-hidden="true"></span></div><div class="mission-plan-times">' + timing.map(t => '<span>' + t[0] + '<b>' + formatTime(row[t[1]]) + '</b></span>').join('') + '</div></div>';
    }).join('');
    el.PlanAxis.innerHTML = [0,.25,.5,.75,1].map(f => '<span>' + formatTime(duration * f) + '</span>').join('');
  }

  function renderCatalogue() {
    const profiles = catalogue.profiles;
    const demoCount = profiles.filter(p => p.availability === 'demo').length;
    el.CatalogueCount.textContent = demoCount + ' demo · ' + (profiles.length - demoCount) + ' planned';
    el.Catalogue.innerHTML = profiles.map(profile => {
      const payload = (profile.payloads || []).map(p => '<div class="mission-stock-capability"><strong>' + escapeHTML(p.name) + '</strong>' + escapeHTML((p.modes || []).join(' · ')) + '<div class="mission-stock-products">Products: ' + escapeHTML((p.products || []).join(', ') || 'None') + '</div></div>').join('');
      return '<article class="mission-stock-card" data-availability="' + escapeHTML(profile.availability) + '"><div class="mission-stock-heading"><h4>' + escapeHTML(profile.name) + '</h4><span class="mission-stock-availability">' + (profile.availability === 'demo' ? 'Exercise profile' : 'Planned') + '</span></div><div class="mission-stock-kind">' + escapeHTML(profile.kind) + '</div>' + (payload || '<div class="mission-stock-capability">Support role · no observation product</div>') + '<div class="mission-stock-links">' + linkBadges(profile) + '</div><div class="mission-stock-note">' + escapeHTML(profile.note) + '</div></article>';
    }).join('');
  }

  function updateAssets() {
    let airborne = 0, ready = 0;
    snapshot.assets.forEach(asset => {
      const f = assetViews.get(asset.id);
      if (!f) return;
      if (['outbound','on_station','returning'].includes(asset.state)) airborne++;
      if (asset.state === 'ready') ready++;
      f.state.textContent = labelState(asset.state);
      f.state.dataset.state = asset.state;
      f.task.textContent = asset.task;
      f.role.textContent = asset.role;
      f.payload.textContent = asset.payloadStatus === 'collecting' ? 'Collecting · scheduled mode' : asset.payloadStatus === 'stowed' ? 'Stowed' : 'Standby';
      f.comms.textContent = asset.communicationsStatus === 'ideal' ? 'Ideal link · exercise assumption' : asset.communicationsStatus;
      const budget = Math.max(0, asset.flightBudgetS || 0);
      const remaining = Math.max(0, asset.remainingFlightS || 0);
      const fraction = budget ? Math.max(0, Math.min(1, remaining / budget)) : 0;
      f.budgetText.textContent = formatTime(remaining) + ' / ' + formatTime(budget);
      f.budgetFill.style.width = (fraction * 100) + '%';
      f.budget.setAttribute('aria-valuemin', '0');
      f.budget.setAttribute('aria-valuemax', String(budget));
      f.budget.setAttribute('aria-valuenow', String(remaining));
      f.budget.setAttribute('aria-valuetext', formatTime(remaining) + ' remaining from ' + formatTime(budget));
      f.reserveMarker.style.left = (budget ? Math.max(0, Math.min(1, asset.reserveS / budget)) * 100 : 0) + '%';
      f.elapsed.textContent = 'Flight elapsed ' + formatTime(asset.elapsedFlightS);
      f.reserve.textContent = 'Reserve ' + formatTime(asset.reserveS);
      f.nextLabel.textContent = asset.nextEvent ? asset.nextEvent.label : 'Sortie complete';
      f.nextTime.textContent = asset.nextEvent ? formatTime(asset.nextEvent.timeS) + ' · in ' + formatTime(asset.nextEvent.timeS - snapshot.timeS) : '—';
    });
    el.AssetSummary.textContent = ready + ' ready · ' + airborne + ' airborne';
  }

  function nextBoundary() {
    const future = snapshot.assets.map(a => a.nextEvent && a.nextEvent.timeS).filter(t => Number.isFinite(t) && t > snapshot.timeS);
    if (snapshot.durationS > snapshot.timeS) future.push(snapshot.durationS);
    return future.length ? Math.min(...future) : null;
  }

  function eventRow(event, compact) {
    const selected = !compact && event.id === selectedEventId;
    return '<button class="mission-event-row" type="button" data-mission-event="' + escapeHTML(event.id) + '" aria-pressed="' + selected + '"><span class="mission-event-time">' + formatTime(event.timeS) + '</span><i class="mission-event-dot" data-family="' + escapeHTML(event.family) + '" aria-hidden="true"></i><span class="mission-event-content"><strong>' + escapeHTML(event.label) + '</strong><small>' + escapeHTML(event.actor) + ' · ' + escapeHTML(familyLabel(event.family)) + '</small></span><span class="mission-event-sequence">#' + escapeHTML(event.sequence) + '</span></button>';
  }

  function emptyActivity(message) {
    return '<div class="mission-empty"><div class="mission-empty-icon" aria-hidden="true">≡</div>' + escapeHTML(message) + '</div>';
  }

  function renderInspector() {
    const event = recorded.find(e => e.id === selectedEventId);
    if (!event) {
      el.EventInspector.innerHTML = '<div class="mission-eyebrow">EVENT INSPECTOR</div><h3 id="missionInspectorTitle">Select an event</h3><p class="mission-inspector-empty">Its timestamp, actor, source and cause will appear here.</p>';
      return;
    }
    const cause = event.causeId ? recorded.find(e => e.id === event.causeId) : null;
    let causeHTML;
    if (cause) {
      causeHTML = '<button class="mission-cause-button" type="button" data-mission-cause="' + escapeHTML(cause.id) + '">← ' + escapeHTML(cause.label) + '<small>' + formatTime(cause.timeS) + ' · ' + escapeHTML(cause.actor) + ' · #' + escapeHTML(cause.sequence) + '</small></button>';
    } else if (event.causeId) {
      const exported = run.exportRun();
      const inputs = exported.inputs || exported.commands || exported.inputCommands || [];
      const input = Array.isArray(inputs) ? inputs.find(x => x.id === event.causeId) : null;
      causeHTML = '<div class="mission-cause-text">Recorded input · ' + escapeHTML(event.causeId) + '</div>' + (input ? '<pre class="mission-inspector-input">' + escapeHTML(JSON.stringify(input, null, 2)) + '</pre>' : '');
    } else {
      causeHTML = '<div class="mission-cause-text">No preceding cause reference.</div>';
    }
    const meta = [['Time',formatTime(event.timeS) + ' · tick ' + event.tick],['Actor',event.actor],['Family',familyLabel(event.family)],['Source',event.source],['Audience',event.audience],['Severity',event.severity],['Event ID',event.id],['Sequence',event.sequence]];
    el.EventInspector.innerHTML = '<div class="mission-eyebrow">EVENT INSPECTOR / ACTUAL</div><h3 id="missionInspectorTitle">' + escapeHTML(event.label) + '</h3><div class="mission-inspector-detail">' + escapeHTML(event.detail) + '</div><dl class="mission-inspector-meta">' + meta.map(x => '<dt>' + escapeHTML(x[0]) + '</dt><dd>' + escapeHTML(x[1]) + '</dd>').join('') + '</dl><div class="mission-inspector-cause"><span>Cause</span>' + causeHTML + '</div>';
  }

  function renderJournal(force) {
    const key = snapshot.runId + '|' + recorded.length + '|' + selectedEventId + '|' + assetFilter + '|' + familyFilter;
    if (!force && key === lastJournalKey) return;
    lastJournalKey = key;
    const filtered = recorded.filter(event => (assetFilter === 'all' || (assetFilter === '__mission__' ? event.assetId == null : event.assetId === assetFilter)) && (familyFilter === 'all' || event.family === familyFilter));
    el.FilteredCount.textContent = filtered.length + (filtered.length === 1 ? ' event' : ' events') + (filtered.length !== recorded.length ? ' of ' + recorded.length : '');
    el.JournalList.innerHTML = filtered.length ? filtered.slice().reverse().map(e => eventRow(e, false)).join('') : emptyActivity(recorded.length ? 'No actual events match these filters.' : 'Start the exercise to record actual events.');
    el.RecentList.innerHTML = recorded.length ? recorded.slice(-4).reverse().map(e => eventRow(e, true)).join('') : emptyActivity('Start the exercise to record actual events.');
    el.RecentSummary.textContent = recorded.length ? recorded.length + ' recorded events · select one to inspect its cause.' : 'Nothing has happened yet.';
    renderInspector();
  }

  function render(forceJournal) {
    const previousCount = recorded.length;
    snapshot = run.snapshot();
    recorded = run.events();
    if (recorded.length && (!selectedEventId || (!inspectorPinned && recorded.length !== previousCount))) selectedEventId = recorded[recorded.length - 1].id;
    el.Clock.textContent = formatTime(snapshot.timeS);
    el.Duration.textContent = formatTime(snapshot.durationS);
    el.Progress.max = snapshot.durationS;
    el.Progress.value = snapshot.timeS;
    const status = snapshot.completed ? 'complete' : playing ? 'running' : snapshot.started ? 'paused' : 'ready';
    el.RunStatus.dataset.state = status;
    el.RunStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    el.Play.textContent = snapshot.completed ? 'Complete' : playing ? 'Pause' : snapshot.started ? 'Resume' : 'Start exercise';
    el.Play.disabled = snapshot.completed;
    el.Step.disabled = playing || snapshot.completed;
    el.Next.disabled = playing || snapshot.completed;
    el.ActivityBadge.textContent = recorded.length;
    el.RunIdentity.textContent = 'Seed ' + snapshot.seed + ' · ' + snapshot.scenarioId;
    const boundary = nextBoundary();
    el.NextHint.textContent = snapshot.completed ? 'Exercise complete. Both assets are ready again.' : !snapshot.started ? 'Start to record the first actual events.' : boundary != null ? 'Next planned boundary ' + formatTime(boundary) + ' · in ' + formatTime(boundary - snapshot.timeS) : 'No further scheduled events.';
    el.PlanNow.textContent = 'Now ' + formatTime(snapshot.timeS);
    const fraction = snapshot.durationS ? Math.max(0, Math.min(1, snapshot.timeS / snapshot.durationS)) : 0;
    el.PlanRows.querySelectorAll('.mission-plan-cursor').forEach(cursor => { cursor.style.left = 'calc(' + (fraction * 100) + '% - ' + (fraction === 1 ? 2 : 0) + 'px)'; });
    el.JournalThrough.textContent = 'Through ' + formatTime(snapshot.timeS);
    updateAssets();
    renderJournal(forceJournal);
  }

  function stopClock() {
    playing = false;
    lastFrame = null;
    fractionalTicks = 0;
    if (frameId != null) cancelAnimationFrame(frameId);
    frameId = null;
  }

  function fail(error) {
    stopClock();
    el.Error.hidden = false;
    el.Error.textContent = 'The exercise paused: ' + (error && error.message ? error.message : String(error));
    render(false);
  }

  function stepTicks(ticks) {
    if (ticks > 0) run.advance(ticks);
    render(false);
    if (snapshot.completed) {
      stopClock();
      render(false);
      announce('Exercise complete at ' + formatTime(snapshot.timeS) + '. Both assets are ready. ' + recorded.length + ' actual events recorded.');
    }
  }

  function frame(now) {
    frameId = null;
    if (!playing) return;
    if (page.hidden || document.hidden) {
      stopClock();
      render(false);
      return;
    }
    if (lastFrame != null) {
      const elapsed = Math.max(0, Math.min(1, (now - lastFrame) / 1000));
      fractionalTicks += elapsed * rate / engine.tickSeconds;
      const ticks = Math.floor(fractionalTicks + 1e-9);
      if (ticks > 0) {
        fractionalTicks -= ticks;
        try { stepTicks(ticks); } catch (error) { fail(error); return; }
      }
    }
    lastFrame = now;
    if (playing) frameId = requestAnimationFrame(frame);
  }

  function setPlaying(value) {
    if (!value) {
      stopClock();
      render(false);
      return;
    }
    if (snapshot.completed) return;
    try {
      if (!snapshot.started) run.start();
      if (!playing) {
        playing = true;
        lastFrame = null;
        fractionalTicks = 0;
        frameId = requestAnimationFrame(frame);
      }
      render(false);
    } catch (error) { fail(error); }
  }

  function setView(view, shouldFocus) {
    activeView = view === 'activity' ? 'activity' : 'overview';
    const activity = activeView === 'activity';
    el.OverviewPanel.hidden = activity;
    el.ActivityPanel.hidden = !activity;
    el.OverviewTab.setAttribute('aria-pressed', String(!activity));
    el.ActivityTab.setAttribute('aria-pressed', String(activity));
    el.OverviewTab.classList.toggle('mission-selected', !activity);
    el.ActivityTab.classList.toggle('mission-selected', activity);
    render(false);
    if (shouldFocus) (activity ? el.ActivityTab : el.OverviewTab).focus();
  }

  function selectEvent(id, clearFilters) {
    if (!recorded.some(e => e.id === id)) return;
    selectedEventId = id;
    inspectorPinned = true;
    if (clearFilters) {
      assetFilter = familyFilter = 'all';
      el.AssetFilter.value = el.FamilyFilter.value = 'all';
    }
    setView('activity', false);
    renderJournal(true);
    const inspectorTitle = el.EventInspector.querySelector('#missionInspectorTitle');
    if (inspectorTitle) {
      inspectorTitle.tabIndex = -1;
      inspectorTitle.focus();
    }
  }

  function download(record, label) {
    const body = JSON.stringify(record, null, 2);
    const blob = new Blob([body], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const seed = record.seed != null ? record.seed : record.snapshot && record.snapshot.seed;
    const tick = record.tick != null ? record.tick : record.snapshot && record.snapshot.tick;
    link.href = url;
    link.download = 'isr-mission-seed-' + seed + '-tick-' + tick + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce((label || 'Current run') + ' JSON downloaded. It includes the recorded inputs, actual events and current snapshot.');
  }

  function createNew(seed) {
    const replacement = engine.createRun({seed, scenarioId:snapshot.scenarioId});
    stopClock();
    if (snapshot.started || recorded.length) {
      previousExport = run.exportRun();
      el.PreviousExport.hidden = false;
      el.ExportHint.hidden = true;
      el.PreviousExport.title = 'Only the most recent previous run is retained in this tab.';
    }
    run = replacement;
    snapshot = run.snapshot();
    recorded = run.events();
    selectedEventId = null;
    inspectorPinned = false;
    lastJournalKey = '';
    el.Seed.value = String(seed);
    el.SeedError.hidden = true;
    el.Seed.removeAttribute('aria-invalid');
    el.SeedHelp.textContent = 'Recorded for reproducibility; timings are fixed.';
    el.Error.hidden = true;
    buildAssets();
    buildPlan();
    render(true);
    announce('New exercise ready with seed ' + seed + '. Activity was cleared.' + (previousExport ? ' The previous run can still be downloaded from this tab.' : ''));
  }

  function parseSeed() {
    const raw = el.Seed.value.trim();
    if (!/^\d+$/.test(raw)) throw new Error('Enter a whole-number seed from 0 to 4294967295.');
    const seed = Number(raw);
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('Seed must be between 0 and 4294967295.');
    return seed;
  }

  el.Play.addEventListener('click', () => {
    const wasPlaying = playing;
    setPlaying(!playing);
    announce(wasPlaying ? 'Exercise paused at ' + formatTime(snapshot.timeS) + '.' : 'Exercise running at ' + rate + ' times speed.');
  });
  el.Step.addEventListener('click', () => {
    if (playing || snapshot.completed) return;
    try {
      if (!snapshot.started) run.start();
      stepTicks(1);
      if (!snapshot.completed) announce('Advanced to ' + formatTime(snapshot.timeS) + '.');
    } catch (error) { fail(error); }
  });
  el.Next.addEventListener('click', () => {
    if (playing || snapshot.completed) return;
    try {
      if (!snapshot.started) {
        run.start();
        render(false);
        announce('Mission start recorded at ' + formatTime(snapshot.timeS) + '.');
      } else {
        const boundary = nextBoundary();
        if (boundary != null) stepTicks(Math.ceil((boundary - snapshot.timeS) / engine.tickSeconds));
        if (!snapshot.completed) announce('Advanced to the planned event boundary at ' + formatTime(snapshot.timeS) + '.');
      }
    } catch (error) { fail(error); }
  });
  el.Rate.addEventListener('change', () => {
    const selected = Number(el.Rate.value);
    if ([1,5,20,60].includes(selected)) rate = selected;
    lastFrame = null;
    announce('Playback speed set to ' + rate + ' times.');
  });
  el.Restart.addEventListener('click', () => { try { createNew(snapshot.seed); } catch (error) { fail(error); } });
  el.New.addEventListener('click', () => {
    try { createNew(parseSeed()); }
    catch (error) {
      el.SeedError.textContent = error.message;
      el.SeedError.hidden = false;
      el.Seed.setAttribute('aria-invalid', 'true');
      el.Seed.focus();
    }
  });
  el.Seed.addEventListener('input', () => {
    el.SeedError.hidden = true;
    el.Seed.removeAttribute('aria-invalid');
    el.SeedHelp.textContent = el.Seed.value.trim() === String(snapshot.seed) ? 'Recorded for reproducibility; timings are fixed.' : 'Draft seed. Choose New run to apply and clear Activity.';
  });
  el.Seed.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); el.New.click(); } });
  el.Export.addEventListener('click', () => { try { download(run.exportRun(), 'Current run'); } catch (error) { fail(error); } });
  el.PreviousExport.addEventListener('click', () => { if (previousExport) download(previousExport, 'Previous run'); });
  el.OverviewTab.addEventListener('click', () => setView('overview', false));
  el.ActivityTab.addEventListener('click', () => setView('activity', false));
  el.ViewActivity.addEventListener('click', () => setView('activity', true));
  el.AssetFilter.addEventListener('change', () => { assetFilter = el.AssetFilter.value; renderJournal(true); });
  el.FamilyFilter.addEventListener('change', () => { familyFilter = el.FamilyFilter.value; renderJournal(true); });
  el.ClearFilters.addEventListener('click', () => {
    assetFilter = familyFilter = 'all';
    el.AssetFilter.value = el.FamilyFilter.value = 'all';
    renderJournal(true);
  });
  page.addEventListener('click', event => {
    const eventButton = event.target.closest('[data-mission-event]');
    if (eventButton) { selectEvent(eventButton.dataset.missionEvent, el.RecentList.contains(eventButton)); return; }
    const causeButton = event.target.closest('[data-mission-cause]');
    if (causeButton) selectEvent(causeButton.dataset.missionCause, true);
  });
  document.addEventListener('isr:page', event => {
    if (!event.detail || event.detail.page !== 'mission') {
      if (playing) { setPlaying(false); announce('Mission paused while another page is open.'); }
    } else activate();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) { setPlaying(false); announce('Mission paused while this browser tab is hidden.'); }
  });

  function activate() { render(false); }

  buildAssets();
  buildPlan();
  renderCatalogue();
  el.Version.textContent = 'Engine ' + engine.version + ' · catalogue ' + catalogue.version;
  render(true);
  window.ISRMissionUI = Object.freeze({
    activate,
    setPlaying,
    get playing() { return playing; },
    get run() { return run; },
    get activeView() { return activeView; },
    get state() { return clone({playing,rate,activeView,assetFilter,familyFilter,selectedEventId,seedDraft:el.Seed.value,snapshot:run.snapshot()}); }
  });
})();
