# {{Site}} MCP API Reference

Detailed documentation for each tool in this package.

## Tools

### get_page_info

Get basic information about the current {{Site}} page.

**Category**: read-only

**Parameters**: None

**Returns**:
```json
{
  "title": "Page Title",
  "url": "https://{{site_url}}/path"
}
```

**Example**:
```javascript
webmcp_{{site}}_page0_get_page_info()
```

---

### search_items

Search for items on the page.

**Category**: read-only

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| query | string | Yes | Search query |
| limit | number | No | Maximum results (default: 10) |

**Returns**:
```json
{
  "query": "search term",
  "results": [
    { "title": "Result 1", "url": "..." },
    { "title": "Result 2", "url": "..." }
  ]
}
```

**Example**:
```javascript
webmcp_{{site}}_page0_search_items({ query: "example", limit: 5 })
```

---

### click_button

Click a button on the page by its label.

**Category**: read-write

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| label | string | Yes | Button label text |

**Returns**: Confirmation message

**Example**:
```javascript
webmcp_{{site}}_page0_click_button({ label: "Submit" })
```

---

## Error Handling

All tools return an error response when something goes wrong:

```json
{
  "content": [{ "type": "text", "text": "Error message" }],
  "isError": true
}
```

Common errors:
- **Element not found**: The selector couldn't find the target element
- **Action failed**: The action (click, type, etc.) couldn't be completed
- **Timeout**: Element didn't appear within the timeout period

## Best Practices

1. **Always check tool results** - Don't assume success
2. **Use take_snapshot first** - Understand page structure before calling tools
3. **Handle navigation** - Tools are lost after page navigation, reinject if needed
4. **Wait for loading** - Some pages have dynamic content that loads asynchronously
