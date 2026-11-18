import { handler, json } from "@/lib/http";

export const GET = handler({ allowMustChange: true }, async (_req, { user }) =>
  json({ ok: true, user: { id: user.id, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword } }),
);
