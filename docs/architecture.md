# Architecture

## Current approach
This repo currently contains legacy prototype UI files and experimental assets in the root.
Those remain untouched for now.

## Reorganization strategy
Build a parallel structure for the future platform:
- docs/
- workflows/
- prompts/
- schemas/
- services/
- ui/
- archive/

Nothing destructive occurs in the first phase.

## Future platform layers
1. UI layer
2. n8n orchestration layer
3. shared services layer
4. project layer
5. bot layer

## Migration strategy
- Leave current experiments in place
- Identify working modules
- Migrate them one by one into the new structure
- Avoid global rewrites
