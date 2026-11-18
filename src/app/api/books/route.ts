import { prisma } from "@/lib/db";
import { handler, json } from "@/lib/http";
import { BookBody } from "@/lib/schemas";

export const GET = handler({}, async () => json({ ok: true, books: await prisma.book.findMany({ orderBy: { title: "asc" } }) }));

export const POST = handler({ admin: true }, async (req) => {
  const data = BookBody.parse(await req.json());
  const book = await prisma.book.create({ data: { ...data, pages: data.pages ?? null } });
  return json({ ok: true, book }, 201);
});
