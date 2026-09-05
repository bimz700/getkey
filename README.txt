MZMODZ v3 — MANUAL KEY ACCESS

- Admin membuat/menentukan key sendiri.
- Admin menentukan batas device per key. 0 = unlimited.
- Admin dapat ACTIVE/DISABLED dan menghapus key.
- Device disimpan sebagai SHA-256, bersama IP dan waktu claim.
- Tidak ada generate key otomatis.
- Tidak ada Upstash / cooldown 24 jam.
- Admin dapat mengaktifkan Maintenance atau Update Mode dari panel.
- System settings disimpan di Firebase RTDB pada /system.
- GET KEY membaca /system dan /keys melalui server API.

Vercel env yang dibutuhkan:
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
FIREBASE_DATABASE_URL
ADMIN_EMAIL

Firebase Auth: Email/Password.
Firebase RTDB: server memakai Firebase Admin SDK.
Jangan masukkan private key service account ke frontend/APK.
