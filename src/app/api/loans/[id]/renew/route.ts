import { z } from "zod";
import { handler, json } from "@/lib/http";
import { renewLoan } from "@/lib/reading";
import { formatTanggalPendek } from "@/lib/dates";

const Body = z.object({}).optional();

/**
 * Perpanjang pinjaman tanpa harus mengembalikan buku dulu.
 * Aturan lengkap ada di `renewLoan()`: batas 2×, dan ditolak kalau ada antrean.
 */
export const POST = handler<{ id: string }>({}, async (req, { user, params }) => {
  Body.parse(await req.json().catch(() => undefined));
  const r = await renewLoan(params.id, user.id);
  return json({
    ok: true,
    oldDueKey: r.oldDue,
    dueKey: r.newDue,
    dueLabel: formatTanggalPendek(r.newDue),
    renewCount: r.loan.renewCount,
    renewLeft: r.remaining,
  });
});
