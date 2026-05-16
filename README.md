<div align="center">

<!-- Logo placeholder — ganti dengan logo asli jika tersedia -->
<img src="https://api.iconify.design/mdi:tshirt-crew.svg?color=%232563eb&height=96" alt="Kucucikan Laundry POS Logo" height="96" />

# Kucucikan Laundry POS

### Sistem Kasir & Manajemen Operasional Laundry Berbasis Cloud

_Enterprise-grade Point of Sale, dibangun di atas Google Apps Script — tanpa server, tanpa biaya hosting, tetap cepat dan andal._

<br />

[![Google Apps Script](https://img.shields.io/badge/Google_Apps_Script-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://script.google.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![Google Sheets](https://img.shields.io/badge/Google_Sheets-34A853?style=for-the-badge&logo=google-sheets&logoColor=white)](https://sheets.google.com/)

<br />

[![Status](https://img.shields.io/badge/status-production_ready-success?style=flat-square)](#)
[![Version](https://img.shields.io/badge/version-2.1-blue?style=flat-square)](#changelog)
[![Runtime](https://img.shields.io/badge/runtime-V8-orange?style=flat-square)](#)
[![Timezone](https://img.shields.io/badge/timezone-Asia%2FJakarta-violet?style=flat-square)](#)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](#license)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](#contributing)

<br />

[Fitur](#-fitur-utama) ·
[Demo](#-screenshots--demo) ·
[Arsitektur](#-arsitektur--performa) ·
[Instalasi](#-instalasi--deployment) ·
[Skema DB](#-skema-database) ·
[Changelog](#-changelog)

</div>

---

## Daftar Isi

- [Tentang Proyek](#-tentang-proyek)
- [Fitur Utama](#-fitur-utama)
- [Screenshots & Demo](#-screenshots--demo)
- [Tech Stack](#-tech-stack)
- [Arsitektur & Performa](#-arsitektur--performa)
- [Skema Database](#-skema-database)
- [Instalasi & Deployment](#-instalasi--deployment)
- [Konfigurasi Pasca-Deploy](#-konfigurasi-pasca-deploy)
- [Workflow Pengembangan](#-workflow-pengembangan)
- [Kredensial Default](#-kredensial-default)
- [Roadmap](#-roadmap)
- [Changelog](#-changelog)
- [Contributing](#-contributing)
- [License](#-license)

---

## Tentang Proyek

**Kucucikan Laundry POS** adalah sistem kasir _end-to-end_ untuk bisnis
laundry yang mengeliminasi kebutuhan server konvensional dengan
memanfaatkan ekosistem Google Workspace:

- **Google Sheets** sebagai database relasional
- **Google Apps Script** sebagai backend serverless
- **Web App URL** sebagai endpoint produksi

Hasilnya: aplikasi POS siap pakai dengan _zero infrastructure cost_, namun
tetap memenuhi standar profesional dalam keamanan (token-based auth,
hashed passwords, server-side validation), performa (multi-layer caching,
batch operations, lazy loading), dan akuntabilitas (shift management,
audit log, auto-backup).

> Cocok untuk UMKM laundry dengan 1–3 kasir aktif yang membutuhkan sistem
> POS profesional tanpa biaya berlangganan bulanan.

---

## Fitur Utama

<table>
<tr>
<td width="50%" valign="top">

### Manajemen Transaksi
- Kalkulasi otomatis tagihan, diskon, kembalian
- Pembayaran fleksibel: Tunai, Transfer, QRIS
- Sistem DP (Down Payment) dan pelunasan
- Multi-item per transaksi (kiloan + satuan)
- Auto-save draft tiap 5 detik (anti-crash)
- Cetak nota digital (thermal-ready)
- Konfirmasi WhatsApp dengan template kustom

### Manajemen Pelanggan
- CRUD pelanggan dengan WA ternormalisasi
- Riwayat transaksi & total spent per pelanggan
- Auto-suggest saat input transaksi baru
- Badge VIP otomatis untuk pelanggan loyal

### Manajemen Layanan
- Katalog dinamis (kiloan, satuan, kategori)
- Toggle aktif/nonaktif dengan optimistic UI
- Indikator popularitas paket
- Migration kolom otomatis untuk skema baru

</td>
<td width="50%" valign="top">

### Shift Management _(NEW)_
- Buka shift dengan modal awal kas
- Tutup shift dengan rekap saldo akhir otomatis
- Atribusi pelunasan akurat antar shift
- Force-close oleh admin untuk shift terbengkalai
- Auto-close trigger harian pukul 23:50
- Tab Rekap Shift di laporan admin
- Bypass otomatis untuk role admin

### Dasbor Analitik
- Real-time omzet, antrean, target hari ini
- Multi-cashier sync (auto-refresh 1 menit)
- Tren pendapatan + chart layanan terlaris
- Export laporan CSV / PDF (lazy-loaded)
- Manajemen kas harian (uang awal & pengeluaran)
- Estimasi saldo real-time

### Administrasi
- Manajemen pegawai (admin/kasir)
- Pengaturan toko (nama, logo, rekening)
- Template WhatsApp kustom dengan placeholder
- Auto-backup harian ke Google Drive
- Error logging silent ke sheet khusus

</td>
</tr>
</table>

---

## Screenshots & Demo

> _Screenshot dapat ditambahkan di folder `docs/screenshots/` dan
> direferensikan di sini._

<table>
<tr>
<td align="center" width="33%">
<strong>Login</strong><br/>
<sub>Halaman masuk dengan branding kustom</sub>
</td>
<td align="center" width="33%">
<strong>Dasbor Overview</strong><br/>
<sub>Pantau omzet & antrean real-time</sub>
</td>
<td align="center" width="33%">
<strong>Halaman Transaksi</strong><br/>
<sub>Input cepat dengan auto-suggest</sub>
</td>
</tr>
<tr>
<td align="center">
<strong>Banner Shift</strong><br/>
<sub>Status & rekap aktif</sub>
</td>
<td align="center">
<strong>Rekap Shift Admin</strong><br/>
<sub>Riwayat & force-close</sub>
</td>
<td align="center">
<strong>Modal Saldo Akhir</strong><br/>
<sub>Penghitungan otomatis tutup shift</sub>
</td>
</tr>
</table>

---

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| **Backend** | Google Apps Script (V8 Runtime), JavaScript |
| **Database** | Google Sheets (8 sheets relasional) |
| **Frontend** | HTML5, JavaScript ES2020, Tailwind CSS v4.2.3 |
| **Charts** | ApexCharts (lazy-loaded) |
| **PDF Export** | jsPDF + jsPDF-AutoTable (lazy-loaded) |
| **Tooling** | clasp (CLI), npm, Tailwind CLI |
| **Hosting** | Google Workspace (Web App URL) |
| **Concurrency** | LockService (Apps Script) |
| **Caching** | CacheService + localStorage + RAM |

---

## Arsitektur & Performa

### Diagram Arsitektur

```
┌─────────────────────────────────────────────────────────────┐
│                       Browser (Client)                        │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ index.html  │  │ JavaScript   │  │ localStorage Cache    │ │
│  │ + CSS       │  │ (SPA, state) │  │ (settings 1h)         │ │
│  └─────────────┘  └──────┬───────┘  └──────────────────────┘ │
└──────────────────────────┼──────────────────────────────────┘
                           │ google.script.run
                           ▼
┌─────────────────────────────────────────────────────────────┐
│           Google Apps Script (Server, V8)                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Kode.js  —  Auth · CRUD · Shift · Reporting · Lock   │  │
│  └──────────┬───────────────────────────────┬───────────┘  │
│             │                               │              │
│             ▼                               ▼              │
│  ┌──────────────────┐          ┌──────────────────────┐   │
│  │ CacheService     │          │ PropertiesService    │   │
│  │ (sessions, lists)│          │ (DB_ID, secrets)     │   │
│  └──────────────────┘          └──────────────────────┘   │
└─────────────────────────────┬───────────────────────────────┘
                              │ SpreadsheetApp.openById()
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Google Sheets (Database)                        │
│  users · packages · transactions · settings · customers ·    │
│  kas_awal · pengeluaran · shifts                             │
└─────────────────────────────────────────────────────────────┘
```

### Pilar Optimasi

#### Performance
- **`getDashboardBundle`** — 1 RPC menggantikan 4 panggilan serial
  (transactions + packages + settings + customers + activeShift),
  hemat **2–8 detik** per login
- **Batch sheet writes** — `setValues([rows])` menggantikan multiple
  `setValue()`, percepat tulis hingga **400–600%**
- **Date-bounding query** — `getTransactions` hanya membaca 300 baris
  terbaru, tetap cepat di database puluhan ribu baris
- **Lazy-load** ApexCharts (~250KB) + jsPDF (~150KB) hanya saat tab
  Laporan dibuka, hemat ~400KB pada initial load
- **3-layer caching**:
  - **Server CacheService** — sesi token (8h), customer list (2m)
  - **Client RAM** — transactions (1m), customers (2m)
  - **localStorage** — settings (1h)

#### Reliability
- **LockService** di semua operasi tulis kritis (createTransaction,
  lunasDanAmbil, openShift, closeShift, forceCloseShift)
- **Defensive setupDashboard** dengan per-blok try/catch — dashboard
  tetap muncul walau ada satu fungsi error
- **Silent error logging** ke sheet `error_logs` untuk debugging
  pasca-insiden tanpa mengganggu kasir
- **Auto-backup harian** spreadsheet ke Drive pukul 02:00
- **Auto-close shift harian** pukul 23:50 sebagai fail-safe

#### Security
- **Token-based session** dengan UUID, TTL 8 jam, rolling refresh
- **Salted hash password** dengan auto-migrasi format lama
- **Login rate limit** — 5 percobaan gagal mengunci 15 menit
- **Admin-only guards** via `validateAdminSession_()` di endpoint
  sensitif (`deleteTransaction`, `forceCloseShift`, `getUsersList`,
  `getShiftHistory`)
- **DB_ID** di Script Properties (bukan hardcoded), auto-migrasi
- **Server-side trust** — perhitungan total, diskon, status validasi
  ulang di server (mencegah manipulasi DevTools)

#### Maintainability
- **LF-only line endings** dipaksa via `.gitattributes` — mencegah
  parser GAS pecah saat menerima CRLF dalam inline `<script>`
- **`.claspignore`** mengecualikan file debug dari deployment
- **Modular helpers** — `computeShiftSummary_()` dipakai di
  closeShift/forceCloseShift/autoCloseExpiredShifts/getShiftHistory
- **Migration scripts** — `setupDatabase()` idempoten untuk
  menambahkan kolom baru tanpa data loss

---

## Skema Database

Sheet otomatis dibuat & dimigrasi oleh `setupDatabase()`:

<details>
<summary><b>Sheet: <code>users</code></b></summary>

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| username | string | Primary key (case-insensitive) |
| password | string | Salted hash format `salt:hash` |
| role | enum | `admin` / `kasir` |
| nama | string | Display name |

</details>

<details>
<summary><b>Sheet: <code>packages</code></b></summary>

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | UUID | Primary key |
| nama_paket | string | Nama layanan |
| harga | int | Tarif per satuan |
| durasi_hari | int | Estimasi proses (hari) |
| satuan | string | Kg / Pcs / Set |
| kategori | string | Tag pengelompokan |
| status | enum | `Aktif` / `Nonaktif` |

</details>

<details>
<summary><b>Sheet: <code>transactions</code> (23 kolom)</b></summary>

| # | Kolom | Tipe |
|---|-------|------|
| 1 | id | UUID |
| 2 | tanggal | ISO datetime |
| 3 | customer | string |
| 4 | paket | string (legacy single-item) |
| 5 | berat | float (legacy) |
| 6 | total | int |
| 7 | status | `Proses`/`Selesai`/`Diambil` |
| 8 | kasir | username |
| 9 | whatsapp | string |
| 10 | satuan | string |
| 11 | estimasi_selesai | ISO datetime |
| 12 | metode_pembayaran | string |
| 13 | status_pembayaran | `Lunas`/`Belum Lunas` |
| 14 | metode_pelunasan | string |
| 15 | _(reserved)_ | — |
| 16 | catatan | string |
| 17 | terbayar | int |
| 18 | items_json | JSON (multi-item) |
| 19 | tanggal_pelunasan | ISO datetime |
| 20 | nominal_dp | int |
| 21 | nominal_pelunasan | int |
| 22 | **shift_id** | UUID (FK → shifts.id) |
| 23 | **pelunasan_shift_id** | UUID (FK → shifts.id) |

</details>

<details>
<summary><b>Sheet: <code>shifts</code></b></summary>

| # | Kolom | Tipe |
|---|-------|------|
| 1 | id | UUID |
| 2 | kasir | username |
| 3 | nama_kasir | string |
| 4 | waktu_mulai | ISO datetime |
| 5 | waktu_selesai | ISO datetime |
| 6 | modal_awal | int |
| 7 | total_transaksi | int |
| 8 | total_tunai | int |
| 9 | total_non_tunai | int |
| 10 | jumlah_order | int |
| 11 | status | `Aktif`/`Selesai`/`Force-Closed` |
| 12 | catatan | string |

</details>

<details>
<summary><b>Sheet lainnya</b></summary>

- **`settings`** — `key`, `value` (config aplikasi)
- **`customers`** — `id`, `nama`, `whatsapp`, `terakhir_order`
- **`kas_awal`** — `tanggal`, `nominal`, `kasir`
- **`pengeluaran`** — `id`, `tanggal`, `keterangan`, `kategori`, `jumlah`, `kasir`

</details>

---

## Instalasi & Deployment

### Prasyarat

- [Node.js](https://nodejs.org/) ≥ 18.x & npm
- Akun Google dengan akses Apps Script
- (Opsional) Tailwind CLI untuk rebuild CSS

### Quick Start

```bash
# 1. Clone repository
git clone https://github.com/nndda-rzn/kucucikan-laundry-gas.git
cd kucucikan-laundry-gas

# 2. Install clasp global
npm install -g @google/clasp

# 3. Login ke Google
clasp login

# 4a. Hubungkan ke project Apps Script existing
clasp clone <YOUR_SCRIPT_ID>

# 4b. ATAU buat project baru
clasp create --type webapp --title "Kucucikan Laundry POS"

# 5. Push source ke server
clasp push

# 6. Buat versi deployment baru (WAJIB untuk URL /exec)
clasp deploy
```

### Build Tailwind (Opsional)

Jika ingin mengubah utility class atau menambahkan custom CSS:

```bash
npm install -D @tailwindcss/cli
node build-tailwind.js
clasp push
```

---

## Konfigurasi Pasca-Deploy

Buka editor (`clasp open`) lalu jalankan fungsi berikut **satu kali**:

| Function | Tujuan | Frekuensi |
|----------|--------|-----------|
| `setupDatabase` | Inisialisasi sheet & migrasi kolom | Sekali (idempoten) |
| `setupBackupTrigger` | Auto-backup harian pukul 02:00 | Sekali |
| `setupShiftAutoCloseTrigger` | Auto-close shift harian 23:50 | Sekali |
| `setupWarmupTrigger` | _(opsional)_ Anti cold-start V8 | Sekali |

> **Catatan:** Pertama kali Run akan meminta authorization Google untuk
> akses Sheets, Drive, dan ScriptApp triggers. Klik _Review permissions_
> → pilih akun → _Allow_.

---

## Workflow Pengembangan

```bash
# Edit file lokal di IDE favorit
code .

# Sync ke GAS
clasp push

# Buat versi deployment baru (untuk URL /exec)
clasp deploy

# Atau test di /dev URL (pakai HEAD terbaru tanpa versioning)
clasp open
# → Deploy → Test deployments → ambil URL
```

> **Penting:** `clasp push` saja **tidak** akan meng-update URL `/exec`
> production — versi deployment baru harus dibuat agar GAS menyajikan
> kode terbaru. Gunakan `/dev` URL untuk iterasi cepat saat development.

---

## Kredensial Default

Setelah `setupDatabase()` pertama kali dijalankan:

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | admin |
| `kasir` | `kasir123` | kasir |

> **Wajib ganti password** setelah login pertama melalui menu
> **Manajemen Pegawai**.

---

## Roadmap

- [ ] Multi-cabang (multi-spreadsheet sync)
- [ ] Dashboard real-time via Apps Script Sheets API push
- [ ] Loyalty point & redemption sistem
- [ ] Integrasi payment gateway (Midtrans/Xendit) untuk QRIS dinamis
- [ ] Mobile-first PWA dengan offline mode
- [ ] Multi-bahasa (EN/ID)
- [ ] Audit trail per transaksi (siapa edit kapan)
- [ ] Time-based shift schedule (jadwal otomatis kasir)

---

## Changelog

### v2.1 — Shift Management _(2026-05)_
- Fitur shift kasir lengkap: open · close · force-close · auto-close
- Atribusi pelunasan via kolom `pelunasan_shift_id` (kolom ke-23)
- Tab Rekap Shift di halaman Laporan admin
- Modal rekap saldo akhir saat tutup shift
- Auto-close trigger harian 23:50 sebagai fail-safe
- Bypass shift untuk role admin
- LF-only line endings via `.gitattributes`
- Defensive `setupDashboard` per-blok try/catch

### v2.0 — Performance Wave _(2026-05)_
- `getDashboardBundle` — 1 GAS call menggantikan 4 panggilan
- Lazy-load ApexCharts & jsPDF
- 3-layer caching strategy
- Date-bounding query (300 transaksi terbaru)
- Optimistic UI untuk toggle status paket
- Batch sheet operations (setValues)

### v1.x — Foundation
- Daily cash management (kas awal & pengeluaran)
- User management dengan role-based access
- WhatsApp integration & template kustom
- Auto-save draft transaksi
- LockService di semua write operations
- Auto-backup harian ke Drive
- UI overhaul ke Tailwind v4

---

## Contributing

Kontribusi terbuka untuk siapa saja yang ingin meningkatkan sistem ini.

```bash
# Fork & clone
git clone https://github.com/<your-username>/kucucikan-laundry-gas.git
cd kucucikan-laundry-gas

# Buat branch fitur
git checkout -b feat/nama-fitur

# Edit, test via clasp push, commit
git commit -m "feat: deskripsi singkat"

# Push & buka Pull Request
git push origin feat/nama-fitur
```

### Konvensi Commit

Mengikuti [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Penggunaan |
|--------|------------|
| `feat:` | Fitur baru |
| `fix:` | Bug fix |
| `perf:` | Optimasi performa |
| `refactor:` | Refactor tanpa perubahan behavior |
| `docs:` | Update dokumentasi |
| `chore:` | Tooling, deps, config |
| `style:` | Formatting, whitespace |

### Code Style

- LF line endings (dipaksa oleh `.gitattributes`)
- Indentasi 2 spasi
- Naming: `camelCase` untuk function/variable, `_suffix` untuk private
  helpers (mis. `getActiveShift_`)

---

## License

Proyek ini dirilis di bawah [MIT License](LICENSE).

---

<div align="center">

**Kucucikan Laundry POS**

_Built with care for laundry operations that demand speed, accuracy, and accountability._

<sub>Made with Apps Script · Deployed on Google Workspace · Zero infrastructure cost</sub>

[⬆ Kembali ke atas](#kucucikan-laundry-pos)

</div>
