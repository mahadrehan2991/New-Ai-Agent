import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Happy Harmony Clinic - AI Voice Receptionist Dashboard",
  description: "Live staff review dashboard for Hannah AI Receptionist at Happy Harmony Physiotherapy & Spine Rehabilitation Clinic in London, Ontario.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
