#!/bin/bash
# Deploy script that loads production variables from .prod.vars

# Load production variables
if [ -f .prod.vars ]; then
  export $(cat .prod.vars | grep -v '^#' | xargs)
fi

# Run build
pnpm run build

# Deploy with wrangler, passing vars from environment
wrangler deploy --var APP_URL:$APP_URL
