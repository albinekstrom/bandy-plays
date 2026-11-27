"use client";
import { useActionState } from "react";
import { login } from "./actions";

export default function LoginForm() {
  const [msg, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="gate-form">
      <label htmlFor="name">Namn</label>
      <input id="name" name="name" className="field field-name" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus required />
      <label htmlFor="pass">Lösenord</label>
      <div className="row">
        <input id="pass" name="pass" type="password" autoComplete="current-password" required />
        <button className="btn" type="submit" disabled={pending} aria-label="Logga in">→</button>
      </div>
      <p className="msg" role="status" aria-live="polite">{msg}</p>
    </form>
  );
}
