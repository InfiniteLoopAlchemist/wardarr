import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wardarr - TV Show Library Manager",
  description: "Manage and stream your TV show libraries",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50`}
      >
        <header className="bg-blue-600 text-white shadow-md">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-2xl font-bold">Wardarr</h1>
            <nav>
              <ul className="flex space-x-6">
                <li><a href="/" className="hover:underline">Home</a></li>
                <li><a href="https://github.com/yourusername/wardarr" className="hover:underline" target="_blank" rel="noopener noreferrer">GitHub</a></li>
              </ul>
            </nav>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="bg-gray-100 border-t mt-12">
          <div className="container mx-auto px-4 py-6 text-center text-gray-600">
            <p>Wardarr - TV Show Library Manager</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
