---
"@mcp-b/react-webmcp": patch
"usewebmcp": patch
---

Broaden React peer dependency to support React 17, 18, and 19

Changed peer dependencies from `^19.1.0` to `^17.0.0 || ^18.0.0 || ^19.0.0` to allow usage in projects with older React versions. The hooks only use React 16.8+ compatible features (useState, useEffect, useCallback, useMemo, useRef, useContext), so this is a safe expansion of compatibility.
