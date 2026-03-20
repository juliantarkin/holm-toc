# Phase 02: Doorman Routing

## Capability
Add a cheap classification and routing step ahead of the dual-agent document review workflow.

## Version name
`doorman-routing-v0.2-draft`

## Why this phase
- reduces waste on malformed or low-value tasks
- gives the system a controlled front door
- creates the foundation for later model bakeoffs

## In scope
- one doorman step before worker execution
- payload validation
- route decision
- clarification or reject decision
- pass-through to the existing dual-agent workflow

## Out of scope
- automated merge
- autonomous project planning
- Notion write-back
- replacing human approval
- changing the Phase 01 response contract

## Input contract
Use the same normalized task payload as Phase 01.

## Doorman output contract
The doorman should return:
- `decision`
- `reason`
- `task_type`
- `recommended_route`
- `missing_information`
- `normalized_constraints`

## Allowed decisions
- `route_dual_review`
- `route_single_worker`
- `needs_clarification`
- `reject`

## Proof artifacts
- doorman decision record
- normalized payload
- worker dispatch record
- run metadata update

## Acceptance test
This phase is proven when:
1. The doorman receives the same payload format as Phase 01.
2. The doorman returns one allowed decision.
3. Invalid payloads stop before worker execution.
4. Valid document review payloads route into the existing Phase 01 path.
5. The routing decision is saved in the run record.

## Candidate model role
A low-cost fast model is preferred for the doorman role.
If Claude Haiku is already available in your environment, it is a reasonable starting candidate for this phase.

## Review questions
- Did the doorman stay narrow?
- Did it avoid rewriting the task?
- Are routing outcomes easy to inspect?
- Is the decision useful enough to justify the extra step?
