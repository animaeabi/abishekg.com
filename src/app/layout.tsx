import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Abishek Gopal | Senior QA Engineer",
  description:
    "Senior QA Engineer with 7+ years at Meta, Tesla, and Google. Test automation, hardware validation, and AI/ML quality assurance.",
  openGraph: {
    title: "Abishek Gopal | Senior QA Engineer",
    description:
      "7+ years building test automation frameworks and validating consumer hardware at Meta, Tesla, and Google.",
    url: "https://abishekg.com",
    type: "website",
  },
};

const themeScript = `
(function(){
  var t=localStorage.getItem('theme');
  var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches);
  if(d)document.documentElement.classList.add('dark');
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <nav className="fixed top-0 right-0 p-4 z-50">
          <ThemeToggle />
        </nav>
        {children}
      </body>
    </html>
  );
}
