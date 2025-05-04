import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-900 text-white flex h-screen`}
      >
        {/* Sidebar */}
        <aside className="w-64 bg-gray-800 text-white flex flex-col h-screen fixed">
          <div className="p-4 border-b border-gray-700">
            <h1 className="text-2xl font-bold">Wardarr</h1>
          </div>
          
          <nav className="flex-grow">
            <ul className="py-4">
              <li>
                <Link 
                  href="/libraries" 
                  className="flex items-center px-4 py-3 hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"></path>
                  </svg>
                  <span>Libraries</span>
                </Link>
              </li>
              <li>
                <Link 
                  href="/" 
                  className="flex items-center px-4 py-3 hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
                  </svg>
                  <span>Dashboard</span>
                </Link>
              </li>
              <li>
                <Link 
                  href="/history" 
                  className="flex items-center px-4 py-3 hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  <span>History</span>
                </Link>
              </li>
            </ul>
          </nav>
          
          <div className="p-4 border-t border-gray-700 text-sm text-gray-400">
            <p>Wardarr v0.1.0</p>
          </div>
        </aside>
        
        {/* Main content */}
        <main className="ml-64 flex-grow p-8 overflow-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
