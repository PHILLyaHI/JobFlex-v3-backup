import { z } from "zod";

export const proposalAcceptanceSchema = z.object({
  name: z.string().trim().min(1, "Enter your full name to accept the proposal.").max(120, "Use 120 characters or fewer.").regex(/\p{L}/u, "Enter your name, including at least one letter."),
});
