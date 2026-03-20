# Phase 01: Dual-Agent Document Review

## Capability
Run one document task through two agents and save both outputs for inspection.

## Version name
`dual-agent-document-review-v0.1-draft`

## Why this phase
- proves the orchestration loop
- keeps the scope narrow
- creates immediate value
- avoids risky auto-merge behavior

## In scope
- one source document
- one task payload
- one Codex response
- one Claude response
- one run folder
- one run metadata file

## Out of scope
- automatic merging
- in-place editing of the source file
- multi-document workflows
- dashboard implementation
- memory system

## Input contract
- `task_id`
- `run_id`
- `project_id`
- `source_document_path`
- `goal`
- `constraints`
- `output_root`

## Agent response contract
Each agent should return:
- `summary`
- `proposed_text`
- `change_notes`
- `open_questions`

## Proof artifacts
- source snapshot
- Codex output file
- Claude output file
- run metadata file

## Acceptance test
This phase is proven when:
1. The workflow accepts one document task.
2. Both agents return output.
3. Both outputs are saved separately.
4. The original source document is unchanged.
5. A run record is saved.

## Review questions
- Did both agents stay inside the same response contract?
- Was the source preserved?
- Is the run folder easy to inspect?
- Are we ready to add approval as Phase 02?

## Promotion
Promote to `dual-agent-document-review-v0.1-stable` only after a successful test run is saved and reviewed.
