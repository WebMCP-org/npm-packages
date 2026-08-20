---
'@mcp-b/global': major
---

Require `allowedOrigins` when you configure a transport. `TransportConfiguration`
wrapped both transport option types in `Partial<>`, which made the required
`allowedOrigins` omissible; `initializeWebModelContext` then filled it with
`['*']`. Configuring a transport at all — to set `channelId`, say — silently
disabled origin validation, the one thing the option exists to enforce.

Zero-configuration is unchanged: `initializeWebModelContext()` with no
`transport` still defaults to `['*']`. Only an explicit partial object breaks,
and it breaks at compile time with the origins named:

```ts
initializeWebModelContext({
  transport: { tabServer: { allowedOrigins: ['https://app.example.com'] } },
});
```
