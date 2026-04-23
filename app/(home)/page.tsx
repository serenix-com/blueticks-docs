import Link from 'next/link';
import {
  ArrowRight,
  Zap,
  Shield,
  RefreshCw,
  FlaskConical,
  BookOpen,
  Code2,
} from 'lucide-react';

export default function HomePage() {
  return (
    <main className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-fd-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-40 [mask-image:radial-gradient(60%_60%_at_50%_30%,black,transparent)]"
          style={{
            backgroundImage:
              'radial-gradient(60% 40% at 50% 0%, color-mix(in oklab, var(--color-fd-primary) 35%, transparent), transparent)',
          }}
        />
        <div className="mx-auto flex max-w-5xl flex-col items-center px-4 py-20 text-center sm:py-28">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card/50 px-3 py-1 text-xs text-fd-muted-foreground">
            <span className="size-1.5 rounded-full bg-fd-primary" />
            v1.0.0 — stable
          </span>
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-6xl">
            The Blueticks API
          </h1>
          <p className="mb-8 max-w-2xl text-lg text-fd-muted-foreground">
            Send WhatsApp messages, manage gateways, and automate customer
            conversations from your own code — with first-class SDKs for
            Python, Node.js, and PHP.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/docs/quickstart"
              className="inline-flex items-center gap-2 rounded-full bg-fd-primary px-6 py-2.5 font-medium text-fd-primary-foreground transition hover:opacity-90"
            >
              Start building
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/docs/api"
              className="inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card/50 px-6 py-2.5 font-medium transition hover:bg-fd-accent"
            >
              API Reference
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4 text-sm text-fd-muted-foreground">
            <code className="rounded-md border border-fd-border bg-fd-card/50 px-3 py-1.5 font-mono text-xs">
              pip install blueticks
            </code>
            <code className="rounded-md border border-fd-border bg-fd-card/50 px-3 py-1.5 font-mono text-xs">
              npm install blueticks
            </code>
            <code className="rounded-md border border-fd-border bg-fd-card/50 px-3 py-1.5 font-mono text-xs">
              composer require blueticks/blueticks
            </code>
          </div>
        </div>
      </section>

      {/* SDKs */}
      <section className="mx-auto w-full max-w-5xl px-4 py-16">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Official SDKs</h2>
            <p className="mt-1 text-sm text-fd-muted-foreground">
              All three expose the same resources and follow the same
              conventions.
            </p>
          </div>
          <Link
            href="/docs/quickstart"
            className="text-sm text-fd-primary hover:underline"
          >
            Compare →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <SdkCard
            language="Python"
            version="1.0.0"
            install="pip install blueticks"
            href="https://pypi.org/project/blueticks/"
          />
          <SdkCard
            language="Node.js"
            version="1.0.0"
            install="npm install blueticks"
            href="https://www.npmjs.com/package/blueticks"
          />
          <SdkCard
            language="PHP"
            version="1.0.0"
            install="composer require blueticks/blueticks"
            href="https://packagist.org/packages/blueticks/blueticks"
          />
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-5xl px-4 py-16">
        <h2 className="mb-8 text-2xl font-bold">Built for production</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<Shield className="size-5" />}
            title="Typed errors"
            body="Each error code maps to a dedicated exception class. Catch the one you care about, ignore the rest."
          />
          <FeatureCard
            icon={<RefreshCw className="size-5" />}
            title="Automatic retries"
            body="Exponential backoff with jitter on 429 / 5xx / network failures. Honors Retry-After. POST gated by Idempotency-Key."
          />
          <FeatureCard
            icon={<Zap className="size-5" />}
            title="Fast startup"
            body="No gRPC, no codegen, no heavy runtime. Native HTTP clients with zero warm-up."
          />
          <FeatureCard
            icon={<FlaskConical className="size-5" />}
            title='In-browser "Try it"'
            body="Every endpoint page has a playground. Paste a test key, fire real requests against api.blueticks.co."
          />
          <FeatureCard
            icon={<Code2 className="size-5" />}
            title="Deterministic regeneration"
            body="SDKs + reference are regenerated from a single OpenAPI spec. Zero-diff between releases."
          />
          <FeatureCard
            icon={<BookOpen className="size-5" />}
            title="Stable contracts"
            body="v1 endpoints and error codes are locked. Changes will be additive until v2."
          />
        </div>
      </section>

      {/* Footer CTA */}
      <section className="border-t border-fd-border bg-fd-card/30">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-16 text-center">
          <h2 className="text-2xl font-bold">Ready to ship?</h2>
          <p className="max-w-xl text-fd-muted-foreground">
            Grab a key in your dashboard and follow the Quickstart to make
            your first request.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/docs/quickstart"
              className="inline-flex items-center gap-2 rounded-full bg-fd-primary px-6 py-2.5 font-medium text-fd-primary-foreground transition hover:opacity-90"
            >
              Quickstart
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/docs/authentication"
              className="inline-flex items-center gap-2 rounded-full border border-fd-border px-6 py-2.5 font-medium transition hover:bg-fd-accent"
            >
              Authentication
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function SdkCard({
  language,
  version,
  install,
  href,
}: {
  language: string;
  version: string;
  install: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group rounded-lg border border-fd-border bg-fd-card/50 p-5 transition hover:border-fd-primary"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">{language}</span>
        <span className="rounded-full border border-fd-border px-2 py-0.5 text-[10px] text-fd-muted-foreground">
          v{version}
        </span>
      </div>
      <code className="block overflow-x-auto rounded-md bg-fd-background/60 p-2 font-mono text-xs text-fd-muted-foreground">
        {install}
      </code>
      <div className="mt-3 text-xs text-fd-primary opacity-0 transition group-hover:opacity-100">
        Open registry →
      </div>
    </a>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-fd-border bg-fd-card/30 p-5">
      <div className="mb-3 inline-flex size-9 items-center justify-center rounded-md bg-fd-primary/10 text-fd-primary">
        {icon}
      </div>
      <h3 className="mb-1 font-semibold">{title}</h3>
      <p className="text-sm text-fd-muted-foreground">{body}</p>
    </div>
  );
}
