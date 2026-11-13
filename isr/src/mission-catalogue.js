(function (root) {
  'use strict';

  // Fictional fixed-loadout display metadata. Availability describes this
  // release, not a capability claim or authorization to execute a behavior.
  const profiles = [
    {
      id: 'scout',
      name: 'Scout',
      kind: 'Small fixed-wing aircraft',
      motionClass: 'fixed_wing',
      payloads: [
        {
          name: 'Visible/thermal camera (EO/IR gimbal)',
          modes: ['Visible (EO)', 'Thermal IR'],
          products: ['Still image', 'Video (FMV)']
        }
      ],
      communications: { los: true, blos: false, relay: false },
      roles: ['Search', 'Fix / confirm'],
      availability: 'demo',
      note: 'Available in the scripted lifecycle exercise. Collecting denotes a scheduled payload mode; detection and LOS connectivity are not simulated.'
    },
    {
      id: 'observer',
      name: 'Observer',
      kind: 'Endurance fixed-wing aircraft',
      motionClass: 'fixed_wing',
      payloads: [
        {
          name: 'Visible/thermal camera (EO/IR gimbal)',
          modes: ['Visible (EO)', 'Thermal IR'],
          products: ['Still image', 'Video (FMV)']
        }
      ],
      communications: { los: true, blos: true, relay: false },
      roles: ['Fix / confirm', 'Track'],
      availability: 'demo',
      note: 'Available in the scripted lifecycle exercise with an ideal-link assumption. One gimbal has one pointing assignment; BLOS equipment does not provide relay capability. Sensing and links are not simulated.'
    },
    {
      id: 'surveyor',
      name: 'Surveyor',
      kind: 'Radar aircraft',
      motionClass: 'fixed_wing',
      payloads: [
        {
          name: 'Multimode radar',
          modes: ['Synthetic aperture radar (SAR)', 'Ground moving-target indication (GMTI)'],
          products: ['Radar image', 'Movement plot']
        }
      ],
      communications: { los: false, blos: true, relay: false },
      roles: ['Area survey', 'Movement observation'],
      availability: 'planned',
      note: 'Planned only. SAR and GMTI share one radar payload; collection, mode sharing and processing delays are not implemented. A movement plot is not an identity confirmation.'
    },
    {
      id: 'listener',
      name: 'Listener',
      kind: 'Passive RF aircraft',
      motionClass: 'fixed_wing',
      payloads: [
        {
          name: 'Passive RF receiver',
          modes: ['Communications intelligence (COMINT)', 'Electronic intelligence (ELINT)'],
          products: ['Emission report']
        }
      ],
      communications: { los: false, blos: true, relay: false },
      roles: ['Emission observation'],
      availability: 'planned',
      note: 'Planned only. COMINT concerns communications emissions; ELINT concerns noncommunication emissions. Reports require eligible fictional emitters and do not supply camera imagery. Passive sensing does not imply silent communications.'
    },
    {
      id: 'finch',
      name: 'Finch',
      kind: 'Quadcopter',
      motionClass: 'rotary_wing',
      payloads: [
        {
          name: 'Visible/thermal camera (EO/IR gimbal)',
          modes: ['Visible (EO)', 'Thermal IR'],
          products: ['Still image', 'Video (FMV)']
        }
      ],
      communications: { los: true, blos: false, relay: false },
      roles: ['Local inspection', 'Fix / confirm'],
      availability: 'planned',
      note: 'Planned only. Local flight and inspection, including launch from a base or an equipped support vessel, require later motion, sensing and recovery behavior.'
    },
    {
      id: 'relay',
      name: 'Relay',
      kind: 'Communications aircraft',
      motionClass: 'fixed_wing',
      payloads: [
        {
          name: 'Communications equipment',
          modes: ['LOS forwarding', 'BLOS connection'],
          products: ['Status telemetry']
        }
      ],
      communications: { los: true, blos: true, relay: true },
      roles: ['Relay'],
      availability: 'planned',
      note: 'Planned only. Forwarding is explicitly included in this stock definition; it is not simulated. This profile has no imagery payload and would forward existing information rather than create new observations.'
    },
    {
      id: 'beacon',
      name: 'Beacon',
      kind: 'High-altitude balloon',
      motionClass: 'station_keeping',
      payloads: [
        {
          name: 'Stabilized visible/thermal camera (EO/IR)',
          modes: ['Visible (EO)', 'Thermal IR'],
          products: ['Still image', 'Video (FMV)']
        },
        {
          name: 'Communications equipment',
          modes: ['LOS forwarding', 'BLOS connection'],
          products: ['Status telemetry']
        }
      ],
      communications: { los: true, blos: true, relay: true },
      roles: ['Station keeping', 'Observation', 'Relay'],
      availability: 'planned',
      note: 'Planned only. Station keeping, deployment, power and relay behavior are not implemented. One camera pointing assignment and finite power and link capacity remain separate constraints.'
    },
    {
      id: 'lookout',
      name: 'Lookout',
      kind: 'ISR uncrewed surface vessel',
      motionClass: 'surface',
      payloads: [
        {
          name: 'Maritime radar',
          modes: ['Surface search'],
          products: ['Movement plot']
        },
        {
          name: 'Visible/thermal camera (EO/IR)',
          modes: ['Visible (EO)', 'Thermal IR'],
          products: ['Still image', 'Video (FMV)']
        }
      ],
      communications: { los: true, blos: false, relay: false },
      roles: ['Surface observation', 'Fix / confirm'],
      availability: 'planned',
      note: 'Planned only. Maritime plots and camera evidence are different products. Water-route motion, payload collection and surface recovery are not implemented.'
    },
    {
      id: 'haven',
      name: 'Haven',
      kind: 'Support uncrewed surface vessel',
      motionClass: 'surface',
      payloads: [
        {
          name: 'Local camera',
          modes: ['Visible (EO)'],
          products: ['Still image', 'Video (FMV)']
        },
        {
          name: 'Communications equipment',
          modes: ['LOS forwarding', 'BLOS connection'],
          products: ['Status telemetry']
        }
      ],
      communications: { los: true, blos: true, relay: true },
      roles: ['Carrier support', 'Relay', 'Local observation'],
      availability: 'planned',
      note: 'Planned only. The proposed inventory is two Finch aircraft and one recovery/service position. Child inventory, deck reservations, service, moving recovery and relay behavior are not implemented.'
    }
  ];

  function deepFreeze(value) {
    if (value && (typeof value === 'object' || typeof value === 'function') && !Object.isFrozen(value)) {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  }

  deepFreeze(profiles);
  const byId = Object.create(null);
  profiles.forEach(profile => { byId[profile.id] = profile; });
  Object.freeze(byId);

  const catalogue = deepFreeze({
    version: '0.1.0',
    profiles,
    get: id => typeof id === 'string' ? byId[id] : undefined
  });

  root.ISRStockCatalogue = catalogue;
  if (typeof module !== 'undefined' && module.exports) module.exports = catalogue;
}(typeof window !== 'undefined' ? window : globalThis));
