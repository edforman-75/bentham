#!/bin/bash
#
# Documentation Checker
# Validates that all packages have proper documentation
#
# Usage: ./scripts/check-docs.sh [--fix] [--package=name]
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PACKAGES_DIR="packages"
DOCS_DIR="docs"
ERRORS=0
WARNINGS=0

# Parse arguments
FIX_MODE=false
SPECIFIC_PACKAGE=""

for arg in "$@"; do
  case $arg in
    --fix)
      FIX_MODE=true
      shift
      ;;
    --package=*)
      SPECIFIC_PACKAGE="${arg#*=}"
      shift
      ;;
  esac
done

echo "========================================"
echo "  Bentham Documentation Checker"
echo "========================================"
echo ""

# Function to check if a README has required sections
check_readme_sections() {
  local readme="$1"
  local package="$2"
  local missing_sections=""

  # Required sections
  local sections=("## Installation" "## Overview" "## Quick Start" "## API Reference" "## Testing" "## Dependencies")

  for section in "${sections[@]}"; do
    if ! grep -q "$section" "$readme" 2>/dev/null; then
      missing_sections="$missing_sections\n  - $section"
    fi
  done

  if [ -n "$missing_sections" ]; then
    echo -e "${YELLOW}WARNING${NC}: $package README missing sections:$missing_sections"
    ((WARNINGS++))
    return 1
  fi
  return 0
}

# Function to check package documentation
check_package() {
  local package_dir="$1"
  local package_name=$(basename "$package_dir")

  # Skip if not a real package (no src directory)
  if [ ! -d "$package_dir/src" ]; then
    return 0
  fi

  # Skip placeholder directories
  if [ "$package_name" = "api-gateway" ] || [ "$package_name" = "infrastructure" ]; then
    return 0
  fi

  echo -n "Checking $package_name... "

  # Check for README.md
  if [ ! -f "$package_dir/README.md" ]; then
    echo -e "${RED}FAIL${NC}"
    echo -e "  ${RED}ERROR${NC}: Missing README.md"
    ((ERRORS++))
    return 1
  fi

  # Check README has required sections
  if ! check_readme_sections "$package_dir/README.md" "$package_name"; then
    echo -e "${YELLOW}WARN${NC}"
    return 0
  fi

  # Check package.json has description
  if [ -f "$package_dir/package.json" ]; then
    if ! grep -q '"description"' "$package_dir/package.json"; then
      echo -e "${YELLOW}WARN${NC}"
      echo -e "  ${YELLOW}WARNING${NC}: package.json missing description"
      ((WARNINGS++))
      return 0
    fi
  fi

  echo -e "${GREEN}OK${NC}"
  return 0
}

# Check system documentation
check_system_docs() {
  echo ""
  echo "Checking system documentation..."
  echo ""

  local required_docs=(
    "ARCHITECTURE.md"
    "MODULES.md"
    "IMPLEMENTATION_PLAN.md"
    "TESTING_STRATEGY.md"
    "DOCUMENTATION.md"
  )

  for doc in "${required_docs[@]}"; do
    echo -n "  $doc... "
    if [ -f "$DOCS_DIR/$doc" ]; then
      echo -e "${GREEN}OK${NC}"
    else
      echo -e "${RED}MISSING${NC}"
      ((ERRORS++))
    fi
  done
}

# Check that new packages are registered in MODULES.md
check_module_registration() {
  echo ""
  echo "Checking module registration..."
  echo ""

  if [ ! -f "$DOCS_DIR/MODULES.md" ]; then
    echo -e "${RED}ERROR${NC}: MODULES.md not found"
    ((ERRORS++))
    return
  fi

  for package_dir in $PACKAGES_DIR/*/; do
    local package_name=$(basename "$package_dir")

    # Skip non-packages
    if [ ! -d "$package_dir/src" ]; then
      continue
    fi

    # Skip placeholders
    if [ "$package_name" = "api-gateway" ] || [ "$package_name" = "infrastructure" ]; then
      continue
    fi

    echo -n "  $package_name in MODULES.md... "
    if grep -q "$package_name" "$DOCS_DIR/MODULES.md" 2>/dev/null; then
      echo -e "${GREEN}OK${NC}"
    else
      echo -e "${YELLOW}WARN${NC} (not found)"
      ((WARNINGS++))
    fi
  done
}

# Main execution
echo "Checking package documentation..."
echo ""

if [ -n "$SPECIFIC_PACKAGE" ]; then
  # Check specific package
  if [ -d "$PACKAGES_DIR/$SPECIFIC_PACKAGE" ]; then
    check_package "$PACKAGES_DIR/$SPECIFIC_PACKAGE"
  else
    echo -e "${RED}ERROR${NC}: Package '$SPECIFIC_PACKAGE' not found"
    exit 1
  fi
else
  # Check all packages
  for package_dir in $PACKAGES_DIR/*/; do
    check_package "$package_dir"
  done

  check_system_docs
  check_module_registration
fi

# Summary
echo ""
echo "========================================"
echo "  Summary"
echo "========================================"
echo ""

if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}Errors: $ERRORS${NC}"
fi

if [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
fi

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo -e "${GREEN}All documentation checks passed!${NC}"
fi

echo ""

# Exit with error if there are errors
if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}Documentation check failed. Please fix errors before committing.${NC}"
  exit 1
fi

exit 0
