<div align="center">
  <img src="https://img.shields.io/badge/Google_Apps_Script-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Google Apps Script" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" />
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5" />
</div>

<br />

<h1 align="center">🧺 L-Premium POS (Point of Sale)</h1>

<p align="center">
  <strong>Enterprise-Grade Laundry Management System</strong><br>
  Sistem kasir cerdas berbasis web yang dirancang khusus untuk bisnis laundry modern. Dibangun menggunakan arsitektur serverless Google Apps Script dengan UI/UX premium yang responsif, aman, dan sangat cepat.
</p>

---

## 📋 Ringkasan Proyek

**L-Premium POS** adalah solusi _end-to-end_ untuk manajemen operasional laundry. Aplikasi ini menghilangkan kebutuhan akan server fisik dengan memanfaatkan ekosistem **Google Workspace (Google Sheets sebagai Database & Google Apps Script sebagai Backend)**, menjadikannya gratis untuk di-host (_zero-cost infrastructure_) namun tetap memiliki standar keamanan dan kecepatan layaknya aplikasi berbayar.

Aplikasi ini telah melalui proses **Evaluasi Senior Full-Stack & UI/UX Profesional**, mencakup perombakan desain secara menyeluruh serta optimasi performa sistem (_Concurrency control, Caching, & Batching_).

---

## ✨ Fitur Utama

### 🛒 Manajemen Transaksi & Kasir

- **Kalkulasi Otomatis:** Perhitungan tagihan, diskon promo, dan uang kembalian secara instan.
- **Sistem Pembayaran Fleksibel:** Mendukung pelunasan langsung atau sistem Uang Muka (DP) dengan metode Tunai, Transfer, maupun QRIS.
- **Auto-Save Draft:** Tidak perlu takut kehilangan data saat browser _crash_. Form transaksi otomatis tersimpan ke memori sementara (Draft) setiap 5 detik.
- **Cetak Nota Digital:** Pembuatan nota dinamis yang siap dicetak di printer kasir (Thermal) atau dibagikan via WhatsApp.
- **Konfirmasi WhatsApp:** Integrasi API WhatsApp untuk mengirimkan bukti transaksi dan notifikasi ke pelanggan dengan sekali klik.

### 👥 Manajemen Pelanggan & Loyalitas

- Pendataan pelanggan lengkap dengan nomor WhatsApp.
- Pelacakan riwayat transaksi dan total pengeluaran (_Total Spent_) per pelanggan.

### 📦 Manajemen Layanan & Promo

- **Katalog Dinamis:** Menambah, mengedit, dan menonaktifkan layanan/paket (Kiloan, Satuan, dsb).
- **Voucher Promo:** Pembuatan kode promo (persen atau nominal) dengan batas minimum transaksi dan tanggal kedaluwarsa.

### 📊 Dasbor Analitik (Admin)

- Pantauan _real-time_ Omzet Hari Ini, Total Transaksi, Antrean Diproses, dan Cucian Siap Diambil.
- **Multi-Cashier Sync:** Data dasbor tersinkronisasi antar komputer kasir secara otomatis setiap 5 menit.
- **Sistem Laporan:** Cetak rekapitulasi penjualan harian/bulanan ke format PDF.

---

## 🎨 UI/UX & Design System

Aplikasi ini menggunakan **TailwindCSS** dengan pendekatan _Enterprise SaaS-grade interface_:

- **Vibrant & Clean Design:** Penggunaan warna yang dikurasi, _white-space_ yang lega, dan tipografi modern (Inter/Roboto).
- **Visual Hierarchy & Consistency:**
  - `rounded-2xl` untuk semua kontainer dan _card_.
  - _Glow focus effect_ elegan pada input form.
  - Ikon berbasis **SVG Inline (Heroicons)** di seluruh elemen untuk ketajaman visual maksimal tanpa menambah beban _loading_.
- **Micro-Animations:** Transisi halus pada _hover_, efek tekan tombol, dan _skeleton loading_ yang responsif.
- **Audio Cues:** Notifikasi _beep_ (Web Audio API) yang asinkron ketika transaksi sukses, membantu efisiensi kasir tanpa harus selalu menatap layar.

---

