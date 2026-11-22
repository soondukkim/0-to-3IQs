import { openMcpSession, type FabricSession } from './fabricClient.js'

/** Opens the work MCP server (Lab 05) as the signed-in user. */
export function openWorkSession(getToken: () => Promise<string>): Promise<FabricSession> {
  return openMcpSession({ endpoint: process.env.WORK_MCP_ENDPOINT!, getToken })
}

/** Presents the Fabric IQ tools and the work tools to the chat loop as one session. */
export function mergeSessions(fabric: FabricSession | null, work: FabricSession): FabricSession {
  if (!fabric) return work
  const workTools = new Set(work.tools.map(t => t.name))
  return {
    tools: [...fabric.tools, ...work.tools],
    callTool: (name, args) => (workTools.has(name) ? work : fabric).callTool(name, args),
    async close() {
      await Promise.all([fabric.close(), work.close()])
    },
  }
}
