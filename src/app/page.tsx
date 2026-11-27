import Link from "next/link";
import { connection } from "next/server";
import { store } from "@/lib/store";
import { logout } from "./login/actions";
import NewPlayButton from "@/components/NewPlayButton";
import DeleteButton from "@/components/DeleteButton";

const fmt = new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Stockholm" });

export default async function Home() {
  await connection(); // always read fresh from the store
  const plays = await store().list();
  return (
    <main className="page">
      <header className="top">
        <div className="title">
          <span className="kicker">Surte</span>
          <h1>Bandyspel</h1>
        </div>
        <div className="bar">
          <NewPlayButton />
          <form action={logout}><button className="btn ghost" type="submit">Logga ut</button></form>
        </div>
      </header>
      {plays.length === 0 ? (
        <p className="empty">Inga spel än. Tryck <b>Nytt spel</b> för att rita det första.</p>
      ) : (
        <ul className="plays">
          {plays.map(p => (
            <li key={p.id}>
              <Link href={`/spel/${p.id}`} className="play-link">
                <span className="play-name">{p.name}</span>
                <span className="play-date">{fmt.format(new Date(p.updatedAt))}</span>
              </Link>
              <DeleteButton id={p.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
