import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Booking App",
  description: "Book sessions with independent coaches",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
