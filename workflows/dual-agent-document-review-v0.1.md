# Dual-Agent Document Review v0.1

## Status
Draft workflow specification for later n8n implementation.

## Intent
Coordinate two agent edit proposals for one document without overwriting the source.

## Workflow steps
1. Trigger
2. Validate input payload
3. Read source document
4. Save source snapshot to run folder
5. Build normalized agent payload
6. Send payload to Codex
7. Send payload to Claude
8. Save Codex output
9. Save Claude output
10. Write run metadata
11. End in review state

## Input payload
```json
{
  "task_id": "task-001",
  "run_id": "run-001",
  "project_id": "toc",
  "source_document_path": "docs/example.md",
  "goal": "Improve clarity and structure",
  "constraints": [
    "Preserve meaning",
    "Do not remove major sections"
  ],
  "output_root": "runs"
}
```

## Normalized agent payload
```json
{
  "task": "document_edit",
  "project_id": "toc",
  "goal": "Improve clarity and structure",
  "constraints": [
    "Preserve meaning",
    "Do not remove major sections"
  ],
  "document_text": "<loaded file contents>",
  "output_format": {
    "summary": "string",
    "proposed_text": "string",
    "change_notes": ["string"],
    "open_questions": ["string"]
  }
}
```

## Run folder layout
- `runs/<run_id>/input.md`
- `runs/<run_id>/codex-output.md`
- `runs/<run_id>/claude-output.md`
- `runs/<run_id>/run.json`

## Success conditions
- source loads
- both outputs save successfully
- run metadata exists
- source file remains unchanged
