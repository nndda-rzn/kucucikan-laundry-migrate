# Hasil Review Keseluruhan `Kode.js` (L-Premium POS)

Sebagai *Senior Developer*, saya telah melakukan audit kode secara menyeluruh terhadap *backend* `Kode.js`. Meskipun secara fungsional aplikasi ini sudah berjalan, terdapat beberapa celah keamanan, potensi *bug* kritikal pada logika perhitungan, serta masalah konkurensi yang wajib diperbaiki sebelum sistem ini digunakan pada skala produksi.

Berikut adalah daftar temuan *bug* dan kelemahan yang saya temukan, diurutkan berdasarkan tingkat keparahannya:

---

## 🔴 1. Bug Kritikal (Keamanan & Integritas Data)

### 1.1. *Zero Server-Side Authentication* (Endpoint Terbuka Penuh)
**Lokasi:** Semua fungsi CRUD (e.g., `deleteTransaction`, `updatePackage`, `addPromo`, dll.)
**Masalah:** 
Aplikasi saat ini hanya mengandalkan pengecekan *login* di sisi antarmuka (*frontend / LocalStorage*). Di Google Apps Script, semua fungsi yang tidak diakhiri dengan `_` (underscore) akan terekspos secara publik ke antarmuka klien melalui `google.script.run`.
*   **Dampak:** Siapapun yang memiliki tautan URL aplikasi dapat membuka *Developer Console* (F12) di *browser* dan mengetik `google.script.run.deleteTransaction("TRX-123")` tanpa perlu *login*. Mereka juga bisa mengubah harga paket, menghapus pelanggan, dsb.
*   **Solusi:** Implementasikan token sesi (menggunakan *CacheService*) saat *login*, lalu wajibkan parameter `token` pada setiap fungsi CRUD untuk divalidasi oleh server sebelum eksekusi.

### 1.2. Validasi Perhitungan Finansial Kosong (Potensi Minus / NaN)
**Lokasi:** `createTransaction(data)`
**Masalah:**
Kode mengambil `berat` dari payload JSON tanpa memastikan bahwa itu adalah angka positif.
```javascript
items[i].subtotal = serverHarga * parseFloat(items[i].berat);
```
*   **Dampak:** Klien yang memanipulasi *payload* atau kesalahan *input* tak terduga bisa mengirimkan `berat: -10` atau `berat: "abc"`. Ini akan membuat `subtotal` menjadi Minus atau `NaN` (Not a Number), yang berujung pada total tagihan minus atau merusak seluruh agregasi data laporan.
*   **Solusi:** Tambahkan validasi: `let berat = parseFloat(items[i].berat); if (isNaN(berat) || berat <= 0) throw new Error("Berat tidak valid");`

### 1.3. Kegagalan *Parsing* Tanggal pada Fungsi Laporan
**Lokasi:** `getReportData(startDateStr, endDateStr)`
**Masalah:**
Pada saat membaca `transactions`, kode menggunakan `let trDate = new Date(r[1]);`. Ini sangat berbahaya. Pada Google Sheets, jika format *cell* secara tidak sengaja terubah menjadi string lokal (misal "21/04/2026"), `new Date()` di server akan mengembalikan `Invalid Date` atau menafsirkannya sebagai format Amerika (MM/DD/YYYY).
*   **Dampak:** Transaksi tersebut akan hilang dari hasil Laporan Bulanan/Harian secara misterius.
*   **Solusi:** Seharusnya menggunakan fungsi utilitas yang sudah ada: `let trDate = new Date(parseSafeDate(r[1]));` sama seperti yang dilakukan di `getTransactions()`.

---

## 🟠 2. Bug Logika (*Logical & Edge-Case Bugs*)

### 2.1. Kesalahan Status Pembayaran pada Transaksi Gratis (Diskon 100%)
**Lokasi:** `createTransaction(data)`
**Masalah:**
```javascript
if (terbayar >= grandTotal && terbayar > 0) statusPay = "Lunas";
else if (terbayar > 0) statusPay = "DP";
else statusPay = "Belum Lunas";
```
*   **Dampak:** Jika ada kode promo diskon 100% sehingga `grandTotal` menjadi `0`, maka nilai `terbayar` biasanya akan `0`. Kondisi di atas akan menjadikan `statusPay` sebagai `"Belum Lunas"`, padahal transaksinya gratis (sudah Lunas).
*   **Solusi:** Ubah logikanya agar mempertimbangkan transaksi dengan nilai 0: 
`if (grandTotal === 0 || (terbayar >= grandTotal && terbayar > 0)) statusPay = "Lunas";`

