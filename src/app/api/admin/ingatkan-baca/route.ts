import { getTodayReading } from "@/lib/reading";
import { wahaSendText } from "@/lib/waha";
import { handler, json, fail } from "@/lib/http";
import { formatTanggalPendek } from "@/lib/dates";

/**
 * Kirim pengingat WhatsApp ke SEMUA karyawan yang belum membaca hari ini.
 *
 * Bos: *"yg belum baca itu wajib list orangnya"* + *"bagus juga tuh kirim ke
 * waha saya"*. Endpoint ini hanya mengirim ke nama-nama yang statusnya BELUM —
 * yang sudah baca tidak dikirimi apa pun, supaya pesan ini benar-benar
 * pengingat dan bukan spam massal.
 *
 * Pengiriman diberi jeda acak antar pesan (pola sama dengan pengingat jatuh
 * tempo) supaya nomor WA tidak dicurigai sebagai bot. Kegagalan satu nomor
 * TIDAK menggagalkan yang lain — hasilnya dilaporkan per jumlah.
 */
export const POST = handler({ admin: true }, async () => {
  if (!process.env.WAHA_URL) {
    return fail("WAHA belum dikonfigurasi. Isi WAHA_URL di environment.", 503, "NO_WAHA");
  }

  const d = await getTodayReading();
  const belum = d.readers.filter((r) => r.status === "BELUM");
  if (belum.length === 0) {
    return json({ ok: true, terkirim: 0, gagal: 0, detail: "Semua karyawan sudah baca hari ini." });
  }

  const tanggal = formatTanggalPendek(d.dayKey);
  let terkirim = 0;
  const gagalNama: string[] = [];

  for (const r of belum) {
    const text =
      `Assalamualaikum ${r.name} 🌿\n\n` +
      `Catatan baca *${tanggal}* belum ada nih. Yuk sempatkan baca buku 10–15 menit hari ini, ` +
      `lalu tandai halaman terakhirnya di app Bertumbuh Bareng Zaneva.\n\n` +
      `Tidak harus banyak — yang penting jalan tiap hari. 📚`;
    try {
      await wahaSendText(r.phone, text);
      terkirim++;
    } catch (e) {
      gagalNama.push(r.name);
      console.error("[ingatkan-baca] gagal", r.phone, String((e as Error).message ?? e));
    }
    // Jeda acak 3–9 detik, sama seperti pengingat jatuh tempo.
    if (belum.indexOf(r) < belum.length - 1) {
      await new Promise((res) => setTimeout(res, 3000 + Math.random() * 6000));
    }
  }

  return json({
    ok: true,
    terkirim,
    gagal: gagalNama.length,
    detail: gagalNama.length > 0 ? `Gagal: ${gagalNama.join(", ")}` : undefined,
  });
});
