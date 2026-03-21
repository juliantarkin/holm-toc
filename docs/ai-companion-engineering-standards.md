# AI Companion Engineering Standards

## Purpose
This document defines the engineering standards that all AI companion workflows, services, prompts, and data contracts should be evaluated against.

It is intended to be stable over time.
It does not describe a single implementation in detail.
It describes what "good" looks like for this repository as the system evolves.

## Scope
These standards apply to:
- n8n workflows
- shared services
- prompt modules
- memory systems
- simulation systems
- agent coordination
- observability and testing

## Repository Rules
- Preserve existing root HTML files as legacy reference material.
- Do not destroy or overwrite existing n8n experiments.
- Prefer additive changes over restructuring.
- Build new architecture in parallel beside the legacy root state.
- Migrate only proven modules later, one at a time.

## Core Engineering Position
The system should treat:
- deterministic code as the source of truth for state
- LLMs as reasoning and language layers
- n8n as the orchestrator
- artifacts as the handoff contract between stages

The system should not treat:
- n8n as the business logic brain
- chat history as the sole memory system
- raw LLM output as safe to write directly into world state

## Core Entities
- `Task`: a requested action
- `Run`: one execution of a task
- `Project`: a container for prompts, tools, memory, and workflows
- `Bot`: a configured interface/persona bound to a project or shared role
- `Agent`: a role-specific worker used in a workflow

## Standards

### 1. Orchestration
- Use a small number of specialized agents with explicit responsibilities.
- Prefer 1 to 4 agents in a workflow unless there is a proven reason to add more.
- Every workflow must document its routing pattern:
  - deterministic branch routing
  - orchestrator calling sub-agents
- Inter-agent communication must pass artifact references and summaries, not large prompt chains.
- Every workflow must define:
  - max iteration count
  - timeout budget
  - retry policy
  - circuit breaker behavior
  - final termination condition

### 2. Deterministic and Stochastic Boundary
- Deterministic systems own simulation state, timers, counters, cooldowns, and validation.
- LLMs may propose interpretations, dialogue, summaries, or candidate actions.
- LLM outputs must be validated before they affect durable state.
- Simulation state changes must go through deterministic code paths, never direct freeform model writes.
- All stochastic or random deterministic operations should be seedable and replayable.

### 3. Memory
- Memory must be tiered.
- Tier 1: core memory always loaded in prompt context.
- Tier 2: searchable recall memory for conversation and recent history.
- Tier 3: archival memory for long-term retrieval.
- The system should support active memory management:
  - write memory
  - update memory
  - suppress duplicate memory
  - promote important memory
  - decay low-value memory
- Retrieval should balance relevance, recency, and importance.

### 4. Context Management
- Context is a limited budget and must be assembled intentionally.
- Every agent type must have a documented context profile.
- Fixed identity and behavioral anchors load before dynamic recall.
- Retrieved modules must have hard size limits.
- Context compaction should happen before prompts become unstable or excessively expensive.

### 5. Character Consistency
- Separate immutable identity from evolving state.
- Immutable identity includes:
  - core persona
  - voice rules
  - hard behavioral boundaries
  - project-level design constraints
- Evolving state includes:
  - emotional condition
  - relationship state
  - current goals
  - accumulated memories
- Example dialogue should be treated as a primary voice anchor.
- The system should include periodic drift detection and re-anchoring checks.

### 6. Emotional and Life Simulation
- Emotional state should be represented in structured form, not inferred only from the latest message.
- Event appraisal and continuous state should be modeled separately.
- Time should progress outside the active conversation loop.
- Goals, schedules, and event cooldowns should exist as durable state.
- A companion should be able to have "life between messages."

### 7. Data and Concurrency
- Shared state tables must support optimistic concurrency control.
- Critical shared-write sections may require stronger locking.
- Durable writes must be idempotent where possible.
- Artifact creation, promotion, and replacement must be explicit.
- Every write path should have one clear owner per stage.

### 8. Quality and Testing
- Deterministic logic should be tested with seeded inputs.
- Agent-dependent logic should use fixtures and contract tests where possible.
- Integration tests should verify durable outputs and state transitions, not only response text.
- Character consistency should be tested over multi-turn scenarios, not single prompt snapshots.

### 9. Observability and Audit
- Trace across workflow, service, and agent boundaries.
- Record latency, token usage, failures, retries, and model routing decisions.
- Log state transitions and artifact writes in a durable audit trail.
- Evaluation data should be preserved for drift and regression review.

### 10. Cost and Latency
- Model choice is an architectural decision, not a late optimization.
- Route simple work to cheaper and faster models.
- Reserve premium reasoning models for rare tasks that justify the cost.
- Cache repeated prompt components and durable reference material when supported.
- Default to deterministic computation before escalating to model inference.

## Required Output of Every New Feature
Before a new feature is considered "proven," it should define:
- owner component
- input contract
- output contract
- state written
- artifacts created
- timeout and retry behavior
- test strategy
- migration impact on legacy files, if any

## Review Checklist
A new design or workflow should be rejected or revised if:
- n8n contains core business logic that belongs in code
- multiple stages can overwrite the same artifact without ownership rules
- prompt context is assembled ad hoc
- character state depends only on rolling chat history
- memory storage exists without memory curation rules
- deterministic state can be mutated directly by LLM output
- failure and retry behavior is undefined
- there is no measurable acceptance test

## Standard Deliverables
Every major subsystem should eventually have:
- an architecture spec
- a schema contract
- a workflow or API contract
- an implementation plan
- a test and observability plan

## Exit Criteria for "Production-Shaped" Design
A subsystem is production-shaped when:
- its deterministic boundaries are explicit
- its write ownership is explicit
- its context budget is bounded
- its failure modes are documented
- its costs are roughly predictable
- its behavior is testable without relying on hope
