import { prisma } from "@/lib/db";
import { verifyReturnToken } from "@/lib/tokens";
import { formatTanggal, keyFromDbDate } from "@/lib/dates";
import { ReturnViaLink } from "@/components/ReturnViaLink";
import { displayPhone } from "@/lib/phone";

export const metadata = { title: "Balikin buku", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function KembaliPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = verifyReturnToken(token);
  const loan = data ? await prisma.loan.findUnique({ where: { id: data.loanId }, include: { book: true, user: true } }) : null;
  const valid = !!(data && loan && !loan.returnedAt && loan.returnNonce === data.nonce);
  return (
    <main className="center-page">
      <div className="center-card">
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src="/icons/icon-192.png" alt="" />
          {valid && loan ? (
            <>
              <h1>Balikin buku</h1>
              <p className="muted">Halo {loan.user.name || displayPhone(loan.user.phone)}, kamu meminjam:</p>
              <h2 data-testid="return-title">{loan.book.title}</h2>
              <p className="small muted">Jatuh tempo {formatTanggal(keyFromDbDate(loan.dueDate))}</p>
              <ReturnViaLink token={token} title={loan.book.title} />
            </>
          ) : (
            <>
              <h1>Link tidak berlaku</h1>
              <p className="muted" data-testid="return-invalid">Link ini sudah dipakai, kedaluwarsa, atau bukunya sudah dikembalikan. Kalau masih bingung, kabari admin ya.</p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
