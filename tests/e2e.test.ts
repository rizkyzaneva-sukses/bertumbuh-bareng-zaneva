import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { prisma } from "@/lib/db";
import { seedAdmins, seedBooks } from "@/lib/seed";
import { dateFromKey, dayOfWeek, jakartaKey } from "@/lib/dates";
import { resetDb, startMockWaha } from "./helpers";

const PORT = 3101;
const BASE = `http://localhost:${PORT}`;
let server: ChildProcess;
let waha: Awaited<ReturnType<typeof startMockWaha>>;

class Client {
  cookie = "";
  async req(path: string, init: RequestInit & { json?: unknown } = {}) {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
    if (this.cookie) headers.cookie = this.cookie;
    if (init.json !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(BASE + path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body, redirect: "manual" });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const [kv] = c.split(";");
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)) this.cookie = "";
      else this.cookie = kv;
    }
    return res;
  }
  async api(path: string, method = "POST", json?: unknown) {
    const res = await this.req(path, { method, json });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
  }
  async html(path: string) {
    const res = await this.req(path);
    // React menyisipkan <!-- --> di antara teks dan variabel; buang supaya mudah dicocokkan
    return { status: res.status, text: (await res.text()).replace(/<!-- -->/g, ""), location: res.headers.get("location") };
  }
  login(phone: string, password: string) {
    return this.api("/api/auth/login", "POST", { phone, password });
  }
}

beforeAll(async () => {
  waha = await startMockWaha();
  await resetDb();
  await seedAdmins();
  await seedBooks();
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
    env: { ...process.env, PORT: String(PORT), DISABLE_SCHEDULER: "1", NODE_ENV: "production" },
    stdio: "pipe",
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE + "/api/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server tidak start");
});
afterAll(async () => {
  server?.kill("SIGTERM");
  await waha.close();
  await prisma.$disconnect();
});

const DEFAULT_PW = "Zaneva2026";
const admin = new Client();
const sinta = new Client();
const budi = new Client();
const ids: Record<string, string> = {};