## 🏗️ Arsitektur & Performa Sistem (Optimasi Senior-Level)

Di balik tampilan antarmukanya, L-Premium POS dilengkapi sistem backend yang dirancang untuk stabilitas jangka panjang:

### 1. Integritas Data (Zero Collision)

- **UUID Implementation:** Seluruh data ID (_Primary Key_) menggunakan Universal Unique Identifier, mencegah tabrakan data saat 2 kasir menyimpan transaksi di milidetik yang sama.
- **Double-Submit Prevention:** Proteksi otomatis terhadap klik ganda via _state management_, mencegah entri transaksi duplikat.
- **Server-Side Trust:** Semua validasi pembayaran, perhitungan total, dan diskon dilakukan ulang di server (Google Apps Script) untuk mencegah manipulasi data dari inspeksi browser.

### 2. Extreme Performance Optimization

- **Batch Operations:** Mengubah operasi _I/O Google Sheets_ yang mahal (multiple `setValue`) menjadi 1 kali eksekusi `setValues()` dalam format array. Meningkatkan kecepatan simpan data hingga **400-600%**.
- **3-Layer Caching Strategy:**
  1. **Server Cache:** Menyimpan referensi _Spreadsheet_ memangkas waktu latensi API.
  2. **Transaction TTL Cache:** Menyimpan data transaksi di RAM klien selama 1 menit. Navigasi menu terasa _instant_ tanpa perlu memanggil server.
  3. **Settings LocalStorage:** Preferensi aplikasi (Nama Toko, Rekening) dikunci di memori lokal selama 1 jam.

### 3. Reliability & Maintenance

- **Auto-Backup System:** Terdapat fungsi _CRON trigger_ yang otomatis menggandakan (duplikasi) database Google Sheets setiap hari jam 02:00 pagi ke Google Drive sebagai _fail-safe_.
- **Silent Error Logging:** Semua _exception_ atau kendala di server akan otomatis dicatat (_log_) pada lembar khusus `error_logs` di database, memungkinkan _debugging_ tanpa mengganggu layar kasir.
- **Optimized Queries:** Pembacaan data transaksi dibatasi algoritma _Smart Row Range_, hanya membaca 300 data terbaru untuk memastikan _loading_ aplikasi tetap cepat meskipun database sudah terisi puluhan ribu baris.

---

## 📂 Struktur File Repository

```text
app-script-mpti/
├── appsscript.json   # Konfigurasi manifest Apps Script (TimeZone, Library, URL)
├── Kode.js           # Server-Side Backend (CRUD logic, Caching, Security)
├── index.html        # Struktur HTML utama (Layout, Sidebar, Modal)
├── CSS.html          # Custom Styling, Font imports, Print Media Queries
└── JavaScript.html   # Client-Side Frontend (SPA Navigation, State, Event Listeners)
```

---

## ⚙️ Cara Instalasi & Deployment

Proyek ini dibangun menggunakan `clasp` (Command Line Apps Script Projects).

**Persyaratan:**

- Node.js & npm terinstal.
- Memiliki akun Google.

**Langkah-langkah:**

1. Clone repositori ini:
   ```bash
   git clone https://github.com/nndda-rzn/app-script-mpti.git
   cd app-script-mpti
   ```
2. Instal clasp secara global:
   ```bash
   npm install -g @google/clasp
   ```
3. Login ke akun Google Anda:
   ```bash
   clasp login
   ```
4. Hubungkan ke project Apps Script Anda yang sudah ada atau buat baru:

   ```bash
   # Jika sudah punya Script ID:
   clasp clone <YOUR_SCRIPT_ID>

   # ATAU buat baru:
   clasp create --type web --title "L-Premium POS"
   ```

5. Deploy kode ke server Google:
   ```bash
   clasp push
   ```

**Post-Deployment (Aktivasi Backup):**
Setelah di-deploy, buka Editor Apps Script di browser (`clasp open`), pilih fungsi `setupBackupTrigger()`, dan klik jalankan (▶ Run) satu kali untuk mengaktifkan sistem backup harian otomatis.

---

<div align="center">
  <p>Dibuat dengan ❤️ untuk merevolusi manajemen usaha laundry.</p>
</div>
