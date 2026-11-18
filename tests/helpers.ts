import http from "node:http";
import { prisma } from "@/lib/db";

export async function resetDb() {
  await prisma.$executeRawUnsafe('TRUNCATE "ReminderLog","Loan","Book","User","Setting" RESTART IDENTITY CASCADE');
}

export type WahaCall = { headers: http.IncomingHttpHeaders; body: { session: string; chatId: string; text: string } };

/** WAHA palsu: merekam POST /api/sendText. failNext = jumlah request berikutnya yang dibalas 500. */
export async function startMockWaha(port = 3999) {
  const calls: WahaCall[] = [];
  const state = { failNext: 0 };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (req.method !== "POST" || req.url !== "/api/sendText") {
        res.statusCode = 404;
        return res.end();
      }
      if (state.failNext > 0) {
        state.failNext--;
        res.statusCode = 500;
        return res.end("boom");
      }
      calls.push({ headers: req.headers, body: JSON.parse(raw) });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ id: "x" }));
    });
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return { calls, state, close: () => new Promise<void>((r) => server.close(() => r())) };
}
