/* Rules for new passwords (sign-up, new account, change and reset). Existing
   passwords keep working; this only runs when a password is set. */
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200; // scrypt of a huge input is a cheap way to tie up the server

// The most used passwords that pass the length rule, plus obvious ones for this team.
const COMMON = new Set([
  "12345678", "123456789", "1234567890", "12341234", "11111111", "00000000", "87654321", "11223344",
  "password", "password1", "password12", "password123", "passw0rd", "qwertyui", "qwerty123", "qwertyuiop",
  "asdfghjk", "asdfasdf", "zxcvbnm1", "iloveyou", "sunshine", "princess", "football", "baseball",
  "superman", "starwars", "whatever", "trustno1", "letmein1", "welcome1", "abcd1234", "abc12345",
  "1q2w3e4r", "1qaz2wsx", "q1w2e3r4", "aaaaaaaa", "monkey123", "dragon123", "master123", "computer",
  "lösenord", "losenord", "lösenord1", "losenord1", "lösenord123", "losenord123", "hemligt1", "hemlighet",
  "sommar2024", "sommar2025", "sommar2026", "vinter2024", "vinter2025", "vinter2026", "sverige1", "sverige123",
  "bandy123", "bandy1234", "bandybandy", "surte123", "surtebandy", "surtebk1", "bandyspel", "hockey123",
  "innebandy", "fotboll1", "fotboll123", "göteborg", "goteborg", "goteborg1", "stockholm", "kalleanka",
]);

/** What is wrong with `pass` as a new password for `name` (in Swedish), or null. */
export function passwordProblem(pass: string, name: string): string | null {
  if (pass.length < MIN_PASSWORD) return `Lösenordet ska vara minst ${MIN_PASSWORD} tecken`;
  if (pass.length > MAX_PASSWORD) return `Lösenordet får vara högst ${MAX_PASSWORD} tecken`;
  const low = pass.toLowerCase();
  const n = name.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(low) || (n && (low === n || new RegExp(`^${n}\\d*$`).test(low))) || (n && low === n + n)) {
    return "Lösenordet är för vanligt eller lätt att gissa. Välj ett annat";
  }
  return null;
}
