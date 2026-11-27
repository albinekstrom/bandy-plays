import Link from "next/link";
import { connection } from "next/server";
import { loggedIn } from "@/lib/auth";
import { store } from "@/lib/store";
import { logout } from "./login/actions";
import NewPlayButton from "@/components/NewPlayButton";
import PlayList from "@/components/PlayList";

const fmt = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Stockholm" });

export default async function Home() {
  await connection(); // always read fresh from the store
  const [plays, me] = await Promise.all([store().list(), loggedIn()]);
  return (
    <main className="page">
      <header className="top">
        <div className="title">
          <span className="kicker">Surte{me ? ` · inloggad som ${me}` : ""}</span>
          <h1>Bandyspel</h1>
        </div>
        <div className="bar">
          <NewPlayButton />
          <Link className="btn ghost" href="/konton">Konton</Link>
          <form action={logout}><button className="btn ghost" type="submit">Logga ut</button></form>
        </div>
      </header>
      {plays.length === 0 ? (
        <p className="empty">Inga spel än. Tryck <b>Nytt spel</b> för att rita det första.</p>
      ) : (
        <PlayList plays={plays.map(p => ({ ...p, date: fmt.format(new Date(p.updatedAt)) }))} />
      )}
    </main>
  );
}
