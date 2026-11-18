import { prisma } from "../src/lib/db";
import { borrowBook, issueReturnToken } from "../src/lib/loans";
import { returnUrl } from "../src/lib/tokens";
const u = await prisma.user.findFirstOrThrow({ where: { name: "Nadia Putri" } });
const b = await prisma.book.findFirstOrThrow({ where: { title: "Make Time" } });
const loan = await borrowBook(u.id, b.id, new Date(Date.now() - 4 * 86400000));
console.log(returnUrl(await issueReturnToken(loan.id)));
await prisma.$disconnect();