### 2.2. Lookup Harga Menggunakan Nama, Bukan ID
**Lokasi:** `createTransaction(data)`
**Masalah:** Saat mencari harga paket dari *database*, pencarian menggunakan:
`if (pkgData[j][1] === items[i].paket)` (Membandingkan kolom "Nama Paket").
*   **Dampak:** Jika terdapat 2 layanan dengan nama yang sama (misal "Reguler") namun berbeda kategori (misal kategori "Kiloan" dan "Satuan"), sistem akan *selalu* mengambil harga dari baris yang pertama kali ditemukan di tabel.
*   **Solusi:** *Payload items* dari keranjang belanja (*frontend*) seharusnya mengirimkan `id` paket, dan server mencarinya menggunakan `pkgData[j][0] === items[i].id`.

### 2.3. Celah Modifikasi Password Melalui Trik Hashing
**Lokasi:** `login(username, password)`
**Masalah:**
Terdapat mekanisme transisi *password* di baris:
`if (dbPassword === password) { sheet.getRange(...).setValue(inputHash); }`
*   **Dampak:** Jika seseorang mengetahui *hash password* milik admin dari *database*, mereka dapat memasukkan nilai *hash* tersebut langsung pada kolom *password* saat *login*. Kondisi di atas akan menilai *password* benar, membiarkan pelaku masuk, dan me-*rehash* *hash* tersebut.

---

## 🟡 3. Bug Konkurensi & Resiko Integritas Struktur

### 3.1. *Race Condition* (Tanpa LockService) pada Master Data
**Lokasi:** `addPackage`, `updatePackage`, `deletePackage`, `addPromo`, `updateCustomerData`, `deletePromo`
**Masalah:** 
Fungsi-fungsi esensial penulisan data utama ini **TIDAK** menggunakan `LockService`. Berbeda dengan `createTransaction` yang sudah sangat baik menggunakan *Lock*.
*   **Dampak:** Jika ada 2 kasir/admin yang mengubah data master (seperti menambah/mengubah paket) dalam milidetik yang berdekatan, baris data di Google Sheet bisa tertimpa (*overwrite*), corrupt, atau tergandakan.
*   **Solusi:** Implementasikan pola *Try-Catch & LockService* pada seluruh fungsi yang melakukan `sheet.appendRow()` atau `sheet.setValues()`.

### 3.2. Penulisan Kolom Secara *Hardcoded* pada Migrasi Skema
**Lokasi:** `setupDatabase()`
**Masalah:**
Saat melakukan migrasi tabel `packages` untuk penambahan kolom `kategori`, baris kodenya adalah:
`sheet.getRange(1, 6).setValue("kategori");`
*   **Dampak:** Fungsi ini secara spesifik berasumsi bahwa kolom kategori pasti berada di indeks 6 (kolom F). Jika di kemudian hari admin secara manual menambahkan kolom baru di tengah-tengah Excel (misalnya kolom HPP di kolom C), migrasi ini akan langsung menimpa data acak di kolom ke-6.
*   **Solusi:** Gunakan `sheet.getLastColumn() + 1` seperti yang sudah dicontohkan pada pembuatan kolom `status`.

---

### Kesimpulan & Tindakan Selanjutnya
Secara arsitektur, *backend* ini sudah mengadopsi optimasi pembacaan memori yang baik. Namun dari sisi keamanan, **Ketiadaan Server-Side Authentication** adalah masalah yang paling fatal. 

Saya menyarankan agar prioritas perbaikan difokuskan pada:
1. Menyematkan validasi token untuk mengamankan fungsi mutasi (*CRUD*).
2. Memperbaiki *bug* validasi angka pada `createTransaction`.
3. Mengaplikasikan `LockService` ke sisa operasi CRUD master data. 

Apakah Anda ingin saya memberikan panduan/kode untuk memperbaiki celah-celah kritikal ini (misal: penambahan sesi keamanan)?
