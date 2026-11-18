import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ForcePasswordModal } from "@/components/ForcePasswordModal";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isAdmin = user.role === "ADMIN";
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <Link href="/" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="" />
            <span>Bertumbuh Bareng Zaneva</span>
          </Link>
          <Nav isAdmin={isAdmin} variant="top" />
          <ThemeToggle />
        </div>
      </header>
      <main className="wrap" aria-hidden={user.mustChangePassword || undefined}>{children}</main>
      <Nav isAdmin={isAdmin} variant="bottom" />
      {user.mustChangePassword && <ForcePasswordModal name={user.name} />}
    </>
  );
}
