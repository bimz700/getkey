MZMODZ GET KEY — Firebase + Vercel

FLOW
- Admin login uses Firebase Email/Password.
- Admin generates keys manually and chooses a device limit per key.
- 0 / UNLIMITED = unlimited devices.
- GET KEY never generates keys automatically.
- Each claim records hashed device identifier, IP and timestamp under keys/<KEY>/claims.
- Per-device GET KEY cooldown is 24 hours.
- Admin can view devices/IP/time and DISABLE/ENABLE keys.
- Shortlink on refresh during cooldown: https://sfl.gl/cSXqDyqz

VERCEL ENV
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
FIREBASE_DATABASE_URL
ADMIN_EMAIL
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN

FIREBASE RULES
Use database.rules.json. The server uses Firebase Admin SDK and bypasses database rules.
