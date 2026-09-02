import type {Metadata} from 'next';
import {Archivo, Instrument_Serif} from 'next/font/google';
import './globals.css';
import {Providers} from './providers';
import {AppChrome} from '@/src/components/AppChrome';

// The two brand faces, self-hosted by Next. src/theme/weldam.ts points
// --font-family-body / --font-family-heading at these CSS variables.
const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Weldam House — Inventory',
  description:
    'Photograph an object, appraise it, price it, list it. Weldam House inventory management.',
  icons: {icon: '/brand/favicon.svg'},
};

export default function RootLayout({children}: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      // data-astryx-theme is what scopes the built theme CSS. Without it the
      // page renders on Astryx's stock tokens and none of the brand lands.
      data-astryx-theme="weldam"
      className={`${archivo.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers>
          <AppChrome>{children}</AppChrome>
        </Providers>
      </body>
    </html>
  );
}
