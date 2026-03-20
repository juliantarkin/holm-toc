# Migration Plan

## Goal
Migrate useful behavior from the legacy root prototypes into the new structure without moving, renaming, or deleting current root files.

## Current classification

### Preserved legacy UI prototypes
- `index.html`
- `TOC-v2.html`
- `TOC-v3.html`
- `TOC-tactical-operations-center.html`
- `toc-dashboard.html`
- `small-council.html`
- `broadsheet.html`
- `char-db.html`
- `music-command.html`
- `art-gallery.html`
- `overcast-studios-pm.html`

### Docs and handoff files
- `AGENTS.md`
- `README.md`
- `CLAUDIUS-HANDOFF.md`
- `docs/architecture.md`
- `docs/migration-plan.md`

### Active scaffold
- `schemas/`
- `prompts/`
- `services/`
- empty target folders: `ui/`, `workflows/`, `archive/`

### Likely duplicate experiment family
- `TOC-v2.html`
- `TOC-v3.html`
- `TOC-tactical-operations-center.html`

These should be treated as a concept lineage, not as deletion candidates yet.

## Recommended migration path

### Module 1: Shared data contracts
Define minimal schemas for Task, Run, Project, and Bot first.
This gives n8n and future UI components a common contract.

### Module 2: Agent role prompts
Define the first reusable agent prompts for planner, researcher, and critic.
Use them as the stable workflow layer before extracting any legacy UI.

### Module 3: Document workflow
Implement one starter workflow around improving a single document.
Keep the write path single-owner:
- planner proposes structure
- researcher proposes evidence
- critic proposes corrections
- one final stage assembles and writes output

### Module 4: Dashboard concepts
Extract only proven dashboard concepts from the root HTML files into `ui/` later:
- task list
- run status
- project list
- bot and agent assignments

### Module 5: Service modules
Add small shared services only after a workflow needs them:
- registry lookup
- run logging
- memory/history storage
- notifications

## Starter workflow recommendation
Use the document workflow as the first real end-to-end path.

### Input
A source document, goal, target audience, and quality bar.

### Output
A revised document plus a structured run record containing:
- task metadata
- planner output
- researcher notes
- critic findings
- final artifact path or inline result

## Deferred work
- UI rewrites
- broad refactors
- movement of root prototypes
- replacement of legacy files
- full workflow library
