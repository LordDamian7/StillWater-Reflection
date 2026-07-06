"use client";

import dynamic from "next/dynamic";

// Client-only render: the app uses localStorage and per-session state,
// so there is nothing meaningful to server-render.
const Stillwater = dynamic(() => import("../components/Stillwater"), { ssr: false });

export default function Page() {
  return <Stillwater />;
}
