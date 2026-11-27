"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewPlayButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn" type="button" disabled={busy} onClick={async () => {
      setBusy(true);
      const res = await fetch("/api/plays", { method: "POST" });
      if (res.ok) router.push(`/spel/${(await res.json()).id}`);
      else setBusy(false);
    }}>+ Nytt spel</button>
  );
}
