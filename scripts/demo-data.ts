// Data contoh untuk uji UI/screenshot (HANYA database lokal). Mengosongkan semua tabel!
import { prisma } from "../src/lib/db";
import { seedAdmins, seedBooks } from "../src/lib/seed";
import { hashPassword } from "../src/lib/password";
import { borrowBook, returnLoan } from "../src/lib/loans";

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("Hanya untuk database lokal");
await prisma.$executeRawUnsafe('TRUNCATE "ReminderLog","Loan","Book","User","Setting" RESTART IDENTITY CASCADE');
await seedAdmins();
await seedBooks();
const people = ["Rina Aulia", "Dimas Pratama", "Nadia Putri", "Fajar Nugroho"];
const hash = await hashPassword("Rahasia12345");
const users = [];
for (const [i, n] of people.entries()) users.push(await prisma.user.create({ data: { name: n, phone: `62813000000${i + 1}`, passwordHash: hash, mustChangePassword: false } }));
const books = await prisma.book.findMany({ orderBy: { title: "asc" } });
const t = (d: string) => new Date(`${d}T09:00:00+07:00`);
// riwayat baca contoh
const plan: [number, number[]][] = [[0, [0, 3, 5, 9]], [1, [0, 3]], [2, [5, 12]], [3, [1]]];
for (const [u, bs] of plan) for (const b of bs) { const l = await borrowBook(users[u].id, books[b].id, t("2026-11-02")); await returnLoan(l.id, "USER", t("2026-11-04")); }
await borrowBook(users[1].id, books[20].id, t("2026-11-17")); // Dimas sedang baca
await prisma.$disconnect();
