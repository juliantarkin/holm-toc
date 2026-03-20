# Build Sheet: Dual-Agent Document Review v0.1 for n8n

## Purpose
Build the first real n8n implementation of Phase 01:
- one source document
- one normalized payload
- one OpenAI worker call
- one Claude worker call
- saved outputs
- saved run metadata
- no overwrite of the source document

## Scope guard
Build only the Phase 01 workflow described in:
- `docs/phases/phase-01-dual-agent-document-review.md`
- `workflows/dual-agent-document-review-v0.1.md`

Do not add:
- automatic merge
- approval UI
- Notion write-back
- dashboard integration
- routing logic from Phase 02

## Workflow name
`dual-agent-document-review-v0.1-draft`

## Trigger
Use a Manual Trigger for the first implementation.

Expected incoming JSON example:
```json
{
  "task_id": "task-001",
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

## Required credentials
- OpenAI credential named `openai-toc`
- Anthropic or Claude credential using the existing working pattern in your n8n environment

## Required nodes
Build these nodes in this order.

### 1. Manual Trigger
Starts the workflow.

### 2. Set: normalize-input
Create a normalized Phase 01 payload.

Fields to set:
- `task_id`
- `project_id`
- `source_document_path`
- `goal`
- `constraints`
- `output_root`
- `run_id`
- `status`
- `current_stage`
- `started_at`

Rules:
- if `constraints` is missing, set it to `[]`
- generate `run_id` inside the workflow
- set `status` to `running`
- set `current_stage` to `intake`
- set `started_at` to the current timestamp

Recommended `run_id` format:
- timestamp plus short random suffix
- example: `20260319T221500Z-a7f3`

### 3. Code or Set: derive-paths
Assemble the run folder and file paths.

Fields to derive:
- `run_folder`
- `input_snapshot_path`
- `codex_output_path`
- `claude_output_path`
- `run_metadata_path`

Expected layout:
- `<output_root>/<run_id>/input.md`
- `<output_root>/<run_id>/codex-output.md`
- `<output_root>/<run_id>/claude-output.md`
- `<output_root>/<run_id>/run.json`

### 4. Filesystem check: guard-run-folder
Check whether the run folder already exists.

Behavior:
- if it exists, fail the workflow
- do not overwrite an existing run

If your n8n environment does not have a direct file existence node, use a Code node or Execute Command node to test for path existence and branch on the result.

### 5. Read file: source-document
Load the source document from `source_document_path`.

Behavior:
- if the source file is missing, fail the workflow
- keep the original content in a field called `document_text`

### 6. Write file: input-snapshot
Write the loaded source content to `input_snapshot_path`.

Purpose:
- preserve the exact input used for the run

### 7. Set: build-agent-payload
Create the normalized agent payload that both workers will receive.

Payload shape:
```json
{
  "task": "document_edit",
  "project_id": "<project_id>",
  "goal": "<goal>",
  "constraints": ["..."],
  "document_text": "<loaded file contents>",
  "output_format": {
    "summary": "string",
    "proposed_text": "string",
    "change_notes": ["string"],
    "open_questions": ["string"]
  }
}
```

Also update:
- `current_stage` to `agent_review`

### 8. Parallel split
Fan out to two parallel worker paths:
- OpenAI path
- Claude path

### 9A. OpenAI worker call
Use the OpenAI Responses API.

Contract:
- endpoint: `POST /v1/responses`
- credential: `openai-toc`
- model: `gpt-5.1`

Instruction goal:
- review and improve the document according to the payload
- return only JSON matching the required output contract

Required response fields:
- `summary`
- `proposed_text`
- `change_notes`
- `open_questions`

### 9B. Claude worker call
Use the existing Claude API execution pattern already working in your n8n setup.

Instruction goal:
- same as OpenAI path
- same output contract

Required response fields:
- `summary`
- `proposed_text`
- `change_notes`
- `open_questions`

### 10A. Validate OpenAI output
Check:
- response is parseable
- required fields exist
- `proposed_text` is non-empty

If invalid:
- mark the worker result as failed in metadata
- fail the workflow

### 10B. Validate Claude output
Check:
- response is parseable
- required fields exist
- `proposed_text` is non-empty

If invalid:
- mark the worker result as failed in metadata
- fail the workflow

### 11A. Write file: codex-output
Save the OpenAI output to `codex_output_path`.

### 11B. Write file: claude-output
Save the Claude output to `claude_output_path`.

### 12. Merge results
Wait for both worker paths and assemble run metadata.

Run metadata should include:
- `run_id`
- `task_id`
- `project_id`
- `status`
- `current_stage`
- `started_at`
- `ended_at`
- `agent_outputs`
- `result`
- `error`

Recommended values at successful end:
- `status`: `needs_review`
- `current_stage`: `approval`
- `ended_at`: current timestamp
- `agent_outputs`: one entry for `codex`, one for `claude`
- `result.summary`: short note that both outputs were saved and await review

### 13. Write file: run-metadata
Write the metadata JSON to `run_metadata_path`.

### 14. End
Stop after writing outputs and metadata.

## Failure behavior
On failure:
- do not overwrite the source file
- do not silently overwrite an existing run folder
- write as much metadata as is practical
- set `status` to `failed`
- include an `error` object with a short message

## OpenAI prompt guidance
Use a system or instruction block that says:
- you are one of two independent document reviewers
- improve clarity, structure, and usefulness
- preserve meaning
- do not remove major sections unless clearly redundant
- return only valid JSON matching the required contract

## Claude prompt guidance
Use the same contract and as close to the same task framing as possible.
Do not let the Claude path use a looser or richer response format than the OpenAI path.

## Acceptance test
The workflow is ready for a first proof run when all of these are true:
1. Manual trigger accepts the Phase 01 payload.
2. The source document is loaded successfully.
3. A unique run folder is created.
4. `input.md` is written.
5. Both worker calls complete.
6. Both outputs validate against the required contract.
7. `codex-output.md` and `claude-output.md` are written.
8. `run.json` is written with valid `started_at` and `ended_at`.
9. `status` ends as `needs_review`.
10. The source document remains unchanged.

## Export requirement
After building and testing:
- export the n8n workflow JSON
- save it into the repo for review

Suggested destination:
- `workflows/n8n/dual-agent-document-review-v0.1-draft.json`

## Review handoff
Once exported, hand the JSON back for contract review against:
- `docs/phases/phase-01-dual-agent-document-review.md`
- `workflows/dual-agent-document-review-v0.1.md`
