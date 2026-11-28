import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Användarvillkor · Bandyspel" };

/* DRAFT: written as a starting point, not legal advice. Must be reviewed (ideally by a lawyer)
   before anyone outside the owner's own team signs up. Fill in the [bracketed] placeholders. */
export default function TermsPage() {
  return (
    <main className="legal">
      <div className="title"><span className="kicker">Utkast</span><h1>Användarvillkor</h1></div>
      <p className="legal-draft" role="note">Detta är ett utkast som ännu inte är juridiskt granskat.</p>

      <h2>Tjänsten</h2>
      <p>Bandyspel är en taktiktavla där en tränare ritar spel steg för steg, spelar upp dem och visar dem i 3D. Tjänsten tillhandahålls av [företagsnamn]. Kontakt: [kontaktadress].</p>

      <h2>Konton</h2>
      <ul>
        <li>Du registrerar dig med lagets kod. Håll koden och ditt lösenord för dig själv.</li>
        <li>Tränare kan redigera spel. Spelare kan titta, öva och se i 3D.</li>
        <li>Du ansvarar för det som sker med ditt konto. Meddela oss om du tror att någon annan har tillgång till det.</li>
        <li>Använd inte tjänsten för olagligt eller kränkande innehåll.</li>
      </ul>

      <h2>Innehåll</h2>
      <p>Spelen du skapar tillhör dig eller din klubb. Du ger oss rätt att lagra och visa dem för de personer du delar dem med, så länge det behövs för att tillhandahålla tjänsten.</p>

      <h2>Personuppgifter</h2>
      <p>Hur vi hanterar personuppgifter står i <Link href="/integritet">integritetspolicyn</Link>. Klubben är personuppgiftsansvarig för sina medlemmars uppgifter.</p>

      <h2>Tillgänglighet och ansvar</h2>
      <p>Vi försöker hålla tjänsten igång och tar säkerhetskopior, men kan inte garantera att den alltid fungerar eller att inget går förlorat. Tjänsten tillhandahålls i befintligt skick. [företagsnamn] ansvarar inte för indirekta skador, i den utsträckning lagen tillåter.</p>

      <h2>Ändringar och avslut</h2>
      <p>Vi kan ändra villkoren och tjänsten. Väsentliga ändringar meddelas i tjänsten. Du kan sluta använda tjänsten och begära att ditt konto raderas när som helst. Vi kan stänga konton som bryter mot villkoren.</p>

      <h2>Tillämplig lag</h2>
      <p>Svensk lag gäller för dessa villkor.</p>

      <p className="gate-alt"><Link href="/integritet">Integritetspolicy</Link> · <Link href="/login">Till inloggning</Link></p>
    </main>
  );
}
