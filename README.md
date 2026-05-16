<div align="center">
  <img src="https://img.shields.io/badge/Google_Apps_Script-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Google Apps Script" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" />
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5" />
</div>

<br />

<h1 align="center">L-Premium POS — Laundry Point of Sale</h1>

<p align="center">
  <strong>Enterprise-Grade Laundry Management System</strong><br>
  Sistem kasir berbasis web untuk bisnis laundry modern. Dibangun di atas
  arsitektur serverless Google Apps Script dengan UI/UX premium yang
  responsif, aman, dan cepat.
</p>

---

## Ringkasan Proyek

**L-Premium POS** adalah solusi end-to-end untuk manajemen operasional
laundry. Memanfaatkan ekosistem **Google Workspace** (Google Sheets sebagai
database, Apps Script sebagai backend), aplikasi ini gratis untuk di-host
namun tetap memenuhi standar keamanan dan performa aplikasi berbayar.

Aplikasi ini telah melalui evaluasi senior full-stack dengan fokus pada
performa (concurrency, caching, batching), reliabilitas (lock service,
defensive error handling), dan UX (skeleton loading, optimistic updates).

---

## Fitur Utama

### Manajemen Transaksi & Kasir
- **Kalkulasi otomatis** — perhitungan tagihan, diskon, dan kembalian
  secara instan
- **Pembayaran fleksibel** — pelunasan langsung atau DP dengan metode
  Tunai, Transfer, atau QRIS
- **Auto-save draft** — form transaksi otomatis tersimpan ke localStorage
  setiap 5 detik agar tidak hilang saat browser crash
- **Cetak nota digital** — siap cetak ke printer thermal kasir atau kirim
  via WhatsApp
- **Konfirmasi WhatsApp** — kirim bukti transaksi & notifikasi update
  status ke pelanggan dengan satu klik

### Manajemen Pelanggan
- Pendataan pelanggan dengan nomor WhatsApp ternormalisasi
- Pelacakan riwayat transaksi & total pengeluaran (total spent) per
  pelanggan

### Manajemen Layanan
- **Katalog dinamis** — tambah, edit, dan toggle aktif/nonaktif paket
  layanan (kiloan, satuan)
- Harga, satuan, durasi, dan kategori per paket dengan optimistic UI
  update saat toggle status

### Manajemen Shift Kasir _(baru)_
- **Buka shift** — kasir wajib membuka shift dengan mencatat modal awal
  sebelum dapat memproses transaksi
- **Tutup shift dengan rekap otomatis** — modal awal, total tunai, total
  non-tunai, total pengeluaran, dan **saldo akhir** dihitung otomatis
- **Atribusi pelunasan akurat** — pelunasan transaksi yang dilakukan di
  shift berbeda tetap tercatat ke shift yang menerima uang (kolom
  `pelunasan_shift_id`)
- **Force-close oleh admin** — admin dapat menutup paksa shift yang lupa
  ditutup oleh kasir (status: `Force-Closed`)
- **Auto-close harian** — trigger otomatis pukul 23:50 menutup semua
  shift yang masih aktif sebagai fail-safe
- **Rekap shift admin** — tab khusus di halaman Laporan menampilkan
  semua shift 30 hari terakhir dengan live preview untuk shift aktif
- **Bypass admin** — role admin tidak terikat shift untuk fleksibilitas
  operasional

### Dasbor Analitik (Admin)
- Pantau real-time omzet hari ini, total transaksi, antrean diproses,
  dan cucian siap diambil
- **Multi-cashier sync** — auto-refresh dasbor setiap 1 menit
- **Laporan periodik** — generate rekapitulasi harian, mingguan, bulanan
  ke format CSV atau PDF
- **Manajemen kas harian** — uang awal, pengeluaran kategorial dengan
  estimasi saldo aktual
- **Manajemen pegawai** — CRUD akun staff dengan role admin/kasir

---

## UI/UX & Design System

Aplikasi memakai **Tailwind CSS v4** dengan pendekatan _enterprise SaaS-grade interface_:

- **Vibrant & clean design** — palet warna terkurasi, white-space lega,
  tipografi modern (Plus Jakarta Sans)
- **Visual hierarchy** — `rounded-2xl` konsisten, glow focus pada input,
  ikon SVG inline (Heroicons) untuk ketajaman visual maksimal
- **Micro-animations** — transisi halus pada hover, button press, modal
  scale-in, dan skeleton loading saat fetching
