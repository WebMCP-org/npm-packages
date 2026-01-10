# {{Site}} Workflows

Common workflows for {{Site}} automation.

## Workflow 1: Basic Page Inspection

Get information about the current page state.

```javascript
// 1. Navigate to the target page
navigate_page({ url: "{{site_url}}" })

// 2. Take a snapshot to understand the page structure
take_snapshot()

// 3. Get page info using the registered tool
webmcp_{{site}}_page0_get_page_info()
```

---

## Workflow 2: Search and Filter

Find specific items on the page.

```javascript
// 1. Ensure you're on the right page
navigate_page({ url: "{{site_url}}/search" })

// 2. Search for items
const results = webmcp_{{site}}_page0_search_items({
  query: "example",
  limit: 10
})

// 3. Process the results
// The results contain the matching items
```

---

## Workflow 3: Interactive Actions

Perform actions on the page.

```javascript
// 1. Navigate to the form/action page
navigate_page({ url: "{{site_url}}/action" })

// 2. Take a snapshot to verify the page loaded
take_snapshot()

// 3. Perform the action
webmcp_{{site}}_page0_click_button({ label: "Submit" })

// 4. Verify the result
take_snapshot()  // Check if action succeeded
```

---

## Multi-Step Workflows

### Example: Complete a Multi-Page Process

```javascript
// Step 1: Start on the initial page
navigate_page({ url: "{{site_url}}/start" })
take_snapshot()

// Step 2: Perform first action
webmcp_{{site}}_page0_click_button({ label: "Begin" })

// Step 3: Wait for navigation and reinject tools
// (Tools are lost after navigation)
inject_webmcp_script({ file_path: "./tools/src/{{site}}.ts" })

// Step 4: Continue with next step
take_snapshot()
webmcp_{{site}}_page0_another_action({ param: "value" })
```

---

## Error Recovery

If something goes wrong:

```javascript
// 1. Check console for errors
list_console_messages()

// 2. Take a snapshot to see current state
take_snapshot()

// 3. If tools disappeared, reinject
inject_webmcp_script({ file_path: "./tools/src/{{site}}.ts" })

// 4. Verify tools are back
diff_webmcp_tools()
```

---

## Tips for Success

1. **Always reinject after navigation** - Tools are cleared when the page changes
2. **Use snapshots liberally** - Understanding page state is crucial
3. **Check console for errors** - Many issues are visible in console messages
4. **Wait for loading** - Dynamic content may need time to appear
5. **Handle authentication** - Log in manually before running automation
