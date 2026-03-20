# Model Routing Plan

## Purpose
Add a cheap front-door routing layer after the base dual-agent workflow is proven.

## Principle
Use the least expensive capable model to classify and route work.
Reserve stronger and more expensive models for tasks that survive intake.

## Routing layers

### Doorman
The doorman decides:
- whether the payload is valid
- whether the task is in scope
- whether the task should be routed to one worker or two
- whether the task should stop for clarification

The doorman should not perform the full document edit.

### Workers
Workers perform the actual document review, editing, planning, or critique.
For early phases, workers should receive the same normalized payload so outputs are comparable.

### Reviewer or assembler
Later phases may add a final agent that compares or merges worker outputs.
This should come after routing is proven.

## Recommended starting pattern
- cheap doorman
- OpenAI worker
- Claude worker
- human review gate

## Why a doorman layer helps
- reduces cost
- filters malformed tasks
- keeps expensive workers focused
- makes later model comparisons cleaner

## Comparison method
When comparing model pairings:
1. keep the same task payload
2. keep the same response contract
3. save outputs separately
4. score them with the same rubric
5. change only one variable at a time

## Good first routing questions
- Is the source path valid?
- Is the task type supported?
- Does the task need one worker or two?
- Are constraints present?
- Should the workflow stop for missing information?

## Non-goals
- autonomous multi-step planning by the doorman
- hidden prompt rewriting
- automatic document merge
- replacing human approval in early phases
