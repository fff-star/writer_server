import { createIsolatedPiSession } from "./pi-session.js";

const runSmoke = async (): Promise<void> => {
  const { session } = await createIsolatedPiSession();
  try {
    const tools = session.getActiveToolNames();
    if (tools.length !== 0) {
      throw new Error(`Expected an isolated session without tools, received: ${tools.join(", ")}`);
    }
    process.stdout.write(`${JSON.stringify({ ok: true, tools })}\n`);
  } finally {
    session.dispose();
  }
};

if (process.argv.includes("--smoke")) {
  await runSmoke();
} else {
  process.send?.({ type: "ready", capabilities: [] });
  process.on("message", (message) => {
    if (message === "shutdown") {
      process.exit(0);
    }
  });
}
