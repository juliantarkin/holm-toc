# AI Companion Implementation Plan

## Purpose
This document defines the practical build sequence for implementing the AI companion architecture in this repository without disrupting the current legacy state.

It is intentionally narrower than the architecture spec.
Its job is to answer: what do we build first, in what order, and what proves each step worked?

## Delivery Principles
- Preserve legacy root files and existing n8n experiments.
- Build in parallel, not by replacement.
- Ship one thin vertical slice before expanding the system.
- Prefer deterministic services over large n8n Code-node logic.
- Add multi-agent complexity only after single-path behavior is reliable.

## Phase Overview
1. Foundation contracts
2. Single-turn conversation slice
3. Deterministic companion state
4. Memory capture and retrieval
5. Background simulation tick
6. Multi-agent support
7. Evaluation and hardening

## Phase 1: Foundation Contracts

### Goal
Create the minimum shared contracts needed to build safely.

### Deliverables
- schema drafts for `Task`, `Run`, `Project`, `Bot`, and `Agent`
- run folder or artifact naming convention
- initial workflow naming convention
- model profile definitions
- context profile definitions

### Suggested repo targets
- `schemas/task.schema.json`
- `schemas/run.schema.json`
- `schemas/project.schema.json`
- `schemas/bot.schema.json`
- `schemas/agent.schema.json`
- `docs/phases/phase-01-foundation.md`

### Exit criteria
- workflows and services can refer to the same core nouns
- one run can be represented without ambiguity
- no implementation work depends on undocumented fields

## Phase 2: Single-Turn Conversation Slice

### Goal
Build one end-to-end user message workflow.

### Scope
- one interface entrypoint
- one n8n workflow
- one conversation model profile
- one deterministic response validation step
- one durable run record

### Workflow shape
1. receive input
2. create `Task`
3. create `Run`
4. fetch persona anchors
5. fetch current state snapshot
6. assemble context
7. call conversation model
8. validate and save output
9. close run

### Non-goals
- no autonomous planning
- no multi-agent debate
- no long-term memory retrieval beyond fixed anchors
- no dashboard rewrite

### Exit criteria
- a user message yields a saved response
- the run record captures inputs, model used, and outputs
- failures leave a useful audit trail

## Phase 3: Deterministic Companion State

### Goal
Move companion state out of prompt-only representation into structured storage.

### Scope
- emotional dimensions
- relationship summary
- current goals
- recent events

### Deliverables
- deterministic state schema
- read/write service for state transitions
- validation rules for clamping and normalization

### Exit criteria
- the conversation workflow reads real structured state
- state changes happen through a service boundary
- the model cannot write raw state directly

## Phase 4: Memory Capture and Retrieval

### Goal
Add basic durable memory without overbuilding a full curation system on day one.

### Scope
- turn transcript storage
- candidate memory extraction
- simple retrieval for relevant prior facts
- duplicate suppression heuristics

### Deliverables
- memory record schema
- memory write path
- retrieval API or service contract
- context assembly policy for memory slices

### Exit criteria
- the bot can recall a prior meaningful fact in later turns
- memory retrieval is bounded and explainable
- duplicate or low-value noise is not exploding unchecked

## Phase 5: Background Simulation Tick

### Goal
Give the companion life between user messages.

### Scope
- scheduler trigger
- deterministic time advancement
- need or mood decay
- event cooldowns
- optional low-cost narrative summarization for major state changes

### Deliverables
- tick workflow
- simulation service methods
- snapshot and replay seed support if randomness is introduced

### Exit criteria
- state changes can occur without an active user message
- the companion can reference off-screen changes in later dialogue
- tick behavior is testable and reproducible

## Phase 6: Multi-Agent Support

### Goal
Add specialized roles only after the single-agent path is reliable.

### Recommended order
1. `perception`
2. `critic`
3. `reactor`
4. `forensics`

### Rules
- each added agent must justify its token and latency cost
- each role must have a clear artifact contract
- each role must have a stop condition
- avoid parallel agent sprawl until artifact handoff is working

### Exit criteria
- at least one workflow uses more than one agent and remains debuggable
- artifacts, not prompt chains, carry work between stages

## Phase 7: Evaluation and Hardening

### Goal
Make the system trustworthy enough to extend.

### Scope
- observability and metrics
- drift checks
- seeded deterministic tests
- contract tests
- fallback model behavior
- retry and circuit-breaker policy

### Exit criteria
- latency and error rates are measurable
- regressions can be caught before silent drift becomes product behavior
- cost per turn is roughly predictable

## MVP Definition
The MVP is complete when the system can:
- accept a user message
- load persona anchors
- load structured companion state
- generate a response
- save the run
- save candidate memories
- advance companion state between turns through deterministic logic

This is enough to prove the architecture without requiring full multi-agent complexity.

## What Not to Build First
- broad provider comparison frameworks
- enrichment swarms
- large dashboard rewrites
- complex vector tuning
- deep memory curation automation
- high-risk intimacy or unrestricted content paths

## Immediate Next Tasks
1. define the five core schemas in `schemas/`
2. draft one conversation workflow under `workflows/`
3. create one deterministic state service under `services/`
4. define the artifact layout for task and run outputs
5. write a phase-specific acceptance checklist

## Decision Log Needs
As implementation begins, keep a lightweight decision log for:
- why a service boundary exists
- why a model was assigned to a role
- why a field exists in a schema
- why a workflow was split or merged

That log will prevent the architecture from turning back into implicit tribal knowledge.
