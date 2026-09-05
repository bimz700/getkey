MZMODZ GET KEY — Firebase + Vercel

CURRENT BUILD
- Firebase Web config is filled with the supplied Web App config.
- Admin login uses Firebase Email/Password.
- Server authorization checks the signed-in Firebase email against ADMIN_EMAIL.
- Email verification status is NOT required; ADMIN_EMAIL remains the authorization gate.
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

IMPORTANT
- Do not put the Firebase service-account private key in firebase-config.js or the APK.
- The Firebase Web API key in firebase-config.js is a public client config value.
- This build does NOT generate any real key during validation/build.
