"use client";
import { useActionState } from "react";
import { setup } from "./actions";

export default function SetupForm() {
  const [msg, action, pending] = useActionState(setup, null);
  return (
    <form action={action} className="gate-form">
      <p className="gate-note">Skapa ditt konto. Engångsnyckeln är det gamla gemensamma lösenordet; efter det loggar alla in med namn och lösenord.</p>
      <label htmlFor="key">Engångsnyckel</label>
      <input id="key" name="key" type="password" className="field" autoComplete="off" required />
      <label htmlFor="name">Namn (små bokstäver)</label>
      <input id="name" name="name" className="field" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required
        pattern="[a-zåäö]{2,20}" onInput={e => { const t = e.currentTarget; t.value = t.value.toLowerCase(); }} />
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
