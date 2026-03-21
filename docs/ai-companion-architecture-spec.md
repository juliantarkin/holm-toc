# AI Companion Architecture Spec

## Purpose
This document defines the target architecture for the AI companion system that will be built in parallel with the repository's legacy prototype state.

It converts broad engineering standards into concrete component boundaries, ownership rules, and data flow expectations.

## Architecture Summary
The system has five major layers:
1. Interface layer
2. n8n orchestration layer
3. shared services layer
4. state and memory layer
5. model execution layer

The key design rule is:
deterministic services own state, while LLMs generate interpretations, language, and candidate decisions.

## Repository Alignment
- Root HTML files remain untouched as legacy prototypes.
- Existing n8n experiments remain preserved.
- New implementation should live in additive paths under `docs/`, `schemas/`, `services/`, `workflows/`, and later `ui/`.

## Core Entities

### Task
A user or system request to perform a unit of work.

Suggested fields:
- `task_id`
- `project_id`
- `bot_id`
- `task_type`
- `input_payload`
- `priority`
- `requested_by`
- `created_at`

### Run
A single execution of a task through one workflow.

Suggested fields:
- `run_id`
- `task_id`
- `workflow_id`
- `status`
- `started_at`
- `completed_at`
- `current_stage`
- `error_code`
- `artifact_refs`
- `metrics`

### Project
The configuration container for a companion or shared system role.

Suggested fields:
- `project_id`
- `name`
- `persona_ref`
- `prompt_pack_ref`
- `memory_policy_ref`
- `workflow_set`
- `simulation_profile`

### Bot
The user-facing companion identity or interface binding.

Suggested fields:
- `bot_id`
- `project_id`
- `display_name`
- `channel_type`
- `voice_profile`
- `policy_profile`

### Agent
A workflow-internal worker with narrow scope.

Suggested fields:
- `agent_id`
- `role`
- `allowed_tools`
- `model_profile`
- `context_profile`
- `timeout_seconds`

## Major Components

### 1. Interface Layer
This layer accepts user messages, admin actions, and scheduled triggers.

Responsibilities:
- capture input
- normalize request payload
- route to the correct workflow entrypoint
- display final responses and run status

Non-responsibilities:
- direct memory mutation
- simulation updates
- model routing logic

### 2. n8n Orchestration Layer
n8n coordinates work between services, agents, approval gates, and artifact storage.

Responsibilities:
- start and track runs
- call services in the correct order
- invoke model-backed agents
- route based on workflow state
- persist stage-level metadata
- enforce stop conditions

Non-responsibilities:
- storing core business logic in Code nodes
- owning simulation rules
- directly defining persona logic

### 3. Shared Services Layer
This layer contains deterministic services used by workflows.

Planned services:
- `run-service`
- `artifact-service`
- `memory-service`
- `simulation-service`
- `persona-service`
- `evaluation-service`

Responsibilities:
- validate contracts
- own state transition logic
- sanitize and normalize model outputs
- expose reusable APIs or function boundaries to n8n

### 4. State and Memory Layer
This layer persists structured and long-term information.

Suggested storage split:
- relational store for tasks, runs, persona state, relationship state, goals, schedules, and audit logs
- vector store for long-term retrieval and semantic memory
- file or object storage for prompt snapshots, transcripts, generated artifacts, and evaluations

### 5. Model Execution Layer
This layer handles prompt execution and provider routing.

Responsibilities:
- model selection by task type
- prompt assembly
- tool permission enforcement
- response normalization
- provider fallback handling

## Recommended Runtime Decomposition
The MVP should start with one conversation-facing agent and deterministic support services.

The fuller target architecture supports these agent roles:
- `router`
- `perception`
- `conversation`
- `reactor`
- `forensics`
- `critic`

Not every workflow should use every role.
Each workflow must declare which roles are active.

## Ownership Rules

### Write Ownership
- n8n may write run-stage metadata and artifact references.
- simulation service owns simulation state writes.
- memory service owns memory promotion, decay, and retrieval records.
- persona service owns immutable persona material and approved mutable overlays.
- conversation agent may propose updates, but it does not directly commit durable state.

### Read Ownership
- agents may read only the context profiles approved for their role.
- stateful services may read from durable stores relevant to their domain.
- interfaces should read through service or view contracts when possible.

## Primary Data Flows

### A. Conversational Turn
1. interface receives user message
2. n8n creates `Task` and `Run`
3. memory service retrieves Tier 1, Tier 2, and Tier 3 context slices
4. simulation service returns current deterministic companion state
5. model layer runs the conversation agent
6. evaluation or validation step checks output shape and policy
7. memory service records turn outputs and candidate memories
8. n8n finalizes the run and returns the reply

### B. Background Life Simulation Tick
1. scheduler triggers workflow
2. n8n starts a simulation run
3. simulation service advances time and applies deterministic updates
4. major event thresholds may produce narrative generation tasks
5. artifact and audit records are written
6. run closes with updated state snapshot

### C. Memory Curation
1. scheduled workflow loads candidate memory records
2. memory service scores relevance, duplication, recency, and importance
3. merge, decay, promote, or suppress operations are applied
4. audit log records what changed and why

## Context Contract
Each model call should be assembled from bounded modules:
- identity and behavioral anchors
- current relationship summary
- current emotional and goal state
- recent conversation slice
- retrieved long-term memory slice
- active task instructions

Context assembly must be deterministic enough to explain after the fact.
Each module should have a target max size.

## Character State Contract
Character identity must be split into:

### Immutable
- persona traits
- voice constraints
- hard boundaries
- stable examples

### Mutable
- emotional dimensions
- moodlets or state modifiers
- relationship strength
- active goals
- recent events
- learned user facts

Mutable state can evolve only through approved service paths.

## Failure Semantics
Every workflow must define:
- what counts as retryable
- what counts as terminal failure
- whether a fallback model exists
- whether partial artifacts should be preserved
- how stale writes are retried

Minimum expected handling:
- timeout returns controlled failure with audit metadata
- malformed model output triggers repair or fail-closed behavior
- version conflict triggers state re-read and retry
- downstream service failure stops write promotion

## Acceptance Criteria for the Architecture
The architecture is considered implemented for Phase 1 when:
- one conversational workflow runs end to end
- deterministic companion state is read outside the prompt itself
- memory writes are captured as artifacts or structured records
- no direct root HTML modification is required
- one run record can explain what happened, which model was used, and which artifacts were produced

## Deferred Architecture
The following are intentionally deferred until the MVP proves value:
- full multi-agent enrichment pipeline
- autonomous multi-day planning loops
- broad dashboard rewrite
- rich NSFW or intimacy-specific execution paths
- advanced model marketplace routing
