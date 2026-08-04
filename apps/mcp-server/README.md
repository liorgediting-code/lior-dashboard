# dashboard-lior MCP server

Read-only MCP server wrapping the same local Supabase instance the web app
uses. Every tool only ever `.select()`s — nothing here can write.

## Tools

- `get_client_overview(client_id)`
- `get_campaign_performance(client_id, since?, until?)`
- `get_kill_queue()`
- `get_missions(client_id?, overdue_only?)`
- `get_sop_bottlenecks()`

## Setup

1. `supabase start` (from the repo root) to get a local Supabase instance running.
2. Copy the `API URL` and `service_role key` it prints out.
3. `npm run build --workspace=apps/mcp-server`
4. Register it with Claude Code:

```bash
claude mcp add dashboard-lior \
  --env NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
  --env SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start> \
  -- node apps/mcp-server/dist/index.js
```

Then, in a Claude Code session: "show me every client stuck at Gate 2 for more than 3 days" will call `get_sop_bottlenecks` directly against the database.
