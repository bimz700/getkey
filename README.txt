MZMODZ ADMIN PANEL v4

Root URL opens the Firebase Email/Password admin login directly.
There is NO public GET KEY page.

KEY MANAGEMENT
- Type one key manually.
- Device limit is any number from 0 to 100000. 0 = unlimited.
- Save as ACTIVE or DISABLED.
- Existing claims are preserved when editing a key.
- View device hash, IP and claim time.
- Disable/Enable a key.
- Delete a key and all of its claims.
- Device usage is calculated from Firebase claims: used/limit.

APP CONTROL
- Maintenance App ON/OFF.
- Maintenance message.
- Update App ON/OFF.
- Update message, version and optional APK download URL.
- Settings are stored in Firebase /system and can be changed live without redeploying.

FIREBASE ENVIRONMENT VARIABLES FOR VERCEL
FIREBASE_PROJECT_ID=bimz-panel
FIREBASE_CLIENT_EMAIL=<service account client_email>
FIREBASE_PRIVATE_KEY=<service account private_key>
FIREBASE_DATABASE_URL=https://bimz-panel-default-rtdb.firebaseio.com
ADMIN_EMAIL=<Firebase Auth admin email>

The Firebase Web config in firebase-config.js is public client config and is only used for admin login.
Never put a Firebase service-account private key in the frontend or APK.
