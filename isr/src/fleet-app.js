(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const F = window.ISRFleet, M = window.ISRModel;
  if (!$('schedulePage')) return;
  if (!F || !M) {
    $('fleetPlanTitle').textContent = 'The fleet model is unavailable.';
    $('fleetPlanTitle').classList.add('fleet-error-heading');
    return;
  }
  const clone = value => JSON.parse(JSON.stringify(value));
  const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const profileBy = id => M.profiles.find(profile => profile.id === id);
  const patternBy = id => M.patterns.find(pattern => pattern.id === id);
  const palette = {scout:'#208b8a',endurance:'#548dc1',crewed:'#a07abc',vtol:'#bc9252'};
  const state = {
    draft: F.defaults(), plan: null, timeS: 0, snapshot: null, playing: false,
    dirty: false, busy: false, cancelRequested: false, rate: 120, page: 'patterns',
    phaseOffset: 0, mapView: 'task', cumulative: false, selectedCellId: null,
    showAllGaps: false, lastFrame: 0, drawElapsed: 0, lastPlaybackEmit: 0,
    mapProjection: null, timelineGeometry: null, mapWidth: 0, mapHeight: 0,
    timelineWidth: 0, timelineHeight: 0, dpr: Math.min(window.devicePixelRatio || 1, 2)
  };
  const map = $('fleetMapCanvas'), timeline = $('fleetTimelineCanvas');
  const mapCtx = map.getContext('2d'), timeCtx = timeline.getContext('2d');
  const globalFields = {
    fleetBaseDistance:'baseDistanceKm', fleetMode:'mode', fleetAreaWidth:'areaWidthKm',
    fleetAreaHeight:'areaHeightKm', fleetThreshold:'coverageThresholdPct', fleetObservers:'requiredObservers',
    fleetHandover:'handoverMin', fleetSetup:'setupMin', fleetSlots:'slots', fleetPhase:'phaseMode',
    fleetStep:'sampleStepS', fleetGrid:'gridSize'
  };
  const numericFields = {
    fleetDuration:['Task duration',0.5,24], fleetBaseDistance:['Base distance',0,500],
    fleetAreaWidth:['Area width',0.1,1000], fleetAreaHeight:['Area height',0.1,1000],
    fleetThreshold:['Area percentage',1,100], fleetObservers:['Observer requirement',1,12,true],
    fleetHandover:['Handover overlap',0,720], fleetSetup:['Setup time',0,120],
    fleetSlots:['Station assignments',1,12,true]
  };
  const profileFields = [
    ['enduranceMin','Endurance','min',1,2880,1],
    ['reserveMin','Reserve','min',0,2880,1],
    ['turnaroundMin','Turnaround','min',0,1440,1],
    ['transitSpeedMps','Transit speed','m/s',1,350,1]
  ];

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    const sign = seconds < 0 ? '−' : '';
    const value = Math.max(0, Math.round(Math.abs(seconds)));
    const hours = Math.floor(value / 3600), minutes = Math.floor(value % 3600 / 60), secs = value % 60;
    if (hours) return sign + hours + 'h' + (minutes ? ' ' + minutes + 'm' : '');
    if (minutes) return sign + minutes + 'm' + (secs ? ' ' + secs + 's' : '');
    return sign + secs + 's';
  }
  function formatClock(seconds, showSeconds = true) {
    const start = state.plan ? state.plan.config.startMinutes : state.draft.startMinutes;
    const total = Math.round(finite(start, 480) * 60 + finite(seconds));
    const day = Math.floor(total / 86400), within = ((total % 86400) + 86400) % 86400;
    const pad = value => String(value).padStart(2, '0');
    const clock = pad(Math.floor(within / 3600)) + ':' + pad(Math.floor(within % 3600 / 60)) + (showSeconds ? ':' + pad(within % 60) : '');
    return clock + (day ? ' (' + (day > 0 ? '+' : '−') + Math.abs(day) + 'd)' : '');
  }
  function pct(value, digits = 1) { return (clamp(finite(value), 0, 1) * 100).toFixed(digits) + '%'; }
  function distance(value) {
    if (!Number.isFinite(value)) return '—';
    return Math.abs(value) >= 1000 ? (value / 1000).toFixed(Math.abs(value) >= 10000 ? 0 : 1) + ' km' : Math.round(value) + ' m';
  }
  function profileInput(id, field, label, unit, min, max, step, value) {
    const domId = 'fleetProfile-' + id + '-' + field;
    return '<div><label for="' + domId + '">' + esc(label) + ' <span>' + esc(unit) + '</span></label><input id="' + domId + '" data-fleet-profile="' + id + '" data-fleet-field="' + field + '" type="number" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '" required></div>';
  }
  function buildProfileCards() {
    $('fleetProfileCards').innerHTML = state.draft.profiles.map(entry => {
      const p = profileBy(entry.profileId), id = entry.profileId;
      if (!p) return '';
      const options = M.supportedPatterns(id).map(item => typeof item === 'string' ? patternBy(item) : item)
        .filter(Boolean).map(pattern => '<option value="' + esc(pattern.id) + '">' + esc(pattern.name) + '</option>').join('');
      const fields = profileFields.map(args => profileInput(id, ...args, entry[args[0]]));
      return '<article class="fleet-profile-card" data-profile-card="' + id + '"><div class="fleet-profile-top"><i class="fleet-profile-swatch" style="background:' + palette[id] + '"></i><div class="fleet-profile-name"><h4>' + esc(p.name) + '</h4><span id="fleetProfile-' + id + '-summary"></span></div><div class="fleet-profile-count"><label for="fleetProfile-' + id + '-count">' + esc(p.name) + ' aircraft count</label><input id="fleetProfile-' + id + '-count" data-fleet-profile="' + id + '" data-fleet-field="count" type="number" min="0" max="12" step="1" value="' + entry.count + '" required></div></div><div class="fleet-profile-capabilities"><span>'+ (id==='crewed'?'Side-looking camera geometry':'Camera geometry') +'</span><span>Links not modeled</span></div><details class="fleet-profile-details" id="fleetProfile-' + id + '-details"><summary><span>Budget, transit & pattern</span></summary><div class="fleet-profile-body"><div class="fleet-field"><label for="fleetProfile-' + id + '-pattern">Flight pattern</label><select id="fleetProfile-' + id + '-pattern" data-fleet-profile="' + id + '" data-fleet-field="pattern">' + options + '</select></div><div class="fleet-field-pair">' + fields.slice(0,2).join('') + '</div><div class="fleet-field-pair">' + fields.slice(2).join('') + '</div><p id="fleetProfile-' + id + '-routeNote" class="fleet-route-note"></p><button type="button" class="fleet-text-button fleet-clear-route" data-clear-profile="' + id + '" hidden>Use default route settings</button></div></details></article>';
    }).join('');
  }
  function syncControls() {
    const c = state.draft;
    Object.entries(globalFields).forEach(([id, key]) => { $(id).value = c[key]; });
    $('fleetDuration').value = c.durationMin / 60;
    $('fleetStartClock').value = String(Math.floor(c.startMinutes / 60) % 24).padStart(2, '0') + ':' + String(c.startMinutes % 60).padStart(2, '0');
    $('fleetPrelaunch').checked = Boolean(c.allowPrelaunch);
    c.profiles.forEach(entry => {
      ['count','pattern',...profileFields.map(item => item[0])].forEach(field => {
        const el = $('fleetProfile-' + entry.profileId + '-' + field);
        if (el) el.value = entry[field];
      });
    });
    updateFormHints();
  }
  function updateFormHints() {
    const area = $('fleetMode').value === 'area';
    $('fleetAreaControls').hidden = !area;
    $('fleetGrid').disabled = state.busy || !area;
    let total = 0;
    state.draft.profiles.forEach(entry => {
      const id = entry.profileId, count = Number($('fleetProfile-' + id + '-count').value);
      total += finite(count);
      const pat = patternBy($('fleetProfile-' + id + '-pattern').value);
      $('fleetProfile-' + id + '-summary').textContent = pat ? pat.name : 'Choose a pattern';
      const override = entry.routeOverrides || {}, custom = Object.keys(override).length > 0;
      const config = Object.assign({}, M.defaultsFor(id, pat && pat.id), override);
      $('fleetProfile-' + id + '-routeNote').textContent = (custom ? 'Copied setup: ' : 'Example setup: ') + distance(config.altitudeM) + ' above ground · ' + (config.pattern === 'hover' || (pat && pat.id === 'hover') ? 'stationary' : finite(config.speedMps) + ' m/s') + ' · ' + finite(config.fovDeg) + '° field of view. ' + (config.sensorMode === 'nadir' ? 'Sensor points down.' : 'Sensor tracks the reference.');
      const clear = document.querySelector('[data-clear-profile="' + id + '"]');
      if (clear) clear.hidden = !custom;
    });
    $('fleetCountBadge').textContent = total + ' / 12';
    $('fleetCountBadge').style.color = total > 12 ? '#a04d36' : '';
  }
  function numberFrom(id, definition, errors) {
    const el = $(id), raw = el.value.trim(), value = raw === '' ? NaN : Number(raw);
    const [label, min, max, integer] = definition;
    const invalid = !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value));
    el.setAttribute('aria-invalid', String(invalid));
    if (invalid) errors.push(label + ' must be ' + (integer ? 'a whole number ' : '') + 'from ' + min + ' to ' + max + '.');
    return value;
  }
  function collectConfig(showErrors = true) {
    const c = clone(state.draft), errors = [];
    Object.entries(numericFields).forEach(([id, definition]) => {
      if ($('fleetMode').value !== 'area' && ['fleetAreaWidth','fleetAreaHeight','fleetThreshold'].includes(id)) {
        $(id).setAttribute('aria-invalid','false');
        return;
      }
      const value = numberFrom(id, definition, errors);
      if (id === 'fleetDuration') c.durationMin = value * 60;
      else c[globalFields[id]] = value;
    });
    c.mode = $('fleetMode').value;
    c.phaseMode = $('fleetPhase').value;
    c.sampleStepS = Number($('fleetStep').value);
    c.gridSize = Number($('fleetGrid').value);
    c.allowPrelaunch = $('fleetPrelaunch').checked;
    const time = /^(\d{2}):(\d{2})$/.exec($('fleetStartClock').value);
    const invalidTime = !time || Number(time[1]) > 23 || Number(time[2]) > 59;
    if (invalidTime) errors.push('Enter a valid task start time.');
    else c.startMinutes = Number(time[1]) * 60 + Number(time[2]);
    $('fleetStartClock').setAttribute('aria-invalid', String(invalidTime));
    c.profiles.forEach(entry => {
      const p = profileBy(entry.profileId), id = entry.profileId;
      entry.count = numberFrom('fleetProfile-' + id + '-count', [p.name + ' count',0,12,true], errors);
      profileFields.forEach(field => { entry[field[0]] = numberFrom('fleetProfile-' + id + '-' + field[0], [p.name + ' ' + field[1].toLowerCase(),field[3],field[4]], errors); });
      entry.pattern = $('fleetProfile-' + id + '-pattern').value;
    });
    const count = c.profiles.reduce((sum, item) => sum + finite(item.count), 0);
    if (count > 12) errors.push('Use at most 12 aircraft across the fleet.');
    if (showErrors) {
      $('fleetValidation').hidden = errors.length === 0;
      $('fleetValidation').textContent = errors.slice(0,3).join(' ') + (errors.length > 3 ? ' Check the other highlighted fields.' : '');
    }
    return {config:c,valid:errors.length === 0,errors};
  }
  function emitTime() {
    document.dispatchEvent(new CustomEvent('fleet:time', {detail:{timeS:state.timeS,snapshot:state.snapshot,playing:state.playing,dirty:state.dirty,busy:state.busy}}));
  }
  function markDirty() {
    if (state.busy) return;
    state.dirty = true;
    state.playing = false;
    updateFormHints();
    const check = collectConfig(true);
    $('fleetBuild').disabled = !check.valid;
    $('fleetOptimize').disabled = !check.valid;
    updateAppliedState();
    emitTime();
  }
  function updateAppliedState() {
    $('fleetDirtyBanner').hidden = !state.dirty;
    $('fleetAppliedLabel').textContent = state.dirty ? 'Previous result' : 'Applied plan';
    $('fleetAppliedLabel').classList.toggle('fleet-stale',state.dirty);
    $('fleetExport').disabled = !state.plan || state.dirty || state.busy;
    $('fleetPlay').disabled = !state.plan || state.dirty || state.busy;
    $('fleetPlay').textContent = state.playing ? 'Pause' : 'Play';
    $('fleetPlay').setAttribute('aria-pressed',String(state.playing));
    $('fleetScrub').disabled = !state.plan || state.busy;
    $('fleetRestart').disabled = !state.plan || state.busy;
  }
  function setBusy(value) {
    state.busy = value;
    if (value) state.playing = false;
    $('fleetForm').querySelectorAll('input,select,button').forEach(el => { el.disabled = value; });
    document.querySelectorAll('[data-fleet-preset]').forEach(el => { el.disabled = value; });
    $('fleetBuild').disabled = value;
    $('fleetOptimize').disabled = value;
    $('fleetProgressWrap').hidden = !value;
    if (!value) updateFormHints();
    updateAppliedState();
    emitTime();
  }
  function applyPlan(plan) {
    state.plan = plan;
    state.draft = clone(plan.config);
    state.phaseOffset = finite(plan.strategy && plan.strategy.phaseOffset);
    state.dirty = false;
    state.playing = false;
    state.selectedCellId = null;
    state.showAllGaps = false;
    state.timeS = 0;
    syncControls();
    $('fleetValidation').hidden = true;
    renderPlan();
    resizeCanvases();
    state.snapshot = F.snapshot(plan, state.timeS, {footprints:state.page === 'schedule'});
    updateAppliedState();
    document.dispatchEvent(new CustomEvent('fleet:plan',{detail:{plan:state.plan,config:state.plan.config}}));
    renderTime();
    emitTime();
    return plan;
  }
  function rebuild() {
    if (state.busy) return null;
    const check = collectConfig(true);
    if (!check.valid) { state.dirty = true; updateAppliedState(); emitTime(); return null; }
    setPlaying(false);
    $('fleetExportStatus').textContent = '';
    try {
      const result = F.plan(check.config,{slots:check.config.slots,phaseMode:check.config.phaseMode,phaseOffset:state.phaseOffset});
      return applyPlan(result);
    } catch (error) {
      state.dirty = true;
      $('fleetValidation').hidden = false;
      $('fleetValidation').textContent = 'Could not build this schedule: ' + error.message;
      updateAppliedState();
      emitTime();
      return null;
    }
  }
  async function optimize() {
    if (state.busy) return;
    const check = collectConfig(true);
    if (!check.valid) return;
    state.cancelRequested = false;
    $('fleetCancel').disabled = false;
    $('fleetCancel').textContent = 'Cancel';
    $('fleetProgress').value = 0;
    $('fleetProgress').max = 1;
    $('fleetProgressText').textContent = 'Evaluating the current setup…';
    $('fleetProgressDetail').textContent = 'Same fleet, budgets, task and analysis resolution for every candidate.';
    setBusy(true);
    try {
      const result = await F.optimize(check.config, {
        baselineStrategy:{slots:check.config.slots,phaseMode:check.config.phaseMode,phaseOffset:state.phaseOffset},
        shouldCancel:() => state.cancelRequested,
        onProgress:progress => {
          if (!progress || typeof progress !== 'object') return;
          $('fleetProgress').max = Math.max(1, finite(progress.total,1));
          $('fleetProgress').value = finite(progress.tested);
          $('fleetProgressText').textContent = 'Compared ' + finite(progress.tested) + ' / ' + finite(progress.total) + ' options';
          $('fleetProgressDetail').textContent = 'Best tested: ' + pct(progress.bestSatisfiedFraction) + ' task satisfaction · ' + formatDuration(progress.bestLongestGapS) + ' longest gap.';
        }
      });
      setBusy(false);
      applyPlan(result);
    } catch (error) {
      setBusy(false);
      $('fleetValidation').hidden = false;
      $('fleetValidation').textContent = 'Could not complete the comparison: ' + error.message;
      updateAppliedState();
    }
  }
  function setPlaying(value) {
    const next = Boolean(value) && Boolean(state.plan) && !state.dirty && !state.busy && state.page !== 'patterns';
    if (next && state.timeS >= state.plan.timelineEndS - 0.01) setTime(state.plan.timelineStartS);
    state.playing = next;
    state.lastFrame = 0;
    updateAppliedState();
    emitTime();
  }
  function setTime(seconds) {
    if (!state.plan || !Number.isFinite(Number(seconds))) return;
    state.timeS = clamp(Number(seconds),finite(state.plan.timelineStartS),finite(state.plan.timelineEndS,state.plan.durationS));
    state.snapshot = F.snapshot(state.plan,state.timeS,{footprints:state.page === 'schedule'});
    renderTime();
    emitTime();
  }
  function renderPlan() {
    const p = state.plan, c = p.config, m = p.metrics;
    const assetCount = p.assets.length, slots = p.strategy.slots;
    $('fleetPlanTitle').textContent = (c.mode === 'point' ? 'Reference-point coverage' : c.areaWidthKm + ' × ' + c.areaHeightKm + ' km area coverage');
    $('fleetPlanSubtitle').textContent = formatDuration(p.durationS) + ' request · ' + assetCount + ' aircraft · ' + slots + ' station assignment' + (slots === 1 ? '' : 's') + ' · ' + (p.strategy.phaseMode === 'spread' ? 'spread phases' : 'aligned phases');
    $('fleetSatisfied').textContent = pct(m.satisfiedFraction);
    $('fleetSatisfiedNote').textContent = formatDuration(p.durationS - finite(m.totalGapS)) + ' of ' + formatDuration(p.durationS);
    $('fleetLongestGap').textContent = formatDuration(m.longestGapS);
    $('fleetGapCount').textContent = p.gaps.length + ' task gap' + (p.gaps.length === 1 ? '' : 's') + ' in this window';
    $('fleetTotalGap').textContent = formatDuration(m.totalGapS);
    $('fleetGapNote').textContent = c.mode === 'area' ? 'Below ' + c.coverageThresholdPct + '% of cells covered' : 'Below ' + c.requiredObservers + ' observer' + (c.requiredObservers === 1 ? '' : 's');
    $('fleetSpatialLabel').textContent = c.mode === 'area' ? 'Mean area covered' : 'Point coverage';
    $('fleetMeanCoverage').textContent = pct(m.meanAreaCoverage);
    $('fleetSpatialNote').textContent = c.requiredObservers + ' observer' + (c.requiredObservers === 1 ? '' : 's') + ' required per cell';
    $('fleetNeverObserved').textContent = finite(m.neverObservedCount) + ' / ' + p.cells.length;
    $('fleetNeverNote').textContent = c.mode === 'area' ? 'Grid cells never observed in the samples' : 'Reference points never observed';
    $('fleetAircraftSorties').textContent = assetCount + ' / ' + finite(m.sortieCount);
    $('fleetFlightHours').textContent = (finite(m.totalFlightS) / 3600).toFixed(1) + ' total modeled flight hours';
    $('fleetScrub').min = p.timelineStartS;
    $('fleetScrub').max = p.timelineEndS;
    $('fleetClockStart').textContent = formatClock(p.timelineStartS,false);
    $('fleetClockEnd').textContent = formatClock(p.timelineEndS,false);
    const r = p.resolution;
    $('fleetResolution').textContent = 'Up to ' + formatDuration(r.effectiveStepS) + ' midpoint bins · ' + r.cellCount + ' cell' + (r.cellCount === 1 ? '' : 's') + (c.mode === 'area' ? ' (' + r.gridSize + ' × ' + r.gridSize + ')' : '') + (r.eventAligned ? ' · station boundaries aligned' : '') + (r.effectiveStepS !== r.requestedStepS ? ' · sampling capped for this horizon' : '');
    $('fleetTimelineNote').textContent = 'Click to inspect a time. Task window: ' + formatClock(0,false) + '–' + formatClock(p.durationS,false) + '. Sensor gap edges use bins of up to ' + formatDuration(r.effectiveStepS) + '.';
    $('fleetCellNote').textContent = c.mode === 'area' ? 'Equal-weight cell centers; bars show time at the observer requirement.' : 'Coverage of the single reference point.';
    renderGaps();
    renderWorstCells();
    $('fleetIssues').innerHTML = p.issues.length ? p.issues.map(issue => '<div class="fleet-issue ' + (['warning','error'].includes(issue.severity) ? issue.severity : '') + '">' + esc(issue.assetId ? issue.assetId + ': ' : '') + esc(issue.message) + '</div>').join('') : '<div class="fleet-issue">No budget or route-feasibility issue was reported for this configuration. Sensor access may still leave coverage gaps.</div>';
    const opt = p.optimization;
    $('fleetOptimizationNote').hidden = !opt;
    if (opt) $('fleetOptimizationNote').textContent = (opt.cancelled ? 'Comparison stopped. ' : 'Comparison complete. ') + 'Best of ' + finite(opt.tested) + ' tested options' + (opt.total ? ' out of ' + opt.total : '') + ': ' + pct(m.satisfiedFraction) + ' task satisfaction; baseline ' + pct(opt.baselineSatisfiedFraction) + '. ' + slots + ' assignments, ' + p.strategy.phaseMode + ' phase, ' + Math.round(finite(p.strategy.phaseOffset) * 100) + '% phase offset. ' + (opt.description || 'This is a bounded deterministic comparison, not a guaranteed global optimum.');
    $('fleetEngineAssumptions').innerHTML = (p.assumptions || []).map(item => '<li>' + esc(item) + '</li>').join('');
  }
  function renderGaps() {
    const gaps = state.plan.gaps;
    $('fleetGapBadge').textContent = gaps.length;
    $('fleetMoreGaps').hidden = gaps.length <= 8;
    $('fleetMoreGaps').textContent = state.showAllGaps ? 'Show fewer gaps' : 'Show all ' + gaps.length + ' gaps';
    if (!gaps.length) {
      $('fleetGapList').innerHTML = '<div class="fleet-empty"><strong>No sampled task gaps.</strong>The requirement is met in every analyzed bin. This does not establish continuous access between samples.</div>';
      return;
    }
    $('fleetGapList').innerHTML = (state.showAllGaps ? gaps : gaps.slice(0,8)).map((gap,index) => {
      const reasons = (gap.reasons || []).map(reason => String(reason).replace(/_/g,' '));
      return '<button type="button" class="fleet-gap-row" data-fleet-gap="' + index + '"><div><strong>' + esc(formatClock(gap.startS)) + '–' + esc(formatClock(gap.endS)) + '</strong><b>' + esc(formatDuration(gap.durationS)) + '</b></div><p>' + esc(reasons.join(' · ') || 'Collection requirement not met') + '</p><small>' + (state.plan.config.mode === 'area' ? 'Lowest coverage ' + pct(gap.minCoveredFraction,0) + ' · ' : '') + 'Up to ' + finite(gap.maxOnStation) + ' on station' + (gap.edgeCensored ? ' · touches the task boundary' : '') + '</small></button>';
    }).join('');
  }
  function cellName(cell) {
    if (state.plan.config.mode === 'point') return 'Reference';
    return 'E ' + (cell.x / 1000).toFixed(1) + ' · N ' + (cell.y / 1000).toFixed(1);
  }
  function renderWorstCells() {
    const cells = state.plan.cells.slice().sort((a,b) => a.coveredFraction - b.coveredFraction || b.longestGapS - a.longestGapS).slice(0,5);
    $('fleetWorstCells').innerHTML = cells.map(cell => '<button type="button" class="fleet-cell-button' + (cell.id === state.selectedCellId ? ' selected' : '') + '" data-fleet-cell="' + esc(cell.id) + '"><span class="fleet-cell-name">' + esc(cellName(cell)) + '<small>' + (cell.neverObserved ? 'Never observed' : 'Position in km') + '</small></span><span class="fleet-cell-bar"><i style="width:' + (clamp(finite(cell.coveredFraction),0,1) * 100) + '%"></i></span><span class="fleet-cell-value">' + pct(cell.coveredFraction,0) + '</span><span class="fleet-cell-gap">' + esc(formatDuration(cell.longestGapS)) + '</span></button>').join('');
  }
  function renderTime() {
    if (!state.plan || !state.snapshot) return;
    const s = state.snapshot, before = state.timeS < 0, after = state.timeS >= state.plan.durationS;
    $('fleetClock').textContent = formatClock(state.timeS);
    const status = $('fleetTaskState');
    status.textContent = before ? 'Before task start' : after ? 'Recovery / turnaround' : s.met ? 'Task requirement met' : 'Task coverage gap';
    status.classList.toggle('fleet-met',!before && !after && s.met);
    status.classList.toggle('fleet-unmet',!before && !after && !s.met);
    $('fleetScrub').value = state.timeS;
    const onStation = s.assets.filter(asset => asset.state === 'ON_STATION').length;
    $('fleetMapCoverage').textContent = state.cumulative ? 'Cumulative coverage over the task' : pct(s.coveredFraction,0) + (state.plan.config.mode === 'area' ? ' of cells meet the requirement' : ' point coverage');
    $('fleetMapCount').textContent = onStation + ' on station · base ' + distance(state.plan.config.baseDistanceKm * 1000) + ' west';
    const cell = state.plan.cells.find(item => item.id === state.selectedCellId);
    $('fleetMapSelection').textContent = cell ? cellName(cell) + ' · requirement met ' + pct(cell.coveredFraction) + ' of sampled time · longest gap ' + formatDuration(cell.longestGapS) : (state.plan.config.mode === 'area' ? 'Click a cell to inspect its sampled coverage. Footprints use one pointing direction per sensor.' : 'Reference point at the origin. Aircraft on station may still have a sensor-access gap.');
    if (state.page === 'schedule' && !$('schedulePage').hidden) {
      drawTimeline();
      drawMap();
    }
  }
  function resizeCanvases() {
    if (!state.plan || !mapCtx || !timeCtx) return;
    const rect = $('fleetMapStage').getBoundingClientRect();
    state.mapWidth = Math.max(240,rect.width || state.mapWidth || 500);
    state.mapHeight = Math.max(260,rect.height || state.mapHeight || 330);
    state.timelineWidth = Math.max(760,timeline.parentElement.clientWidth || state.timelineWidth || 850);
    state.timelineHeight = 85 + Math.max(state.plan.assets.length,1) * 39;
    timeline.style.height = state.timelineHeight + 'px';
    [[map,state.mapWidth,state.mapHeight],[timeline,state.timelineWidth,state.timelineHeight]].forEach(([canvas,width,height]) => {
      const w = Math.round(width * state.dpr), h = Math.round(height * state.dpr);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    });
    state.mapProjection = null;
    renderTime();
  }
  function drawTimeline() {
    const p = state.plan, ctx = timeCtx;
    if (!p || !ctx) return;
    const w = state.timelineWidth, h = state.timelineHeight, labelW = 127, right = w - 18;
    const start = finite(p.timelineStartS), end = Math.max(start + 1,finite(p.timelineEndS,p.durationS));
    const x = time => labelW + (time - start) / (end - start) * (right - labelW);
    state.timelineGeometry = {start,end,labelW,right,width:w};
    ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = '#eef7f3'; ctx.fillRect(x(0),26,x(p.durationS)-x(0),h-26);
    const tickCount = Math.max(5,Math.min(9,Math.round((w-labelW)/110)));
    ctx.font = '9px system-ui'; ctx.fillStyle = '#8b9da7'; ctx.textAlign = 'center';
    for(let i=0;i<=tickCount;i++){
      const t = start + (end-start)*i/tickCount, xx=x(t);
      ctx.strokeStyle='#e7edef';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(xx,25);ctx.lineTo(xx,h);ctx.stroke();
      ctx.fillText(formatClock(t,false),xx,16);
    }
    ctx.textAlign='left';ctx.fillStyle='#536f7e';ctx.font='600 10px system-ui';ctx.fillText('Task coverage',14,47);
    for(const sample of p.samples){ctx.fillStyle=sample.met?'#37a78d':'#e0ad6f';const a=x(sample.startS),b=x(sample.endS);ctx.fillRect(a,33,Math.max(.8,b-a+.15),20);}
    ctx.strokeStyle='#d9e5e8';ctx.beginPath();ctx.moveTo(0,64);ctx.lineTo(w,64);ctx.stroke();
    const phaseColors={outbound:'#81a8c7',setup:'#b7aaca',return:'#d8aa6a',turnaround:'#bdc8d0'};
    p.assets.forEach((asset,index)=>{
      const y=72+index*39;
      if(index%2===0){ctx.fillStyle='#f7fafb';ctx.fillRect(0,y-4,w,39);}
      ctx.fillStyle=asset.color||palette[asset.profileId]||'#208b8a';ctx.fillRect(13,y+3,4,21);
      ctx.fillStyle='#385566';ctx.font='600 10px system-ui';ctx.fillText(String(asset.label).slice(0,19),24,y+11);
      ctx.fillStyle='#93a3ac';ctx.font='8px system-ui';ctx.fillText((patternBy(asset.pattern)||{}).name||asset.pattern,24,y+24);
      const sorties=p.sorties.filter(sortie=>sortie.assetId===asset.id);
      if(!sorties.length){ctx.fillStyle='#96a5ae';ctx.font='9px system-ui';ctx.fillText(asset.issues&&asset.issues.length?'Unavailable for dispatch':'No assigned sortie',labelW+8,y+16);}
      for(const sortie of sorties){
        const segments=[[sortie.launchS,sortie.arrivalS,phaseColors.outbound],[sortie.arrivalS,sortie.stationStartS,phaseColors.setup],[sortie.stationStartS,sortie.departS,asset.color||palette[asset.profileId]||'#14998a'],[sortie.departS,sortie.landS,phaseColors.return],[sortie.landS,sortie.readyS,phaseColors.turnaround]];
        for(const [a,b,color] of segments){if(b<=a)continue;ctx.fillStyle=color;ctx.fillRect(x(a),y+2,Math.max(.8,x(b)-x(a)),23);}
        ctx.strokeStyle='#ffffffb5';ctx.lineWidth=1;ctx.strokeRect(x(sortie.stationStartS),y+2,Math.max(.7,x(sortie.departS)-x(sortie.stationStartS)),23);
      }
    });
    if(!p.assets.length){ctx.fillStyle='#8196a2';ctx.font='10px system-ui';ctx.fillText('No aircraft in the applied fleet.',labelW+9,93);}
    ctx.save();ctx.setLineDash([3,3]);ctx.strokeStyle='#7aa99a';ctx.lineWidth=1;
    for(const t of [0,p.durationS]){ctx.beginPath();ctx.moveTo(x(t),25);ctx.lineTo(x(t),h);ctx.stroke();}ctx.restore();
    const cursor=x(state.timeS);ctx.strokeStyle='#d4654f';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(cursor,27);ctx.lineTo(cursor,h);ctx.stroke();ctx.fillStyle='#d4654f';ctx.beginPath();ctx.moveTo(cursor-4,25);ctx.lineTo(cursor+4,25);ctx.lineTo(cursor,31);ctx.fill();
  }
  function niceStep(value){const power=Math.pow(10,Math.floor(Math.log10(Math.max(value,1))));const unit=value/power;return (unit<2?1:unit<5?2:unit<10?5:10)*power;}
  function createMapProjection(){
    const p=state.plan,c=p.config,points=[{x:0,y:0}],unique=new Set();
    if(c.mode==='area'){points.push({x:-c.areaWidthKm*500,y:-c.areaHeightKm*500},{x:c.areaWidthKm*500,y:c.areaHeightKm*500});}
    for(const asset of p.assets){const key=asset.profileId+'-'+asset.pattern;if(unique.has(key))continue;unique.add(key);const route=asset.scenario&&asset.scenario.route&&asset.scenario.route.points||[];const stride=Math.max(1,Math.ceil(route.length/160));for(let i=0;i<route.length;i+=stride)points.push(route[i]);}
    if(state.mapView==='full')points.push(p.base);
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const point of points){minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);}
    const spanX=Math.max(500,maxX-minX),spanY=Math.max(500,maxY-minY),scale=Math.min((state.mapWidth-75)/spanX,(state.mapHeight-90)/spanY);
    state.mapProjection={centerX:(minX+maxX)/2,centerY:(minY+maxY)/2,scale};
  }
  function project(point){const p=state.mapProjection;return{x:state.mapWidth/2+(point.x-p.centerX)*p.scale,y:state.mapHeight/2-(point.y-p.centerY)*p.scale};}
  function path(points,color,width=1,fill=null,dash=[]){
    if(!points||!points.length)return;const ctx=mapCtx;ctx.beginPath();points.forEach((point,i)=>{const q=project(point);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});if(fill){ctx.closePath();ctx.fillStyle=fill;ctx.fill();}if(color){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}
  }
  function drawMap(){
    const p=state.plan,s=state.snapshot,ctx=mapCtx;
    if(!p||!s||!ctx)return;
    if(!state.mapProjection)createMapProjection();
    const w=state.mapWidth,h=state.mapHeight,pr=state.mapProjection;
    ctx.setTransform(state.dpr,0,0,state.dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#102b3b';ctx.fillRect(0,0,w,h);
    const step=niceStep(Math.max(w,h)/pr.scale/9),minX=pr.centerX-w/pr.scale/2,maxX=pr.centerX+w/pr.scale/2,minY=pr.centerY-h/pr.scale/2,maxY=pr.centerY+h/pr.scale/2;
    for(let x=Math.floor(minX/step)*step;x<=maxX;x+=step)path([{x,y:minY},{x,y:maxY}],Math.abs(x)<1?'#355365':'#1a394a',1);
    for(let y=Math.floor(minY/step)*step;y<=maxY;y+=step)path([{x:minX,y},{x:maxX,y}],Math.abs(y)<1?'#355365':'#1a394a',1);
    if(p.config.mode==='area'){
      const cellWidth=p.config.areaWidthKm*1000/p.resolution.gridSize,cellHeight=p.config.areaHeightKm*1000/p.resolution.gridSize;
      p.cells.forEach((cell,index)=>{
        const q=project({x:cell.x-cellWidth/2,y:cell.y+cellHeight/2}),count=(s.counts&&s.counts[index])||0,met=count>=p.config.requiredObservers;
        if(state.cumulative){const amount=clamp(finite(cell.coveredFraction),0,1);ctx.fillStyle=amount===0?'rgba(174,119,55,.28)':'rgba(44,173,142,'+(.08+.5*amount)+')';}
        else ctx.fillStyle=met?'rgba(52,177,144,.38)':'rgba(177,124,63,.15)';
        ctx.fillRect(q.x,q.y,cellWidth*pr.scale,cellHeight*pr.scale);ctx.strokeStyle=cell.id===state.selectedCellId?'#f4dc99':'#769aab34';ctx.lineWidth=cell.id===state.selectedCellId?2:0.7;ctx.strokeRect(q.x,q.y,cellWidth*pr.scale,cellHeight*pr.scale);
      });
    }
    const unique=new Set();for(const asset of p.assets){const key=asset.profileId+'-'+asset.pattern;if(unique.has(key))continue;unique.add(key);const points=asset.scenario&&asset.scenario.route&&asset.scenario.route.points||[];path(points,'#87aabd65',1.1);}
    if(state.mapView==='full'){
      for(const sortie of p.sorties){if(sortie.launchS<=state.timeS&&sortie.landS>=state.timeS){path([p.base,sortie.entryPosition],'#7b9eb94a',1,null,[4,4]);path([sortie.exitPosition,p.base],'#bd9a6945',1,null,[4,4]);}}
    }
    for(const asset of s.assets){if(asset.state==='ON_STATION'&&asset.sensor&&asset.sensor.footprint&&asset.sensor.footprint.length>2)path(asset.sensor.footprint,asset.observingReference?'#77d3b69a':'#d0b07578',1,asset.observingReference?'#57ba9220':'#c09b5c14');}
    const origin=project({x:0,y:0});ctx.fillStyle=p.config.mode==='point'?(s.met?'#73d6b5':'#edbd76'):'#edbd76';ctx.beginPath();ctx.moveTo(origin.x,origin.y-5);ctx.lineTo(origin.x+5,origin.y);ctx.lineTo(origin.x,origin.y+5);ctx.lineTo(origin.x-5,origin.y);ctx.closePath();ctx.fill();ctx.strokeStyle='#e6bd6a50';ctx.beginPath();ctx.arc(origin.x,origin.y,11,0,Math.PI*2);ctx.stroke();
    const base=project(p.base);if(base.x>=0&&base.x<=w&&base.y>=0&&base.y<=h){ctx.fillStyle='#a7bac5';ctx.fillRect(base.x-5,base.y-2,10,8);ctx.beginPath();ctx.moveTo(base.x-7,base.y-2);ctx.lineTo(base.x,base.y-9);ctx.lineTo(base.x+7,base.y-2);ctx.closePath();ctx.fill();ctx.font='9px system-ui';ctx.fillStyle='#9bb5c3';ctx.textAlign='center';ctx.fillText('Base',base.x,base.y+20);}
    for(const asset of s.assets){
      if(['READY','QUEUED','TURNAROUND','UNAVAILABLE'].includes(asset.state))continue;
      const q=project(asset.position);if(q.x<-20||q.x>w+20||q.y<-20||q.y>h+20)continue;
      ctx.save();ctx.translate(q.x,q.y);ctx.rotate(finite(asset.headingDeg)*Math.PI/180);ctx.fillStyle=asset.color||palette[asset.profileId]||'#bcd4df';ctx.strokeStyle='#e6f4f7';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(3,-1);ctx.lineTo(8,4);ctx.lineTo(2,3);ctx.lineTo(0,7);ctx.lineTo(-2,3);ctx.lineTo(-8,4);ctx.lineTo(-3,-1);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();ctx.font='600 8px system-ui';ctx.textAlign='left';ctx.fillStyle='#c7dce5';ctx.fillText(String(asset.label),q.x+10,q.y-7);
    }
    $('fleetMapScale').textContent=distance(45/pr.scale);
  }
  function activate(){
    if(!state.plan)rebuild();
    if(state.plan){state.snapshot=F.snapshot(state.plan,state.timeS,{footprints:state.page==='schedule'});resizeCanvases();renderTime();emitTime();}
  }
  function selectCell(id){state.selectedCellId=id;renderWorstCells();renderTime();}
  function applyPreset(kind){
    if(state.busy)return;
    const config=F.defaults();
    if(kind==='distance')config.baseDistanceKm=500;
    if(kind==='area'){
      config.mode='area';config.areaWidthKm=6;config.areaHeightKm=4;config.coverageThresholdPct=90;config.slots=2;
      const scout=config.profiles.find(p=>p.profileId==='scout'),endurance=config.profiles.find(p=>p.profileId==='endurance');
      scout.count=2;scout.pattern='parallel';scout.routeOverrides={sensorMode:'nadir'};endurance.count=1;
    }
    state.draft=config;state.phaseOffset=0;syncControls();markDirty();
    rebuild();
    $('fleetCopyStatus').textContent='Example scenario loaded and applied. Adjust the settings to explore another case.';
  }
  function copyExplorer(){
    if(state.busy)return;
    const source=window.ISRApp&&window.ISRApp.config;
    if(!source){$('fleetCopyStatus').textContent='Open Pattern Explorer and choose a setup first.';return;}
    const current=collectConfig(true);if(!current.valid){$('fleetCopyStatus').textContent='Correct the highlighted fleet settings before copying a route.';return;}
    state.draft=current.config;
    const entry=state.draft.profiles.find(p=>p.profileId===source.profileId);
    if(!entry){$('fleetCopyStatus').textContent='That profile is not available in this fleet.';return;}
    entry.pattern=source.pattern;entry.routeOverrides={};
    for(const key of ['altitudeM','speedMps','scaleM','aspect','headingDeg','fovDeg','maxRangeM','sensorMode','clockwise'])if(source[key]!==undefined)entry.routeOverrides[key]=source[key];
    $('fleetProfile-'+entry.profileId+'-pattern').value=entry.pattern;
    $('fleetProfile-'+entry.profileId+'-details').open=true;
    markDirty();
    $('fleetCopyStatus').textContent='Copied '+profileBy(entry.profileId).name+' / '+patternBy(entry.pattern).name+'. Aircraft count remains '+entry.count+'. Build to apply; the fleet reference is fixed at the origin.';
  }
  function exportPlan(){
    if(!state.plan||state.dirty||state.busy)return;
    try{
      const text=F.exportJSON(state.plan),name='isr_fleet_schedule.json';
      if(window.ISRExport)window.ISRExport.download(name,text,'application/json');
      else{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
      $('fleetExportStatus').textContent='Downloaded the applied schedule, aircraft and sorties, sampled coverage, gaps, settings and assumptions.';
    }catch(error){$('fleetExportStatus').textContent='Export failed: '+error.message;}
  }

  buildProfileCards();
  syncControls();
  $('fleetForm').addEventListener('submit',event=>event.preventDefault());
  $('fleetForm').addEventListener('input',event=>{if(event.target.matches('input'))markDirty();});
  $('fleetForm').addEventListener('change',event=>{
    if(event.target.dataset.fleetField==='pattern'){
      const entry=state.draft.profiles.find(p=>p.profileId===event.target.dataset.fleetProfile);if(entry)entry.routeOverrides={};
    }
    if(event.target.id==='fleetSlots'||event.target.id==='fleetPhase')state.phaseOffset=0;
    markDirty();
  });
  $('fleetProfileCards').addEventListener('click',event=>{
    const button=event.target.closest('[data-clear-profile]');if(!button)return;
    const entry=state.draft.profiles.find(p=>p.profileId===button.dataset.clearProfile);if(entry){entry.routeOverrides={};markDirty();}
  });
  document.querySelectorAll('[data-fleet-preset]').forEach(button=>button.addEventListener('click',()=>applyPreset(button.dataset.fleetPreset)));
  $('fleetBuild').addEventListener('click',rebuild);
  $('fleetOptimize').addEventListener('click',optimize);
  $('fleetCancel').addEventListener('click',()=>{state.cancelRequested=true;$('fleetCancel').disabled=true;$('fleetCancel').textContent='Stopping…';});
  $('fleetCopyExplorer').addEventListener('click',copyExplorer);
  $('fleetExport').addEventListener('click',exportPlan);
  $('fleetPlay').addEventListener('click',()=>setPlaying(!state.playing));
  $('fleetRestart').addEventListener('click',()=>{setPlaying(false);setTime(0);});
  $('fleetRate').addEventListener('change',event=>{state.rate=Number(event.target.value);});
  $('fleetScrub').addEventListener('input',event=>{setPlaying(false);setTime(Number(event.target.value));});
  $('fleetMoreGaps').addEventListener('click',()=>{state.showAllGaps=!state.showAllGaps;renderGaps();});
  $('fleetGapList').addEventListener('click',event=>{const button=event.target.closest('[data-fleet-gap]');if(!button||!state.plan)return;const gap=state.plan.gaps[Number(button.dataset.fleetGap)];if(gap){setPlaying(false);setTime((gap.startS+gap.endS)/2);}});
  $('fleetWorstCells').addEventListener('click',event=>{const button=event.target.closest('[data-fleet-cell]');if(button)selectCell(button.dataset.fleetCell);});
  $('fleetTaskView').addEventListener('click',()=>{state.mapView='task';state.mapProjection=null;$('fleetTaskView').classList.add('selected');$('fleetFullView').classList.remove('selected');$('fleetTaskView').setAttribute('aria-pressed','true');$('fleetFullView').setAttribute('aria-pressed','false');drawMap();});
  $('fleetFullView').addEventListener('click',()=>{state.mapView='full';state.mapProjection=null;$('fleetFullView').classList.add('selected');$('fleetTaskView').classList.remove('selected');$('fleetTaskView').setAttribute('aria-pressed','false');$('fleetFullView').setAttribute('aria-pressed','true');drawMap();});
  $('fleetCumulative').addEventListener('change',event=>{state.cumulative=event.target.checked;renderTime();});
  timeline.addEventListener('click',event=>{const g=state.timelineGeometry;if(!g)return;const rect=timeline.getBoundingClientRect(),xx=(event.clientX-rect.left)*g.width/rect.width;if(xx<g.labelW)return;setPlaying(false);setTime(g.start+(xx-g.labelW)/(g.right-g.labelW)*(g.end-g.start));});
  map.addEventListener('click',event=>{
    if(!state.plan||!state.mapProjection)return;const rect=map.getBoundingClientRect(),xx=event.clientX-rect.left,yy=event.clientY-rect.top,p=state.mapProjection;
    const x=(xx-state.mapWidth/2)/p.scale+p.centerX,y=(state.mapHeight/2-yy)/p.scale+p.centerY;
    const cells=state.plan.cells;let nearest=null,best=Infinity;for(const cell of cells){const d=(cell.x-x)**2+(cell.y-y)**2;if(d<best){best=d;nearest=cell;}}
    if(nearest)selectCell(nearest.id);
  });
  document.addEventListener('isr:page',event=>{
    state.page=event.detail&&event.detail.page||'patterns';
    if(state.page==='patterns'||state.page==='mission')setPlaying(false);
    else if(state.page==='schedule')activate();
    else{if(state.plan)state.snapshot=F.snapshot(state.plan,state.timeS,{footprints:false});emitTime();}
  });
  window.ISRFleetUI={
    get config(){return state.plan?state.plan.config:state.draft;},get plan(){return state.plan;},
    get timeS(){return state.timeS;},get snapshot(){return state.snapshot;},
    get playing(){return state.playing;},get dirty(){return state.dirty;},get busy(){return state.busy;},
    setTime,setPlaying,rebuild,activate,formatClock,formatDuration
  };
  if(window.innerWidth<=800){$('fleetTaskDetails').open=false;$('fleetAssetsDetails').open=false;}
  if(typeof ResizeObserver!=='undefined'){
    const observer=new ResizeObserver(()=>{if(state.page==='schedule'&&!$('schedulePage').hidden)resizeCanvases();});
    observer.observe($('fleetMapStage'));observer.observe(timeline.parentElement);
  }
  window.addEventListener('resize',()=>{if(state.page==='schedule')resizeCanvases();});
  rebuild();
  function frame(now){
    const dt=state.lastFrame?Math.min((now-state.lastFrame)/1000,.25):0;state.lastFrame=now;
    if(state.playing&&state.plan&&(state.page==='schedule'||state.page==='tracker')){
      state.drawElapsed+=dt;
      if(state.drawElapsed>=.1){const next=state.timeS+state.drawElapsed*state.rate;state.drawElapsed=0;setTime(next);if(next>=state.plan.timelineEndS)setPlaying(false);}
    }else state.drawElapsed=0;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}());
