import type { Metadata } from "next";
import { connection } from "next/server";
import { users } from "@/lib/users";
import LoginForm from "./LoginForm";
import SetupForm from "./SetupForm";

export const metadata: Metadata = { title: "Logga in · Bandyspel" };

export default async function LoginPage() {
  await connection();
  const first = (await users().count()) === 0;
  return (
    <main className="gate">
      <div className="title">
        {first && <span className="kicker">Första kontot</span>}
        <h1>Bandyspel</h1>
      </div>
      {first ? <SetupForm /> : <LoginForm />}
    </main>
  );
}
