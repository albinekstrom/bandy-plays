# Bandyspel

Draw bandy plays step by step and play them back. Next.js on Vercel, one shared password.

## Local

```
cp .env.example .env.local   # set APP_PASSWORD and AUTH_SECRET (openssl rand -hex 32)
npm install
npm run dev
```

Without `DATABASE_URL`, plays are stored in `.data/plays.json`.

## Vercel

Env vars: `APP_PASSWORD`, `AUTH_SECRET`, and `DATABASE_URL` (from the Neon integration).