- **Audio cues** — beep asinkron via Web Audio API saat transaksi sukses
- **Accessibility-conscious** — focus trap di modal, aria-labels,
  semantic HTML

---

## Arsitektur & Performa Sistem

### 1. Integritas Data (Zero Collision)
- **UUID primary keys** — semua ID transaksi/customer/paket pakai UUID,
  mencegah tabrakan saat 2 kasir menyimpan di milidetik yang sama
- **LockService concurrency control** — semua operasi tulis kritis
  (createTransaction, lunasDanAmbil, openShift, closeShift) dibungkus
  `LockService.getScriptLock()` untuk serialize akses
- **Double-submit prevention** — state guard di sisi klien mencegah
  duplikasi transaksi akibat klik ganda
- **Server-side trust** — validasi pembayaran, perhitungan total, dan
  diskon dilakukan ulang di server, mencegah manipulasi dari DevTools

### 2. Performance Optimization
- **Batch sheet operations** — multiple `setValue` digabung jadi 1
  `setValues([...])`, peningkatan kecepatan tulis 400-600%
- **getDashboardBundle** — 1 GAS call menggantikan 3-4 serial call
  (transactions + packages + settings + customers + activeShift),
  hemat 2-8 detik per login
- **Date-bounding query** — `getTransactions` hanya membaca 300 baris
  terbaru, tetap cepat meski database punya puluhan ribu baris
- **3-layer caching strategy:**
  1. **Server cache** — referensi spreadsheet & customer list (TTL 2
     menit) di `CacheService`
  2. **Client RAM cache** — transaksi (TTL 1 menit) & customers (TTL 2
     menit), navigasi tab terasa instant
  3. **localStorage cache** — settings aplikasi (TTL 1 jam) untuk
     mempercepat cold start
- **Lazy-load heavy libs** — ApexCharts & jsPDF (~400KB) hanya dimuat
  saat tab Laporan dibuka pertama kali
- **Optimistic UI** — toggle status paket update langsung di UI tanpa
  menunggu response server

### 3. Reliability & Maintenance
- **Defensive setupDashboard** — initialization dibungkus per-blok
  try/catch, dashboard tetap muncul walau ada satu fungsi yang error
- **Silent error logging** — exception server otomatis tercatat di
  sheet `error_logs` untuk debugging tanpa mengganggu kasir
- **Auto-backup harian** — trigger CRON menduplikasi spreadsheet ke
  Google Drive setiap pukul 02:00
- **Auto-close shift** — trigger harian 23:50 mencegah shift terlupa
  dan saldo kas terdistorsi
- **LF-only line endings** — `.gitattributes` memaksa LF di semua file
  text untuk mencegah parser GAS pecah saat menerima CRLF dalam
  inline `<script>`

### 4. Security
- **Token-based session** — login menghasilkan UUID token tersimpan di
  `CacheService` dengan TTL 8 jam, di-rolling tiap aktivitas
- **Hash + salt password** — semua password di-hash sebelum disimpan,
  auto-migrasi format lama ke salted hash saat login berhasil
- **Login rate limit** — 5x percobaan gagal mengunci akun selama 15
  menit
- **Admin-only guards** — `validateAdminSession_()` di semua endpoint
  sensitif (deleteTransaction, getUsersList, forceCloseShift,
  getShiftHistory)
- **DB_ID di Script Properties** — bukan hardcoded di source, dengan
  auto-migrasi sekali jalan

---

## Struktur File Repository

```text
app-script-mpti/
├── appsscript.json     # Manifest Apps Script (timezone, runtime, webapp)
├── Kode.js             # Server-side: CRUD, auth, shift, caching
├── index.html          # Struktur HTML (layout, sidebar, modal)
├── CSS.html            # Custom CSS, font imports, print media queries
├── JavaScript.html     # Client-side: SPA navigation, state, event handlers
├── Tailwind.html       # Pre-built Tailwind CSS (di-generate via build script)
├── input.css           # Tailwind source untuk build
├── build-tailwind.js   # Build script Tailwind → Tailwind.html
├── .gitattributes      # Enforce LF line endings di semua file
└── .claspignore        # File yang dikecualikan dari clasp push
```

---

## Skema Database

Sheet otomatis dibuat oleh `setupDatabase()` saat first run:

