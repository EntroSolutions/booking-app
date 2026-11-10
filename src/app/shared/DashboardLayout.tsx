import Link from "next/link";
import type { ReactNode } from "react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dashboard-layout">
      <header className="border-b pb-4">
        <nav aria-label="Dashboard" className="flex gap-4">
          <Link href="/coaches" className="underline">
            Browse coaches
          </Link>
          <Link href="/dashboard" className="underline">
            Dashboard
          </Link>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
