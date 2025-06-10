#!/bin/bash
# Find TypeScript 'any' type usage in the codebase

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Searching for TypeScript 'any' type usage...${NC}"
echo ""

# Determine source directories to search
SEARCH_DIRS=()
if [ -d "src" ]; then
    SEARCH_DIRS+=("src")
fi
if [ -d "lib" ]; then
    SEARCH_DIRS+=("lib")
fi
if [ -d "packages" ]; then
    SEARCH_DIRS+=("packages")
fi
if [ -d "apps" ]; then
    SEARCH_DIRS+=("apps")
fi
# Add current directory if no standard dirs found
if [ ${#SEARCH_DIRS[@]} -eq 0 ]; then
    SEARCH_DIRS+=(".")
fi

echo -e "${BLUE}Searching in directories: ${SEARCH_DIRS[*]}${NC}"
echo ""

# Counter for total findings
TOTAL_COUNT=0

# Search for explicit :any type annotations
echo -e "${YELLOW}=== Explicit :any type annotations ===${NC}"
ANY_TYPES=""
for dir in "${SEARCH_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        RESULTS=$(grep -rn ": any" "$dir" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "eslint-disable" | grep -v "@ts-ignore" | grep -v "node_modules" || true)
        if [ -n "$RESULTS" ]; then
            ANY_TYPES="$ANY_TYPES$RESULTS"$'\n'
        fi
    fi
done

if [ -n "$ANY_TYPES" ]; then
    echo "$ANY_TYPES"
    COUNT=$(echo "$ANY_TYPES" | grep -c . || echo 0)
    TOTAL_COUNT=$((TOTAL_COUNT + COUNT))
    echo -e "${RED}Found $COUNT explicit :any type annotations${NC}"
else
    echo -e "${GREEN}No explicit :any type annotations found${NC}"
fi

echo ""

# Search for any[] array types
echo -e "${YELLOW}=== any[] array type annotations ===${NC}"
ANY_ARRAYS=""
for dir in "${SEARCH_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        RESULTS=$(grep -rn ": any\[\]" "$dir" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "eslint-disable" | grep -v "@ts-ignore" | grep -v "node_modules" || true)
        if [ -n "$RESULTS" ]; then
            ANY_ARRAYS="$ANY_ARRAYS$RESULTS"$'\n'
        fi
    fi
done

if [ -n "$ANY_ARRAYS" ]; then
    echo "$ANY_ARRAYS"
    COUNT=$(echo "$ANY_ARRAYS" | grep -c . || echo 0)
    TOTAL_COUNT=$((TOTAL_COUNT + COUNT))
    echo -e "${RED}Found $COUNT any[] array type annotations${NC}"
else
    echo -e "${GREEN}No any[] array type annotations found${NC}"
fi

echo ""

# Search for Function type (which is essentially any function)
echo -e "${YELLOW}=== Function type usage (prefer specific function signatures) ===${NC}"
FUNCTION_TYPES=""
for dir in "${SEARCH_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        RESULTS=$(grep -rn ": Function" "$dir" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "eslint-disable" | grep -v "@ts-ignore" | grep -v "node_modules" || true)
        if [ -n "$RESULTS" ]; then
            FUNCTION_TYPES="$FUNCTION_TYPES$RESULTS"$'\n'
        fi
    fi
done

if [ -n "$FUNCTION_TYPES" ]; then
    echo "$FUNCTION_TYPES"
    COUNT=$(echo "$FUNCTION_TYPES" | grep -c . || echo 0)
    TOTAL_COUNT=$((TOTAL_COUNT + COUNT))
    echo -e "${RED}Found $COUNT Function type annotations${NC}"
else
    echo -e "${GREEN}No Function type annotations found${NC}"
fi

echo ""

# Search for as any type assertions
echo -e "${YELLOW}=== 'as any' type assertions ===${NC}"
AS_ANY=""
for dir in "${SEARCH_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        RESULTS=$(grep -rn " as any" "$dir" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "eslint-disable" | grep -v "@ts-ignore" | grep -v "node_modules" || true)
        if [ -n "$RESULTS" ]; then
            AS_ANY="$AS_ANY$RESULTS"$'\n'
        fi
    fi
done

if [ -n "$AS_ANY" ]; then
    echo "$AS_ANY"
    COUNT=$(echo "$AS_ANY" | grep -c . || echo 0)
    TOTAL_COUNT=$((TOTAL_COUNT + COUNT))
    echo -e "${RED}Found $COUNT 'as any' type assertions${NC}"
else
    echo -e "${GREEN}No 'as any' type assertions found${NC}"
fi

echo ""

# Search for Record<string, any>
echo -e "${YELLOW}=== Record<string, any> usage ===${NC}"
RECORD_ANY=""
for dir in "${SEARCH_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        RESULTS=$(grep -rn "Record<[^,]*, *any>" "$dir" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "eslint-disable" | grep -v "@ts-ignore" | grep -v "node_modules" || true)
        if [ -n "$RESULTS" ]; then
            RECORD_ANY="$RECORD_ANY$RESULTS"$'\n'
        fi
    fi
done

if [ -n "$RECORD_ANY" ]; then
    echo "$RECORD_ANY"
    COUNT=$(echo "$RECORD_ANY" | grep -c . || echo 0)
    TOTAL_COUNT=$((TOTAL_COUNT + COUNT))
    echo -e "${RED}Found $COUNT Record<string, any> type annotations${NC}"
else
    echo -e "${GREEN}No Record<string, any> type annotations found${NC}"
fi

echo ""

# Generate summary report
echo -e "${BLUE}=== Summary Report ===${NC}"
echo -e "Total 'any' type usage found: ${TOTAL_COUNT}"

if [ $TOTAL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✅ Excellent! No 'any' types found in the codebase.${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Found $TOTAL_COUNT instances of 'any' type usage.${NC}"
    echo ""
    echo -e "${BLUE}Recommendations:${NC}"
    echo "1. Replace :any with specific types or interfaces"
    echo "2. Use unknown type instead of any when type is truly unknown"
    echo "3. Use generics for flexible but type-safe code"
    echo "4. Create proper interfaces for complex objects"
    echo "5. Use union types for values with multiple possible types"
    
    # Generate a file count report
    echo ""
    echo -e "${BLUE}Files with 'any' usage:${NC}"
    (
        [ -n "$ANY_TYPES" ] && echo "$ANY_TYPES" | grep -v '^$' | cut -d: -f1
        [ -n "$ANY_ARRAYS" ] && echo "$ANY_ARRAYS" | grep -v '^$' | cut -d: -f1
        [ -n "$FUNCTION_TYPES" ] && echo "$FUNCTION_TYPES" | grep -v '^$' | cut -d: -f1
        [ -n "$AS_ANY" ] && echo "$AS_ANY" | grep -v '^$' | cut -d: -f1
        [ -n "$RECORD_ANY" ] && echo "$RECORD_ANY" | grep -v '^$' | cut -d: -f1
    ) | sort | uniq -c | sort -nr | head -20
    
    exit 1
fi