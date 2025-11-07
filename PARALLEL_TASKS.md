# Parallel Tasks for Web Standards Showcase

This document contains independent tasks that can be delegated to parallel agents. Each task is self-contained and can be worked on simultaneously.

## Feature Work

### Task 1: Iframe Context Propagation Showcase

**Priority:** High
**Estimated Complexity:** Medium
**File Location:** `e2e/web-standards-showcase/`

**Description:**
Add a demonstration of how the native Web Model Context API propagates across iframe boundaries. This should showcase the "two-bucket" architecture working with cross-origin and same-origin iframes.

**Requirements:**
- Create an iframe sandbox section in the UI (below the existing tool executor)
- Add controls to:
  - Load different test pages in the iframe (same-origin and cross-origin scenarios)
  - Register tools in the parent context
  - Register tools in the iframe context
  - Test tool availability across boundaries
- Display visual indicators showing:
  - Which tools are available in parent vs iframe
  - Context propagation success/failure
  - Bucket A vs Bucket B behavior differences
- Add event logging for iframe context events

**Acceptance Criteria:**
- [ ] Iframe section with controls is visible in the UI
- [ ] Can register tools in both parent and iframe contexts
- [ ] Visual diff shows tool availability in each context
- [ ] Event log captures cross-frame events
- [ ] Works with native API (no polyfill)
- [ ] Tailwind styling matches existing design
- [ ] No emojis in UI or code

**Reference Files:**
- `src/main.ts` - Main application logic
- `src/ui/toolDisplay.ts` - Tool visualization
- `src/ui/eventLog.ts` - Event logging

---

### Task 2: Tool Schema Validation & Visualization

**Priority:** Medium
**Estimated Complexity:** Low-Medium
**File Location:** `e2e/web-standards-showcase/`

**Description:**
Add JSON schema validation and visualization for tool definitions. Show users proper tool structure and validate their custom tool definitions before registration.

**Requirements:**
- Create a schema validator that checks tool definitions against MCP spec
- Add a "Validate Tool" button in the tool registration section
- Display validation errors with helpful messages
- Add a collapsible "Tool Schema Reference" panel showing:
  - Required fields (name, description)
  - Optional fields (inputSchema, etc.)
  - Example valid tools
- Highlight invalid JSON syntax in the tool input area

**Acceptance Criteria:**
- [ ] Schema validation function implemented
- [ ] Validation errors display clearly with line numbers
- [ ] Schema reference panel is accessible and helpful
- [ ] Visual feedback for valid/invalid tool definitions
- [ ] Examples match MCP specification
- [ ] Tailwind styling consistent with app

**Reference Files:**
- `src/templates/toolTemplates.ts` - Example tool definitions
- `src/main.ts` - Tool registration logic

---

### Task 3: Performance Metrics Dashboard

**Priority:** Low
**Estimated Complexity:** Medium
**File Location:** `e2e/web-standards-showcase/`

**Description:**
Add a performance metrics section that tracks and visualizes API call performance, memory usage, and tool execution timing.

**Requirements:**
- Create a metrics collection system that tracks:
  - API call latency (registerTool, provideContext, etc.)
  - Number of tools registered in each bucket
  - Tool execution time (if/when tool invocation is added)
  - Memory usage estimates
- Add a collapsible metrics panel showing:
  - Real-time metrics table
  - Simple charts (using CSS, no chart libraries)
  - Historical data (last 50 operations)
- Export metrics as JSON for analysis

**Acceptance Criteria:**
- [ ] Metrics collection integrated into existing API calls
- [ ] Metrics panel displays real-time data
- [ ] Performance data is accurate
- [ ] Export functionality works
- [ ] Minimal performance overhead
- [ ] Clean Tailwind-based visualization

**Reference Files:**
- `src/main.ts` - API interaction points
- `src/ui/eventLog.ts` - Similar UI component for reference

---

## Cleanup & Refactoring Tasks

### Task 4: Extract UI Components into Modules

**Priority:** Medium
**Estimated Complexity:** Low
**File Location:** `e2e/web-standards-showcase/src/ui/`

**Description:**
Refactor the monolithic `main.ts` file by extracting UI initialization and event handler logic into separate, testable modules.

