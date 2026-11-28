"use client";
import { useActionState, useState } from "react";
import { randomTeamCode, MIN_TEAM_CODE } from "@/lib/teamcode";
import { addUser, changePassword, changeTeamCode } from "./actions";

export function AddUserForm() {
  const [res, action, pending] = useActionState(addUser, null);
  return (
    <form action={action} className="acc-form" key={res?.ok ? res.msg : "add"}>
      <label>Namn<input name="name" className="field field-name" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" pattern="[A-Za-zÅÄÖåäö]{2,20}" required /></label>
      <label>Lösenord (minst 8 tecken)<input name="pass" type="password" className="field" autoComplete="new-password" minLength={8} required /></label>
      <label>Lösenord igen<input name="pass2" type="password" className="field" autoComplete="new-password" minLength={8} required /></label>
      <label>Nivå
        <select name="role" className="field" defaultValue="player">
          <option value="player">Spelare – kan titta, köra quiz och 3D</option>
          <option value="admin">Admin – kan ändra spel och konton</option>
        </select>
      </label>
      <button className="btn" type="submit" disabled={pending}>Skapa konto</button>
      {res && <p className={"msg" + (res.ok ? " ok" : "")} role="status">{res.msg}</p>}
    </form>
  );
}

export function ChangePasswordForm() {
  const [res, action, pending] = useActionState(changePassword, null);
  return (
    <form action={action} className="acc-form" key={res?.ok ? res.msg : "pw"}>
      <label>Nuvarande lösenord<input name="old" type="password" className="field" autoComplete="current-password" required /></label>
      <label>Nytt lösenord (minst 8 tecken)<input name="pass" type="password" className="field" autoComplete="new-password" minLength={8} required /></label>
      <label>Nytt lösenord igen<input name="pass2" type="password" className="field" autoComplete="new-password" minLength={8} required /></label>
      <button className="btn" type="submit" disabled={pending}>Byt lösenord</button>
      {res && <p className={"msg" + (res.ok ? " ok" : "")} role="status">{res.msg}</p>}
    </form>
  );
}

export function TeamCodeForm({ suggestion }: { suggestion: string }) {
  const [res, action, pending] = useActionState(changeTeamCode, null);
  const [code, setCode] = useState(suggestion);
  const [copied, setCopied] = useState(false);
  const saved = res?.ok ? res.code : undefined;
  return (
    <form action={action} className="acc-form" onSubmit={() => setCopied(false)}>
      <label>Ny lagkod (minst {MIN_TEAM_CODE} tecken)
        <span className="code-row">
          <input name="code" className="field code-field" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} minLength={MIN_TEAM_CODE} maxLength={40} required />
          <button className="btn ghost" type="button" onClick={() => setCode(randomTeamCode())}>Slumpa</button>
        </span>
      </label>
      <button className="btn" type="submit" disabled={pending || code.trim().length < MIN_TEAM_CODE}>Spara lagkoden</button>
      {res && <p className={"msg" + (res.ok ? " ok" : "")} role="status">{res.msg}</p>}
      {saved && (
        <p className="code-saved">
          <b>{saved}</b>
          <button className="btn ghost sm" type="button" onClick={async () => {
            try { await navigator.clipboard.writeText(saved); setCopied(true); } catch { /* select it by hand */ }
          }}>{copied ? "Kopierad" : "Kopiera"}</button>
        </p>
      )}
    </form>
  );
}
