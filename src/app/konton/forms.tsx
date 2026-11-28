"use client";
import { useActionState, useState } from "react";
import { randomTeamCode, MIN_TEAM_CODE } from "@/lib/teamcode";
import { MIN_PASSWORD } from "@/lib/password";
import { addUser, changePassword, changeTeamCode, resetPassword, removeUser, removeMyAccount } from "./actions";

export function AddUserForm() {
  const [res, action, pending] = useActionState(addUser, null);
  return (
    <form action={action} className="acc-form" key={res?.ok ? res.msg : "add"}>
      <label>Namn<input name="name" className="field field-name" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" pattern="[A-Za-zÅÄÖåäö]{2,20}" required /></label>
      <label>Lösenord (minst {MIN_PASSWORD} tecken)<input name="pass" type="password" className="field" autoComplete="new-password" minLength={MIN_PASSWORD} required /></label>
      <label>Lösenord igen<input name="pass2" type="password" className="field" autoComplete="new-password" minLength={MIN_PASSWORD} required /></label>
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
      <label>Nytt lösenord (minst {MIN_PASSWORD} tecken)<input name="pass" type="password" className="field" autoComplete="new-password" minLength={MIN_PASSWORD} required /></label>
      <label>Nytt lösenord igen<input name="pass2" type="password" className="field" autoComplete="new-password" minLength={MIN_PASSWORD} required /></label>
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

/* Admin, per player: a new password, or remove the account (second click confirms). */
export function PlayerTools({ name }: { name: string }) {
  const [reset, resetAction, resetting] = useActionState(resetPassword, null);
  const [removed, removeAction, removing] = useActionState(removeUser, null);
  const [armed, setArmed] = useState(false);
  const shown = name.toUpperCase();
  return (
    <details className="acc-more">
      <summary>Hantera {shown}</summary>
      <form action={resetAction} className="acc-form" key={reset?.ok ? reset.msg : "reset"}>
        <input type="hidden" name="name" value={name} />
        <label>Nytt lösenord åt {shown} (minst {MIN_PASSWORD} tecken)<input name="pass" type="password" className="field" autoComplete="new-password" minLength={MIN_PASSWORD} required /></label>
        <label>Nytt lösenord igen<input name="pass2" type="password" className="field" autoComplete="new-password" minLength={MIN_PASSWORD} required /></label>
        <button className="btn ghost" type="submit" disabled={resetting}>Sätt nytt lösenord</button>
        {reset && <p className={"msg" + (reset.ok ? " ok" : "")} role="status">{reset.msg}</p>}
      </form>
      <form action={removeAction} className="acc-form">
        <input type="hidden" name="name" value={name} />
        {armed
          ? <span className="code-row">
              <button className="btn danger" type="submit" disabled={removing}>Ja, ta bort {shown}</button>
              <button className="btn ghost" type="button" onClick={() => setArmed(false)}>Avbryt</button>
            </span>
          : <button className="btn ghost" type="button" onClick={() => setArmed(true)}>Ta bort kontot</button>}
        {removed && <p className={"msg" + (removed.ok ? " ok" : "")} role="status">{removed.msg}</p>}
      </form>
    </details>
  );
}

export function RemoveMyAccountForm({ lastAdmin }: { lastAdmin: boolean }) {
  const [res, action, pending] = useActionState(removeMyAccount, null);
  if (lastAdmin) return <p className="acc-note">Du är enda admin, så ditt konto kan inte tas bort. Gör någon annan till admin först.</p>;
  return (
    <form action={action} className="acc-form">
      <label>Ditt lösenord<input name="old" type="password" className="field" autoComplete="current-password" required /></label>
      <button className="btn danger" type="submit" disabled={pending}>Ta bort mitt konto</button>
      {res && <p className={"msg" + (res.ok ? " ok" : "")} role="status">{res.msg}</p>}
    </form>
  );
}
