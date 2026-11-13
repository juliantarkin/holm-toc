# ISR explorer and mission demonstrator

An offline HTML application with four views: Pattern Explorer, Fleet & Schedule, Asset Tracker, and Mission. All vehicle, sensor and resource values are illustrative.

## Mission foundation 0.1

This increment adds a deterministic lifecycle exercise for two fictional aircraft, an actual-event journal, fixed payload/communications catalogue metadata, and an isolated Mission clock. It implements the foundations in development increments 0–1.

Open `../isr_pattern_explorer.html#mission`, select **Start**, and use the playback controls or a one-second step. The planned timeline and the actual journal are separate. Inspect journal entries for their cause, asset, event time and event ID. Export the run as JSON to preserve the observed sequence.

Only Scout and Observer participate in this fixed exercise. The remaining stock profiles, including Beacon, are explicitly marked Planned. Scheduled collection changes payload status but generates no target observations. Communications are an explicit ideal-link assumption. Changing the seed identifies another reproducible run; this initial fixture has no random outcomes. Later increments add scenario editing, waypointed transit and actual sensing behavior.

The three existing laboratory views retain their independent applied plans. Navigating into Mission pauses laboratory playback. Leaving Mission pauses its clock, and returning preserves its state. Switching between Mission's own views does not create a second clock.

## Source and build

`src/` contains the separate source modules. The root HTML is a bundled release, not the only editable source. Python 3 builds it without third-party packages:

```sh
python3 isr/build.py --out isr_pattern_explorer_mission_v01.html
```

The builder accepts `--source` and `--out` for alternate directories. It rejects missing or duplicate template tokens and embedded closing-script sequences. The output needs no server, fonts, external scripts or network calls.

## Validation

The kernel and fleet engine checks use Node built-ins. DOM integration checks additionally use `@napi-rs/canvas` for the existing laboratory canvases. They verify authored module integration and explicitly do not claim browser layout, focus or touch validation.

```sh
node isr/tests/isr_mission_engine_qa.cjs isr/src/mission-engine.js
node isr/tests/isr_fleet_engine_qa.cjs isr/src
node isr/tests/isr_explorer_dom_qa.cjs isr_pattern_explorer_mission_v01.html
node isr/tests/isr_fleet_dom_qa.cjs isr_pattern_explorer_mission_v01.html
node isr/tests/isr_mission_dom_qa.cjs isr_pattern_explorer_mission_v01.html
```

Check the hosted build in a real browser before promotion: start/pause/step, Activity filtering and event inspection, navigation across all four pages, and state persistence. Keep generated test reports and screenshots outside the source directory.

## Release and rollback

Build and validate a versioned draft first. After verification, preserve the previous canonical HTML as `isr_pattern_explorer_backup.html`, then promote the tested bytes to `isr_pattern_explorer.html`. Keep the older v2 release and Git history. Publish unrelated repository files unchanged.

`src/mission-contract.md` documents the current subsystem boundary. The fixed exercise is not a simulation of actual platform performance, target detection or operational radio propagation.
