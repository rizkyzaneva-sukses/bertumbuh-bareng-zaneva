/*
 * Service worker Web Push — SENGAJA TANPA CACHING.
 *
 * Tugasnya cuma dua: terima `push` lalu tampilkan notifikasi, dan tangani
 * `notificationclick` dengan membuka halaman yang relevan.
 *
 * Kenapa tidak offline-first: app ini menyajikan data pinjaman & progres baca
 * yang berubah tiap hari. Kalau halaman di-cache, anggota bisa submit form ke
 * state lama lalu mengira datanya hilang. Notifikasi tidak butuh cache sama
 * sekali, jadi lebih aman tanpa.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Bertumbuh Bareng Zaneva", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Bertumbuh Bareng Zaneva";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/badge-96.png",
    // `tag` sama = notifikasi lama diganti, bukan menumpuk jadi 10 baris.
    tag: data.tag || "bbz-info",
    renotify: true,
    // Android mudah membuang notifikasi yang tidak requireInteraction.
    requireInteraction: true,
    // silent:false penting — channel senyap bisa dimatikan tanpa sadar.
    silent: false,
    vibrate: [120, 60, 120],
    // Anggota TIDAK boleh diarahkan ke /admin: halaman itu dijaga role admin,
    // jadi mereka akan mendarat di "Akses ditolak" dan melapor app error.
    data: { url: data.url || "/buku" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/buku";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Kalau tab app sudah terbuka, fokuskan & arahkan — jangan buka tab baru.
      for (const c of all) {
        if (c.url && new URL(c.url).origin === self.location.origin) {
          await c.focus();
          if ("navigate" in c) {
            try {
              await c.navigate(target);
            } catch {
              /* navigate bisa ditolak; fokus saja sudah cukup */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