**Requirements:**
- Create new UI component modules:
  - `src/ui/apiTester.ts` - API testing panel logic
  - `src/ui/toolExecutor.ts` - Tool execution logic
  - `src/ui/codeEditor.ts` - Live code editor logic
  - `src/ui/banner.ts` - Detection banner management
- Each module should export a class or factory function
- Update `main.ts` to use the new modules
- Maintain all existing functionality
- Improve type safety with proper interfaces

**Acceptance Criteria:**
- [ ] New modules created with clear responsibilities
- [ ] `main.ts` reduced by at least 60%
- [ ] All existing functionality works identically
- [ ] TypeScript types are properly defined
- [ ] No circular dependencies
- [ ] Code is more testable

**Reference Files:**
- `src/main.ts` - Current monolithic file (lines 50-200+)
- `src/ui/toolDisplay.ts` - Example of good module structure
- `src/ui/eventLog.ts` - Example of good module structure

---

### Task 5: Add Comprehensive Error Handling

**Priority:** High
**Estimated Complexity:** Low-Medium
**File Location:** `e2e/web-standards-showcase/src/`

**Description:**
Improve error handling throughout the application with user-friendly error messages and recovery mechanisms.

**Requirements:**
- Wrap all API calls in try-catch blocks
- Create an error handler utility that:
  - Categorizes errors (API error, validation error, network error, etc.)
  - Provides user-friendly error messages
  - Logs technical details to console
  - Suggests recovery actions
- Add error boundaries for async operations
- Display errors in the event log with clear formatting
- Add a "Copy Error Report" button for bug reporting

**Acceptance Criteria:**
- [ ] No uncaught exceptions in console
- [ ] All errors display user-friendly messages
- [ ] Error categories are accurate
- [ ] Recovery suggestions are helpful
- [ ] Error reports contain useful debugging info
- [ ] Event log shows errors with proper styling

**Reference Files:**
- `src/main.ts` - Multiple API call sites
- `src/api/detection.ts` - Error handling example
- `src/ui/eventLog.ts` - Error display

---

### Task 6: Improve TypeScript Type Safety

**Priority:** Medium
**Estimated Complexity:** Low
**File Location:** `e2e/web-standards-showcase/src/`

**Description:**
Strengthen type definitions throughout the codebase, eliminating `any` types and adding proper interfaces for all data structures.

**Requirements:**
- Create `src/types/` directory with proper type definitions:
  - `api.ts` - Types for native API (ModelContext, Tool, etc.)
  - `ui.ts` - Types for UI state and events
  - `templates.ts` - Types for tool templates
- Replace all `any` types with proper types
- Add JSDoc comments for public APIs
- Enable stricter TypeScript options in tsconfig if possible
- Add type guards for runtime validation

**Acceptance Criteria:**
- [ ] No `any` types in src/ (except for eval in controlled contexts)
- [ ] All interfaces properly documented
- [ ] Type guards implemented where needed
- [ ] Typecheck passes with no errors
- [ ] Code is more maintainable

**Reference Files:**
- `src/main.ts` - Multiple type improvement opportunities
- `src/templates/toolTemplates.ts` - Needs interface definitions

---

## Documentation Tasks

### Task 7: Create Comprehensive README

**Priority:** High
**Estimated Complexity:** Low
**File Location:** `e2e/web-standards-showcase/README.md`

**Description:**
Write a comprehensive README for the web-standards-showcase app with setup instructions, usage guide, and architecture overview.

**Requirements:**
- Document sections:
  - Overview and purpose
  - Prerequisites (Chromium with flags)
  - Setup and installation
  - Running locally (`pnpm dev`)
  - Deploying to Cloudflare Workers
  - Architecture overview
  - Native API detection logic
  - Two-bucket system explanation
  - Browser compatibility
  - Troubleshooting guide
- Include command examples and expected output
- Add screenshots or ASCII diagrams where helpful
- Link to official Chromium documentation

**Acceptance Criteria:**
- [ ] README is comprehensive and clear
- [ ] All commands are accurate and tested
- [ ] Architecture section explains key concepts
- [ ] Troubleshooting covers common issues
- [ ] Links are valid and relevant
- [ ] Follows markdown best practices

**Reference Files:**
- `index.html` - UI structure to document
- `src/api/detection.ts` - Detection logic to explain
- `../chat-ui/README.md` - Reference for structure

---

### Task 8: Add Inline Code Documentation