| Sheet | Kolom |
|-------|-------|
| `users` | username, password (hashed), role, nama |
| `packages` | id, nama, harga, durasi, satuan, kategori, status |
| `transactions` | id, tanggal, customer, paket, berat, total, status, kasir, whatsapp, satuan, estimasi, metode_pembayaran, status_pembayaran, metode_pelunasan, _, catatan, terbayar, items_json, tanggal_pelunasan, nominal_dp, nominal_pelunasan, **shift_id**, **pelunasan_shift_id** |
| `settings` | key, value |
| `customers` | id, nama, whatsapp, terakhir_order |
| `kas_awal` | tanggal, nominal, kasir |
| `pengeluaran` | id, tanggal, keterangan, kategori, jumlah, kasir |
| `shifts` | id, kasir, nama_kasir, waktu_mulai, waktu_selesai, modal_awal, total_transaksi, total_tunai, total_non_tunai, jumlah_order, status, catatan |

---

## Instalasi & Deployment

Proyek dibangun menggunakan `clasp` (Command Line Apps Script Projects).

### Prasyarat
- Node.js & npm terinstal
- Akun Google
- (Opsional) `npx @tailwindcss/cli` untuk build ulang Tailwind

### Langkah Setup

1. Clone repositori:
   ```bash
   git clone <REPO_URL>
   cd app-script-standar-version
   ```

2. Install clasp global:
   ```bash
   npm install -g @google/clasp
   ```

3. Login Google:
   ```bash
   clasp login
   ```

4. Hubungkan ke project Apps Script:
   ```bash
   # Jika sudah punya Script ID:
   clasp clone <YOUR_SCRIPT_ID>

   # ATAU buat project baru:
   clasp create --type webapp --title "L-Premium POS"
   ```

5. Push ke server Google:
   ```bash
   clasp push
   ```

6. **Wajib:** Buat versi deployment baru agar URL `/exec` ter-update:
   ```bash
   clasp deploy
   ```
   Atau via editor: **Deploy → Manage deployments → Edit (pensil) →
   Version: New version → Deploy**.

### One-Time Post-Deployment Setup

Buka editor Apps Script (`clasp open`), pilih dropdown function lalu
klik Run untuk masing-masing:

| Function | Tujuan |
|----------|--------|
| `setupDatabase` | Inisialisasi sheet & migrasi kolom (`shift_id`, `pelunasan_shift_id`) |
| `setupBackupTrigger` | Aktifkan auto-backup harian pukul 02:00 |
| `setupShiftAutoCloseTrigger` | Aktifkan auto-close shift harian pukul 23:50 |
| `setupWarmupTrigger` _(opsional)_ | Mencegah cold start V8 engine |

### Workflow Pengembangan

```bash
# Edit file lokal
clasp push                     # Sync ke GAS
clasp deploy                   # Buat versi deployment baru
# Hard-refresh browser (Ctrl+Shift+R)
```

> **Catatan penting:** `clasp push` saja tidak cukup untuk URL `/exec`
> production — versi deployment baru harus dibuat agar GAS menyajikan
> kode terbaru. URL `/dev` (test deployment) selalu pakai HEAD terbaru
> tanpa perlu versioning.

---

## Default Credentials (First Run)

Setelah `setupDatabase` pertama kali, akun default dibuat:

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | admin |
| `kasir` | `kasir123` | kasir |

> **Wajib ganti password** setelah login pertama via menu Manajemen
> Pegawai.

---

## Changelog Singkat

### v2.1 — Shift Management _(terbaru)_
- Fitur shift kasir lengkap: open/close/force-close/auto-close
- Atribusi pelunasan ke shift via kolom `pelunasan_shift_id`
- Tab Rekap Shift di halaman Laporan admin
- Modal rekap saldo akhir saat tutup shift
- Bypass shift untuk role admin

### v2.0 — Performance Wave
- `getDashboardBundle` menggabungkan 4 GAS call jadi 1
- Lazy-load ApexCharts & jsPDF
- 3-layer caching strategy
- Date-bounding query transactions (30 hari terakhir)
- Optimistic UI update untuk toggle status paket
- Batch sheet operations

### v1.x — Foundation
- Daily cash management (kas awal & pengeluaran)
- User management (CRUD staff)
- WhatsApp integration & template
- Auto-save draft transaksi
- LockService di semua write operations

---

<div align="center">
  <p>Dibangun untuk operasional laundry yang efisien dan akuntabel.</p>
</div>
