# Summary

<!-- What changed, and why? -->

## Compatibility and Safety

- [ ] Human approval before CX2 dispatch remains mandatory.
- [ ] CX2 approval requests remain routed to CX1/Human.
- [ ] Full task logs remain retained.
- [ ] Public MCP tool names, task statuses, and result shapes remain compatible, or the breaking change is explicitly documented.

## Validation

<!-- Paste commands and results. -->

```sh
node --check mcp/cx2-controller/src/server.mjs
node mcp/cx2-controller/test/smoke.mjs
node mcp/cx2-controller/test/wait.mjs
node mcp/cx2-controller/test/model-settings.mjs
```

## Risks or Unverified Paths

<!-- Note any runtime paths, host behavior, or manual checks that were not verified. -->
