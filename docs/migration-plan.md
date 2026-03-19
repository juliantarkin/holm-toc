# Migration Plan

## Phase 1
- Create safe scaffolding
- Preserve all existing files
- Document current root contents
- Define platform concepts

## Phase 2
- Identify root files that are still useful
- Tag each as:
  - keep
  - replace
  - archive
  - merge

## Phase 3
- Migrate validated modules into:
  - ui/
  - workflows/
  - prompts/
  - schemas/
  - services/

## Phase 4
- Wire migrated components into n8n and dashboard flow
