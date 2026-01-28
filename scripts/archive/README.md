# Archived Scripts

This directory contains legacy study-runner scripts from before the manifest-driven execution system was implemented.

## Why Archived

These scripts were one-off study runners with:
- Hardcoded queries specific to individual studies
- Study-specific surface configurations
- Manual execution workflows

They have been superseded by:
- **Manifest-driven execution** (`bentham study run manifest.yaml`)
- **Repository structure** for manifests and results (`repository/manifests/`, `repository/results/`)
- **Reusable surface adapters** in `packages/surface-adapters/`

## Contents

- `run-*.ts` - Study execution scripts for specific clients/studies
- `retry-*.ts` - Retry logic for failed study queries
- `debug-*.ts` - Debugging utilities for specific surface issues
- `analyze-*.ts` - One-off analysis scripts (analysis now in tenant repos)

## If You Need These

If you need to reference how a specific study was run:
1. Check the corresponding manifest in `repository/manifests/`
2. Review the results in `repository/results/`
3. Use these archived scripts as reference only

**Do not run these scripts in production** - use the manifest system instead.
