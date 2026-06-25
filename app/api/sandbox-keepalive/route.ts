import { Sandbox } from "@vercel/sandbox";
import { NextRequest } from "next/server";

export const maxDuration = 10;

export async function POST(req: NextRequest) {
  const { sandboxId } = await req.json() as { sandboxId?: string };
  if (!sandboxId) return new Response("Missing sandboxId", { status: 400 });
  try {
    const sandbox = await Sandbox.get({ name: sandboxId });
    await sandbox.runCommand({ cmd: "true", args: [] });
  } catch {
    // Keepalive failure is non-critical — auth may be unavailable or sandbox may have expired.
    // noVNC's reconnect=true handles recovery if the sandbox stops.
  }
  return new Response("ok");
}
