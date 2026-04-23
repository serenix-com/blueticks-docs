import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col justify-center text-center px-4">
      <h1 className="mb-4 text-4xl font-bold">Blueticks API</h1>
      <p className="text-fd-muted-foreground mb-8">
        Official developer documentation for the Blueticks API.
      </p>
      <div className="flex gap-4 justify-center">
        <Link
          href="/docs"
          className="rounded-full bg-fd-primary text-fd-primary-foreground px-6 py-2 font-medium"
        >
          Read the docs
        </Link>
        <Link
          href="/docs/quickstart"
          className="rounded-full border border-fd-border px-6 py-2 font-medium"
        >
          Quickstart
        </Link>
      </div>
    </main>
  );
}
