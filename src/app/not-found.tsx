import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ink px-6 text-center">
      <h1 className="text-5xl font-black tracking-tighter text-brand md:text-7xl">YETFLIX</h1>
      <h2 className="text-2xl font-semibold">Lost your way?</h2>
      <p className="max-w-md text-sm leading-relaxed text-neutral-400">
        Sorry, we can&rsquo;t find that page. You&rsquo;ll find plenty to explore on the home page.
      </p>
      <Link
        href="/home"
        className="rounded bg-white px-8 py-2.5 text-sm font-bold text-black transition hover:bg-neutral-300"
      >
        Yetflix Home
      </Link>
    </main>
  );
}
