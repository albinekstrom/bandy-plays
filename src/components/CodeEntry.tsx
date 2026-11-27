"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CodeEntry() {
  const router = useRouter();
  const [code, setCode] = useState("");
  return (
    <form className="gate-form" onSubmit={e => { e.preventDefault(); if (/^\d{4}$/.test(code)) router.push(`/fjarr/${code}`); }}>
      <label htmlFor="code">Koden som visas på skärmen</label>
      <div className="row">
        <input id="code" inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off" autoFocus
          value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        <button className="btn" type="submit" aria-label="Anslut" disabled={code.length !== 4}>→</button>
      </div>
    </form>
  );
}