describe("alur end-to-end lewat HTTP", () => {
  it("health, login salah, dan cron butuh rahasia", async () => {
    expect((await new Client().api("/api/health", "GET")).body.ok).toBe(true);
    expect((await new Client().login("081220210193", "salah")).status).toBe(401);
    expect((await new Client().login("abc", "x")).status).toBe(400);
    expect((await new Client().api("/api/cron/reminders", "POST")).status).toBe(401);
    expect((await new Client().api("/api/books", "GET")).status).toBe(401);
    const html = await new Client().html("/");
    expect(html.status).toBeGreaterThanOrEqual(300);
    expect(html.location).toContain("/login");
  });

  it("origin lain ditolak (CSRF)", async () => {
    const res = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ phone: "081220210193", password: DEFAULT_PW }) });
    expect(res.status).toBe(403);
  });

  it("admin login (format +62) -> wajib ganti password, popup di halaman, API terkunci", async () => {
    const r = await admin.login("+62 812-2021-0193", DEFAULT_PW);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ mustChangePassword: true, role: "ADMIN" });
    expect((await admin.api("/api/books", "GET")).body.code).toBe("MUST_CHANGE_PASSWORD");
    expect((await admin.api("/api/auth/me", "GET")).status).toBe(200);
    for (const p of ["/", "/buku", "/dashboard", "/admin/pengguna", "/profil"]) {
      const h = await admin.html(p);
      expect(h.status, p).toBe(200);
      expect(h.text, p).toContain('data-testid="force-password-modal"');
    }
    // validasi password baru
    expect((await admin.api("/api/auth/change-password", "POST", { newPassword: "pendek" })).status).toBe(400);
    expect((await admin.api("/api/auth/change-password", "POST", { newPassword: DEFAULT_PW })).body.code).toBe("SAME");
    expect((await admin.api("/api/auth/change-password", "POST", { newPassword: "RahasiaBaru99" })).status).toBe(200);
    expect((await admin.html("/")).text).not.toContain("force-password-modal");
    expect((await admin.api("/api/books", "GET")).body.books).toHaveLength(37);
    // password lama tidak berlaku lagi
    expect((await new Client().login("081220210193", DEFAULT_PW)).status).toBe(401);
    expect((await new Client().login("081220210193", "RahasiaBaru99")).status).toBe(200);
  });

  it("admin kedua ada & admin menambah user massal (tempel/CSV)", async () => {
    expect((await new Client().login("085177555437", DEFAULT_PW)).body).toMatchObject({ role: "ADMIN", mustChangePassword: true });
    const csv = "Nama,No HP\r\nSinta Dewi,0812-3456-7890\r\nBudi;+62 857 1111 2222\r\nRizky Dobel, 081220210193\r\nTanpa Nomor\r\nCitra, 6289912345678\r\n";
    const r = await admin.api("/api/admin/users", "POST", { text: csv, password: "Sementara1" });
    expect(r.status).toBe(200);
    expect(r.body.created).toBe(3);
    expect(r.body.skipped).toHaveLength(1);
    expect(r.body.errors).toHaveLength(1);
    const list = (await admin.api("/api/admin/users", "GET")).body.users as any[];
    const s = list.find((u) => u.name === "Sinta Dewi");
    expect(s).toMatchObject({ phone: "6281234567890", tempPassword: "Sementara1", mustChangePassword: true, role: "MEMBER" });
    ids.sinta = s.id;
    ids.budi = list.find((u) => u.name === "Budi").id;
    ids.citra = list.find((u) => u.name === "Citra").id;
    // password default dari env kalau admin tidak mengisi
    await admin.api("/api/admin/users", "POST", { text: "Dedi, 081300000001" });
    expect((await prisma.user.findUniqueOrThrow({ where: { phone: "6281300000001" } })).tempPassword).toBe(DEFAULT_PW);
    // halaman data user menampilkan password sementara
    const page = await admin.html("/admin/pengguna");
    expect(page.text).toContain("Sementara1");
  });

  it("member: login, popup ganti password, lalu tidak boleh akses admin", async () => {
    expect((await sinta.login("0812 3456 7890", "Sementara1")).body.mustChangePassword).toBe(true);
    expect((await sinta.html("/buku")).text).toContain("force-password-modal");
    expect((await sinta.api("/api/loans", "POST", { bookId: "x" })).body.code).toBe("MUST_CHANGE_PASSWORD");
    expect((await sinta.api("/api/auth/change-password", "POST", { newPassword: "SintaBaru123" })).status).toBe(200);
    expect((await sinta.html("/buku")).text).not.toContain("force-password-modal");
    expect((await sinta.api("/api/admin/users", "GET")).status).toBe(403);
    expect((await sinta.api("/api/books", "POST", { title: "x", author: "y" })).status).toBe(403);
    const adminPage = await sinta.html("/admin/pengguna");
    expect(adminPage.location).toBe("/");
    // admin tidak lagi melihat password sementara Sinta
    const list = (await admin.api("/api/admin/users", "GET")).body.users as any[];
    expect(list.find((u) => u.id === ids.sinta).tempPassword).toBeNull();
    // reset oleh admin -> kembali ke password sementara & wajib ganti lagi
    const reset = await admin.api(`/api/admin/users/${ids.sinta}/reset-password`, "POST", {});
    expect(reset.body.tempPassword).toBe(DEFAULT_PW);
    expect((await new Client().login("081234567890", "SintaBaru123")).status).toBe(401);
    expect((await sinta.html("/")).text).toContain("force-password-modal"); // sesi lama pun kena popup lagi
    const again = new Client();
    expect((await again.login("081234567890", DEFAULT_PW)).body.mustChangePassword).toBe(true);
    expect((await again.html("/")).text).toContain("force-password-modal");
    expect((await sinta.api("/api/auth/change-password", "POST", { newPassword: "SintaBaru456" })).status).toBe(200);
  });

  it("pinjam: maksimal 2 buku, tidak boleh dobel, jatuh tempo benar", async () => {
    const books = (await admin.api("/api/books", "GET")).body.books as any[];
    const [b1, b2, b3] = ["Atomic Habits", "Deep Work", "Essentialism"].map((t) => books.find((b) => b.title === t));
    const r1 = await sinta.api("/api/loans", "POST", { bookId: b1.id });
    expect(r1.status).toBe(201);
    const expectedDue = (() => {
      let k = jakartaKey(new Date());
      let n = 0;
      while (n < 3) {
        const d = new Date(k + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + 1);
        k = d.toISOString().slice(0, 10);
        if (dayOfWeek(k) !== 0) n++;
      }
      return k;
    })();
    expect(r1.body.loan.dueDate).toBe(expectedDue);
    expect((await sinta.api("/api/loans", "POST", { bookId: b1.id })).body.code).toBe("ALREADY");
    expect((await sinta.api("/api/loans", "POST", { bookId: b2.id })).status).toBe(201);
    const r3 = await sinta.api("/api/loans", "POST", { bookId: b3.id });
    expect(r3.status).toBe(409);
    expect(r3.body.code).toBe("LIMIT");
    // stok 1: orang lain tidak bisa pinjam buku yang sedang dipinjam
    await budi.login("+6285711112222", "Sementara1");
    await budi.api("/api/auth/change-password", "POST", { newPassword: "BudiBaru1234" });
    expect((await budi.api("/api/loans", "POST", { bookId: b1.id })).body.code).toBe("NO_STOCK");
    // buku yang bukan pinjamannya tidak bisa dikembalikan orang lain
    const loanSinta = await prisma.loan.findFirstOrThrow({ where: { userId: ids.sinta, bookId: b1.id } });
    expect((await budi.api(`/api/loans/${loanSinta.id}/return`)).status).toBe(403);
    ids.b1 = b1.id; ids.b2 = b2.id; ids.b3 = b3.id; ids.loanSinta1 = loanSinta.id;
    // katalog menunjukkan status
    const cat = await sinta.html("/buku");
    expect(cat.text).toContain("Kamu pinjam");
  });

  it("pengingat: pesan pertama lewat WAHA berisi link, link mengembalikan buku sekali pakai", async () => {
    if (dayOfWeek(jakartaKey(new Date())) === 0) return; // hari Ahad job memang tidak mengirim
    // Budi meminjam Essentialism; jatuh temponya dibuat hari ini
    const loan = await prisma.loan.create({
      data: { userId: ids.budi, bookId: ids.b3, dueDate: dateFromKey(jakartaKey(new Date())), borrowedAt: new Date(Date.now() - 3 * 86400000) },
    });
    // tanpa rahasia: ditolak; dengan rahasia: jalan
    expect((await new Client().api("/api/cron/reminders?ignoreWindow=1", "POST")).status).toBe(401);
    const run = await new Client().req("/api/cron/reminders?ignoreWindow=1", { method: "POST", headers: { authorization: "Bearer cron-test-secret" } });
    const body = await run.json();
    expect(body.result.sent).toBeGreaterThanOrEqual(1);
    const msg = waha.calls.find((c) => c.body.chatId === "6285711112222@c.us")!;
    expect(msg).toBeTruthy();
    expect(msg.headers["x-api-key"]).toBe("testkey");
    const link = msg.body.text.match(/http:\/\/localhost:3101\/kembali\/(\S+)/)!;
    expect(link).toBeTruthy();
    // job kedua: tidak dobel
    const before = waha.calls.length;
    const run2 = await new Client().req("/api/cron/reminders?ignoreWindow=1", { method: "POST", headers: { authorization: "Bearer cron-test-secret" } });
    expect((await run2.json()).result.sent).toBe(0);
    expect(waha.calls.length).toBe(before);

    const anon = new Client();
    const page = await anon.html(`/kembali/${link[1]}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain("Balikin sekarang");
    expect(page.text).toContain("Essentialism");
    // token rusak
    expect((await anon.api(`/api/return/${link[1].slice(0, -3)}xyz`)).status).toBe(400);
    // klik tombol -> kembali
    const ok = await anon.api(`/api/return/${link[1]}`);
    expect(ok.status).toBe(200);
    const after = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
    expect(after.returnedAt).not.toBeNull();
    expect(after.returnedVia).toBe("LINK");
    expect(after.status).toBe("DIKEMBALIKAN");
    // sekali pakai
    expect((await anon.api(`/api/return/${link[1]}`)).status).toBe(410);
    expect((await anon.html(`/kembali/${link[1]}`)).text).toContain("Link tidak berlaku");
    // job berikutnya tidak mengirim apa pun untuk buku itu
    await new Client().req("/api/cron/reminders?ignoreWindow=1", { method: "POST", headers: { authorization: "Bearer cron-test-secret" } });
    expect(waha.calls.length).toBe(before);
  });

  it("kembalikan sendiri, admin tandai dikembalikan, hapus buku, tambah/edit buku", async () => {
    expect((await sinta.api(`/api/loans/${ids.loanSinta1}/return`)).status).toBe(200);
    expect((await sinta.api(`/api/loans/${ids.loanSinta1}/return`)).status).toBe(409);
    // hapus buku yang sedang dipinjam ditolak
    const del1 = await admin.api(`/api/books/${ids.b2}`, "DELETE");
    expect(del1.status).toBe(409);
    expect(del1.body.code).toBe("ACTIVE_LOANS");
    const loan2 = await prisma.loan.findFirstOrThrow({ where: { bookId: ids.b2, returnedAt: null } });
    expect((await admin.api(`/api/loans/${loan2.id}/return`)).status).toBe(200);
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: loan2.id } })).returnedVia).toBe("ADMIN");
    // admin hapus
    expect((await sinta.api(`/api/books/${ids.b2}`, "DELETE")).status).toBe(403);
    expect((await admin.api(`/api/books/${ids.b2}`, "DELETE")).status).toBe(200);
    expect(await prisma.book.count({ where: { id: ids.b2 } })).toBe(0);
    expect(await prisma.book.count()).toBe(36);
    expect((await sinta.html("/buku")).text).not.toContain("Deep Work");
    // tambah & edit
    const add = await admin.api("/api/books", "POST", { title: "Buku Baru", author: "Penulis", pages: 250, category: "Tes", synopsis: "Isi.", stock: 2 });
    expect(add.status).toBe(201);
    expect((await admin.api("/api/books", "POST", { title: "", author: "x" })).status).toBe(400);
    const upd = await admin.api(`/api/books/${add.body.book.id}`, "PATCH", { pages: null, stock: 3 });
    expect(upd.body.book).toMatchObject({ pages: null, stock: 3, title: "Buku Baru" });
    // hapus user: ditolak kalau punya pinjaman aktif / admin utama
    expect((await admin.api(`/api/admin/users/${ids.citra}`, "DELETE")).status).toBe(200);
    const adminRow = (await admin.api("/api/admin/users", "GET")).body.users.find((u: any) => u.phone === "6285177555437");
    expect((await admin.api(`/api/admin/users/${adminRow.id}`, "DELETE")).body.code).toBe("SEED");
  });

  it("dashboard: angka & ranking sesuai data", async () => {
    // Aturan baru: "selesai dibaca" HANYA dihitung kalau ditandai beres
    // (lewat app atau balasan WA "1"), BUKAN dari buku yang sudah dikembalikan.
    // Sinta sebelumnya mengembalikan 1 buku; tandai beres lewat API progres.
    const gtd = ((await admin.api("/api/books", "GET")).body.books as any[]).find((b) => b.title === "Getting Things Done");
    const lg = await sinta.api("/api/loans", "POST", { bookId: gtd.id });
    expect(lg.status).toBe(201);
    expect((await sinta.html("/dashboard?tab=orang")).text).toContain("1 dibaca");
    expect((await sinta.html("/")).text).toMatch(/data-testid="slot-used">1\/2/);
    expect((await sinta.api(`/api/loans/${lg.body.loan.id}/return`)).status).toBe(200);
    // Kembalikan buku saja TIDAK membuatnya "selesai".
    expect((await sinta.html("/dashboard?tab=ranking")).text).not.toContain("data-testid=\"rank-row\"");
    // Tandai beres -> baru masuk dashboard.
    expect((await sinta.api("/api/progress", "POST", { bookId: gtd.id, done: true })).status).toBe(200);

    const r = await sinta.html("/dashboard?tab=ranking");
    expect(r.status).toBe(200);
    const rows = [...r.text.matchAll(/data-testid="rank-row"[^>]*>(.*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    expect(rows).toEqual(["1 Sinta Dewi (kamu) 1 buku"]);
    const stat = (label: string) => r.text.match(new RegExp(`<b>(\\d+)</b><span>${label}</span>`))?.[1];
    expect(stat("Judul buku")).toBe("37"); // 36 + Buku Baru
    expect(stat("Sedang dipinjam")).toBe("0");
    expect(stat("Beres dibaca")).toBe("1");
    expect(stat("Terlambat")).toBe("0");
    // halaman baru bisa dibuka
    expect((await sinta.html("/riwayat")).status).toBe(200);
    expect((await sinta.html("/panduan")).text).toContain("Beres bacanya?");
    // beranda: slot & jumlah selesai (dari penanda beres, bukan pengembalian)
    const home = (await sinta.html("/")).text;
    expect(home).toMatch(/data-testid="slot-used">0\/2/);
    expect(home).toMatch(/data-testid="my-finished">1</);
  });

  it("halaman PWA: manifest, ikon, service worker, meta apple", async () => {
    const c = new Client();
    const m = await (await c.req("/manifest.webmanifest")).json();
    expect(m).toMatchObject({ name: "Bertumbuh Bareng Zaneva", display: "standalone", start_url: "/" });
    expect(m.icons.map((i: any) => i.purpose)).toContain("maskable");
    for (const p of ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/apple-touch-icon.png", "/sw.js", "/offline.html"]) expect((await c.req(p)).status, p).toBe(200);
    const login = (await c.html("/login")).text;
    expect(login).toContain('rel="apple-touch-icon"');
    expect(login).toContain('name="apple-mobile-web-app-capable"');
    expect(login).toContain('rel="manifest"');
    expect(login).toContain('name="theme-color"');
  });

  it("logout menghapus sesi", async () => {
    expect((await budi.api("/api/auth/logout")).status).toBe(200);
    expect((await budi.api("/api/auth/me", "GET")).status).toBe(401);
  });
});
