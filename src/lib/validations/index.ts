// Zod validation schemas live here.
import { z } from "zod";

export const exampleSchema = z.object({
  name: z.string().min(1),
});

export type Example = z.infer<typeof exampleSchema>;

/** Email entered on the sign-in form. Normalized to lowercase. */
export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export type SignInInput = z.infer<typeof signInSchema>;
