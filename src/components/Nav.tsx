"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: IconName };

type IconName = "home" | "books" | "history" | "chart" | "user";

/**
 * Ikon garis satu set (bukan emoji) supaya ukurannya sama di semua HP.
 * `currentColor` ikut warna menu: abu saat biasa, aksen saat aktif.
 */
function Icon({ name }: { name: IconName }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (name === "home")
    return (
      <svg {...common}>
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
      </svg>
    );
  if (name === "books")
    return (
      <svg {...common}>
        <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v15H7.5A2.5 2.5 0 0 0 5 20.5z" />
        <path d="M5 5.5V20" />
      </svg>
    );
  if (name === "history")
    return (
      <svg {...common}>
        <path d="M4 12a8 8 0 1 0 2.3-5.6" />
        <path d="M4 4v4h4" />
        <path d="M12 8v4.5l3 1.5" />
      </svg>
    );
  if (name === "chart")
    return (
      <svg {...common}>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 15v-3" />
        <path d="M12 15V8" />
        <path d="M16 15v-5" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

export function Nav({ isAdmin, variant }: { isAdmin: boolean; variant: "top" | "bottom" }) {
  const path = usePathname();
  // HP: maksimal 5. Panduan, Admin, Usulan, Notifikasi pindah ke Profil —
  // 7 item membuat tiap tombol ~51px dan label 10px (terukur di 360px).
  const items: Item[] = [
    { href: "/", label: "Beranda", icon: "home" },
    { href: "/buku", label: "Buku", icon: "books" },
    { href: "/riwayat", label: "Riwayat", icon: "history" },
    { href: "/dashboard", label: "Dasbor", icon: "chart" },
    { href: "/profil", label: "Profil", icon: "user" },
  ];
  const on = (h: string) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"));
  // Desktop tetap menampilkan Pintasan admin/panduan di kanan, bukan di bawah.
  const extra =
    variant === "top"
      ? [
          { href: "/panduan", label: "Panduan" },
          ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
        ]
      : [];
  return (
    <nav className={variant === "top" ? "desknav" : "bottomnav"} aria-label="Menu utama">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={on(i.href) ? "on" : ""} aria-current={on(i.href) ? "page" : undefined}>
          {variant === "bottom" && (
            <span className="ic">
              <Icon name={i.icon} />
            </span>
          )}
          <span className={variant === "bottom" ? "lbl" : undefined}>{i.label}</span>
        </Link>
      ))}
      {extra.map((i) => (
        <Link key={i.href} href={i.href} className={on(i.href) ? "on" : ""} aria-current={on(i.href) ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