**Priority:** Low
**Estimated Complexity:** Low
**File Location:** `e2e/web-standards-showcase/src/`

**Description:**
Add comprehensive JSDoc comments and inline documentation throughout the codebase to improve maintainability.

**Requirements:**
- Add JSDoc comments to:
  - All exported functions and classes
  - Complex algorithms (especially in detection.ts)
  - Public APIs and interfaces
  - Event handlers with non-obvious behavior
- Document:
  - Function purpose and behavior
  - Parameter types and constraints
  - Return values
  - Possible exceptions
  - Usage examples for complex functions
- Keep comments concise and up-to-date

**Acceptance Criteria:**
- [ ] All public APIs documented
- [ ] Complex logic has explanatory comments
- [ ] JSDoc syntax is correct
- [ ] Comments add value (not just restating code)
- [ ] Examples are accurate and helpful

**Reference Files:**
- `src/api/detection.ts` - Needs detailed documentation
- `src/main.ts` - Many undocumented functions
- `src/ui/*.ts` - Classes need JSDoc

---

## Testing Tasks

### Task 9: Expand E2E Test Coverage

**Priority:** High
**Estimated Complexity:** Medium
**File Location:** `e2e/tests/native-showcase.spec.ts`

**Description:**
Expand the existing Playwright test suite to cover all major features of the web-standards-showcase app.

**Requirements:**
- Add test cases for:
  - Two-bucket system (provideContext vs registerTool)
  - Tool replacement behavior (Bucket A)
  - Tool persistence behavior (Bucket B)
  - Tool unregistration (Bucket B only)
  - Context clearing (Bucket A only)
  - Live code editor functionality
  - Tool template selection
  - Event logging
  - Error scenarios (invalid tools, API failures)
- Use proper Playwright best practices
- Add helpful test descriptions and comments
- Ensure tests are deterministic and reliable

**Acceptance Criteria:**
- [ ] Test coverage increased to 80%+ of features
- [ ] All tests pass reliably
- [ ] Tests run in under 2 minutes
- [ ] Test descriptions are clear
- [ ] Proper assertions and error messages
- [ ] No flaky tests

**Reference Files:**
- `e2e/tests/native-showcase.spec.ts` - Current test file
- `e2e/playwright-native-showcase.config.ts` - Test configuration

---

### Task 10: Add Visual Regression Testing

**Priority:** Low
**Estimated Complexity:** Medium
**File Location:** `e2e/tests/`

**Description:**
Set up visual regression testing to catch unintended UI changes and ensure consistent styling across updates.

**Requirements:**
- Configure Playwright visual comparisons
- Create baseline screenshots for:
  - Initial load state
  - Detection success banner
  - Detection failure banner
  - Tool registry display (empty and populated)
  - Event log display
  - Each major UI panel
- Add visual comparison tests
- Document how to update baselines
- Configure reasonable diff thresholds

**Acceptance Criteria:**
- [ ] Visual tests configured and working
- [ ] Baseline screenshots committed
- [ ] Tests detect obvious visual regressions
- [ ] Update process is documented
- [ ] Tests don't fail due to minor rendering differences
- [ ] CI-friendly configuration

**Reference Files:**
- `e2e/playwright-native-showcase.config.ts` - Configuration

---

## Task Priorities Summary

**High Priority (Do First):**
1. Task 1: Iframe Context Propagation Showcase
2. Task 5: Add Comprehensive Error Handling
3. Task 7: Create Comprehensive README
4. Task 9: Expand E2E Test Coverage

**Medium Priority:**
2. Task 2: Tool Schema Validation & Visualization
4. Task 4: Extract UI Components into Modules
6. Task 6: Improve TypeScript Type Safety

**Low Priority (Nice to Have):**
3. Task 3: Performance Metrics Dashboard
8. Task 8: Add Inline Code Documentation
10. Task 10: Add Visual Regression Testing

---

## Notes for Agents

- All changes must pass `pnpm check` (linter) and `pnpm typecheck`
- Use Tailwind CSS only - no custom CSS
- No emojis anywhere in code or UI
- Follow existing code patterns and conventions
- Test locally before committing
- Commit messages must follow format: `<type>(<scope>): <subject>`
- Valid scopes for this work: `e2e`, `web-standards-showcase`, `tests`, `docs`
