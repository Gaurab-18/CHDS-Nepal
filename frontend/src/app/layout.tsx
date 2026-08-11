import React from 'react';
import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import ThemeProvider from '@/providers/ThemeProvider';
import AuthProvider from '@/providers/AuthProvider';
import CursorProvider from '@/providers/CursorProvider';
import { CookieConsent, TermsModal } from '@/components/ui/ConsentBanner';
import SecurityResponseGate from '@/components/ui/SecurityResponseGate';

export const metadata: Metadata = {
  title: 'CHDS Nepal : Healthcare Data Sharing Platform',
  description: 'A patient-mediated data sharing platform uniting hospitals across Nepal for seamless, secure healthcare.',
  keywords: ['healthcare', 'Nepal', 'medical records', 'hospital', 'data sharing'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head />
      <body className="antialiased">
        <Script
          src="https://unpkg.com/@lottiefiles/dotlottie-wc@0.9.14/dist/dotlottie-wc.js"
          type="module"
          strategy="beforeInteractive"
        />
        <AuthProvider>
          <ThemeProvider>
            <CursorProvider>
              <SecurityResponseGate />
              {children}
              <CookieConsent />
              <TermsModal />
            </CursorProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
