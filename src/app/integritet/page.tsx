import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Integritetspolicy · Bandyspel" };

/* DRAFT: written as a starting point, not legal advice. Must be reviewed (ideally by a lawyer)
   before anyone outside the owner's own team signs up. Fill in the [bracketed] placeholders. */
export default function PrivacyPage() {
  return (
    <main className="legal">
      <div className="title"><span className="kicker">Utkast</span><h1>Integritetspolicy</h1></div>
      <p className="legal-draft" role="note">Detta är ett utkast som ännu inte är juridiskt granskat.</p>

      <h2>Vem ansvarar för uppgifterna</h2>
      <p>Bandyspel drivs av [företagsnamn]. För uppgifter om spelare och andra medlemmar i ett lag är <b>klubben</b> personuppgiftsansvarig och [företagsnamn] är klubbens <b>personuppgiftsbiträde</b>. Ett personuppgiftsbiträdesavtal mellan klubben och [företagsnamn] ska finnas. Kontakt: [kontaktadress].</p>

      <h2>Vad vi sparar</h2>
      <ul>
        <li><b>Kontonamn.</b> Ett användarnamn du själv väljer. Du behöver inte använda ditt riktiga namn.</li>
        <li><b>Lösenord.</b> Sparas aldrig i klartext, bara som en envägs-hash (scrypt).</li>
        <li><b>Spel.</b> De spel och taktiker tränaren ritar, med namn och etiketter.</li>
        <li><b>Inloggningskaka.</b> En signerad session-kaka som håller dig inloggad.</li>
      </ul>
      <p>Vi samlar inte in e-postadress, personnummer, foton eller platsdata. Vi använder inga spårningsskript, ingen reklam och ingen analys. Den enda kakan är den nödvändiga inloggningskakan, därför visas ingen kakbanner.</p>

      <h2>Varför</h2>
      <p>Uppgifterna behövs för att du ska kunna logga in och för att laget ska kunna se och öva på spelen. Vi använder dem inte för något annat och säljer dem inte.</p>

      <h2>Var uppgifterna finns</h2>
      <p>Databasen ligger hos Neon (Postgres) i EU, Frankfurt. Webbtjänsten körs hos Vercel, med funktionerna i Frankfurt. Utöver dessa leverantörer delas inga uppgifter med andra.</p>

      <h2>Barn och unga</h2>
      <p>Spelare kan vara under 18 år. Därför ber vi inte om riktiga namn. Använd gärna ett smeknamn eller en förkortning. Det är klubben som ansvarar för att inhämta vårdnadshavares samtycke där det behövs.</p>

      <h2>Rättslig grund</h2>
      <p>[Rättslig grund, t.ex. avtal eller berättigat intresse, att fastställas tillsammans med klubben.]</p>

      <h2>Delningslänkar</h2>
      <p>Den som har en delningslänk till ett spel kan se det spelet utan att logga in. Dela länkar bara med personer som ska se spelet.</p>

      <h2>Hur länge</h2>
      <p>Ett konto och dess uppgifter sparas så länge kontot finns. När ett konto tas bort raderas det.</p>
      <ul>
        <li>Serverloggar sparas i [antal] dagar.</li>
        <li>Säkerhetskopior och sparade databasgrenar (Neon) sparas i [antal] dagar.</li>
        <li>Exportfiler med spel raderas efter [antal] dagar.</li>
      </ul>

      <h2>Dina rättigheter</h2>
      <p>Du har rätt att få veta vilka uppgifter som finns om dig, att få dem rättade och att få dem raderade. Du har också rätt att invända och att begränsa behandlingen. Hör av dig till klubben eller till [kontaktadress] så hjälper vi till. Du kan klaga hos Integritetsskyddsmyndigheten (IMY).</p>

      <p className="gate-alt"><Link href="/villkor">Användarvillkor</Link> · <Link href="/login">Till inloggning</Link></p>
    </main>
  );
}
