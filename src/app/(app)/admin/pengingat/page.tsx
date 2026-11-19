import { prisma } from "@/lib/db";
import { formatDateTimeWib } from "@/lib/dates";
import { SEND_FROM_HOUR, SEND_UNTIL_HOUR } from "@/lib/reminders";
import { displayPhone } from "@/lib/phone";

export const metadata = { title: "Admin · Pengingat WA" };

export default async function AdminPengingat() {
  const logs = await prisma.reminderLog.findMany({ include: { loan: { include: { user: true, book: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
  const wahaOk = !!process.env.WAHA_URL;
  return (
    <>
      <div className="card">
        <h2>Cara kerja</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }} className="small">
          <li>Pengingat pertama dikirim di hari jatuh tempo (sekitar {String(SEND_FROM_HOUR).padStart(2, "0")}.00 WIB) dan berisi link “Balikin sekarang”.</li>
          <li>Setelah itu pengingat teks biasa (tanpa link) dikirim tiap hari sampai buku dikembalikan. Hari Ahad dilewati.</li>
          <li>Pengiriman hanya di jam {String(SEND_FROM_HOUR).padStart(2, "0")}.00 sampai {SEND_UNTIL_HOUR}.00 WIB, dengan jeda acak antar pesan.</li>
        </ul>
        <p style={{ margin: "10px 0 0" }}>Status WAHA: {wahaOk ? <span className="chip green">WAHA_URL terisi</span> : <span className="chip red">WAHA_URL belum diisi</span>}</p>
      </div>
      <h2>Riwayat pengiriman</h2>
      <div className="card table-scroll">
        {logs.length === 0 ? <span className="muted">Belum ada pengingat yang dikirim.</span> : (
          <table>
            <thead><tr><th>Waktu</th><th>Peminjam</th><th>Buku</th><th>Jenis</th><th>Status</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{formatDateTimeWib(l.createdAt)}</td>
                  <td>{l.loan.user.name || displayPhone(l.loan.user.phone)}</td>
                  <td>{l.loan.book.title}</td>
                  <td>{l.kind === "FIRST_LINK" ? "Pertama (+link)" : "Lanjutan (teks)"}</td>
                  <td>{l.status === "SENT" ? <span className="chip green">Terkirim</span> : l.status === "FAILED" ? <span className="chip red" title={l.error ?? ""}>Gagal</span> : <span className="chip amber">Proses</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
