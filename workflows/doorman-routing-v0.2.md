# Doorman Routing v0.2

## Status
Draft workflow specification for later n8n implementation.

## Intent
Add a cheap front-door model that validates and routes tasks before expensive worker calls begin.

## Workflow steps
1. Trigger
2. Validate base payload shape
3. Send payload to doorman model
4. Save doorman decision
5. Branch by decision
6. If `route_dual_review`, invoke `dual-agent-document-review-v0.1`
7. If `route_single_worker`, invoke a future single-worker path
8. If `needs_clarification`, stop and request more information
9. If `reject`, stop and log the reason
10. Write run metadata

## Doorman prompt goals
- classify the request
- confirm required fields are present
- preserve the task rather than reinvent it
- select the cheapest adequate route

## Example doorman output
```json
{
  "decision": "route_dual_review",
  "reason": "Document improvement task with clear source and constraints",
  "task_type": "document_edit",
  "recommended_route": "dual-agent-document-review-v0.1",
  "missing_information": [],
  "normalized_constraints": [
    "Preserve meaning",
    "Do not remove major sections"
  ]
}
```

## Success conditions
- the doorman returns one allowed decision
- the decision is logged
- invalid tasks do not reach worker steps
- valid tasks reach the expected downstream workflow
