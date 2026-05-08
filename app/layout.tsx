import { RootProvider } from 'fumadocs-ui/provider/next';
import Script from 'next/script';
import './global.css';
import { Geist, Geist_Mono } from 'next/font/google';

// Shared blueticks.co GA4 measurement ID. cookie_domain '.blueticks.co'
// so traffic on this subdomain ties together with the apex domain.
const GA4_ID = 'G-RCEGPEQEZ5';

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  weight: ['400', '500', '600', '700'],
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  weight: ['400', '500', '600'],
});

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex flex-col min-h-screen font-sans">
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            // cookie_domain '.blueticks.co' ties this subdomain to apex
            // traffic, but only when we're actually on a *.blueticks.co
            // host. On localhost / Netlify preview hosts, GA4 logs
            // "Error retrieving a token" because it can't set the cookie
            // on a non-matching domain — so omit the option there.
            (function () {
              var host = window.location.hostname;
              var config = host.endsWith('.blueticks.co')
                ? { cookie_domain: '.blueticks.co' }
                : {};
              gtag('config', '${GA4_ID}', config);
            })();
          `}
        </Script>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
