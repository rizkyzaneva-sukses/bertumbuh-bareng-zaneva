import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "sharp"],
  poweredByHeader: false,
  async headers() {
    // Header keamanan dasar. Sebelumnya app tidak mengirim satu pun — artinya
    // app ini bisa di-embed di iframe situs lain (clickjacking) dan browser
    // tidak dipaksa memakai HTTPS.
    //
    // CSP sengaja TIDAK dipasang: Next.js butuh inline script untuk hidrasi,
    // dan CSP yang salah lebih berbahaya (app putih total) daripada tidak ada.
    // Kalau nanti mau CSP, pakai nonce resmi Next, jangan asal tempel.
    const keamanan = [
      // Cegah app dibingkai situs lain (klik palsu di atas tombol kita).
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      // Jangan biarkan browser menebak tipe berkas (mis. HTML dibaca sebagai gambar).
      { key: "X-Content-Type-Options", value: "nosniff" },
      // Alamat halaman tidak ikut bocor ke situs luar.
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Paksa HTTPS selama setahun (aman: app memang selalu https).
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      // Matikan fitur perangkat yang tidak dipakai app ini.
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
    ];
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
      // Semua rute kecuali aset statis Next (aset sudah immutable & tidak perlu header ini).
      { source: "/((?!_next/static|_next/image).*)", headers: keamanan },
    ];
  },
};
export default config;
