MZMODZ GET KEY — FIREBASE VERSION

FILES
- index.html / script.js / style.css = public GET KEY
- admin.html / admin.js / admin.css = admin panel
- api/getkey.js = public claim + 24h cooldown
- api/admin.js = admin generate/disable/enable
- api/firebase.js = Firebase Admin SDK
- api/auth.js = admin token verification
- firebase-config.js = PUBLIC Firebase Web config for admin login
- database.rules.json = locks client access to Realtime Database

VERCEL ENVIRONMENT VARIABLES
FIREBASE_PROJECT_ID=bimz-panel
FIREBASE_CLIENT_EMAIL=from Firebase service account
FIREBASE_PRIVATE_KEY=from Firebase service account private_key (keep the \n escapes)
FIREBASE_DATABASE_URL=https://bimz-panel-default-rtdb.firebaseio.com
ADMIN_EMAIL=your Firebase Auth admin email
UPSTASH_REDIS_REST_URL=your Upstash REST URL
UPSTASH_REDIS_REST_TOKEN=your NEW Upstash REST token

FIREBASE
1. Enable Authentication > Email/Password.
2. Create the admin user. Its email must equal ADMIN_EMAIL.
3. Add a Web App and put its public config in firebase-config.js.
4. Realtime Database rules: use database.rules.json.
5. Create/generate keys from /admin; the first generated key creates the keys node automatically.

IMPORTANT
- Do NOT put Firebase service-account JSON/private key in the website or APK.
- The Android APK can use google-services.json and the same Realtime Database.
- Rotate any Upstash token that was previously exposed.
