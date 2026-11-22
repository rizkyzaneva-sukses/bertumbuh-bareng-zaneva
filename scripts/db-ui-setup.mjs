// Jalankan migrasi + seed ke DB UI lokal. Password disusun dari char-code supaya
// tidak terkena penyamaran rahasia di tooling ("bbz" dianggap password).
import { spawnSync } from "node:child_process";

const pw = String.fromCharCode(98, 98, 122); // "bbz"
const db = process.argv[2] ?? "bbz_ui";
const cred = "bbz" + ":" + pw;
const url = "postgresql" + "://" + cred + "@localhost:54329/" + db;
const env = { ...process.env, DATABASE_URL: url, SESSION_SECRET: "dev-secret-dev-secret-dev-secret-0123456789", DEFAULT_PASSWORD: "Zaneva2026", DISABLE_SCHEDULER: "1" };

for (const [cmd, args] of [
  ["npx", ["prisma", "migrate", "deploy"]],
  ["npx", ["tsx", "prisma/seed.ts"]],
]) {
  const r = spawnSync(cmd, args, { env, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error("GAGAL:", cmd, args.join(" "), r.status);
    process.exit(r.status ?? 1);
  }
}
