"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: string };

export function Nav({ isAdmin, variant }: { isAdmin: boolean; variant: "top" | "bottom" }) {
  const path = usePathname();
  const items: Item[] = [
    { href: "/", label: "Beranda", icon: "🏠" },
    { href: "/buku", label: "Buku", icon: "📚" },
    { href: "/riwayat", label: "Riwayat", icon: "📖" },
    { href: "/dashboard", label: "Dasbor", icon: "📊" },
    { href: "/panduan", label: "Panduan", icon: "📘" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: "🛠️" }] : []),
    { href: "/profil", label: "Profil", icon: "👤" },
  ];
  // Usulan & Notifikasi sengaja TIDAK di sini: 9 item = 576px di HP 390px,
  // jadi menu terakhir tidak terjangkau (bottom nav tidak bisa digeser).
  // Keduanya masuk dari halaman Profil supaya navigasi tetap pas 7 item.
  const on = (h: string) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"));
  return (
    <nav className={variant === "top" ? "desknav" : "bottomnav"} aria-label="Menu utama">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={on(i.href) ? "on" : ""} aria-current={on(i.href) ? "page" : undefined}>
          {variant === "bottom" && <span className="ic" aria-hidden>{i.icon}</span>}
          <span className={variant === "bottom" ? "lbl" : undefined}>{i.label}</span>
        </Link>
      ))}
    </nav>
  );
}
