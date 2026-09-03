// Session revocation. JWTs are stateless for their 7-day life; requireUser()
// compares the token's credentialVersion with the row on every request, so
// bumping the column is "sign out everywhere" (password reset does the same).
import { db } from "@/lib/db";

export async function signOutEverywhereFor(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { credentialVersion: { increment: 1 } },
  });
}
