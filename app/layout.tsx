import { RootProvider } from 'fumadocs-ui/provider/next';
import Script from 'next/script';
import './global.css';
import type { Metadata } from 'next';
import { buildRootMetadata } from '@/lib/seo';
// Self-hosted (bundled in the `geist` package) so builds never fetch fonts
// from Google and can't flake on the network (#1579).
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';

// Shared blueticks.co GA4 measurement ID. cookie_domain '.blueticks.co'
// so traffic on this subdomain ties together with the apex domain.
const GA4_ID = 'G-RCEGPEQEZ5';

export const metadata: Metadata = buildRootMetadata();

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex flex-col min-h-screen font-sans" suppressHydrationWarning>
        {/* Debug gate: before hydration/paint, stamp html[data-bt-debug="true"]
            when the visitor opted in via localStorage. CSS in global.css keys
            off this attribute to reveal the otherwise-hidden Suno API section
            (sidebar folder + pages). Inline + pre-hydration so there's no flash
            and no hydration mismatch (html already has suppressHydrationWarning). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(window.localStorage.getItem('bt-debug')==='true'){document.documentElement.setAttribute('data-bt-debug','true')}}catch(e){}})();`,
          }}
        />
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
