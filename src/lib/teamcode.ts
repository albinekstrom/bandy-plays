/* Readable random team code: capitals and digits without 0/O, 1/I/L (31^8, about 8.5e11 combinations;
   with sign-up limited to a few wrong codes per IP and 15 minutes, guessing is hopeless). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** For new codes only: a saved code keeps working whatever its length. */
export const MIN_TEAM_CODE = 8;
export function randomTeamCode() {
  // 2^32 is not a multiple of 31: drop the top few values so every letter is equally likely
  const out: string[] = [];
  const cap = Math.floor(2 ** 32 / ALPHABET.length) * ALPHABET.length;
  while (out.length < MIN_TEAM_CODE) {
    for (const n of crypto.getRandomValues(new Uint32Array(MIN_TEAM_CODE))) {
      if (n < cap && out.length < MIN_TEAM_CODE) out.push(ALPHABET[n % ALPHABET.length]);
    }
  }
  return out.join("");
}
