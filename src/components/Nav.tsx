"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: string };

export function Nav({ isAdmin, variant }: { isAdmin: boolean; variant: "top" | "bottom" }) {
  const path = usePathname();
  const items: Item[] = [
    { href: "/", label: "Beranda", icon: "🏠" },
    { href: "/buku", label: "Buku", icon: "📚" },
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: "🛠️" }] : []),
    { href: "/profil", label: "Profil", icon: "👤" },
  ];
  const on = (h: string) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"));
  return (
    <nav className={variant === "top" ? "desknav" : "bottomnav"} aria-label="Menu utama">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={on(i.href) ? "on" : ""} aria-current={on(i.href) ? "page" : undefined}>
          {variant === "bottom" && <span className="ic" aria-hidden>{i.icon}</span>}
          <span>{i.label}</span>
        </Link>
      ))}
    </nav>
  );
}
