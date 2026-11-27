import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Logga in · Bandyspel" };

export default function LoginPage() {
  return (
    <main className="gate">
      <div className="title">
        <h1>Bandyspel</h1>
      </div>
      <LoginForm />
    </main>
  );
}
