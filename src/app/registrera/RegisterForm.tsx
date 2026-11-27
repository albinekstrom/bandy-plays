"use client";
import { useActionState } from "react";
import { register } from "../login/actions";

const lower = (e: React.FormEvent<HTMLInputElement>) => { const t = e.currentTarget; t.value = t.value.toLowerCase(); };

export default function RegisterForm() {
  const [msg, action, pending] = useActionState(register, null);
  return (
    <form action={action} className="gate-form">
      <p className="gate-note">Lagkoden får du av tränaren.</p>
      <label htmlFor="code">Lagkod</label>
      <input id="code" name="code" type="password" className="field" autoComplete="off" required autoFocus />
      <label htmlFor="name">Namn (små bokstäver)</label>
      <input id="name" name="name" className="field" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} pattern="[a-zåäö]{2,20}" required onInput={lower} />
      <label htmlFor="pass">Lösenord (minst 8 tecken)</label>
      <input id="pass" name="pass" type="password" className="field" autoComplete="new-password" minLength={8} required />
      <label htmlFor="pass2">Lösenord igen</label>
      <div className="row">
        <input id="pass2" name="pass2" type="password" autoComplete="new-password" minLength={8} required />
        <button className="btn" type="submit" disabled={pending} aria-label="Skapa konto">→</button>
      </div>
      <p className="msg" role="status" aria-live="polite">{msg}</p>
    </form>
  );
}
