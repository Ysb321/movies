"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { SearchIcon, XIcon } from "./Icons";

/** Expanding search field — debounced, navigates to /search without scroll jump */
export default function SearchBox() {
  const router = useRouter();
  const pathname = usePathname();
  const onSearchPage = pathname === "/search";
  const [open, setOpen] = useState(onSearchPage);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // sync from URL when arriving on /search
  useEffect(() => {
    if (onSearchPage) {
      setOpen(true);
      const q = new URLSearchParams(window.location.search).get("q") ?? "";
      setValue(q);
    }
  }, [onSearchPage]);

  // debounce → navigate
  useEffect(() => {
    const t = setTimeout(() => {
      const q = value.trim();
      if (q.length === 0) {
        if (onSearchPage) router.replace("/search", { scroll: false });
        return;
      }
      const url = `/search?q=${encodeURIComponent(q)}`;
      if (onSearchPage) router.replace(url, { scroll: false });
      else router.push(url);
    }, 320);
    return () => clearTimeout(t);
  }, [value, router, onSearchPage]);

  return (
    <div
      className={clsx(
        "flex items-center overflow-hidden rounded-sm border transition-all duration-300",
        open
          ? "w-52 border-white/40 bg-black/80 pl-2 sm:w-64"
          : "w-9 cursor-pointer border-transparent hover:border-white/40"
      )}
      onClick={() => {
        if (!open) {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 60);
        }
      }}
    >
      <SearchIcon className="h-5 w-5 shrink-0 text-white" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Titles, people, genres"
        className={clsx(
          "w-full bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-neutral-400",
          !open && "pointer-events-none"
        )}
        aria-label="Search"
      />
      {open && value && (
        <button
          aria-label="Clear search"
          onClick={(e) => {
            e.stopPropagation();
            setValue("");
            inputRef.current?.focus();
          }}
          className="pr-2 text-neutral-400 hover:text-white"
        >
          <XIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
