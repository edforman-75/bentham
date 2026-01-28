#!/bin/bash
# Check that code changes comply with Bentham charter
# Run this in CI or as pre-commit hook

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0

echo "Checking Bentham charter compliance..."
echo ""

# Check for analysis scripts in scripts/
echo -n "Checking for analysis scripts in /scripts/... "
ANALYSIS_SCRIPTS=$(ls scripts/analyze-*.ts 2>/dev/null || true)
if [ -n "$ANALYSIS_SCRIPTS" ]; then
    echo -e "${RED}FAIL${NC}"
    echo "  Analysis scripts belong in tenant repos:"
    echo "$ANALYSIS_SCRIPTS" | sed 's/^/    /'
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}OK${NC}"
fi

# Check for report generation scripts
echo -n "Checking for report scripts in /scripts/... "
REPORT_SCRIPTS=$(ls scripts/generate-*-report.ts 2>/dev/null || true)
if [ -n "$REPORT_SCRIPTS" ]; then
    echo -e "${RED}FAIL${NC}"
    echo "  Report scripts belong in tenant repos:"
    echo "$REPORT_SCRIPTS" | sed 's/^/    /'
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}OK${NC}"
fi

# Check for correlation/statistics scripts
echo -n "Checking for statistics scripts in /scripts/... "
STATS_SCRIPTS=$(ls scripts/*correlation*.ts scripts/*statistics*.ts 2>/dev/null || true)
if [ -n "$STATS_SCRIPTS" ]; then
    echo -e "${RED}FAIL${NC}"
    echo "  Statistics scripts belong in tenant repos:"
    echo "$STATS_SCRIPTS" | sed 's/^/    /'
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}OK${NC}"
fi

# Check for Excel files in studies/
echo -n "Checking for Excel files in /studies/... "
EXCEL_FILES=$(ls studies/*.xlsx 2>/dev/null || true)
if [ -n "$EXCEL_FILES" ]; then
    echo -e "${RED}FAIL${NC}"
    echo "  Excel workbooks belong in tenant repos:"
    echo "$EXCEL_FILES" | sed 's/^/    /'
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}OK${NC}"
fi

# Check for report files in studies/
echo -n "Checking for report files in /studies/... "
REPORT_FILES=$(ls studies/*-report.md studies/*-report.html 2>/dev/null || true)
if [ -n "$REPORT_FILES" ]; then
    echo -e "${RED}FAIL${NC}"
    echo "  Reports belong in tenant repos:"
    echo "$REPORT_FILES" | sed 's/^/    /'
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}OK${NC}"
fi

# Check for email drafts in studies/
echo -n "Checking for email drafts in /studies/... "
EMAIL_FILES=$(ls studies/*-email*.md 2>/dev/null || true)
if [ -n "$EMAIL_FILES" ]; then
    echo -e "${RED}FAIL${NC}"
    echo "  Email drafts belong in tenant repos:"
    echo "$EMAIL_FILES" | sed 's/^/    /'
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}OK${NC}"
fi

# Check for scoring logic in packages (excluding ai-advisor which has deprecated modules)
echo -n "Checking for scoring logic in core packages... "
SCORING_FILES=$(grep -rl "ResponseScorer\|scoreResponse\|calculateScore" packages/orchestrator packages/executor packages/validator 2>/dev/null || true)
if [ -n "$SCORING_FILES" ]; then
    echo -e "${YELLOW}WARN${NC}"
    echo "  Found scoring references (may be imports of deprecated modules):"
    echo "$SCORING_FILES" | sed 's/^/    /'
else
    echo -e "${GREEN}OK${NC}"
fi

# Check for xlsx imports in core packages
echo -n "Checking for Excel dependencies in core packages... "
XLSX_IMPORTS=$(grep -rl "from 'xlsx'\|from \"xlsx\"\|require('xlsx')" packages/ 2>/dev/null || true)
if [ -n "$XLSX_IMPORTS" ]; then
    echo -e "${RED}FAIL${NC}"
    echo "  Excel manipulation belongs in tenant repos:"
    echo "$XLSX_IMPORTS" | sed 's/^/    /'
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}OK${NC}"
fi

echo ""
if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}Charter compliance check failed with $ERRORS error(s)${NC}"
    echo ""
    echo "Bentham is multi-tenant execution infrastructure only."
    echo "Analysis, reporting, and scoring belong in tenant repositories."
    echo ""
    echo "See /CHARTER.md and /CONTRIBUTING.md for details."
    exit 1
else
    echo -e "${GREEN}Charter compliance check passed${NC}"
    exit 0
fi
