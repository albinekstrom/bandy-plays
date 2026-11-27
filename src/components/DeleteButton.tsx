"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/* Two taps to delete: no blocking confirm() dialog. */
export default function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button className={"btn ghost del" + (armed ? " armed" : "")} type="button" onClick={async () => {
      if (!armed) { setArmed(true); return; }
      await fetch(`/api/plays/${id}`, { method: "DELETE" });
      router.refresh();
    }}>{armed ? "Säker?" : "Ta bort"}</button>
  );
}
