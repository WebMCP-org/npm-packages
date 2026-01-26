#!/bin/bash
# Publish packages in dependency order
# This ensures each package can resolve its dependencies from npm

set -e

echo "========================================"
echo "WebMCP Ordered Package Publisher"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to publish a package
publish_package() {
    local pkg_dir=$1
    local pkg_name=$2
    local pkg_version=$3

    echo -e "${YELLOW}Publishing ${pkg_name}@${pkg_version}...${NC}"

    cd "$pkg_dir"

    # Check if already published
    if npm view "${pkg_name}@${pkg_version}" version 2>/dev/null; then
        echo -e "${GREEN}${pkg_name}@${pkg_version} already published, skipping${NC}"
        cd - > /dev/null
        return 0
    fi

    # Publish with explicit latest tag (needed because npm remembers unpublished 2.0.x)
    if pnpm publish --access public --no-git-checks --tag latest; then
        echo -e "${GREEN}✓ Published ${pkg_name}@${pkg_version}${NC}"
    else
        echo -e "${RED}✗ Failed to publish ${pkg_name}${NC}"
        cd - > /dev/null
        return 1
    fi

    cd - > /dev/null

    # Wait for npm registry to update
    echo "Waiting 5 seconds for npm registry to update..."
    sleep 5
}

# Get the root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Root directory: $ROOT_DIR"
echo ""

# Step 1: Build all packages first
echo "========================================"
echo "Step 1: Building all packages"
echo "========================================"
pnpm build

echo ""
echo "========================================"
echo "Step 2: Publishing in dependency order"
echo "========================================"
echo ""

# Layer 0: No internal dependencies
echo "--- Layer 0: No internal dependencies ---"
publish_package "packages/smart-dom-reader" "@mcp-b/smart-dom-reader" "1.1.1"
publish_package "packages/webmcp-ts-sdk" "@mcp-b/webmcp-ts-sdk" "1.2.0"
publish_package "packages/chrome-devtools-mcp" "@mcp-b/chrome-devtools-mcp" "1.7.0"

# Layer 1: Depends on Layer 0
echo ""
echo "--- Layer 1: Depends on Layer 0 ---"
publish_package "packages/transports" "@mcp-b/transports" "1.3.0"
publish_package "packages/extension-tools" "@mcp-b/extension-tools" "0.3.1"

# Layer 2: Depends on Layer 1
echo ""
echo "--- Layer 2: Depends on Layer 1 ---"
publish_package "packages/global" "@mcp-b/global" "1.3.0"
publish_package "packages/mcp-iframe" "@mcp-b/mcp-iframe" "0.1.0"

# Layer 3: Depends on Layer 2
echo ""
echo "--- Layer 3: Depends on Layer 2 ---"
publish_package "packages/react-webmcp" "@mcp-b/react-webmcp" "1.1.0"

# Layer 4: Depends on Layer 3
echo ""
echo "--- Layer 4: Depends on Layer 3 ---"
publish_package "packages/usewebmcp" "usewebmcp" "0.1.0"

echo ""
echo "========================================"
echo -e "${GREEN}All packages published successfully!${NC}"
echo "========================================"
echo ""
echo "New versions:"
echo "  @mcp-b/smart-dom-reader@1.1.1"
echo "  @mcp-b/webmcp-ts-sdk@1.2.0"
echo "  @mcp-b/chrome-devtools-mcp@1.7.0"
echo "  @mcp-b/transports@1.3.0"
echo "  @mcp-b/extension-tools@0.3.1"
echo "  @mcp-b/global@1.3.0"
echo "  @mcp-b/mcp-iframe@0.1.0"
echo "  @mcp-b/react-webmcp@1.1.0"
echo "  usewebmcp@0.1.0"
