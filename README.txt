MZMODZ ADMIN PANEL v6  (Get Key + Verify Key + Android API)

Root URL (/)   : Firebase Email/Password admin login + panel.
/get-key       : halaman Get Key publik (generate key).
Semua fitur lama tetap ada: stok key manual, enable/disable, delete, Maintenance,
Update App, Announcement, admin authentication.

ALUR APLIKASI ANDROID
  Announcement -> Maintenance -> Update (tetap membaca Firebase /system langsung)
  -> Key Validation: POST /api/verify-key (BUKAN lagi baca /keys / tulis /claims)
  -> MzmodzActivity.
Kode Android pengganti: android/MainActivity_key_validation.java

==================== API ====================
PUBLIK (header X-Device-Identifier wajib: ANDROID_ID / id browser, min 8 karakter,
        bukan "unknown-device"/"UNKNOWN_DEVICE"; server yang melakukan hashing)
  POST /api/verify-key
     Header : X-Device-Identifier, X-Device-Model (opsional, tampilan admin)
     Body   : {"key":"BIMZ-XXXX-XXXX-XXXX"}   (key stok lama juga diterima)
     200    : { success:true, valid:true, status:"ACTIVE", expiresAt, deviceIndex,
                maxDevices, newlyBound, devices:{used,max} }
              expiresAt = ms epoch (0 = tanpa batas); maxDevices 0 = unlimited.
     error  : { success:false, valid:false, error:"<CODE>", message }
     Device baru yang masih punya slot otomatis di-bind (atomic) saat verifikasi pertama.
  GET  /api/generate-key    Status key milik browser ini (tidak membuat key).
  POST /api/generate-key    Buat key BIMZ-XXXX-XXXX-XXXX (1 hari, 1 device), atau kembalikan
                            key aktif milik browser ini. Key BELUM terikat device; terikat ke
                            device pertama yang memakainya lewat /api/verify-key.
  GET|POST /api/getkey      Stok key LAMA (/keys), response tidak berubah.

ADMIN (Authorization: Bearer <Firebase ID token>, email = ADMIN_EMAIL)
  GET  /api/admin           Daftar key (stok + generated) dan /system.
  POST /api/admin  action:  saveKey | createKey{durationDays,maxDevices,count} |
                            setStatus | revokeKey | extendKey{addDays} | deleteKey |
                            listAudit{limit} | saveSystem | saveAnnouncement

ERROR CODE
  INVALID_KEY 404 | KEY_EXPIRED 403 | KEY_REVOKED 403 | KEY_DISABLED 403
  DEVICE_NOT_ALLOWED 403 | MAX_DEVICES_REACHED 403 | RATE_LIMITED 429 (+Retry-After)
  UNAUTHORIZED 401 | BAD_REQUEST 400 | MAINTENANCE 503 | SERVER_ERROR 500
  KEY_DISABLED  = status "disabled" (tanpa revokedAt) ; KEY_REVOKED = dicabut admin.
  Key 1-device yang terikat device lain -> DEVICE_NOT_ALLOWED.
  Key multi-device yang slotnya penuh   -> MAX_DEVICES_REACHED.

RATE LIMIT (per IP, RTDB /rateLimits)
  generate POST 10/jam | generate GET 60/menit | verify 60/menit | getkey lama 30/menit
  admin 120/menit

==================== DATABASE (Firebase RTDB) ====================
/keys/{KEY}        stok lama, TIDAK diubah secara destruktif. Field lama: status, maxDevices,
                   durationDays, createdAt, updatedAt, claims/{deviceId}. Opsional baru:
                   expiresAt, revokedAt, revokedBy. Tanpa expiresAt = tanpa batas.
                   Claim lama (kunci = ANDROID_ID mentah) tetap dikenali; claim baru
                   memakai sha256(device). Claim lama: expiredAt hanya berlaku jika key
                   punya durationDays > 0 (semantik aplikasi lama).
                   Revoke stok lama menulis status "disabled" + revokedAt (APK lama ikut menolak).
/licenses/{KEY}    key hasil generate (privat): key, status(active|disabled|revoked),
                   source(generated|admin), createdAt, updatedAt, durationMs, expiresAt,
                   maxDevices, issuedTo(hash browser), createdBy, revokedAt, revokedBy,
                   extendedAt, lastClaimAt, claims/{sha256(device)}:
                   {device, ip, claimedAt, deviceIndex, model?}
/deviceKeys/{sha256(browser)} -> KEY generate aktif untuk browser itu
/auditLogs/{pushId}  {type, at, key, device(12 hex hash), ip, code, actor, meta}
/rateLimits/{scope}/{sha256(ip)}  {s, c}
/system            maintenance, updateMode, ..., announcement (tidak berubah)
Status: ACTIVE | EXPIRED | REVOKED | DISABLED.

==================== FIREBASE RULES (2 tahap) ====================
Aplikasi Android SELALU membaca /system langsung (Announcement/Maintenance/Update),
jadi /system harus tetap bisa dibaca klien di kedua file rules.

TAHAP 1  database.rules.json  (pasang SEKARANG)
  /system baca publik; /keys tetap baca publik + aturan tulis claims lama, supaya APK LAMA
  yang sudah terpasang tetap jalan. APK baru tidak menyentuh /keys dan /claims.
  Konsekuensi: selama APK lama masih beredar, celah lama (baca /keys, tulis claim langsung)
  masih ada. Penegakan maxDevices/expiry/revoke server-side hanya berlaku penuh untuk APK baru
  dan website.
TAHAP 2  database.rules.strict.json  (pasang setelah APK lama tidak dipakai lagi)
  Hanya /system yang bisa dibaca klien; semua lainnya hanya lewat server (firebase-admin).
  APK lama akan gagal membaca key (permission denied).
Pasang lewat Firebase Console > Realtime Database > Rules. Periksa juga rules yang AKTIF di
console: file di repo belum tentu sama dengan yang terpasang.

==================== ENVIRONMENT VARIABLES (Vercel) ====================
Semua secret hanya dari Vercel > Settings > Environment Variables (process.env.*).
Repository tidak berisi .env / .env.example / nilai credential.
Wajib: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (baris baru boleh \n),
       FIREBASE_DATABASE_URL, ADMIN_EMAIL.
Tidak ada secret tambahan. firebase-config.js hanya config web PUBLIK untuk login admin.

==================== DEPLOY ====================
1. Pastikan 5 Environment Variables terisi di Vercel.
2. Pasang database.rules.json (tahap 1) di Firebase Console.
3. Deploy backend (git push / vercel --prod). Tanpa build step; dependency: firebase-admin.
4. Ganti kode key di Android sesuai android/MainActivity_key_validation.java, rilis APK baru.
5. Setelah APK lama tidak dipakai, pasang database.rules.strict.json (tahap 2).
