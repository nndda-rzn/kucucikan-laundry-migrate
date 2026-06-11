# Logbook Pengerjaan Proyek (Tahap Awal)

**Nama Proyek:** Sistem POS & Manajemen Operasional Berbasis Google Apps Script
**Repository:** https://github.com/nndda-rzn/app-script-mpti
**Periode:** 31 Maret 2026 — 13 April 2026 (sebelum fitur Manajemen Kas & Shift)
**Cakupan:** Fondasi sistem POS, validasi data, manajemen pengguna
**Total Hari Kerja Aktif:** 5 hari

---

## Ringkasan Tahap

Tahap ini merupakan fase fondasi pembangunan sistem POS berbasis Google Apps Script + Google Sheets. Fokus pengerjaan ada pada penyiapan struktur data, alur transaksi inti, validasi pelanggan, manajemen pengguna multi-role, serta penyempurnaan tampilan UI awal. Modul Manajemen Kas Harian dan Manajemen Shift Kasir BELUM diimplementasikan pada tahap ini.

---

## Detail Aktivitas Harian

### Hari 1 — Selasa, 31 Maret 2026
**Aktivitas:** Inisialisasi proyek dan setup repository
**Rincian Pekerjaan:**
- Pembuatan repository Git dan struktur folder proyek
- Penyusunan kode awal sistem POS (entry point, layout dashboard)
- Setup Google Apps Script dengan integrasi clasp
- Penyiapan dokumentasi awal proyek (README versi pertama)
- Konfigurasi koneksi awal antara frontend dan Google Sheets sebagai backend

**Output:**
- Repository tersedia di GitHub dengan kode dasar yang dapat dijalankan
- Sistem dapat diakses via web app Google Apps Script

**Commit:** `4a577f0` — Initial commit with POS code and documentation

---

### Hari 2 — Selasa, 7 April 2026
**Aktivitas:** Iterasi awal pengembangan fitur dasar POS
**Rincian Pekerjaan:**
- Penyesuaian dan perapian kode awal POS
- Pengujian alur transaksi sederhana (input pelanggan, pilih paket, simpan transaksi)
- Penyiapan struktur sheet Google Sheets sebagai database
  - Sheet `Transaksi`
  - Sheet `Paket`
  - Sheet `Pelanggan`
- Penyesuaian fungsi server-side untuk read/write data ke sheet

**Output:**
- Versi awal fungsional sistem POS
- Alur input transaksi end-to-end berjalan

**Commit:** `3f76f3c`, `dbbeb39`

---

### Hari 3 — Kamis, 9 April 2026
**Aktivitas:** Penataan ulang skema database dan logika transaksi
**Rincian Pekerjaan:**
- Refactoring skema database pada Google Sheets agar lebih konsisten dan scalable
- Perbaikan logika perhitungan transaksi:
  - Perhitungan subtotal per item
  - Penerapan diskon (nominal & persentase)
  - Perhitungan total akhir
- Standarisasi format kode (indentasi, penamaan variabel, struktur fungsi)
- Penyamaan konvensi penulisan antara file `.gs` dan `.html`

**Output:**
- Skema data sheet lebih konsisten dan mudah di-query
- Perhitungan transaksi lebih akurat untuk berbagai skenario diskon
- Codebase lebih mudah dipelihara

**Commit:** `b16c2f0` — refactor: update database schema, refine transaction calculations, and standardize code formatting

---

### Hari 4 — Sabtu, 11 April 2026
**Aktivitas:** Implementasi penghapusan transaksi & validasi data customer
**Rincian Pekerjaan:**
- Implementasi fitur hapus transaksi:
  - Penambahan tombol hapus pada daftar transaksi
  - Modal konfirmasi sebelum penghapusan
  - Sinkronisasi penghapusan ke Google Sheets
- Penambahan validasi data pelanggan:
  - Validasi format nomor HP
  - Validasi nama tidak kosong
  - Validasi data wajib lainnya
- Perbaikan tampilan form input pelanggan (label, placeholder, error message)
- Penyempurnaan tampilan laporan transaksi
- Perbaikan minor pada UI dashboard

**Output:**
- Sistem dapat menghapus transaksi dengan aman dan dengan konfirmasi
- Input pelanggan lebih ketat divalidasi sehingga mengurangi data sampah
- Tampilan laporan lebih informatif dan rapi

