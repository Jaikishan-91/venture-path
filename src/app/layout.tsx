import type { Metadata } from "next";
import { Geist_Mono, Poppins } from "next/font/google";
import { Suspense } from "react";
import { AppToaster } from "@/components/app-toaster";
import { readFlash } from "@/lib/flash";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Venture Path",
  description: "Freelance work and internships from organisations, for users.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const flash = await readFlash();
  return (
    <html lang="en" className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-white font-sans text-foreground">
        {children}
        {/* useSearchParams needs a Suspense boundary. */}
        <Suspense>
          <AppToaster flash={flash} />
        </Suspense>
      </body>
    </html>
  );
}
