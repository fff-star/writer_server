import { z } from "zod";

export const appInfoSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  platform: z.enum(["linux", "win32", "darwin"]),
  stage: z.literal("foundation"),
});

export type AppInfo = z.infer<typeof appInfoSchema>;
