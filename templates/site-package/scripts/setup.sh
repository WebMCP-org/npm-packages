#!/bin/bash
#
# Setup script for {{Site}} MCP tools
#
# This script initializes the tools directory and installs dependencies.
#
# Usage:
#   ./scripts/setup.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Setting up {{Site}} MCP tools..."

# Navigate to tools directory
cd "$PROJECT_DIR/tools"

# Install dependencies
echo "Installing dependencies..."
npm install

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Navigate to {{site_url}} in Chrome"
echo "  2. Run: inject_webmcp_script({ file_path: \"$PROJECT_DIR/tools/src/{{site}}.ts\" })"
echo "  3. Use: diff_webmcp_tools() to verify tools are available"
echo ""
