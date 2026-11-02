// Zod validation schemas live here.
import { z } from "zod";

export const exampleSchema = z.object({
  name: z.string().min(1),
});

export type Example = z.infer<typeof exampleSchema>;
