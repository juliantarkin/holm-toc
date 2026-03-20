# n8n Layer Plan

## Purpose
Use n8n as the orchestration layer for tasks, agents, approvals, and saved outputs.
The n8n layer should coordinate work, not replace role-specific reasoning.

## Layer model

### Layer 1: Base orchestration
This is the starting layer.
- trigger intake
- load source file
- normalize task payload
- call agents
- save outputs
- record run metadata

### Layer 2: Control and quality
Add after Layer 1 is proven.
- approval gates
- retries
- validation checks
- routing by task type
- artifact promotion rules

### Layer 3: Reusable registry and memory
Add after multiple workflows exist.
- project registry
- prompt registry
- workflow registry
- run history
- artifact index

## Starter principle
Start with one workflow that produces evidence of success without modifying the source document in place.

## First workflow recommendation
`dual-agent-document-review-v0.1`

### Goal
Send one document task to two agents, save both outputs, and stop for review.

### Inputs
- source document path
- goal
- constraints
- output folder
- run id

### Outputs
- saved source snapshot
- codex output
- claude output
- run metadata record

### Non-goals
- automatic merge
- automatic overwrite of the source document
- broad routing
- full dashboard integration

## Versioning strategy

### Workflow versions
Name each workflow explicitly:
- `dual-agent-document-review-v0.1-draft`
- `dual-agent-document-review-v0.1-proven`
- `dual-agent-document-review-v0.1-stable`

### Artifact versions
Store each run in its own folder and promote only approved artifacts.

Suggested layout:
- `runs/<run_id>/input.md`
- `runs/<run_id>/codex-output.md`
- `runs/<run_id>/claude-output.md`
- `runs/<run_id>/run.json`
- `artifacts/docs/<document_name>/v001.md`

## Acceptance test for v0.1
The workflow is proven when:
- the source file is loaded successfully
- both agent calls complete
- both outputs are saved
- run metadata is written
- the original source file remains unchanged

## Growth path
1. v0.1 dual outputs only
2. v0.2 human approval and promoted save
3. v0.3 structured section edits
4. v0.4 critic review stage
5. v0.5 assembler final write stage
