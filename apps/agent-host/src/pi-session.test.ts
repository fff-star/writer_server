import { describe, expect, it } from "vitest";
import { createIsolatedPiSession } from "./pi-session.js";

describe("createIsolatedPiSession", () => {
  it("creates a session without exposing tools", async () => {
    const { session } = await createIsolatedPiSession();
    try {
      expect(session.getActiveToolNames()).toEqual([]);
    } finally {
      session.dispose();
    }
  });
});
