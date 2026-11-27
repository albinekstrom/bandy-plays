"use client";
import { useActionState } from "react";
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

export function TeamCodeForm() {
  const [res, action, pending] = useActionState(changeTeamCode, null);
  return (
    <form action={action} className="acc-form" key={res?.ok ? res.msg : "code"}>
      <label>Ny lagkod (minst 4 tecken)<input name="code" type="password" className="field" autoComplete="off" minLength={4} required /></label>
      <label>Ny lagkod igen<input name="code2" type="password" className="field" autoComplete="off" minLength={4} required /></label>
      <button className="btn" type="submit" disabled={pending}>Byt lagkod</button>
      {res && <p className={"msg" + (res.ok ? " ok" : "")} role="status">{res.msg}</p>}
    </form>
  );
}
