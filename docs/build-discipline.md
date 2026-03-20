# Build Discipline

## Purpose
Keep the project focused on one proven capability at a time.

## Operating rules
1. One active build phase at a time.
2. One workflow version at a time.
3. One builder and one reviewer per phase.
4. No destructive changes to legacy root files.
5. No promotion without proof artifacts.

## Roles

### User
- Chooses the mission for the phase
- Approves scope
- Approves promotion from draft to stable

### Builder
- Implements only the current phase goal
- Stays inside the phase contract
- Produces artifacts and notes for review

### Reviewer
- Checks for scope drift
- Checks contracts, regressions, and missing proof
- Recommends approve or revise

## Phase template
Every phase must define:
- capability added
- in scope
- out of scope
- inputs
- outputs
- proof artifacts
- acceptance test
- version name

## Version states

### Draft
Under construction. Not the baseline.

### Proven
Passed the acceptance test at least once with recorded artifacts.

### Stable
Approved as the baseline for the next phase.

## Promotion rule
Do not continue editing a stable version directly.
Clone it into the next draft version and evolve that.

## Recommended first phases
1. Dual-agent document review
2. Human approval and versioned save
3. Critic or assembler merge step
4. Reusable projectized workflow

## Anti-patterns
- Starting a new feature before the current phase is proven
- Letting multiple agents write the same artifact at the same time
- Rewriting legacy prototypes while inventing new architecture
- Using "latest" as the only workflow version
