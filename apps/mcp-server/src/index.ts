#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { getClientOverview, getClientOverviewSchema } from "./tools/get-client-overview.js";
import { getCampaignPerformance, getCampaignPerformanceSchema } from "./tools/get-campaign-performance.js";
import { getKillQueue } from "./tools/get-kill-queue.js";
import { getMissions, getMissionsSchema } from "./tools/get-missions.js";
import { getSopBottlenecks } from "./tools/get-sop-bottlenecks.js";

const server = new McpServer({
  name: "dashboard-lior",
  version: "0.1.0",
});

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

server.tool(
  "get_client_overview",
  "Client profile, baseline snapshot, SOP gate statuses, and current (last 30 days) computed metrics for one client.",
  getClientOverviewSchema,
  async (args) => jsonResult(await getClientOverview(args))
);

server.tool(
  "get_campaign_performance",
  "Campaign -> ad set -> ad drill-down with spend/leads/CPL for one client over a date range (defaults to the last 30 days).",
  getCampaignPerformanceSchema,
  async (args) => jsonResult(await getCampaignPerformance(args))
);

server.tool(
  "get_kill_queue",
  "All ads currently marked KILL and pending manual approval, across every client. (Transient SUSPECT verdicts live only in the per-client analyzer report in the web app.)",
  {},
  async () => jsonResult(await getKillQueue())
);

server.tool(
  "get_missions",
  "Missions across clients, optionally filtered to one client_id and/or overdue-only.",
  getMissionsSchema,
  async (args) => jsonResult(await getMissions(args))
);

server.tool(
  "get_sop_bottlenecks",
  "Which clients are stuck at which SOP gate, and for how many days — same source as the dashboard's bottleneck widget.",
  {},
  async () => jsonResult(await getSopBottlenecks())
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("dashboard-lior MCP server failed to start:", err);
  process.exit(1);
});
