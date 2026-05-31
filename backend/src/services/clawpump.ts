export function clawPumpStatus() {
  const apiUrl = process.env.CLAWPUMP_API_URL || "";
  const apiKey = process.env.CLAWPUMP_API_KEY || "";
  const agentId = process.env.CLAWPUMP_LAZARUS_AGENT_ID || "";
  return {
    configured: Boolean(apiUrl && apiKey && agentId),
    apiUrl: apiUrl || null,
    agentId: agentId || null,
    lastSync: null,
    message: apiUrl && apiKey && agentId ? "ClawPump credentials are configured." : "ClawPump integration is not configured yet.",
  };
}

export async function testClawPumpConnection() {
  const status = clawPumpStatus();
  if (!status.configured) return status;
  try {
    const response = await fetch(`${status.apiUrl}/agents/${status.agentId}`, {
      headers: { Authorization: `Bearer ${process.env.CLAWPUMP_API_KEY}` },
    });
    return {
      ...status,
      ok: response.ok,
      message: response.ok ? "ClawPump responded successfully." : `ClawPump responded with ${response.status}.`,
    };
  } catch (error) {
    return {
      ...status,
      ok: false,
      message: error instanceof Error ? error.message : "ClawPump connection failed.",
    };
  }
}
