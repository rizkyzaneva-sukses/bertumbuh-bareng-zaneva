import { z } from "zod";
import { handler, json } from "@/lib/http";
import { getLoanWorkingDays, setLoanWorkingDays } from "@/lib/settings";
import { LOAN_DAYS_MAX, LOAN_DAYS_MIN, LOAN_WORKING_DAYS_DEFAULT } from "@/lib/loan-rules";

export const dynamic = "force-dynamic";

/** Lama pinjam yang berlaku sekarang — dibaca semua anggota, diubah admin. */
export const GET = handler({}, async () => {
  return json({
    ok: true,
    hari: await getLoanWorkingDays(),
    default: LOAN_WORKING_DAYS_DEFAULT,
    min: LOAN_DAYS_MIN,
    max: LOAN_DAYS_MAX,
  });
});

const Body = z.object({ hari: z.number().int().min(LOAN_DAYS_MIN).max(LOAN_DAYS_MAX) });

/**
 * Ubah lama pinjam. Khusus admin.
 *
 * Sengaja TIDAK mengubah jatuh tempo pinjaman yang sedang berjalan — buku yang
 * sudah di tangan tetap pakai tanggal yang sudah dijanjikan ke peminjam.
 * Perubahan hanya berlaku untuk peminjaman & perpanjangan berikutnya.
 */
export const POST = handler({ admin: true }, async (req) => {
  const { hari } = Body.parse(await req.json());
  const tersimpan = await setLoanWorkingDays(hari);
  return json({ ok: true, hari: tersimpan });
});
