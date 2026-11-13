/* Offline, dependency-free exports for the illustrative ISR pattern explorer. */
(function (global) {
  'use strict';

  const VERSION = '1.0';
  const DEFAULT_START = '2026-01-01T00:00:00.000Z';
  const MAX_EXTENT_M = 100000;
  const DEG = Math.PI / 180;
  const WGS84_A = 6378137;
  const WGS84_E2 = 6.6943799901413165e-3;
  const encoder = new TextEncoder();

  const REFERENCES = [
    { title: 'CNATRA P-882, Core Fleet Operations (2018), chapter 8',
      url: 'https://studylib.net/doc/26943100/fleet-ops-fti',
      note: 'Reproduced public-release training manual. Pattern names only; explorer dimensions and performance are illustrative.' },
    { title: 'JP 3-09.3, Close Air Support (25 November 2014), pp. III-85–86 and III-102–104',
      url: 'https://server.3rd-wing.net/public/Bureau_4thMEG/Procedures_communes/jp3_09_3.pdf',
      note: 'Historical archived edition; not a claim about current doctrine or platform performance.' },
    { title: 'Google KML reference', url: 'https://developers.google.com/kml/documentation/kmlreference' },
    { title: 'Google KMZ file documentation', url: 'https://developers.google.com/kml/documentation/kmzarchives' }
  ];

  const ASSUMPTIONS = [
    'Illustrative geometry and sensor presets; no validated aircraft or sensor performance.',
    'Local coordinates are meters: x east, y north, z up. Flat ground is z = 0.',
    'Observability is the model result, not a probability of detection, identification, or survival.',
    'No terrain, buildings, Earth-curvature masking, weather, wind, atmospheric attenuation, or actual threat data.',
    'KML uses a first-order local projection with WGS84 meridional and prime-vertical radii at the anchor latitude. It is not a geodesic route or an ECEF/ENU transformation.',
    'KML altitude is absolute, in meters above mean sea level: supplied anchor ground elevation plus local z. No geoid conversion or terrain lookup is performed.',
    'KML clock timestamps use a synthetic fixed start date unless the caller supplies startTime.',
    'Non-finite numeric values serialize to null in JSON and to blank values in KML sample arrays.'
  ];

  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function numeric(value) {
    if (value === '' || value === null || value === undefined || typeof value === 'boolean') return NaN;
    if (typeof value === 'string' && !value.trim()) return NaN;
    return Number(value);
  }
  function escapeXml(value) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function json(value, indent) {
    return JSON.stringify(value, function (_key, item) {
      if (typeof item === 'function') return undefined;
      if (typeof item === 'number' && !Number.isFinite(item)) return null;
      return item;
    }, indent);
  }
  function position(point) {
    const p = point && (point.position || point);
    if (!p || !finite(p.x) || !finite(p.y) || !finite(p.z)) {
      throw new Error('The route contains an invalid local coordinate. Rebuild the scenario before exporting.');
    }
    return { x: p.x, y: p.y, z: p.z };
  }
  function checkScenario(scenario) {
    if (!scenario || !Array.isArray(scenario.samples) || scenario.samples.length < 2) {
      throw new Error('Build a scenario with at least two timed samples before exporting.');
    }
    let lastTime = -Infinity;
    scenario.samples.forEach(function (s) {
      position(s);
      if (!finite(s.timeS) || s.timeS < 0 || s.timeS < lastTime) {
        throw new Error('Sample times must be finite, nonnegative, and in chronological order.');
      }
      lastTime = s.timeS;
    });
    return scenario;
  }

  function normalizeAnchor(anchor) {
    if (!anchor) throw new Error('Enter an anchor latitude, longitude, and ground elevation to export KML or KMZ. JSON can be exported without a location.');
    const latitude = numeric(anchor.latitude !== undefined ? anchor.latitude : anchor.lat);
    const longitude = numeric(anchor.longitude !== undefined ? anchor.longitude : anchor.lon);
    const elevationM = numeric(anchor.elevationM !== undefined ? anchor.elevationM :
      (anchor.groundElevationM !== undefined ? anchor.groundElevationM : anchor.elevation_m));
    if (!finite(latitude) || !finite(longitude) || !finite(elevationM)) {
      throw new Error('Enter numeric latitude, longitude, and ground elevation in meters above mean sea level.');
    }
    if (Math.abs(latitude) > 80) throw new Error('This local map projection supports anchor latitudes between 80° S and 80° N.');
    if (longitude < -180 || longitude > 180) throw new Error('Longitude must be between −180° and 180°.');
    return { latitude: latitude, longitude: longitude, elevationM: elevationM };
  }

  function projectionFor(anchor) {
    const phi = anchor.latitude * DEG;
    const denominator = 1 - WGS84_E2 * Math.sin(phi) * Math.sin(phi);
    const northRadius = WGS84_A * (1 - WGS84_E2) / Math.pow(denominator, 1.5);
    const eastRadius = WGS84_A * Math.cos(phi) / Math.sqrt(denominator);
    return function (point) {
      const p = position(point);
      const latitude = anchor.latitude + p.y / northRadius / DEG;
      const longitude = anchor.longitude + p.x / eastRadius / DEG;
      if (Math.abs(latitude) > 80 || longitude < -180 || longitude > 180) {
        throw new Error('The anchored route crosses the supported latitude or longitude limits. Move the anchor away from the pole or antimeridian.');
      }
      return { longitude: longitude, latitude: latitude, altitudeM: anchor.elevationM + p.z };
    };
  }

  function validateAnchor(scenario, anchor) {
    checkScenario(scenario);
    const a = normalizeAnchor(anchor);
    const points = scenario.samples.map(position);
    if (scenario.route && Array.isArray(scenario.route.points)) points.push.apply(points, scenario.route.points.map(position));
    const target = scenario.config && scenario.config.target ? position(scenario.config.target) : { x: 0, y: 0, z: 0 };
    points.push(target);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxOffsetM = 0;
    const project = projectionFor(a);
    points.forEach(function (p) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      maxOffsetM = Math.max(maxOffsetM, Math.hypot(p.x, p.y));
      project(p);
    });
    const spanM = Math.hypot(maxX - minX, maxY - minY);
    if (maxOffsetM > MAX_EXTENT_M || spanM > MAX_EXTENT_M) {
      throw new Error('The route is too large for this local projection: keep its bounding diagonal and distance from the anchor below 100 km.');
    }
    return {
      anchor: a,
      projection: 'First-order local WGS84 radii; x east / y north; absolute MSL altitude',
      maxOffsetM: maxOffsetM,
      spanM: spanM,
      warnings: Math.max(maxOffsetM, spanM) > 25000 ?
        ['This route extends beyond 25 km. Local projection distortion grows with distance; use a geodesic conversion for precise geographic work.'] : []
    };
  }

  function startDate(options) {
    const value = options && options.startTime ? options.startTime : DEFAULT_START;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error('The export start time is not a valid date.');
    return date;
  }
  function titleFor(scenario) {
    const profile = scenario.profile && (scenario.profile.name || scenario.profile.label || scenario.profile.id);
    const pattern = (scenario.pattern && (scenario.pattern.name || scenario.pattern.label || scenario.pattern.id)) ||
      (scenario.config && scenario.config.pattern) || 'Pattern';
    return 'Illustrative ISR — ' + pattern + (profile ? ' — ' + profile : '');
  }

  function buildJSON(scenario, options) {
    checkScenario(scenario);
    options = options || {};
    const geographic = options.anchor ? validateAnchor(scenario, options.anchor) : null;
    const project = geographic ? projectionFor(geographic.anchor) : null;
    const date = startDate(options);
    const result = {
      schema: 'illustrative-isr-scenario',
      schemaVersion: VERSION,
      title: titleFor(scenario),
      units: { distance: 'meters', time: 'seconds', angle: 'degrees', speed: 'meters_per_second' },
      localFrame: { x: 'east', y: 'north', z: 'up', groundZ: 0 },
      clock: { startTime: date.toISOString(), syntheticStartTime: !options.startTime },
      geographic: geographic,
      config: scenario.config,
      profile: scenario.profile,
      pattern: scenario.pattern,
      route: scenario.route,
      durationS: scenario.durationS,
      bounds: scenario.bounds,
      metrics: scenario.metrics,
      warnings: (scenario.warnings || []).concat(geographic ? geographic.warnings : []),
      samples: scenario.samples,
      geographicTrack: project ? scenario.samples.map(function (sample) {
        const p = project(sample);
        return { timeS: sample.timeS, longitude: p.longitude, latitude: p.latitude, altitudeM: p.altitudeM };
      }) : null,
      assumptions: ASSUMPTIONS.concat(options.assumptions || []),
      references: REFERENCES.concat(options.references || [])
    };
    return json(result, 2);
  }

  function data(name, value) {
    return '<Data name="' + escapeXml(name) + '"><value>' + escapeXml(typeof value === 'object' ? json(value) : value) + '</value></Data>';
  }
  function coord(p) { return p.longitude.toFixed(8) + ',' + p.latitude.toFixed(8) + ',' + p.altitudeM.toFixed(3); }
  function trackCoord(p) { return p.longitude.toFixed(8) + ' ' + p.latitude.toFixed(8) + ' ' + p.altitudeM.toFixed(3); }
  function numberValue(value) { return finite(value) ? String(value) : ''; }
  function arrayData(name, values) {
    return '<gx:SimpleArrayData name="' + name + '">' + values.map(function (v) { return '<gx:value>' + escapeXml(v) + '</gx:value>'; }).join('') + '</gx:SimpleArrayData>';
  }

  function makeKML(scenario, options) {
    checkScenario(scenario);
    options = options || {};
    const geographic = validateAnchor(scenario, options.anchor);
    const project = projectionFor(geographic.anchor);
    const samples = scenario.samples;
    const projected = samples.map(project);
    const start = startDate(options);
    const when = function (t) { return new Date(start.getTime() + t * 1000).toISOString(); };
    const target = scenario.config && scenario.config.target ? position(scenario.config.target) : { x: 0, y: 0, z: 0 };
    const rawRoute = scenario.route && Array.isArray(scenario.route.points) && scenario.route.points.length > 1 ?
      scenario.route.points.map(position) : samples.map(position);
    if (scenario.route && scenario.route.periodic) {
      const first = rawRoute[0], last = rawRoute[rawRoute.length - 1];
      if (first.x !== last.x || first.y !== last.y || first.z !== last.z) rawRoute.push(first);
    }
    const routeCoords = rawRoute.map(project).map(coord).join(' ');
    const intervals = scenario.metrics && scenario.metrics.observationIntervals || [];
    const fields = [
      ['time_s', 'double'], ['observable', 'bool'], ['range_m', 'double'],
      ['heading_deg', 'double'], ['bank_deg', 'double'], ['sensor_azimuth_deg', 'double'],
      ['sensor_depression_deg', 'double'], ['reasons', 'string']
    ];
    const arrays = [
      arrayData('time_s', samples.map(function (s) { return numberValue(s.timeS); })),
      arrayData('observable', samples.map(function (s) { return s.observable ? '1' : '0'; })),
      arrayData('range_m', samples.map(function (s) { return numberValue(s.rangeM); })),
      arrayData('heading_deg', samples.map(function (s) { return numberValue(s.headingDeg); })),
      arrayData('bank_deg', samples.map(function (s) { return numberValue(s.bankDeg); })),
      arrayData('sensor_azimuth_deg', samples.map(function (s) { return numberValue(s.sensor && s.sensor.azimuthDeg); })),
      arrayData('sensor_depression_deg', samples.map(function (s) { return numberValue(s.sensor && s.sensor.depressionDeg); })),
      arrayData('reasons', samples.map(function (s) { return (s.reasons || []).join('; '); }))
    ].join('');

    // Visibility segments are a readable static overlay. Samples at transitions are shared.
    const segments = [];
    let segmentStart = 0;
    for (let i = 1; i < samples.length; i += 1) {
      if (Boolean(samples[i].observable) !== Boolean(samples[i - 1].observable)) {
        if (i > segmentStart) segments.push({ start: segmentStart, end: i, visible: Boolean(samples[i - 1].observable) });
        segmentStart = i;
      }
    }
    if (samples.length - 1 > segmentStart) segments.push({ start: segmentStart, end: samples.length - 1, visible: Boolean(samples[segmentStart].observable) });
    const segmentKml = segments.map(function (segment, index) {
      const a = samples[segment.start].timeS, b = samples[segment.end].timeS;
      return '<Placemark><name>' + (segment.visible ? 'Observable' : 'No usable look') + ' ' + (index + 1) +
        '</name><styleUrl>#' + (segment.visible ? 'look' : 'gap') + '</styleUrl><ExtendedData>' +
        data('start_s', a) + data('end_s', b) + data('sampled_segment', true) +
        '</ExtendedData><LineString><altitudeMode>absolute</altitudeMode><coordinates>' +
        projected.slice(segment.start, segment.end + 1).map(coord).join(' ') + '</coordinates></LineString></Placemark>';
    }).join('');

    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document>' +
      '<name>' + escapeXml(titleFor(scenario)) + '</name>' +
      '<description>' + escapeXml('Illustrative local simulation. Green segments have a usable look under the chosen model; orange segments do not. These colors do not represent threat exposure or survivability. ' + ASSUMPTIONS.join(' ')) + '</description>' +
      '<Style id="route"><LineStyle><color>ffdcad66</color><width>3</width></LineStyle></Style>' +
      '<Style id="look"><LineStyle><color>ff95d36b</color><width>5</width></LineStyle></Style>' +
      '<Style id="gap"><LineStyle><color>ff559ce6</color><width>5</width></LineStyle></Style>' +
      '<Style id="aircraft"><IconStyle><color>ffdcad66</color><scale>1.1</scale></IconStyle><LineStyle><color>ffdcad66</color><width>3</width></LineStyle></Style>' +
      '<Style id="target"><IconStyle><color>ff95d36b</color><scale>1.1</scale></IconStyle></Style>' +
      '<ExtendedData>' + data('schema_version', VERSION) + data('configuration', scenario.config) +
      data('profile', scenario.profile) + data('metrics', scenario.metrics) + data('observation_intervals', intervals) +
      data('geographic_conversion', geographic) + data('synthetic_clock', !options.startTime) +
      data('assumptions', ASSUMPTIONS.concat(options.assumptions || [])) + data('references', REFERENCES.concat(options.references || [])) + '</ExtendedData>' +
      '<Schema id="sensorSamples" name="Sensor samples">' + fields.map(function (f) { return '<gx:SimpleArrayField name="' + f[0] + '" type="' + f[1] + '"/>'; }).join('') + '</Schema>' +
      '<Placemark><name>Observation target</name><styleUrl>#target</styleUrl><Point><altitudeMode>absolute</altitudeMode><coordinates>' +
      coord(project(target)) + '</coordinates></Point></Placemark>' +
      '<Placemark><name>Complete route</name><styleUrl>#route</styleUrl><LineString><altitudeMode>absolute</altitudeMode><coordinates>' + routeCoords + '</coordinates></LineString></Placemark>' +
      '<Folder><name>Modeled observation availability</name>' + segmentKml + '</Folder>' +
      '<Placemark><name>Timed aircraft track</name><styleUrl>#aircraft</styleUrl><gx:Track><altitudeMode>absolute</altitudeMode>' +
      samples.map(function (s) { return '<when>' + when(s.timeS) + '</when>'; }).join('') +
      projected.map(function (p) { return '<gx:coord>' + trackCoord(p) + '</gx:coord>'; }).join('') +
      '<ExtendedData><SchemaData schemaUrl="#sensorSamples">' + arrays + '</SchemaData></ExtendedData></gx:Track></Placemark>' +
      '</Document></kml>\n';
  }

  const CRC_TABLE = (function () {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  }());
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function zipStore(files) {
    const local = [], central = [];
    let offset = 0, centralSize = 0;
    files.forEach(function (file) {
      const name = encoder.encode(file.name), bytes = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
      const crc = crc32(bytes);
      const header = new Uint8Array(30 + name.length), h = new DataView(header.buffer);
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint16(8, 0, true); h.setUint16(10, 0, true); h.setUint16(12, 23585, true);
      h.setUint32(14, crc, true); h.setUint32(18, bytes.length, true); h.setUint32(22, bytes.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true); header.set(name, 30);
      local.push(header, bytes);
      const record = new Uint8Array(46 + name.length), c = new DataView(record.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 23585, true);
      c.setUint32(16, crc, true); c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true); record.set(name, 46);
      central.push(record); centralSize += record.length; offset += header.length + bytes.length;
    });
    const end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
    return new Blob(local.concat(central, [end]), { type: 'application/vnd.google-earth.kmz' });
  }

  function buildKMZ(scenario, options) {
    options = options || {};
    const kml = makeKML(scenario, options);
    const payload = buildJSON(scenario, options);
    const readme = 'Illustrative ISR Pattern Explorer\n\n' +
      'doc.kml: geographic route, sampled observation segments, and timed aircraft track.\n' +
      'scenario.json: complete local route, sensor samples, metrics, settings, and geographic track.\n\n' +
      ASSUMPTIONS.join('\n') + '\n\n' +
      'The KMZ is a standards-compliant ZIP archive using the STORE method (no compression).\n' +
      'Google Earth may render the timed track; other KML readers may show only static geometry.\n';
    return zipStore([{ name: 'doc.kml', data: kml }, { name: 'scenario.json', data: payload }, { name: 'README.txt', data: readme }]);
  }

  function download(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; link.style.display = 'none'; document.body.appendChild(link);
    link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return blob;
  }

  global.ISRExport = Object.freeze({
    version: VERSION,
    defaultStartTime: DEFAULT_START,
    buildJSON: buildJSON,
    makeKML: makeKML,
    buildKMZ: buildKMZ,
    validateAnchor: validateAnchor,
    download: download
  });
}(typeof window !== 'undefined' ? window : globalThis));
