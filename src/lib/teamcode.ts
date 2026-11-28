/* Readable random team code: capitals and digits without 0/O, 1/I/L (31^8 combinations). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function randomTeamCode() {
  return [...crypto.getRandomValues(new Uint32Array(8))].map(n => ALPHABET[n % ALPHABET.length]).join("");
}
