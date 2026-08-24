import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MAP — 四个月毕业作战地图",
  description: "管理学期、求职、健康、运动与日常任务的个人生活操作系统。",
  manifest: "/manifest.webmanifest",
  applicationName: "MAP",
  appleWebApp: { capable: true, title: "MAP", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], shortcut: "/favicon.svg", apple: "/icon-192.png" },
  openGraph: { title: "MAP", description: "Graduate with intention.", images: [{ url: "/og.png", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: "MAP", description: "Graduate with intention.", images: ["/og.png"] },
};

export const viewport: Viewport = { themeColor: "#171914", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
