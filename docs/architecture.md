# Architecture

## Purpose
Build the new multi-agent platform beside the legacy prototype files in the repository root.
The root HTML files remain preserved reference implementations and should not be rewritten in place.

## Current state
- Root HTML files are legacy UI and concept prototypes.
- Root handoff files capture project history and operator intent.
- `docs/`, `schemas/`, `prompts/`, and `services/` form the new parallel scaffold.
- `ui/` and `workflows/` are reserved for later migration of proven modules.

## Target platform layers
1. UI layer
2. n8n orchestration layer
3. shared services layer
4. project layer
5. bot layer
6. agent role layer

## Core entities

### Task
A requested action such as "improve this brief" or "research options for hosting."

### Run
One execution of a task, including agent outputs, statuses, timestamps, and produced artifacts.

### Project
A container for prompts, tools, memory, schemas, and workflow configuration.

### Bot
A user-facing interface or persona bound to a project or shared role.

### Agent
A role-specific worker used inside a workflow. Agents should have narrow responsibilities.

## Recommended starter workflow
The best first workflow is a document-centered flow with multiple agents contributing to one document while only one step owns the final write.

### Why start here
- It demonstrates orchestration without requiring a full app rewrite.
- It produces visible output quickly.
- It maps cleanly to the repository's core entities.
- It is easier to debug than multi-document or multi-tool automation.

### Recommended stages
1. Intake task
2. Planner produces document goal, outline, and section plan
3. Researcher gathers supporting material and evidence notes
4. Critic reviews the draft plan or assembled draft for gaps and risks
5. Assembler merges approved section outputs into the working document
6. Optional human approval gate
7. Final write and run log

### Key rule
Multiple agents may propose edits, but only one stage should write the document artifact for a given run.

## Data flow for the starter workflow
1. Input task references a source document and desired outcome.
2. Planner returns a structured plan with assumptions, sections, and next steps.
3. Researcher returns notes tied to sections or claims.
4. Critic returns findings, risks, and revision requests.
5. Assembler combines accepted outputs into a revised document.
6. Run metadata records what happened and where the output lives.

## Migration rules
- Preserve all legacy root files in place.
- Extract reusable concepts before extracting UI.
- Prefer schema-first and prompt-first migration.
- Move one proven module at a time into `ui/`, `workflows/`, or `services/`.
- Do not archive or remove legacy files until a replacement module is validated.
