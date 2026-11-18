import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runReminderJob } from "@/lib/reminders";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.nextUrl.searchParams.get("secret") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Dipanggil manual / cron eksternal. Tetap menghormati jendela 08.00-20.00 WIB dan anti-dobel. */
async function run(req: NextRequest) {
  if (!authorized(req)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  // ?ignoreWindow=1 = abaikan jendela jam kirim (uji manual). Tetap anti-dobel.
  const result = await runReminderJob({ ignoreWindow: req.nextUrl.searchParams.get("ignoreWindow") === "1" });
  return Response.json({ ok: true, result });
}
export const GET = run;
export const POST = run;
