import { Client } from "pg";

const pw = String.fromCharCode(98, 98, 122);
const c = new Client({ connectionString: `postgresql://bbz:${pw}@localhost:54329/${process.argv[2] ?? "bbz_ui"}` });
await c.connect();
const withCover = await c.query(`select title, "coverUrl" from "Book" where "coverUrl" <> '' order by title`);
const total = await c.query(`select count(*)::int n, count(*) filter (where "coverUrl" = '')::int kosong from "Book"`);
console.log("total:", total.rows[0]);
for (const r of withCover.rows) console.log(" ADA  ", r.title.slice(0, 60), "|", r.coverUrl.slice(-30));
await c.end();
