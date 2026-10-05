MZMODZ ADMIN PANEL v7  (Get Key + Verify Key + Android API + Multi-Role/Seller)

Root URL (/)   : Firebase Email/Password admin login + panel.
/get-key       : halaman Get Key publik (generate key).
Semua fitur lama tetap ada: stok key manual, enable/disable, delete, Maintenance,
Update App, Announcement, admin authentication.

ALUR APLIKASI ANDROID
  Announcement -> Maintenance -> Update (tetap membaca Firebase /system langsung)
  -> Key Validation: POST /api/verify-key (BUKAN lagi baca /keys / tulis /claims)
  -> MzmodzActivity.
Kode Android (Sketchware): android/1_ONSTART_system_check.java (cek /system saat start, tanpa
validasi key) dan android/2_LOGIN_button_verify_key.java (hanya dijalankan saat tombol LOGIN ditekan).

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


==================== ROLE / PERMISSION (v7) ====================
Permission bisa dikombinasikan per akun: admin, seller (owner khusus). Disimpan di
/users/{uid} (hanya server): {email, name, active, permissions:{seller,admin,owner}, limits?, createdAt, updatedAt}.
- OWNER = akun ber-email ADMIN_EMAIL (akun admin existing). Ditentukan dari environment variable,
  BUKAN dari database: tidak bisa diberikan/dicabut/dinonaktifkan/dihapus lewat API, dan nilai
  permissions.owner di database selalu diabaikan. Owner otomatis admin + seller.
- ADMIN (permissions.admin): semua fungsi Admin Panel existing; tanpa User Management.
- SELLER (permissions.seller): Seller Panel; hanya key miliknya.
Login: /api/me menentukan panel. Seller saja -> Seller Panel; admin saja -> Admin Panel;
lebih dari satu (admin+seller / owner) -> pilihan panel. Tombol SWITCH PANEL ada di tiap panel;
pilihan diingat selama sesi browser.

API tambahan
  GET  /api/me            { uid,email,name,owner,admin,seller,panels,limits }   (token Firebase)
  GET  /api/seller        key milik seller (difilter di server: licenses.sellerId == uid) + stats
  POST /api/seller        {action:"createKey", durationDays, maxDevices, count}
  POST /api/admin (OWNER saja): listUsers | saveUser{email,name,password?,permissions{admin,seller},active,limits{maxDurationDays,maxDevices}}
                               | setUserActive{uid,active} | deleteUser{uid}
Semua endpoint memverifikasi token, UID, permission, dan ownership di server.
Key buatan seller: source "seller", sellerId = createdBy = UID seller, createdByEmail. Key lama
(tanpa sellerId) dan stok /keys hanya terlihat oleh Admin/Owner. Seller TIDAK bisa revoke/extend/delete
(tetap Admin) dan tidak melihat IP device.
Limit seller (bisa diubah Owner per akun): default maks 365 hari dan 10 device per key, 20 key per request,
20 request pembuatan per jam per IP.
Menghapus user tidak menghapus key miliknya. Menonaktifkan user: langsung ditolak server + akun Auth disabled.
Rules: hanya ditambah index licenses.sellerId; /users, /licenses, /auditLogs tetap tertutup untuk klien.
(Fitur Short Link tidak butuh environment variable tambahan, lihat bagian SHORT LINK.)

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
/users/{uid}       lihat bagian ROLE (privat, hanya server)
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
firebase-config.js hanya config web PUBLIK untuk login admin.

==================== DEPLOY ====================
1. Pastikan 5 Environment Variables terisi di Vercel.
2. Pasang database.rules.json (tahap 1) di Firebase Console.
3. Deploy backend (git push / vercel --prod). Tanpa build step; dependency: firebase-admin.
4. Android: pasang blok 1 di event start dan blok 2 di onClick tombol LOGIN; hapus semua blok
   FirebaseDB1/_firebase yang memakai path keys/; rilis APK baru.
5. Setelah APK lama tidak dipakai, pasang database.rules.strict.json (tahap 2).

==================== SHORT LINK MANUAL (GATE /get-key) ====================
Alur: /get-key -> Short Link (https://sfl.gl/BFeVm8DP) -> /get-key -> GET KEY tampil. Tanpa ?access=, tanpa token di URL.
- URL Short Link: konstanta MANUAL_SHORT_LINK di api/_lib/shortlink.js (satu-satunya tempat ganti).
- Destination Short Link di dashboard penyedia: https://DOMAIN/get-key (polos, tanpa parameter).
- /get-key tanpa cookie pending -> set cookie gk_pending (HttpOnly, bertanda tangan HMAC, 30 menit) lalu 302 ke Short Link.
- Kembali dari Short Link dengan cookie pending valid (min. 8 detik sejak redirect) -> cookie dihapus, sesi bertanda tangan
  dikirim lewat hash (#s=...), dibaca get-key.js ke memori lalu dihapus dengan history.replaceState.
- Refresh / tutup-buka lagi -> cookie sudah terpakai/hilang -> kembali ke Short Link. Kembali < 8 detik -> halaman 'belum selesai' (tanpa redirect).
- POST /api/generate-key wajib header X-Gate-Session (sesi valid, TTL 30 menit); GET status tidak berubah.
- Pengaman loop: maks 3 redirect ke Short Link per 60 detik, setelah itu halaman error.
- Kunci tanda tangan diturunkan dari FIREBASE_PRIVATE_KEY. GETKEY_ACCESS_TOKEN TIDAK dipakai lagi (boleh dihapus dari Vercel).
- Opsional: env GETKEY_REQUIRE_REFERER=1 menambah syarat Referer berasal dari host Short Link (aktifkan setelah dites; tidak semua provider mengirim Referer).
- BATASAN: Short Link tanpa callback/parameter tidak bisa dibuktikan secara kriptografis; gate hanya membuktikan browser pernah dikirim ke Short Link dan kembali setelah jeda minimum.