**Commit:** `5637453` — refactor: implement transaction deletion, robust validation for customer data, and improve UI/report functionality

---

### Hari 5 — Senin, 13 April 2026
**Aktivitas:** Modul Manajemen Pengguna (User Management) & penyempurnaan UI
**Rincian Pekerjaan:**
- Implementasi sistem manajemen pengguna untuk staff:
  - Tambah akun staff baru (form admin)
  - Edit detail akun staff
  - Hapus akun staff
  - Daftar pengguna dengan role (admin, kasir)
- Update Tailwind CSS ke versi 4.2.3
- Pembersihan file JavaScript utility yang tidak terpakai
- Penambahan null check pada elemen menu admin untuk menghindari error saat elemen tidak tersedia
- Perbaikan tag SVG yang tidak tertutup dengan benar
- Refactor signature fungsi `saveUserAccount` agar lebih konsisten
- Pembungkusan `getUsersList` dengan error handling response yang lebih informatif

**Output:**
- Admin dapat mengelola akun staff (tambah, edit, hapus) melalui UI
- Sistem multi-role siap menjadi fondasi untuk pengembangan modul lanjutan
- UI lebih stabil dan tidak melempar error saat elemen menu tidak ada

**Commit:**
- `20b79b3` — feat: implement user management system for adding, editing, and deleting staff accounts
- `98ab867` — chore: update Tailwind CSS library version to 4.2.3 and remove unused JavaScript utilities
- `93c8f72` — refactor: add null checks for admin menu elements and fix SVG path tag closure
- `8781d50` — refactor: update saveUserAccount signature and wrap getUsersList in error handling response

---

## Ringkasan Pencapaian Tahap

### Statistik Pengerjaan
- **Total Commit:** 8 commit
- **Periode Aktif:** 31 Maret — 13 April 2026 (14 hari kalender, 5 hari kerja aktif)
- **Fase:** Fondasi sistem (sebelum modul Kas & Shift)

### Distribusi Jenis Pekerjaan
| Kategori | Jumlah | Keterangan |
|----------|--------|------------|
| `feat` | 2 | Initial commit & user management |
| `refactor` | 3 | Schema, transaction logic, signature |
| `chore` | 1 | Update Tailwind & cleanup |
| Lainnya | 2 | Iterasi awal (`update`) |

### Modul/Fitur yang Diselesaikan pada Tahap Ini
1. Sistem POS dasar
   - Input transaksi dengan pelanggan dan paket
   - Perhitungan subtotal, diskon, total
   - Daftar transaksi dengan fitur hapus
2. Validasi data pelanggan
3. Manajemen pengguna multi-role (admin & kasir)
4. UI dashboard awal dengan Tailwind CSS

### Modul yang BELUM Diimplementasikan pada Tahap Ini
- Manajemen Kas Harian (saldo awal, pengeluaran)
- Manajemen Shift Kasir (open/close shift, history, force-close)
- Optimasi performa lanjutan (caching, IndexedDB, adaptive polling)
- Multi-device realtime sync
- UX/A11y polish lanjutan
- Sistem profiling

### Tech Stack yang Digunakan
- **Backend:** Google Apps Script (V8 Runtime)
- **Database:** Google Sheets
- **Frontend:** HTML, JavaScript (Vanilla), Tailwind CSS 4.2.3
- **Tools:** clasp, Git, GitHub

---

## Catatan Pengembangan

Tahap awal ini menekankan pembangunan fondasi yang stabil sebelum menambah modul-modul kompleks. Pendekatan yang diambil:

1. **Mulai dari kode minimal yang berjalan** kemudian iterasi bertahap
2. **Refactor lebih dulu** sebelum menambah fitur baru (terlihat pada hari ke-3 dan ke-4)
3. **Validasi & error handling** dijadikan prioritas sebelum fitur lanjutan
4. **Manajemen pengguna multi-role** disiapkan sebagai prerequisite untuk modul Kas & Shift di tahap berikutnya

Setelah tahap ini, pengembangan dilanjutkan dengan implementasi Manajemen Kas Harian (13 April sore) dan Manajemen Shift Kasir (16 April).

---

**Disusun berdasarkan riwayat commit Git pada repository:**
https://github.com/nndda-rzn/app-script-mpti
