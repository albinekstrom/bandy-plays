"use client";
import { useActionState } from "react";
import { login } from "./actions";

export default function LoginForm() {
  const [msg, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="gate-form">
      <label htmlFor="pass">Lösenord</label>
      <div className="row">
        <input id="pass" name="pass" type="password" autoComplete="current-password" autoCapitalize="none" spellCheck={false} autoFocus required />
        <button className="btn" type="submit" disabled={pending} aria-label="Logga in">→</button>
      </div>
      <p className="msg" role="status" aria-live="polite">{msg}</p>
    </form>
  );
}
