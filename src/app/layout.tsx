import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { Suspense } from "react";
import { AppToaster } from "@/components/app-toaster";
import { readFlash } from "@/lib/flash";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "VenturePath",
  description: "Freelance work and internships from organisations, for users.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const flash = await readFlash();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[#e8e9ec] font-sans text-foreground">
        {children}
        {/* useSearchParams needs a Suspense boundary. */}
        <Suspense>
          <AppToaster flash={flash} />
        </Suspense>
      </body>
    </html>
  );
}
