import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MAP — Life Operating System",
  description: "管理长期目标、日程、任务、求职、笔记与健康的个人生活操作系统。",
  manifest: "/manifest.webmanifest",
  applicationName: "MAP",
  appleWebApp: { capable: true, title: "MAP", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], shortcut: "/favicon.svg", apple: "/icon-192.png" },
  openGraph: { title: "MAP — Life Operating System", description: "把长期目标、日程、任务、求职、笔记与健康放进同一个个人系统。" },
  twitter: { card: "summary", title: "MAP — Life Operating System", description: "管理目标，也管理每天怎样生活。" },
};

export const viewport: Viewport = { themeColor: "#171914", colorScheme: "light", viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
