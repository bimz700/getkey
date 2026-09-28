MZMODZ ADMIN PANEL v5  (Get Key + Verify Key)

Root URL (/)        : Firebase Email/Password admin login + panel.
/get-key            : halaman Get Key publik (generate key per device).
Semua fitur v4 tetap ada: stok key manual, enable/disable, delete, Maintenance,
Update App, Announcement, admin authentication.

==================== API ====================
PUBLIK (header: X-Device-Identifier; wajib valid, min 8 karakter, bukan "unknown-device")
  GET  /api/getkey               Stok key LAMA (/keys). Response tidak berubah:
                                 { success, key, existing } | { success:false, message }
  GET  /api/generate-key         Status key milik device ini (tidak membuat key).
  POST /api/generate-key         Buat key baru BIMZ-XXXX-XXXX-XXXX (1 hari, 1 device),
                                 atau kembalikan key aktif milik device ini.
  POST /api/verify-key           Body {"key":"..."}; validasi + device binding atomic.
                                 200: { valid:true, status:"ACTIVE", expiresAt, devices:{used,max} }
                                 err: { valid:false, error:"KEY_EXPIRED", message }

ADMIN (Authorization: Bearer <Firebase ID token>, email harus = ADMIN_EMAIL)
  GET  /api/admin                Daftar key (stok + generated) dan /system.
  POST /api/admin  action:
     saveKey {key,maxDevices,status}      stok lama (manual)
     createKey {durationDays,maxDevices,count}   default 1 hari, 1 device, max 20 key
     setStatus {key,status:active|disabled}
     revokeKey {key}   extendKey {key,addDays}   deleteKey {key}
     listAudit {limit}
     saveSystem {...}  saveAnnouncement {...}

ERROR CODE
  INVALID_KEY 404 | KEY_EXPIRED 403 | KEY_REVOKED 403 | DEVICE_NOT_ALLOWED 403
  MAX_DEVICES_REACHED 403 | RATE_LIMITED 429 (+Retry-After) | UNAUTHORIZED 401
  BAD_REQUEST 400 | MAINTENANCE 503 | SERVER_ERROR 500
  Key 1-device yang sudah terikat device lain -> DEVICE_NOT_ALLOWED.
  Key multi-device yang slotnya penuh        -> MAX_DEVICES_REACHED.
  Key disabled (stok lama) diperlakukan sama dengan revoked.

RATE LIMIT (per IP, disimpan di RTDB /rateLimits)
  generate POST 10/jam | generate GET 60/menit | verify 60/menit
  getkey lama 30/menit | admin 120/menit

==================== DATABASE (Firebase RTDB) ====================
/keys/{KEY}        stok lama. Field lama tetap: status, maxDevices, createdAt,
                   updatedAt, claims/{sha256(device)}. Field opsional baru:
                   expiresAt, revokedAt, revokedBy. Key lama tanpa expiresAt = tanpa batas.
/licenses/{KEY}    key hasil generate (privat): key, status(active|disabled|revoked),
                   source(generated|admin), createdAt, updatedAt, durationMs, expiresAt,
                   maxDevices, revokedAt, revokedBy, createdBy, extendedAt, lastClaimAt,
                   claims/{sha256(device)}: {device, ip, claimedAt, deviceIndex}
/deviceKeys/{sha256(device)}  -> KEY generate milik device (satu key aktif per device)
/auditLogs/{pushId}  {type, at, key, device(12 hex pertama hash), ip, code, actor, meta}
                   type: key_created, key_claimed, key_verified, device_bound,
                   device_rejected, key_expired, key_extended, key_revoked, key_deleted,
                   key_enabled, key_disabled, key_invalid
/rateLimits/{scope}/{sha256(ip)}  {s: awal window, c: hitungan}
/system            maintenance, updateMode, ..., announcement (tidak berubah)
Status key: ACTIVE | EXPIRED | REVOKED | DISABLED.

==================== FIREBASE RULES ====================
database.rules.json         TRANSISI. Menutup semua akses klien KECUALI baca /keys
                            (stok lama, agar aplikasi Android lama tidak putus). Tulis
                            klien ke claims dihapus. /licenses, /deviceKeys, /auditLogs,
                            /rateLimits, /system tidak bisa diakses klien.
database.rules.strict.json  FINAL. Semua akses klien ditutup; hanya server (firebase-admin).
Pasang lewat Firebase Console > Realtime Database > Rules. Pindah ke strict setelah
aplikasi Android dipastikan hanya memakai /api/getkey atau /api/verify-key.

==================== ENVIRONMENT VARIABLES (Vercel) ====================
Semua secret/credential HANYA dari Vercel > Project > Settings > Environment Variables
dan dibaca backend lewat process.env.*. Repository tidak berisi file .env / .env.example
dan tidak berisi nilai credential apa pun.

Nama variable yang dibutuhkan (semua wajib):
  FIREBASE_PROJECT_ID
  FIREBASE_CLIENT_EMAIL
  FIREBASE_PRIVATE_KEY      (baris baru boleh berupa \n)
  FIREBASE_DATABASE_URL
  ADMIN_EMAIL               (email akun Firebase Auth yang boleh masuk admin panel)

Fitur Get Key/Verify Key/rate limit/audit log TIDAK membutuhkan secret tambahan.
Jangan pernah taruh service account di frontend/APK. firebase-config.js hanya berisi
config web PUBLIK Firebase untuk login admin (bukan credential rahasia).

==================== DEPLOY ====================
1. Set kelima Environment Variables di Vercel (Production/Preview sesuai kebutuhan).
2. Pasang database.rules.json di Firebase Console (lihat di atas).
3. git push / vercel --prod  (tanpa build step; dependency: firebase-admin).
4. Buka / untuk admin dan /get-key untuk halaman publik.
