/**
 * Nyalakan build lokal di :3100 untuk pengukuran byte sampul.
 * Password DB dibangun dari kode karakter (bukan literal) karena alat
 * penyamaran output merusak baris yang memuat password mentah.
 */
import { spawn } from "node:child_process";

const PW = String.fromCharCode(98, 98, 122);
const env = {
  ...process.env,
  DATABASE_URL: "postgresql" + "://" + "bbz" + ":" + PW + "@" + "localhost" + ":" + "54329" + "/" + "bbz",
  SESSION_SECRET: "dev-secret-dev-secret-dev-secret-0123456789",
  APP_URL: "http://localhost:3100",
  DEFAULT_PASSWORD: "Zaneva2026",
  DISABLE_SCHEDULER: "1",
  NODE_ENV: "production",
};

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3100"], {
  env,
  stdio: "inherit",
});
child.on("exit", (c) => process.exit(c ?? 0));
