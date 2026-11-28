# Personuppgiftsbiträdesavtal (mall)

> UTKAST. Mall som ska granskas juridiskt innan den används. Fyll i [hakparenteserna].

Detta avtal ingås mellan

**[Klubbens namn]**, org.nr [organisationsnummer] ("Personuppgiftsansvarig"), och
**[företagsnamn]**, org.nr [organisationsnummer] ("Personuppgiftsbiträdet").

## 1. Bakgrund och syfte
Personuppgiftsbiträdet tillhandahåller tjänsten Bandyspel (en taktiktavla) till Personuppgiftsansvarig. I samband med det behandlar Personuppgiftsbiträdet personuppgifter för Personuppgiftsansvarigs räkning. Avtalet reglerar behandlingen enligt artikel 28 i dataskyddsförordningen (GDPR).

## 2. Behandlingen
- **Ändamål:** att tillhandahålla inloggning och tjänsten Bandyspel till klubbens tränare och spelare.
- **Kategorier av registrerade:** tränare, spelare (även under 18 år) och andra medlemmar i klubben.
- **Typer av personuppgifter:** kontonamn (fritt valt, riktigt namn krävs inte), lösenord i form av envägs-hash, inloggningssession, samt de spel och etiketter som klubben själv skapar. Inga känsliga personuppgifter ska registreras.
- **Varaktighet:** så länge avtalet gäller, och därefter enligt punkt 10.

## 3. Instruktioner
Personuppgiftsbiträdet får behandla personuppgifterna endast enligt Personuppgiftsansvarigs dokumenterade instruktioner, vilka utgörs av detta avtal och användningen av tjänsten. Om en instruktion strider mot dataskyddsreglerna ska Personuppgiftsbiträdet underrätta Personuppgiftsansvarig.

## 4. Sekretess
Personer hos Personuppgiftsbiträdet som har tillgång till personuppgifterna ska vara bundna av sekretess.

## 5. Säkerhet
Personuppgiftsbiträdet ska vidta lämpliga tekniska och organisatoriska åtgärder, bland annat: lösenord lagras som scrypt-hash, kommunikation krypteras med TLS, åtkomst är rollstyrd (tränare/spelare), säkerhetskopior tas (se `docs/backup.md`) och fel övervakas (se `docs/monitoring.md`).

## 6. Underbiträden
Personuppgiftsansvarig godkänner följande underbiträden:

| Underbiträde | Tjänst | Plats |
|---|---|---|
| Neon, Inc. | databas (Postgres) | EU, Frankfurt |
| Vercel Inc. | hosting | EU, Frankfurt (funktioner), global CDN för statiska filer |

Personuppgiftsbiträdet ska underrätta Personuppgiftsansvarig om planerade byten eller tillägg av underbiträden minst [30] dagar i förväg, så att Personuppgiftsansvarig kan invända. Underbiträden ska omfattas av motsvarande skyldigheter som i detta avtal.

## 7. Överföring till tredjeland
Personuppgifter lagras inom EU/EES. Om underbiträden överför uppgifter utanför EU/EES ska det ske med stöd av ett giltigt överföringsverktyg, till exempel EU-kommissionens standardavtalsklausuler eller beslut om adekvat skyddsnivå.

## 8. Bistånd
Personuppgiftsbiträdet ska hjälpa Personuppgiftsansvarig att besvara registrerades begäranden (tillgång, rättelse, radering m.m.) och att fullgöra skyldigheter om säkerhet, konsekvensbedömning och samråd, i den mån det är möjligt med hänsyn till behandlingens art.

## 9. Personuppgiftsincidenter
Personuppgiftsbiträdet ska underrätta Personuppgiftsansvarig utan onödigt dröjsmål, och senast inom [48] timmar, efter att ha fått kännedom om en personuppgiftsincident, och lämna den information som behövs för att Personuppgiftsansvarig ska kunna anmäla till IMY inom 72 timmar.

## 10. Radering och återlämnande
När avtalet upphör ska Personuppgiftsbiträdet, efter Personuppgiftsansvarigs val, radera eller lämna tillbaka alla personuppgifter inom [30] dagar och radera befintliga kopior. Säkerhetskopior skrivs över inom [antal] dagar.

## 11. Granskning
Personuppgiftsbiträdet ska ge Personuppgiftsansvarig tillgång till den information som behövs för att visa att skyldigheterna följs, och medverka vid granskningar, inklusive inspektioner, som Personuppgiftsansvarig eller en utsedd revisor genomför.

## 12. Ansvar, giltighetstid och lag
Avtalet gäller så länge Personuppgiftsbiträdet behandlar personuppgifter för Personuppgiftsansvarig. Ansvar regleras av tjänstens användarvillkor och av artikel 82 i GDPR. Svensk lag gäller.

## Underskrifter

| Personuppgiftsansvarig | Personuppgiftsbiträde |
|---|---|
| [klubbens namn] | [företagsnamn] |
| Namn: | Namn: |
| Datum: | Datum: |
| Underskrift: | Underskrift: |

Kontakt för dataskyddsfrågor: [kontaktadress]
