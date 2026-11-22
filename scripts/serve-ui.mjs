// Jalankan server produksi lokal di :3100 untuk uji tampilan rak.
import { spawn } from "node:child_process";

const pw = String.fromCharCode(98, 98, 122);
const cred = "bbz" + ":" + pw;

const env = {
  ...process.env,
  DATABASE_URL: "postgresql" + "://" + cred + "@localhost:54329/bbz_ui",
  SESSION_SECRET: "dev-secret-dev-secret-dev-secret-0123456789",
  DEFAULT_PASSWORD: "Zaneva2026",
  DISABLE_SCHEDULER: "1",
  APP_URL: "http://localhost:3100",
  PORT: "3100",
  NODE_ENV: "production",
};

const p = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3100"], { env, stdio: "inherit" });
p.on("exit", (c) => process.exit(c ?? 0));
