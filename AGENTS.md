# AGENTS.md

## Project rules
- Do not delete, rename, or move existing root HTML files unless explicitly instructed.
- Do not destroy or overwrite existing n8n experiments.
- Prefer additive changes over restructuring.
- Treat the current repository root as legacy/prototype state.
- New architecture should be built in parallel beside the legacy state.
- Migrate only proven working modules later, one at a time.

## Repository intent
This repository is evolving into an n8n-based multi-agent platform with:
- shared orchestration
- reusable project definitions
- general and specialist bots
- dashboard and control interfaces

## Core entities
- Task: a requested action
- Run: one execution of a task
- Project: a container for prompts, tools, memory, and workflows
- Bot: a configured interface/persona bound to a project or shared role
- Agent: a role-specific worker used in a workflow
