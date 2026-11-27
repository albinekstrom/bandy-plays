# Bandyspel

Draw bandy plays step by step, play them back, and see them in 3D. Live at https://bandy-plays.vercel.app.

## Run locally (macOS)

```
xcode-select --install                  # git
brew install node gh                    # Homebrew: https://brew.sh
gh auth login
gh repo clone albinekstrom/bandy-plays && cd bandy-plays
npm install
cp .env.example .env.local              # fill in APP_PASSWORD and AUTH_SECRET (openssl rand -hex 32)
npm run dev                             # http://localhost:3000, log in as "daniel" with APP_PASSWORD
```

Leave `DATABASE_URL` empty locally: plays and accounts then live in `.data/` and the real data is untouched.

## Deploy

Push to `main`; Vercel builds and deploys. Vercel env: `APP_PASSWORD`, `AUTH_SECRET`, `DATABASE_URL` (Neon integration).

See `CLAUDE.md` for how the code is organised.
