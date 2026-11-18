import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
const dir = ".localpg/data";
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "bbz", password: "bbz", port: 54329, persistent: true });
if (!fs.existsSync(dir + "/PG_VERSION")) await pg.initialise();
await pg.start();
try { await pg.createDatabase("bbz"); } catch {}
try { await pg.createDatabase("bbz_test"); } catch {}
console.log("PG READY");
setInterval(() => {}, 1 << 30);
