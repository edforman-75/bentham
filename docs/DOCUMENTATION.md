# Documentation Requirements

Documentation is a **mandatory** part of every commit and pull request. Code changes without corresponding documentation updates will be rejected.

## Documentation Checklist

Before committing, verify all applicable items:

### For New Packages

- [ ] `README.md` created in package root
- [ ] Installation instructions included
- [ ] Quick start example provided
- [ ] API reference documented
- [ ] Configuration options listed
- [ ] Testing instructions included
- [ ] Dependencies listed
- [ ] Package added to `docs/MODULES.md`

### For New Features

- [ ] Feature documented in package README
- [ ] API changes reflected in type exports
- [ ] Usage examples provided
- [ ] Configuration options documented (if any)
- [ ] Breaking changes noted (if any)

### For Bug Fixes

- [ ] If fix changes API behavior, update documentation
- [ ] If fix adds new error handling, document error codes

### For Architecture Changes

- [ ] `docs/ARCHITECTURE.md` updated
- [ ] `docs/MODULES.md` updated (if module interactions change)
- [ ] Dependency graph updated (if dependencies change)

## Package README Template

Every package must have a `README.md` with these sections:

```markdown
# @bentham/package-name

Brief description of what this package does.

## Installation

\`\`\`bash
pnpm add @bentham/package-name
\`\`\`

## Overview

Bullet points of key features and capabilities.

## Quick Start

\`\`\`typescript
// Working example code
\`\`\`

## API Reference

### Main Functions/Classes

Document each public export with:
- Function signature
- Parameter descriptions
- Return type
- Example usage

## Configuration

\`\`\`typescript
interface ConfigOptions {
  // Document each option
}
\`\`\`

## Testing

\`\`\`bash
pnpm test        # Run tests
pnpm test:watch  # Watch mode
\`\`\`

## Dependencies

- List internal @bentham/* dependencies
- Note external service dependencies
```

## System Documentation

### Required System Docs

| Document | Purpose | Update When |
|----------|---------|-------------|
| `docs/ARCHITECTURE.md` | System design | Architecture changes |
| `docs/MODULES.md` | Module specifications | New modules, API changes |
| `docs/IMPLEMENTATION_PLAN.md` | Build phases | Phase completion |
| `docs/TESTING_STRATEGY.md` | Test approach | Test strategy changes |
| `docs/COST_ANALYSIS.md` | Cost estimates | Pricing/resource changes |

### Keeping Docs Current

1. **During Development**: Update docs as you write code, not after
2. **In PRs**: Include doc updates in the same PR as code changes
3. **In Reviews**: Verify documentation completeness during code review

## Automated Checks

The following checks run on every commit:

1. **Package README Check**: Every package with `src/` must have `README.md`
2. **README Content Check**: READMEs must include required sections
3. **Module Registration**: New packages must be in `docs/MODULES.md`

## Running Documentation Checks

```bash
# Check all documentation
pnpm run docs:check

# Check specific package
pnpm run docs:check --package=core

# Generate documentation report
pnpm run docs:report
```

## Documentation Standards

### Writing Style

- Use active voice ("The function returns..." not "The value is returned by...")
- Be concise but complete
- Include working code examples (test them!)
- Use consistent terminology across all docs

### Code Examples

- All examples must be valid TypeScript
- Examples should be copy-paste runnable when possible
- Include necessary imports
- Show common use cases first, edge cases later

### Formatting

- Use GitHub-flavored Markdown
- Use tables for structured data
- Use code blocks with language hints
- Keep line lengths reasonable (~100 chars)

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-17 | Claude Code | Initial documentation requirements |
