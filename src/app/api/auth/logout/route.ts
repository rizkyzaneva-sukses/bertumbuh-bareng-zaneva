import { getSession } from "@/lib/auth";
import { handler, json } from "@/lib/http";

export const POST = handler({ auth: false }, async () => {
  const s = await getSession();
  s.destroy();
  return json({ ok: true });
});
