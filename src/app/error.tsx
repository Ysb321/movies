"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-ink px-6 text-center">
      <h1 className="text-4xl font-black text-brand">NETOUT</h1>
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="max-w-md text-sm text-neutral-400">
        {error.message || "An unexpected error occurred while loading this page."}
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded bg-white px-6 py-2 text-sm font-bold text-black transition hover:bg-neutral-300"
        >
          Try Again
        </button>
        <a
          href="/home"
          className="rounded border border-neutral-600 px-6 py-2 text-sm font-semibold text-neutral-200 transition hover:border-white hover:text-white"
        >
          Go Home
        </a>
      </div>
    </main>
  );
}
