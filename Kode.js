/**
 * SISTEM MANAJEMEN LAUNDRY - SERVER SIDE
 */

// [SEC] DB_ID dimuat dari Script Properties agar tidak terekspos di source code.
// Jalankan setupScriptProperties() sekali untuk menyimpan ID ke properties.
// Fallback ke hardcoded ID untuk backward compatibility.
let _dbIdCache = null;
function getDbId_() {
  if (_dbIdCache) return _dbIdCache;
  const props = PropertiesService.getScriptProperties();
  let dbId = props.getProperty("DB_ID");
  if (!dbId) {
    // Fallback: auto-migrate hardcoded ID ke Script Properties
    dbId = "1_3qq0iZyn8dF7YwY0Y0qyyAtXu2n8tOKdpFuW1qkAzY";
    props.setProperty("DB_ID", dbId);
  }
  _dbIdCache = dbId;
  return dbId;
}

function doGet() {
  const settings = getSettings();
  const appName = settings.app_name || settings.nota_title || "L-Premium";

  const template = HtmlService.createTemplateFromFile("index");
  template.appName = appName;
  template.appLogoUrl = settings.app_logo_url || "";

  const output = template
    .evaluate()
    .setTitle(appName + " System")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  // Jika ada URL logo, jadikan sebagai favicon di tab browser
  if (settings.app_logo_url) {
    try {
      // GAS hanya mendukung akhiran .ico, .png, dan .gif
      output.setFaviconUrl(settings.app_logo_url);
    } catch (e) {
      // Abaikan error (biarkan pakai logo default) agar web tidak crash
      // Kita bisa log error ini secara diam-diam
      logError("doGet_favicon", e.message, settings.app_logo_url);
    }
  }

  return output;
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// [P1] Cache spreadsheet reference — menghindari openById() berulang (~200-500ms per panggilan)
let _cachedSS = null;
function getSS() {
  if (!_cachedSS) _cachedSS = SpreadsheetApp.openById(getDbId_());
  return _cachedSS;
}

function getSheet(name) {
  const ss = getSS();
  if (!ss) throw new Error("Kesalahan internal: Database tidak ditemukan.");
  const sheet = ss.getSheetByName(name);
  if (!sheet)
    throw new Error("Kesalahan internal: Tabel data tidak ditemukan.");
  return sheet;
}

// [PERF] Cache map id→harga paket. Dipakai oleh createTransaction agar tidak
// perlu full sheet read tiap transaksi. Cache 5 menit di CacheService +
// memory cache untuk hot loop. Invalidasi otomatis saat addPackage/updatePackage.
let _priceMapMem = null;
let _priceMapMemTs = 0;
const PRICE_MAP_CACHE_KEY = "package_price_map";
const PRICE_MAP_TTL = 300; // 5 menit

function getPackagePriceMap_() {
  // Memory cache (per execution) — gratis & paling cepat
  const now = Date.now();
  if (_priceMapMem && now - _priceMapMemTs < 60000) {
    return _priceMapMem;
  }
  // Script cache — antar execution
  const cache = CacheService.getScriptCache();
  const cached = cache.get(PRICE_MAP_CACHE_KEY);
  if (cached) {
    try {
      _priceMapMem = JSON.parse(cached);
      _priceMapMemTs = now;
      return _priceMapMem;
    } catch (e) {}
  }
  // Cold path — read sheet sekali, build map, simpan ke kedua cache
  const sheet = getSheet("packages");
  const lastRow = sheet.getLastRow();
  const map = {};
  if (lastRow > 1) {
    const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    for (let i = 0; i < data.length; i++) {
      const id = data[i][0];
      const harga = parseInt(data[i][2]) || 0;
      if (id) map[id] = harga;
    }
  }
  try { cache.put(PRICE_MAP_CACHE_KEY, JSON.stringify(map), PRICE_MAP_TTL); } catch (e) {}
  _priceMapMem = map;
  _priceMapMemTs = now;
  return map;
}

function invalidatePriceMapCache_() {
  _priceMapMem = null;
  _priceMapMemTs = 0;
  try { CacheService.getScriptCache().remove(PRICE_MAP_CACHE_KEY); } catch (e) {}
}

// [P0] Generate ID unik menggunakan Utilities.getUuid() — menghindari collision
function generateId(prefix) {
  return prefix + "-" + Utilities.getUuid().replace(/-/g, "").substring(0, 12);
}

// [P2] Error logging ke Cloud Logging + sheet error_logs
function logError(funcName, message, context) {
  try {
    console.error(
      "[" +
        funcName +
        "] " +
        message +
        (context ? " | Context: " + context : ""),
    );
    const ss = getSS();
    let logSheet = ss.getSheetByName("error_logs");
    if (!logSheet) {
      logSheet = ss.insertSheet("error_logs");
      logSheet.appendRow(["Waktu", "Fungsi", "Pesan", "Context"]);
      logSheet.setFrozenRows(1);
    }
    logSheet.appendRow([
      new Date(),
      funcName,
      message,
      (context || "").substring(0, 500),
    ]);
    // Batasi log maksimal 500 baris
    const lastRow = logSheet.getLastRow();
    if (lastRow > 500) logSheet.deleteRows(2, lastRow - 500);
  } catch (e) {
    /* fail silently untuk logging */
  }
}

// [PERF] Profiling helper — log durasi eksekusi fungsi server ke
// Stackdriver/console + sample ke sheet `perf_logs` (1 dari 5 call).
// Pakai dengan pattern: return _perf("fnName", () => { ...body... });
// Disable global via PropertiesService key PERF_DISABLED = "1".
let _perfDisabled = null;
function _isPerfDisabled() {
  if (_perfDisabled === null) {
    try {
      _perfDisabled = PropertiesService.getScriptProperties().getProperty("PERF_DISABLED") === "1";
    } catch (e) { _perfDisabled = false; }
  }
  return _perfDisabled;
}

function _perf(name, fn) {
  if (_isPerfDisabled()) return fn();
  const t0 = Date.now();
  try {
    const result = fn();
    const dur = Date.now() - t0;
    console.log("[PERF][" + name + "] " + dur + "ms");
    // Sample 1/5 ke sheet untuk tidak membebani I/O
    if (Math.random() < 0.2) {
      try {
        const ss = getSS();
        let s = ss.getSheetByName("perf_logs");
        if (!s) {
          s = ss.insertSheet("perf_logs");
          s.appendRow(["timestamp", "fn", "ms", "ok"]);
          s.setFrozenRows(1);
        }
        s.appendRow([new Date(), name, dur, true]);
        const lastRow = s.getLastRow();
        if (lastRow > 1000) s.deleteRows(2, lastRow - 1000);
      } catch (e) { /* silent */ }
    }
    return result;
  } catch (e) {
    const dur = Date.now() - t0;
    console.log("[PERF][" + name + "] " + dur + "ms (FAIL: " + e.message + ")");
    throw e;
  }
}

function disablePerfLogging() {
  PropertiesService.getScriptProperties().setProperty("PERF_DISABLED", "1");
  _perfDisabled = true;
  return "Perf logging dinonaktifkan.";
}
function enablePerfLogging() {
  PropertiesService.getScriptProperties().deleteProperty("PERF_DISABLED");
  _perfDisabled = false;
  return "Perf logging diaktifkan.";
}

// [P2] Auto backup harian — panggil setupBackupTrigger() sekali untuk mengaktifkan
function setupBackupTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "dailyBackup")
      ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger("dailyBackup")
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();
}

function dailyBackup() {
  try {
    const ss = SpreadsheetApp.openById(getDbId_());
    const name =
      "Backup_LPremium_" +
      Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd");
    ss.copy(name);
  } catch (e) {
    logError("dailyBackup", e.message);
  }
}

function computeHash(rawPassword) {
  const rawHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    rawPassword,
  );
  let txtHash = "";
  for (let i = 0; i < rawHash.length; i++) {
    let hashVal = rawHash[i];
    if (hashVal < 0) {
      hashVal += 256;
    }
    if (hashVal.toString(16).length == 1) {
      txtHash += "0";
    }
    txtHash += hashVal.toString(16);
  }
  return txtHash;
}

function generateSalt(length = 16) {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let salt = "";
  for (let i = 0; i < length; i++) {
    salt += charset[Math.floor(Math.random() * charset.length)];
  }
  return salt;
}

function hashPassword(password) {
  const salt = generateSalt();
  const hash = computeHash(password + salt);
  return salt + ":" + hash;
}

function verifyPassword(inputPassword, dbPassword) {
  if (dbPassword.includes(":")) {
    const parts = dbPassword.split(":");
    const salt = parts[0];
    const hash = computeHash(inputPassword + salt);
    return hash === parts[1];
  } else {
    // Unsalted backward compatibility
    return computeHash(inputPassword) === dbPassword;
  }
}

function setupDatabase() {
  const ss = SpreadsheetApp.openById(getDbId_());
  const sheets = ["users", "packages", "transactions", "settings", "customers", "kas_awal", "pengeluaran", "shifts"];
  sheets.forEach((name) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      if (name === "users") {
        sheet.appendRow(["username", "password", "role", "nama"]);
        sheet.appendRow([
          "admin",
          hashPassword("admin123"),
          "admin",
          "Administrator",
        ]);
        sheet.appendRow([
          "kasir",
          hashPassword("kasir123"),
          "kasir",
          "Staff Kasir",
        ]);
      } else if (name === "packages") {
        sheet.appendRow([
          "id",
          "nama_paket",
          "harga",
          "durasi_hari",
          "satuan",
          "kategori",
          "status",
        ]);
      } else if (name === "transactions") {
        sheet.appendRow([
          "id",
          "tanggal",
          "customer",
          "paket",
          "berat",
          "total",
          "status",
          "kasir",
          "whatsapp",
          "satuan",
          "estimasi_selesai",
          "metode_pembayaran",
          "status_pembayaran",
          "metode_pelunasan",
          "",
          "catatan",
          "terbayar",
          "items_json",
          "tanggal_pelunasan",
          "nominal_dp",
          "nominal_pelunasan",
          "shift_id",
          "pelunasan_shift_id",
        ]);
      } else if (name === "settings") {
        sheet.appendRow(["key", "value"]);
        sheet.appendRow(["nota_title", "L-PREMIUM"]);
        sheet.appendRow(["nota_subtitle", "Laundry Bersih & Wangi"]);
        sheet.appendRow(["nota_footer", "Terima kasih!"]);
      } else if (name === "customers") {
        sheet.appendRow(["id", "nama", "whatsapp", "terakhir_order"]);
      } else if (name === "kas_awal") {
        sheet.appendRow(["tanggal", "nominal", "kasir"]);
      } else if (name === "pengeluaran") {
        sheet.appendRow(["id", "tanggal", "keterangan", "kategori", "jumlah", "kasir"]);
      } else if (name === "shifts") {
        sheet.appendRow([
          "id",
          "kasir",
          "nama_kasir",
          "waktu_mulai",
          "waktu_selesai",
          "modal_awal",
          "total_transaksi",
          "total_tunai",
          "total_non_tunai",
          "jumlah_order",
          "status",
          "catatan",
          "total_pengeluaran",
          "saldo_akhir",
          "breakdown_json",
        ]);
      }
    } else if (name === "packages") {
      // Migration: tambah kolom kategori & status jika belum ada
      const lastCol = sheet.getLastColumn();
      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      if (headers.indexOf("kategori") === -1) {
        const sCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, sCol).setValue("kategori");
      }
      const hdrs2 = sheet
        .getRange(1, 1, 1, sheet.getLastColumn())
        .getValues()[0];
      if (hdrs2.indexOf("status") === -1) {
        const sCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, sCol).setValue("status");
        const lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          sheet.getRange(2, sCol, lastRow - 1, 1).setValue("Aktif");
        }
      }
    } else if (name === "transactions") {
      // Migration: tambah kolom shift_id jika belum ada (kolom ke-22)
      const lastCol = sheet.getLastColumn();
      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      if (headers.indexOf("shift_id") === -1) {
        const sCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, sCol).setValue("shift_id");
      }
      // Migration: tambah kolom pelunasan_shift_id (kolom ke-23) untuk attribusi pelunasan ke shift saat pelunasan terjadi
      const headers2 = sheet
        .getRange(1, 1, 1, sheet.getLastColumn())
        .getValues()[0];
      if (headers2.indexOf("pelunasan_shift_id") === -1) {
        const sCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, sCol).setValue("pelunasan_shift_id");
      }
    } else if (name === "shifts") {
      // Migration: tambah kolom total_pengeluaran (col M/13) & saldo_akhir (col N/14)
      // agar getShiftHistory tidak perlu recompute pengeluaran untuk shift sudah ditutup.
      const headers = sheet
        .getRange(1, 1, 1, sheet.getLastColumn())
        .getValues()[0];
      if (headers.indexOf("total_pengeluaran") === -1) {
        const sCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, sCol).setValue("total_pengeluaran");
      }
      const headers2 = sheet
        .getRange(1, 1, 1, sheet.getLastColumn())
        .getValues()[0];
      if (headers2.indexOf("saldo_akhir") === -1) {
        const sCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, sCol).setValue("saldo_akhir");
      }
      // [SHIFT] Migration: tambah kolom breakdown_json (col O/15) untuk persistence
      // breakdown metode pembayaran & kategori pengeluaran per shift.
      const headers3 = sheet
        .getRange(1, 1, 1, sheet.getLastColumn())
        .getValues()[0];
      if (headers3.indexOf("breakdown_json") === -1) {
        const sCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, sCol).setValue("breakdown_json");
      }
    }
  });
  return "Setup selesai.";
}

function validateSession_(token) {
  if (!token)
    throw new Error("Akses ditolak: Token autentikasi tidak ditemukan.");
  const cache = CacheService.getScriptCache();
  const sessionData = cache.get(token);
  if (!sessionData)
    throw new Error(
      "Akses ditolak: Sesi telah berakhir atau tidak valid. Silakan login kembali.",
    );
  cache.put(token, sessionData, 28800);
  return JSON.parse(sessionData);
}

// [SEC] Validasi sesi + role admin — gunakan di semua fungsi yang hanya boleh diakses admin
function validateAdminSession_(token) {
  const session = validateSession_(token);
  if (session.role !== "admin") {
    throw new Error(
      "Akses ditolak: Anda tidak memiliki izin untuk operasi ini.",
    );
  }
  return session;
}

function login(username, password) {
  const cache = CacheService.getScriptCache();
  const attemptKey = "login_attempts_" + username;
  let attempts = cache.get(attemptKey);
  if (attempts && parseInt(attempts) >= 5)
    return {
      success: false,
      message: "Akun dikunci sementara. Coba lagi dalam 15 menit.",
    };

  try {
    const sheet = getSheet("users");
    const data = sheet.getDataRange().getValues();
    const lowerUsername = username.toLowerCase();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === lowerUsername) {
        const dbPassword = String(data[i][1]).trim();
        if (!verifyPassword(password, dbPassword)) {
          cache.put(
            attemptKey,
            (attempts ? parseInt(attempts) + 1 : 1).toString(),
            900,
          );
          return { success: false, message: "Username atau password salah!" };
        }

        // Auto-migration to salted hash format if needed
        if (!dbPassword.includes(":")) {
          sheet.getRange(i + 1, 2).setValue(hashPassword(password));
        }

        cache.remove(attemptKey);
        const token = Utilities.getUuid();
        const sessionData = JSON.stringify({
          username: username,
          role: data[i][2],
          nama: data[i][3],
        });
        CacheService.getScriptCache().put(token, sessionData, 28800);
        return {
          success: true,
          role: data[i][2],
          nama: data[i][3],
          token: token,
        };
      }
    }
    cache.put(
      attemptKey,
      (attempts ? parseInt(attempts) + 1 : 1).toString(),
      900,
    );
    return { success: false, message: "Username atau password salah!" };
  } catch (error) {
    return { success: false, message: "Error Database: " + error.message };
  }
}

function parseSafeDate(rawDate) {
  if (!rawDate) return new Date().toISOString();
  if (rawDate instanceof Date && !isNaN(rawDate)) return rawDate.toISOString();
  let str = String(rawDate).trim();
  if (str.includes("/")) {
    let parts = str.split(" ");
    let datePart = parts[0];
    let timePart = parts[1] || "00:00:00";
    if (timePart.split(":").length === 2) timePart += ":00";
    let dParts = datePart.split("/");
    if (dParts.length === 3) {
      let isoStr = `${dParts[2]}-${dParts[1].padStart(2, "0")}-${dParts[0].padStart(2, "0")}T${timePart}.000Z`;
      let testDate = new Date(isoStr);
      if (!isNaN(testDate)) return testDate.toISOString();
    }
  }
  let fallback = new Date(str);
  if (!isNaN(fallback)) return fallback.toISOString();
  return new Date().toISOString();
}

function getTransactions(token) {
  validateSession_(token);
  try {
    const sheet = getSheet("transactions");
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];

    // [P2] Optimasi: hanya baca 300 row terakhir daripada seluruh sheet
    const rowCount = Math.min(300, lastRow - 1);
    const startRow = lastRow - rowCount + 1;
    // [SHIFT] Baca 23 kolom termasuk pelunasan_shift_id
    const rawData = sheet.getRange(startRow, 1, rowCount, 23).getValues();

    let validData = [];
    for (let i = 0; i < rawData.length; i++) {
      let row = rawData[i];
      if (row.join("").trim() !== "") validData.push(row);
    }
    return validData.map((r) => ({
      id: String(r[0] || "TRX-?"),
      tanggal: parseSafeDate(r[1]),
      customer: String(r[2] || "Pelanggan"),
      paket: String(r[3] || "Layanan"),
      berat: parseFloat(r[4]) || 0,
      total: parseInt(r[5]) || 0,
      status: String(r[6] || "Proses"),
      kasir: String(r[7] || "-"),
      whatsapp: String(r[8] || ""),
      satuan: String(r[9] || "Kg"),
      estimasi: parseSafeDate(r[10]),
      metode_pembayaran: String(r[11] || "Tunai"),
      status_pembayaran: String(r[12] || "Belum Lunas"),
      catatan: String(r[15] || ""),
      terbayar:
        r[16] !== undefined && r[16] !== ""
          ? parseInt(r[16])
          : String(r[12] || "Belum Lunas") === "Lunas"
            ? parseInt(r[5]) || 0
            : 0,
      items: r[17]
        ? (function () {
            try {
              return JSON.parse(r[17]);
            } catch (e) {
              return [];
            }
          })()
        : [
            {
              paket: String(r[3] || "Layanan"),
              berat: parseFloat(r[4]) || 0,
              satuan: String(r[9] || "Kg"),
              subtotal: parseInt(r[5]) || 0,
            },
          ],
      tanggal_pelunasan:
        r[18] && String(r[18]).trim() !== "" ? parseSafeDate(r[18]) : "",
      nominal_dp: parseInt(r[19]) || parseInt(r[16]) || 0,
      nominal_pelunasan: parseInt(r[20]) || 0,
      metode_pelunasan: String(r[13] || ""),
      shift_id: String(r[21] || ""),
      pelunasan_shift_id: String(r[22] || ""),
    }));
  } catch (e) {
    logError("getTransactions", e.message);
    throw new Error("Gagal baca sheet Transaksi: " + e.message);
  }
}

function createTransaction(token, data) {
  const session = validateSession_(token);
  if (!data || !data.customer || !data.items_json)
    return { success: false, message: "Data tidak lengkap." };
    
  // Periksa shift aktif (WAJIB untuk Kasir, Bypass untuk Admin)
  let activeShift = null;
  if (session.role !== "admin") {
    activeShift = getActiveShift_(session.username);
    if (!activeShift) {
      return { success: false, message: "Anda belum membuka shift. Silakan buka shift terlebih dahulu." };
    }
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheetTrx = getSheet("transactions");

    let items = [];
    try {
      items = JSON.parse(data.items_json);
    } catch (e) {}
    if (!items || items.length === 0)
      return { success: false, message: "Keranjang kosong." };

    // [PERF] Pakai map id→harga yang di-cache (CacheService 5 menit + memory).
    // Lebih cepat 200-400ms vs full sheet read di setiap createTransaction.
    const priceMap = getPackagePriceMap_();
    let subtotal = 0;
    let totalBerat = 0;

    for (let i = 0; i < items.length; i++) {
      const serverHarga = priceMap[items[i].id] || 0;
      if (serverHarga === 0)
        return {
          success: false,
          message: "Paket " + items[i].paket + " tidak valid.",
        };

      let beratStr = items[i].berat;
      if (typeof beratStr === "string") beratStr = beratStr.replace(",", ".");
      let berat = parseFloat(beratStr);
      if (isNaN(berat) || berat <= 0) {
        throw new Error(
          `Data tidak valid: Berat untuk item ${items[i].paket} harus berupa angka positif.`,
        );
      }

      items[i].harga = serverHarga;
      items[i].subtotal = Math.round(serverHarga * berat);
      subtotal += items[i].subtotal;
      totalBerat += berat;
    }

    data.items_json = JSON.stringify(items);

    let grandTotal = subtotal;

    // [P0] Gunakan UUID untuk ID — menghindari collision pada transaksi bersamaan
    const id = generateId("TRX");
    const date = new Date();
    const paketLabel =
      items.length === 1 ? items[0].paket : `Multi-Item (${items.length})`;

    // [P0] Server hitung status_pembayaran sendiri — JANGAN percaya input client
    const terbayar = parseInt(data.terbayar) || 0;
    let statusPay;
    if (grandTotal === 0 || (terbayar >= grandTotal && terbayar > 0))
      statusPay = "Lunas";
    else if (terbayar > 0) statusPay = "DP";
    else statusPay = "Belum Lunas";

    const nominalDp = terbayar;
    const nominalPelunasan = 0;
    const tanggalPelunasan = "";

    sheetTrx.appendRow([
      id,
      date,
      data.customer,
      paketLabel,
      totalBerat,
      grandTotal,
      "Proses",
      data.kasir,
      data.whatsapp || "",
      items.length === 1 ? items[0].satuan || "Kg" : "-",
      data.estimasi || "",
      data.metode_pembayaran || "Tunai",
      statusPay,
      "",
      0,
      data.catatan || "",
      terbayar,
      data.items_json,
      tanggalPelunasan,
      nominalDp,
      nominalPelunasan,
      activeShift ? activeShift.id : "",
      "", // pelunasan_shift_id (diisi saat pelunasan terjadi)
    ]);

    saveOrUpdateCustomer(data.kasir, data.customer, data.whatsapp || "", date);
    return {
      success: true,
      id: id,
      tanggal: date.toISOString(),
      total: grandTotal,
      subtotal: subtotal,
      status_pembayaran: statusPay,
    };
  } catch (e) {
    logError(
      "createTransaction",
      e.message,
      JSON.stringify(data).substring(0, 500),
    );
    return { success: false, message: "Sistem sibuk, silakan simpan lagi." };
  } finally {
    lock.releaseLock();
  }
}

function updateTransactionStatus(token, id, newStatus) {
  validateSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    const sheet = getSheet("transactions");
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: "Data kosong" };
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === id) {
        sheet.getRange(i + 2, 7).setValue(newStatus);
        return { success: true };
      }
    }
    return { success: false, message: "Transaksi tidak ditemukan" };
  } catch (e) {
    logError("updateTransactionStatus", e.message, id);
    return { success: false, message: "Sistem sibuk." };
  } finally {
    lock.releaseLock();
  }
}

function lunasDanAmbil(token, id, metode) {
  const session = validateSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    const sheet = getSheet("transactions");
    const lastRow = sheet.getLastRow();
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

    // [SHIFT] Attribusi pelunasan ke shift kasir yang sedang melakukan pelunasan.
    // Admin bypass shift, jadi pelunasan_shift_id boleh kosong untuk role admin.
    let pelunasanShiftId = "";
    if (session.role !== "admin") {
      const activeShift = getActiveShift_(session.username);
      if (!activeShift) {
        return {
          success: false,
          message: "Anda belum membuka shift. Silakan buka shift sebelum proses pelunasan.",
        };
      }
      pelunasanShiftId = activeShift.id;
    }

    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === id) {
        const row = i + 2;
        const total = parseInt(sheet.getRange(row, 6).getValue()) || 0;
        // [SHIFT] Lebar baris diperluas ke 23 kolom (termasuk pelunasan_shift_id)
        const rowData = sheet.getRange(row, 1, 1, 23).getValues()[0];

        let currentDp = parseInt(rowData[19]);
        // Fallback untuk data lama yang belum punya nominal_dp (ambil dari terbayar)
        if (isNaN(currentDp)) {
          currentDp = parseInt(rowData[16]) || 0;
          rowData[19] = currentDp;
        }

        rowData[6] = "Diambil"; // col G (status)
        rowData[12] = "Lunas"; // col M (status_pembayaran)
        rowData[16] = total; // col Q (terbayar)

        rowData[18] = new Date().toISOString(); // tanggal_pelunasan
        rowData[20] = total - currentDp; // nominal_pelunasan
        rowData[13] = metode; // col N (metode_pelunasan)
        rowData[22] = pelunasanShiftId; // col W (pelunasan_shift_id)

        if (currentDp === 0) {
          rowData[11] = metode; // Timpa metode_pembayaran utama hanya jika sebelumnya 0 DP
        }

        sheet.getRange(row, 1, 1, 23).setValues([rowData]);
        return { success: true };
      }
    }
    return { success: false, message: "Transaksi tidak ditemukan" };
  } catch (e) {
    logError("lunasDanAmbil", e.message, id);
    return { success: false, message: "Sistem sibuk." };
  } finally {
    lock.releaseLock();
  }
}

function deleteTransaction(token, id) {
  validateAdminSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    const sheet = getSheet("transactions");
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: "Data kosong" };
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === id) {
        sheet.deleteRow(i + 2);
        return { success: true };
      }
    }
    return { success: false, message: "Transaksi tidak ditemukan" };
  } catch (e) {
    logError("deleteTransaction", e.message, id);
    return { success: false, message: "Sistem sibuk." };
  } finally {
    lock.releaseLock();
  }
}

function getCustomers(token) {
  validateSession_(token);
  // [OPT] Cache pelanggan 2 menit — cukup fresh untuk operasional, tapi tidak membebani read setiap tab-switch
  const cacheKey = "customers_list";
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }
  const sheet = getSheet("customers");
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    try { cache.put(cacheKey, "[]", 120); } catch(e) {}
    return [];
  }
  // [PERF] Range-bounded read — ambil maksimal 1500 customer terbaru.
  // Untuk UMKM laundry, 1500 pelanggan unik sudah lebih dari cukup;
  // mencegah latensi saat sheet sudah membengkak puluhan ribu baris.
  const MAX_CUSTOMERS = 1500;
  const rowCount = Math.min(MAX_CUSTOMERS, lastRow - 1);
  const startRow = lastRow - rowCount + 1;
  const rawData = sheet.getRange(startRow, 1, rowCount, 4).getValues();
  const result = rawData
    .filter((r) => r.join("").trim() !== "")
    .map((r) => ({
      id: r[0],
      nama: String(r[1] || "Anonim"),
      whatsapp: String(r[2] || ""),
      terakhir_order: parseSafeDate(r[3]),
    }))
    .reverse();
  try { cache.put(cacheKey, JSON.stringify(result), 120); } catch(e) {}
  return result;
}

function saveOrUpdateCustomer(kasir, nama, wa, date) {
  if (!nama) return;
  const sheet = getSheet("customers");
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const names = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    for (let i = 0; i < names.length; i++) {
      if (
        String(names[i][0]).trim().toLowerCase() ===
        String(nama).trim().toLowerCase()
      ) {
        // [OPT] Batch write 2 sel sekaligus agar lebih cepat
        if (wa) {
          sheet.getRange(i + 2, 3, 1, 2).setValues([[wa, date]]);
        } else {
          sheet.getRange(i + 2, 4).setValue(date);
        }
        return;
      }
    }
  }
  sheet.appendRow([generateId("CUST"), nama, wa, date]);
}

function addCustomerData(token, nama, wa) {
  validateSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    getSheet("customers").appendRow([
      generateId("CUST"),
      nama,
      wa,
      new Date().toISOString(),
    ]);
    // [OPT] Invalidate customer cache setelah write
    CacheService.getScriptCache().remove("customers_list");
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function updateCustomerData(token, id, nama, wa) {
  validateSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    const sheet = getSheet("customers");
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    // [OPT] Batch write: 2 setValue → 1 setValues
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === id) {
        sheet.getRange(i + 2, 2, 1, 2).setValues([[nama, wa]]);
        // [OPT] Invalidate customer cache setelah write
        CacheService.getScriptCache().remove("customers_list");
        return { success: true };
      }
    }
    return { success: false };
  } catch (e) {
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function deleteCustomerData(token, id) {
  validateSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    const sheet = getSheet("customers");
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === id) {
        sheet.deleteRow(i + 2);
        // [OPT] Invalidate customer cache setelah write
        CacheService.getScriptCache().remove("customers_list");
        return { success: true };
      }
    }
    return { success: false };
  } catch (e) {
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function getPackages(token) {
  validateSession_(token);
  // [OPT] Cache paket layanan — jarang berubah, cache 10 menit di ScriptCache
  const cacheKey = "packages_list";
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }
  const sheet = getSheet("packages");
  const rawData = sheet.getDataRange().getValues();
  if (rawData.length <= 1) return [];
  const result = rawData
    .slice(1)
    .filter((r) => r.join("").trim() !== "")
    .map((r) => ({
      id: r[0],
      nama: String(r[1] || "Paket"),
      harga: parseInt(r[2]) || 0,
      durasi: parseInt(r[3]) || 0,
      satuan: String(r[4] || "Kg"),
      kategori: String(r[5] || ""),
      status: String(r[6] || "Aktif"),
    }));
  try { cache.put(cacheKey, JSON.stringify(result), 600); } catch(e) {}
  return result;
}

function addPackage(token, nama, harga, durasi, satuan, kategori, status) {
  validateAdminSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    getSheet("packages").appendRow([
      generateId("PKG"),
      nama,
      harga,
      durasi,
      satuan,
      kategori || "",
      status || "Aktif",
    ]);
    // [OPT] Invalidate package cache setelah write
    CacheService.getScriptCache().remove("packages_list");
    invalidatePriceMapCache_();
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function updatePackage(
  token,
  id,
  newNama,
  newHarga,
  newDurasi,
  newSatuan,
  newKategori,
  newStatus,
) {
  validateAdminSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    const sheet = getSheet("packages");
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    // [OPT] Batch write: 6 setValue → 1 setValues
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === id) {
        sheet
          .getRange(i + 2, 2, 1, 6)
          .setValues([
            [
              newNama,
              newHarga,
              newDurasi,
              newSatuan,
              newKategori || "",
              newStatus || "Aktif",
            ],
          ]);
        // [OPT] Invalidate package cache setelah write
        CacheService.getScriptCache().remove("packages_list");
        invalidatePriceMapCache_();
        return { success: true };
      }
    }
    return { success: false };
  } catch (e) {
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function updatePackageStatus(token, id, newStatus) {
  validateAdminSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    const sheet = getSheet("packages");
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: "Data kosong" };
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === id) {
        sheet.getRange(i + 2, 7).setValue(newStatus);
        // [OPT] Invalidate package cache setelah status berubah
        CacheService.getScriptCache().remove("packages_list");
        invalidatePriceMapCache_();
        return { success: true };
      }
    }
    return { success: false, message: "Layanan tidak ditemukan" };
  } catch (e) {
    logError("updatePackageStatus", e.message, id);
    return { success: false, message: "Sistem sibuk." };
  } finally {
    lock.releaseLock();
  }
}

function deletePackage(token, id) {
  validateAdminSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    const sheet = getSheet("packages");
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === id) {
        sheet.deleteRow(i + 2);
        // [OPT] Invalidate package cache setelah delete
        CacheService.getScriptCache().remove("packages_list");
        invalidatePriceMapCache_();
        return { success: true };
      }
    }
    return { success: false };
  } catch (e) {
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function getSettings() {
  const cache = CacheService.getScriptCache();
  const cachedSettings = cache.get("app_settings");
  if (cachedSettings) return JSON.parse(cachedSettings);
  const data = getSheet("settings").getDataRange().getValues();
  let settings = {};
  for (let i = 1; i < data.length; i++) settings[data[i][0]] = data[i][1];
  cache.put("app_settings", JSON.stringify(settings), 21600);
  return settings;
}

function saveSettingsConfig(token, dataObj) {
  validateAdminSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    const sheet = getSheet("settings");
    const data = sheet.getDataRange().getValues();

    // [OPT] Batch write: update in-memory dulu, lalu tulis semua sekaligus
    // Menggantikan N-call setValue() → 1 setValues() + 1 appendRow batch
    const keysToAdd = [];
    for (let key in dataObj) {
      let found = false;
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === key) {
          data[i][1] = dataObj[key]; // update in-memory saja
          found = true;
          break;
        }
      }
      if (!found) keysToAdd.push([key, dataObj[key]]);
    }
    // 1 batch write untuk semua row yang diupdate
    sheet.getRange(1, 1, data.length, 2).setValues(data);
    // Append key baru (jika ada) dalam 1 operasi
    if (keysToAdd.length > 0) {
      sheet.getRange(data.length + 1, 1, keysToAdd.length, 2).setValues(keysToAdd);
    }

    CacheService.getScriptCache().remove("app_settings");
    return { success: true };
  } catch (e) {
    logError("saveSettingsConfig", e.message);
    return { success: false, message: "Sistem sibuk. Coba lagi." };
  } finally {
    lock.releaseLock();
  }
}

// Fungsi utilitas: Hapus sheet promos dari database (jalankan sekali)
function deletePromosSheet() {
  try {
    const ss = SpreadsheetApp.openById(getDbId_());
    const sheet = ss.getSheetByName("promos");
    if (sheet) {
      ss.deleteSheet(sheet);
      return "Sheet promos berhasil dihapus.";
    }
    return "Sheet promos tidak ditemukan.";
  } catch (e) {
    return "Gagal hapus: " + e.message;
  }
}

// ==========================================
// MANAJEMEN KAS HARIAN
// ==========================================

function setupKasSheet_() {
  const ss = SpreadsheetApp.openById(getDbId_());
  if (!ss.getSheetByName("kas_awal")) {
    const s1 = ss.insertSheet("kas_awal");
    s1.appendRow(["tanggal", "nominal", "kasir"]);
  }
  if (!ss.getSheetByName("pengeluaran")) {
    const s2 = ss.insertSheet("pengeluaran");
    s2.appendRow(["id", "tanggal", "keterangan", "kategori", "jumlah", "kasir"]);
  }
}

function saveUangAwal(token, nominal, dateStr) {
  const session = validateSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    setupKasSheet_();
    const sheet = getSheet("kas_awal");
    const data = sheet.getDataRange().getValues();
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    
    // Cari apakah sudah ada uang awal untuk tanggal yang sama dan kasir yang sama
    let foundRow = -1;
    for (let i = 1; i < data.length; i++) {
      const rowDate = new Date(data[i][0]);
      rowDate.setHours(0, 0, 0, 0);
      if (rowDate.getTime() === targetDate.getTime() && data[i][2] === session.username) {
        foundRow = i + 1;
        break;
      }
    }
    
    if (foundRow !== -1) {
      sheet.getRange(foundRow, 2).setValue(nominal);
      return { success: true, isUpdate: true };
    } else {
      sheet.appendRow([targetDate.toISOString(), nominal, session.username]);
      return { success: true, isUpdate: false };
    }
  } catch (e) {
    logError("saveUangAwal", e.message);
    return { success: false, message: "Gagal menyimpan uang awal: " + e.message };
  } finally {
    lock.releaseLock();
  }
}

function getKasHarian(token, tanggalStr) {
  const session = validateSession_(token);
  try {
    // [OPT] Hapus setupKasSheet_() — sheet sudah dibuat saat setupDatabase(), tidak perlu cek ulang di setiap read
    const targetDate = tanggalStr ? new Date(tanggalStr) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    
    // 1. Ambil Uang Awal
    let uangAwal = 0;
    
    // [FIX] getActiveShift_ butuh username — sebelumnya dipanggil tanpa arg → selalu null
    let activeShift = getActiveShift_(session.username);
    if (activeShift) {
       const shiftDate = new Date(activeShift.waktu_mulai);
       shiftDate.setHours(0, 0, 0, 0);
       if (shiftDate.getTime() === targetDate.getTime()) {
           uangAwal = parseInt(activeShift.modal_awal) || 0;
       }
    }
    
    // Fallback: Jika tidak ada shift aktif dari hari ini, coba cari dari shift yang sudah ditutup hari ini
    if (uangAwal === 0) {
      const sheetShifts = getSheet("shifts");
      const lastRowShifts = sheetShifts.getLastRow();
      if (lastRowShifts > 1) {
        // [PERF] Range-bounded read — cukup 100 shift terakhir untuk fallback hari ini.
        // Lebih cepat ~5-10x dari getDataRange untuk sheet dengan ratusan shift.
        const shiftRowCount = Math.min(100, lastRowShifts - 1);
        const shiftStartRow = lastRowShifts - shiftRowCount + 1;
        const dataShifts = sheetShifts
          .getRange(shiftStartRow, 1, shiftRowCount, 6)
          .getValues();
        // Cari shift terakhir di hari yang sama (iterasi mundur)
        for (let i = dataShifts.length - 1; i >= 0; i--) {
          if (!dataShifts[i][0]) continue;
          const rowDate = new Date(dataShifts[i][3]); // waktu_mulai
          rowDate.setHours(0, 0, 0, 0);
          if (rowDate.getTime() === targetDate.getTime()) {
            // modal_awal di kolom indeks 5 (kolom F)
            uangAwal = parseInt(dataShifts[i][5]) || 0;
            break;
          }
        }
      }
    }
    
    // Backward compatibility: Tetap cek kas_awal lama jika shift tidak ada
    if (uangAwal === 0) {
      const sheetKas = getSheet("kas_awal");
      const lastRowKas = sheetKas.getLastRow();
      if (lastRowKas > 1) {
        // [PERF] Range-bounded read — kas_awal harian, cukup 90 hari terakhir
        const kasRowCount = Math.min(90, lastRowKas - 1);
        const kasStartRow = lastRowKas - kasRowCount + 1;
        const dataKas = sheetKas.getRange(kasStartRow, 1, kasRowCount, 2).getValues();
        for (let i = 0; i < dataKas.length; i++) {
          if (!dataKas[i][0]) continue;
          const rowDate = new Date(dataKas[i][0]);
          rowDate.setHours(0, 0, 0, 0);
          if (rowDate.getTime() === targetDate.getTime()) {
            uangAwal += parseInt(dataKas[i][1]) || 0;
          }
        }
      }
    }
    
    // 2. Ambil Pengeluaran
    let pengeluaranList = [];
    let totalPengeluaran = 0;
    const sheetPengeluaran = getSheet("pengeluaran");
    const lastRowPg = sheetPengeluaran.getLastRow();
    if (lastRowPg > 1) {
      // [PERF] Range-bounded read — cukup 500 pengeluaran terakhir untuk filter hari ini
      const pgRowCount = Math.min(500, lastRowPg - 1);
      const pgStartRow = lastRowPg - pgRowCount + 1;
      const dataPengeluaran = sheetPengeluaran
        .getRange(pgStartRow, 1, pgRowCount, 6)
        .getValues();
      for (let i = 0; i < dataPengeluaran.length; i++) {
        if (dataPengeluaran[i].join("").trim() === "") continue;
        const rowDate = new Date(dataPengeluaran[i][1]);
        rowDate.setHours(0, 0, 0, 0);
        if (rowDate.getTime() === targetDate.getTime()) {
          const nominal = parseInt(dataPengeluaran[i][4]) || 0;
          pengeluaranList.push({
            id: dataPengeluaran[i][0],
            tanggal: dataPengeluaran[i][1],
            keterangan: dataPengeluaran[i][2],
            kategori: dataPengeluaran[i][3],
            jumlah: nominal,
            kasir: dataPengeluaran[i][5],
          });
          totalPengeluaran += nominal;
        }
      }
    }

    return {
      success: true,
      uang_awal: uangAwal,
      pengeluaran: pengeluaranList,
      total_pengeluaran: totalPengeluaran,
    };
  } catch (e) {
    logError("getKasHarian", e.message);
    return { success: false, message: "Gagal mengambil data kas: " + e.message };
  }
}

function savePengeluaran(token, keterangan, kategori, jumlah, dateStr) {
  const session = validateSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    setupKasSheet_();
    const sheet = getSheet("pengeluaran");
    const dateToSave = dateStr ? new Date(dateStr) : new Date();
    // Use current time if date is today, else use 12:00 of that date
    if (dateStr) {
      const today = new Date();
      if (dateToSave.toDateString() === today.toDateString()) {
         dateToSave.setHours(today.getHours(), today.getMinutes(), today.getSeconds());
      } else {
         dateToSave.setHours(12, 0, 0);
      }
    }
    
    const newId = generateId("PGL");
    sheet.appendRow([newId, dateToSave.toISOString(), keterangan, kategori, jumlah, session.username]);
    return { success: true, id: newId };
  } catch (e) {
    logError("savePengeluaran", e.message);
    return { success: false, message: "Gagal menyimpan pengeluaran: " + e.message };
  } finally {
    lock.releaseLock();
  }
}

function deletePengeluaran(token, id) {
  validateAdminSession_(token); // Only Admin can delete
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    const sheet = getSheet("pengeluaran");
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === id) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    return { success: false, message: "Data tidak ditemukan." };
  } catch (e) {
    logError("deletePengeluaran", e.message);
    return { success: false, message: "Gagal menghapus pengeluaran: " + e.message };
  } finally {
    lock.releaseLock();
  }
}

function getKasPeriode(token, startDateStr, endDateStr) {
  validateAdminSession_(token);
  try {
    // [OPT] Hapus setupKasSheet_() — tidak diperlukan di operasi baca
    let startD = startDateStr ? new Date(startDateStr) : null;
    if (startD) startD.setHours(0, 0, 0, 0);

    let endD = endDateStr ? new Date(endDateStr) : null;
    if (endD) endD.setHours(23, 59, 59, 999);
    
    let totalUangAwal = 0;
    const sheetKas = getSheet("kas_awal");
    const dataKas = sheetKas.getDataRange().getValues();
    for (let i = 1; i < dataKas.length; i++) {
      const rowDate = new Date(dataKas[i][0]);
      if (isNaN(rowDate)) continue;
      if (startD && rowDate < startD) continue;
      if (endD && rowDate > endD) continue;
      totalUangAwal += parseInt(dataKas[i][1]) || 0;
    }
    
    let totalPengeluaran = 0;
    const sheetPengeluaran = getSheet("pengeluaran");
    const dataPengeluaran = sheetPengeluaran.getDataRange().getValues();
    for (let i = 1; i < dataPengeluaran.length; i++) {
      if(dataPengeluaran[i].join("").trim() === "") continue;
      const rowDate = new Date(dataPengeluaran[i][1]);
      if (isNaN(rowDate)) continue;
      if (startD && rowDate < startD) continue;
      if (endD && rowDate > endD) continue;
      totalPengeluaran += parseInt(dataPengeluaran[i][4]) || 0;
    }
    
    return { 
      success: true, 
      total_uang_awal: totalUangAwal, 
      total_pengeluaran: totalPengeluaran 
    };
  } catch (e) {
    logError("getKasPeriode", e.message);
    return { success: false, message: "Gagal mengambil data kas periode: " + e.message };
  }
}

// FUNGSI KHUSUS LAPORAN
function getReportData(token, startDateStr, endDateStr) {
  validateAdminSession_(token);
  try {
    const sheet = getSheet("transactions");
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];

    // Mengambil seluruh data (tanpa limitasi 300 baris) agar laporan bulanan akurat
    // [SHIFT] Baca 23 kolom termasuk shift_id & pelunasan_shift_id
    const rawData = sheet.getRange(2, 1, lastRow - 1, 23).getValues();
    let validData = [];

    let startD = startDateStr ? new Date(startDateStr) : null;
    if (startD) startD.setHours(0, 0, 0, 0);

    let endD = endDateStr ? new Date(endDateStr) : null;
    if (endD) endD.setHours(23, 59, 59, 999);

    for (let i = 0; i < rawData.length; i++) {
      let r = rawData[i];
      if (r.join("").trim() === "") continue;

      // [FIX] parseSafeDate() mengembalikan string ISO, harus di-convert ke Date object untuk perbandingan
      let trDateStr = parseSafeDate(r[1]);
      let trDate = new Date(trDateStr);
      let trPelunasanDate = null;
      if (r[18] && String(r[18]).trim() !== "") {
        trPelunasanDate = new Date(parseSafeDate(r[18]));
      }

      // Filter Tanggal: Masuk jika tanggal pembuatan di dalam rentang ATAU tanggal pelunasan di dalam rentang
      let trDateInRange = true;
      let trPelunasanDateInRange = false;

      if (!isNaN(trDate)) {
        if (startD && trDate < startD) trDateInRange = false;
        if (endD && trDate > endD) trDateInRange = false;
      } else {
        trDateInRange = false;
      }

      if (trPelunasanDate && !isNaN(trPelunasanDate)) {
        trPelunasanDateInRange = true;
        if (startD && trPelunasanDate < startD) trPelunasanDateInRange = false;
        if (endD && trPelunasanDate > endD) trPelunasanDateInRange = false;
      }

      if (!trDateInRange && !trPelunasanDateInRange) continue;

      // Hanya memasukkan field yang dibutuhkan untuk laporan agar payload ringan
      validData.push({
        id: String(r[0] || "TRX-?"),
        tanggal: !isNaN(trDate)
          ? trDate.toISOString()
          : new Date().toISOString(),
        customer: String(r[2] || "Pelanggan"),
        paket: String(r[3] || "Layanan"),
        berat: parseFloat(r[4]) || 0,
        total: parseInt(r[5]) || 0,
        status: String(r[6] || "Proses"),
        kasir: String(r[7] || "-"),
        metode_pembayaran: String(r[11] || "Tunai"),
        status_pembayaran: String(r[12] || "Belum Lunas"),

        terbayar:
          parseInt(r[16]) ||
          (String(r[12] || "Belum Lunas") === "Lunas"
            ? parseInt(r[5]) || 0
            : 0),
        items: r[17] || "[]",
        tanggal_pelunasan:
          trPelunasanDate && !isNaN(trPelunasanDate)
            ? trPelunasanDate.toISOString()
            : "",
        nominal_dp: parseInt(r[19]) || parseInt(r[16]) || 0,
        nominal_pelunasan: parseInt(r[20]) || 0,
        metode_pelunasan: String(r[13] || ""),
        shift_id: String(r[21] || ""),
        pelunasan_shift_id: String(r[22] || ""),
      });
    }
    return validData;
  } catch (e) {
    logError("getReportData", e.message);
    throw new Error("Gagal ambil data laporan: " + e.message);
  }
}

// [OPT] Fungsi gabungan: mengambil data Laporan + data Kas dalam 1 GAS call.
// Menggantikan 2 serial nested call di frontend (sebelumnya: getReportData → callback → getKasPeriode).
// Menghemat 1 round-trip GAS (~1-5 detik) setiap kali tab Laporan dibuka.
function getReportAndKasData(token, startDateStr, endDateStr) {
  validateAdminSession_(token);
  try {
    const reportData = getReportData(token, startDateStr, endDateStr);
    const kasResult = getKasPeriode(token, startDateStr, endDateStr);
    return {
      success: true,
      report: reportData,
      kas: kasResult
    };
  } catch (e) {
    logError("getReportAndKasData", e.message);
    return { success: false, message: "Gagal mengambil data laporan: " + e.message };
  }
}

// [OPT] Dashboard Bundle: satu GAS call untuk menggantikan 3 call saat login
// (getTransactions + getSettings + getPackages → 1 getDashboardBundle)
// Menghemat 2 round-trip GAS (~2-10 detik) setiap kali pengguna login atau reload.
function getDashboardBundle(token) {
  return _perf("getDashboardBundle", function () {
    const session = validateSession_(token);
    try {
      const transactions = _perf("  └ getTransactions", () => getTransactions(token));
      const packages = _perf("  └ getPackages", () => getPackages(token));
      const settings = _perf("  └ getSettings", () => getSettings());
      const customers = _perf("  └ getCustomers", () => getCustomers(token));
      const activeShift = _perf("  └ getActiveShift_", () => getActiveShift_(session.username));
      return {
        success: true,
        transactions: transactions,
        packages: packages,
        settings: settings,
        customers: customers,
        activeShift: activeShift,
      };
    } catch (e) {
      logError("getDashboardBundle", e.message);
      return { success: false, message: "Gagal mengambil data dashboard: " + e.message };
    }
  });
}

// ==========================================
// SHIFT MANAGEMENT
// ==========================================

function getActiveShift_(username) {
  const sheet = getSheet("shifts");
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === username && data[i][10] === "Aktif") {
      return {
        id: data[i][0],
        kasir: data[i][1],
        nama_kasir: data[i][2],
        waktu_mulai: data[i][3],
        modal_awal: parseInt(data[i][5]) || 0,
        status: data[i][10]
      };
    }
  }
  return null;
}

function getActiveShiftAPI(token) {
  const session = validateSession_(token);
  const activeShift = getActiveShift_(session.username);
  return { success: true, data: activeShift };
}

// [SHIFT] Admin: ambil semua shift berstatus "Aktif" beserta live summary.
// Dipakai di section Manajemen Shift admin untuk monitoring real-time.
// [PERF] Hasil di-cache 15 detik untuk meredam polling/refresh agresif tanpa
// membuat data terlihat basi (kasir biasanya buka shift hanya beberapa kali per hari).
function getAllActiveShifts(token) {
  validateAdminSession_(token);
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = "active_shifts_v2";
    const cached = cache.get(cacheKey);
    if (cached) {
      try {
        return { success: true, data: JSON.parse(cached), _cached: true };
      } catch (e) {
        // cache corrupt → recompute
      }
    }

    const sheet = getSheet("shifts");
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      cache.put(cacheKey, "[]", 15);
      return { success: true, data: [] };
    }

    // [PERF] Range-bounded — cukup 200 shift terakhir, shift "Aktif" pasti yang baru
    const rowCount = Math.min(200, lastRow - 1);
    const startRow = lastRow - rowCount + 1;
    const data = sheet.getRange(startRow, 1, rowCount, 15).getValues();

    const result = [];
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      if (!r[0] || String(r[10] || "") !== "Aktif") continue;

      const modalAwal = parseInt(r[5]) || 0;
      const summary = computeShiftSummary_(r[0], modalAwal);

      result.push({
        id: r[0],
        kasir: r[1],
        nama_kasir: r[2],
        waktu_mulai: r[3] ? new Date(r[3]).toISOString() : "",
        modal_awal: modalAwal,
        status: "Aktif",
        live_summary: summary,
      });
    }
    // Urutkan terbaru → terlama
    result.sort((a, b) => {
      const ta = a.waktu_mulai ? new Date(a.waktu_mulai).getTime() : 0;
      const tb = b.waktu_mulai ? new Date(b.waktu_mulai).getTime() : 0;
      return tb - ta;
    });

    // Cache 15dtk — payload kecil (max ~5 shift aktif), aman dari batas 100KB
    try {
      const payload = JSON.stringify(result);
      if (payload.length < 95000) cache.put(cacheKey, payload, 15);
    } catch (e) {}

    return { success: true, data: result };
  } catch (e) {
    logError("getAllActiveShifts", e.message);
    return { success: false, message: "Gagal ambil shift aktif: " + e.message };
  }
}

// [SHIFT] Helper internal — invalidasi cache shift aktif setelah open/close/forceClose
function invalidateActiveShiftsCache_() {
  try {
    CacheService.getScriptCache().remove("active_shifts_v2");
  } catch (e) {}
}

function openShift(token, modalAwal) {
  const session = validateSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    const existing = getActiveShift_(session.username);
    if (existing) {
      return { success: false, message: "Anda masih memiliki shift yang aktif." };
    }
    
    const sheet = getSheet("shifts");
    const id = generateId("SHF");
    const now = new Date().toISOString();
    
    sheet.appendRow([
      id,
      session.username,
      session.nama,
      now,
      "", 
      parseInt(modalAwal) || 0,
      0, 
      0, 
      0, 
      0, 
      "Aktif",
      "",
      0,
      0,
      "",
    ]);
    
    // Fallback Kas Harian
    saveUangAwal(token, parseInt(modalAwal) || 0, now);
    invalidateActiveShiftsCache_();
    
    return { success: true, message: "Shift berhasil dibuka." };
  } catch(e) {
    logError("openShift", e.message);
    return { success: false, message: "Gagal membuka shift: " + e.message };
  } finally {
    lock.releaseLock();
  }
}

// [SHIFT] Helper terpadu — hitung rekap shift berdasarkan transaksi (DP),
// pelunasan (yang dilakukan dalam shift ini), dan pengeluaran shift.
// Digunakan oleh closeShift, forceCloseShift, autoCloseExpiredShifts,
// dan getShiftHistory (untuk shift yang masih aktif → preview).
function computeShiftSummary_(shiftId, modalAwal) {
  const trxSheet = getSheet("transactions");
  const lastRow = trxSheet.getLastRow();
  let totalTransaksi = 0; // grand total nilai transaksi di shift ini
  let totalTunai = 0;
  let totalNonTunai = 0;
  let jumlahOrder = 0;
  let totalDp = 0;        // pemasukan DP yang masuk ke shift ini
  let totalPelunasan = 0; // pemasukan pelunasan yang dieksekusi di shift ini

  // [SHIFT] Breakdown rinci per metode pembayaran (untuk pembukuan)
  // Memisahkan DP vs Pelunasan dan QRIS vs Transfer secara eksplisit
  const breakdownMetode = {
    Tunai: { dp: 0, pelunasan: 0, total: 0, count: 0 },
    QRIS: { dp: 0, pelunasan: 0, total: 0, count: 0 },
    Transfer: { dp: 0, pelunasan: 0, total: 0, count: 0 },
    Lainnya: { dp: 0, pelunasan: 0, total: 0, count: 0 },
  };
  const normalizeMetode_ = function (raw) {
    const m = String(raw || "").toLowerCase();
    if (m.indexOf("tunai") !== -1 || m.indexOf("cash") !== -1) return "Tunai";
    if (m.indexOf("qris") !== -1) return "QRIS";
    if (m.indexOf("transfer") !== -1) return "Transfer";
    return "Lainnya";
  };

  if (lastRow > 1) {
    const trxData = trxSheet.getRange(2, 1, lastRow - 1, 23).getValues();
    for (let i = 0; i < trxData.length; i++) {
      const r = trxData[i];
      if (!r[0]) continue;

      const total = parseInt(r[5]) || 0;
      const metodeUtama = String(r[11] || "Tunai");
      const metodePelunasan = String(r[13] || "");
      const dp = parseInt(r[19]) || 0;
      const pelunasan = parseInt(r[20]) || 0;
      const trxShiftId = String(r[21] || "");
      const pelunasanShiftId = String(r[22] || "");

      // Transaksi DIBUAT di shift ini → catat sebagai order, akumulasi DP-nya
      if (trxShiftId === shiftId) {
        jumlahOrder++;
        totalTransaksi += total;
        const keyDp = normalizeMetode_(metodeUtama);
        if (keyDp === "Tunai") totalTunai += dp;
        else totalNonTunai += dp;
        if (dp > 0) {
          breakdownMetode[keyDp].dp += dp;
          breakdownMetode[keyDp].total += dp;
          breakdownMetode[keyDp].count++;
        }
        totalDp += dp;
      }

      // Pelunasan DILAKUKAN di shift ini (mungkin shift berbeda dari pembuatan)
      if (pelunasanShiftId === shiftId && pelunasan > 0) {
        const keyP = normalizeMetode_(metodePelunasan || metodeUtama);
        if (keyP === "Tunai") totalTunai += pelunasan;
        else totalNonTunai += pelunasan;
        breakdownMetode[keyP].pelunasan += pelunasan;
        breakdownMetode[keyP].total += pelunasan;
        breakdownMetode[keyP].count++;
        totalPelunasan += pelunasan;
      }
    }
  }

  // [SHIFT] Pengeluaran selama shift aktif — ambil semua pengeluaran antara waktu_mulai shift ini dan now (atau waktu_selesai untuk shift sudah ditutup).
  // Karena pengeluaran tidak punya shift_id, gunakan window waktu shift sebagai aproksimasi.
  let totalPengeluaran = 0;
  let pengeluaranList = [];
  // [SHIFT] Breakdown pengeluaran per kategori (untuk pembukuan)
  const breakdownPengeluaran = {
    "Bahan Baku": { jumlah: 0, count: 0 },
    "Operasional": { jumlah: 0, count: 0 },
    "Lain-lain": { jumlah: 0, count: 0 },
  };
  try {
    const shiftSheet = getSheet("shifts");
    const lastRowShifts = shiftSheet.getLastRow();
    let waktuMulai = null;
    let waktuSelesai = null;
    let username = "";
    if (lastRowShifts > 1) {
      // [PERF] Cari shift dengan range-bound (max 200 shift terakhir)
      const shiftRowCount = Math.min(200, lastRowShifts - 1);
      const shiftStartRow = lastRowShifts - shiftRowCount + 1;
      const shiftData = shiftSheet
        .getRange(shiftStartRow, 1, shiftRowCount, 5)
        .getValues();
      for (let i = shiftData.length - 1; i >= 0; i--) {
        if (shiftData[i][0] === shiftId) {
          waktuMulai = shiftData[i][3] ? new Date(shiftData[i][3]) : null;
          waktuSelesai = shiftData[i][4] ? new Date(shiftData[i][4]) : null;
          username = String(shiftData[i][1] || "");
          break;
        }
      }
    }
    if (waktuMulai && !isNaN(waktuMulai)) {
      const start = waktuMulai.getTime();
      const end = (waktuSelesai && !isNaN(waktuSelesai))
        ? waktuSelesai.getTime()
        : Date.now();
      const pgSheet = getSheet("pengeluaran");
      const lastRowPg = pgSheet.getLastRow();
      if (lastRowPg > 1) {
        // [PERF] Range-bound — shift max 24 jam, jadi 500 pengeluaran terakhir cukup
        const pgRowCount = Math.min(500, lastRowPg - 1);
        const pgStartRow = lastRowPg - pgRowCount + 1;
        const pgData = pgSheet
          .getRange(pgStartRow, 1, pgRowCount, 6)
          .getValues();
        for (let i = 0; i < pgData.length; i++) {
          if (pgData[i].join("").trim() === "") continue;
          const t = pgData[i][1] ? new Date(pgData[i][1]).getTime() : 0;
          const kasir = String(pgData[i][5] || "");
          if (t >= start && t <= end && (!username || kasir === username || kasir === "")) {
            const nominal = parseInt(pgData[i][4]) || 0;
            const kategori = String(pgData[i][3] || "Lain-lain");
            totalPengeluaran += nominal;
            pengeluaranList.push({
              id: pgData[i][0],
              tanggal: pgData[i][1] ? new Date(pgData[i][1]).toISOString() : "",
              keterangan: pgData[i][2],
              kategori: kategori,
              jumlah: nominal,
            });
            // Akumulasi ke kategori; fallback ke Lain-lain kalau kategori non-standar
            const keyKat = breakdownPengeluaran[kategori] ? kategori : "Lain-lain";
            breakdownPengeluaran[keyKat].jumlah += nominal;
            breakdownPengeluaran[keyKat].count++;
          }
        }
      }
    }
  } catch (e) {
    logError("computeShiftSummary_pengeluaran", e.message);
  }

  const modal = parseInt(modalAwal) || 0;
  const saldoAkhir = modal + totalTunai - totalPengeluaran;

  return {
    totalTransaksi,
    totalTunai,
    totalNonTunai,
    jumlahOrder,
    totalDp,
    totalPelunasan,
    totalPengeluaran,
    pengeluaranList,
    modalAwal: modal,
    saldoAkhir,
    // [SHIFT] Breakdown detail untuk pembukuan
    breakdownMetode,
    breakdownPengeluaran,
  };
}

function closeShift(token, shiftId, catatan) {
  const session = validateSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getSheet("shifts");
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    let modalAwal = 0;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === shiftId && data[i][1] === session.username && data[i][10] === "Aktif") {
        rowIndex = i + 1;
        modalAwal = parseInt(data[i][5]) || 0;
        break;
      }
    }

    if (rowIndex === -1) {
      return { success: false, message: "Shift tidak ditemukan atau sudah ditutup." };
    }

    const summary = computeShiftSummary_(shiftId, modalAwal);
    const now = new Date().toISOString();

    // [SHIFT] Persist breakdown JSON untuk pembukuan rinci shift lama.
    // Disimpan compact (tanpa pengeluaranList karena bisa di-recompute on-demand).
    const breakdownPayload = JSON.stringify({
      breakdownMetode: summary.breakdownMetode || {},
      breakdownPengeluaran: summary.breakdownPengeluaran || {},
      totalDp: summary.totalDp || 0,
      totalPelunasan: summary.totalPelunasan || 0,
    });

    // [OPT] Batch write — 9 setValue → 1 setValues (termasuk total_pengeluaran, saldo_akhir & breakdown_json)
    const existingRow = sheet.getRange(rowIndex, 1, 1, 15).getValues()[0];
    existingRow[4] = now;
    existingRow[6] = summary.totalTransaksi;
    existingRow[7] = summary.totalTunai;
    existingRow[8] = summary.totalNonTunai;
    existingRow[9] = summary.jumlahOrder;
    existingRow[10] = "Selesai";
    existingRow[11] = catatan || "";
    existingRow[12] = summary.totalPengeluaran || 0;
    existingRow[13] = summary.saldoAkhir || 0;
    existingRow[14] = breakdownPayload;
    sheet.getRange(rowIndex, 1, 1, 15).setValues([existingRow]);

    return {
      success: true,
      message: "Shift berhasil ditutup.",
      summary: summary,
    };
  } catch(e) {
    logError("closeShift", e.message);
    return { success: false, message: "Gagal menutup shift: " + e.message };
  } finally {
    invalidateActiveShiftsCache_();
    lock.releaseLock();
  }
}

// [SHIFT] Admin force-close — untuk shift yang lupa ditutup atau kasir tidak available
function forceCloseShift(token, shiftId, catatan) {
  validateAdminSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getSheet("shifts");
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    let modalAwal = 0;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === shiftId && data[i][10] === "Aktif") {
        rowIndex = i + 1;
        modalAwal = parseInt(data[i][5]) || 0;
        break;
      }
    }

    if (rowIndex === -1) {
      return { success: false, message: "Shift aktif tidak ditemukan." };
    }

    const summary = computeShiftSummary_(shiftId, modalAwal);
    const now = new Date().toISOString();
    const noteFinal = (catatan ? catatan + " — " : "") + "[Force-closed by admin]";

    const breakdownPayload = JSON.stringify({
      breakdownMetode: summary.breakdownMetode || {},
      breakdownPengeluaran: summary.breakdownPengeluaran || {},
      totalDp: summary.totalDp || 0,
      totalPelunasan: summary.totalPelunasan || 0,
    });

    const existingRow = sheet.getRange(rowIndex, 1, 1, 15).getValues()[0];
    existingRow[4] = now;
    existingRow[6] = summary.totalTransaksi;
    existingRow[7] = summary.totalTunai;
    existingRow[8] = summary.totalNonTunai;
    existingRow[9] = summary.jumlahOrder;
    existingRow[10] = "Force-Closed";
    existingRow[11] = noteFinal;
    existingRow[12] = summary.totalPengeluaran || 0;
    existingRow[13] = summary.saldoAkhir || 0;
    existingRow[14] = breakdownPayload;
    sheet.getRange(rowIndex, 1, 1, 15).setValues([existingRow]);

    return {
      success: true,
      message: "Shift berhasil di-force close.",
      summary: summary,
    };
  } catch(e) {
    logError("forceCloseShift", e.message);
    return { success: false, message: "Gagal force close shift: " + e.message };
  } finally {
    invalidateActiveShiftsCache_();
    lock.releaseLock();
  }
}

// [SHIFT] Admin: ambil daftar shift dalam rentang tanggal (default 30 hari terakhir)
function getShiftHistory(token, startDateStr, endDateStr) {
  validateAdminSession_(token);
  try {
    const sheet = getSheet("shifts");
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: true, data: [] };

    // [PERF] Range-bounded — default 30 hari, batasi 500 shift terakhir agar getValues() ringan
    // walau sheet sudah berisi ribuan record.
    const rowCount = Math.min(500, lastRow - 1);
    const startRow = lastRow - rowCount + 1;
    const data = sheet.getRange(startRow, 1, rowCount, 15).getValues();
    let startD = startDateStr ? new Date(startDateStr) : null;
    if (startD) startD.setHours(0, 0, 0, 0);
    let endD = endDateStr ? new Date(endDateStr) : null;
    if (endD) endD.setHours(23, 59, 59, 999);

    const result = [];
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      if (!r[0]) continue;
      const startTime = r[3] ? new Date(r[3]) : null;
      if (startD && startTime && startTime < startD) continue;
      if (endD && startTime && startTime > endD) continue;

      const status = String(r[10] || "");
      const modalAwal = parseInt(r[5]) || 0;
      let summary = null;

      if (status === "Aktif") {
        // Untuk shift aktif: hitung real-time
        summary = computeShiftSummary_(r[0], modalAwal);
      } else {
        // [SHIFT] Untuk shift sudah ditutup: restore breakdown dari kolom breakdown_json (kolom 15).
        // Kalau kolom kosong (shift lama sebelum migration), recompute on-demand sebagai fallback.
        const breakdownRaw = String(r[14] || "").trim();
        if (breakdownRaw) {
          try {
            const parsed = JSON.parse(breakdownRaw);
            summary = {
              totalTransaksi: parseInt(r[6]) || 0,
              totalTunai: parseInt(r[7]) || 0,
              totalNonTunai: parseInt(r[8]) || 0,
              jumlahOrder: parseInt(r[9]) || 0,
              modalAwal: modalAwal,
              totalPengeluaran: parseInt(r[12]) || 0,
              saldoAkhir: parseInt(r[13]) || 0,
              totalDp: parsed.totalDp || 0,
              totalPelunasan: parsed.totalPelunasan || 0,
              breakdownMetode: parsed.breakdownMetode || {},
              breakdownPengeluaran: parsed.breakdownPengeluaran || {},
            };
          } catch (parseErr) {
            // JSON corrupt → fallback ke recompute
            logError("getShiftHistory_parseBreakdown", parseErr.message);
          }
        }
      }

      result.push({
        id: r[0],
        kasir: r[1],
        nama_kasir: r[2],
        waktu_mulai: r[3] ? new Date(r[3]).toISOString() : "",
        waktu_selesai: r[4] ? new Date(r[4]).toISOString() : "",
        modal_awal: modalAwal,
        total_transaksi: parseInt(r[6]) || 0,
        total_tunai: parseInt(r[7]) || 0,
        total_non_tunai: parseInt(r[8]) || 0,
        jumlah_order: parseInt(r[9]) || 0,
        status: status,
        catatan: String(r[11] || ""),
        total_pengeluaran: parseInt(r[12]) || 0,
        saldo_akhir: parseInt(r[13]) || 0,
        live_summary: summary, // berisi breakdown untuk shift Aktif & shift sudah ditutup (post-migration)
      });
    }
    // Urutkan terbaru → terlama
    result.sort((a, b) => {
      const ta = a.waktu_mulai ? new Date(a.waktu_mulai).getTime() : 0;
      const tb = b.waktu_mulai ? new Date(b.waktu_mulai).getTime() : 0;
      return tb - ta;
    });

    return { success: true, data: result };
  } catch (e) {
    logError("getShiftHistory", e.message);
    return { success: false, message: "Gagal ambil riwayat shift: " + e.message };
  }
}

// [SHIFT] Recompute breakdown on-demand untuk shift LAMA yang belum punya breakdown_json
// (shift yang ditutup sebelum migration breakdown_json). Hasilnya dipersist ke sheet
// supaya panggilan berikutnya langsung pakai cache di kolom breakdown_json.
function recomputeShiftBreakdown(token, shiftId) {
  validateAdminSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getSheet("shifts");
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { success: false, message: "Sheet kosong." };

    const data = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
    let rowIndex = -1;
    let r = null;
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === shiftId) {
        rowIndex = i + 2;
        r = data[i];
        break;
      }
    }
    if (rowIndex === -1) {
      return { success: false, message: "Shift tidak ditemukan." };
    }
    const modalAwal = parseInt(r[5]) || 0;
    const summary = computeShiftSummary_(shiftId, modalAwal);
    const breakdownPayload = JSON.stringify({
      breakdownMetode: summary.breakdownMetode || {},
      breakdownPengeluaran: summary.breakdownPengeluaran || {},
      totalDp: summary.totalDp || 0,
      totalPelunasan: summary.totalPelunasan || 0,
    });
    sheet.getRange(rowIndex, 15).setValue(breakdownPayload);
    return {
      success: true,
      data: {
        breakdownMetode: summary.breakdownMetode,
        breakdownPengeluaran: summary.breakdownPengeluaran,
        totalDp: summary.totalDp,
        totalPelunasan: summary.totalPelunasan,
      },
    };
  } catch (e) {
    logError("recomputeShiftBreakdown", e.message);
    return { success: false, message: "Gagal recompute: " + e.message };
  } finally {
    lock.releaseLock();
  }
}

// [SHIFT] Time-trigger: jalan otomatis tiap hari pukul 23:50
// Mencari shift yang masih Aktif dan menutupnya dengan status Force-Closed.
function autoCloseExpiredShifts() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getSheet("shifts");
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;

    const data = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
    const now = new Date().toISOString();
    let closedCount = 0;

    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      if (!r[0] || r[10] !== "Aktif") continue;

      const shiftId = r[0];
      const modalAwal = parseInt(r[5]) || 0;
      const rowIndex = i + 2;

      const summary = computeShiftSummary_(shiftId, modalAwal);
      const breakdownPayload = JSON.stringify({
        breakdownMetode: summary.breakdownMetode || {},
        breakdownPengeluaran: summary.breakdownPengeluaran || {},
        totalDp: summary.totalDp || 0,
        totalPelunasan: summary.totalPelunasan || 0,
      });
      const updatedRow = [
        r[0], r[1], r[2], r[3],
        now,                           // waktu_selesai
        r[5],
        summary.totalTransaksi,
        summary.totalTunai,
        summary.totalNonTunai,
        summary.jumlahOrder,
        "Force-Closed",
        "[Auto-closed sistem]",
        summary.totalPengeluaran || 0,
        summary.saldoAkhir || 0,
        breakdownPayload,
      ];
      sheet.getRange(rowIndex, 1, 1, 15).setValues([updatedRow]);
      closedCount++;
    }
    if (closedCount > 0) logError("autoCloseExpiredShifts", "Closed " + closedCount + " shifts", "");
  } catch (e) {
    logError("autoCloseExpiredShifts", e.message);
  } finally {
    invalidateActiveShiftsCache_();
    lock.releaseLock();
  }
}

// [SHIFT] One-time setup: pasang trigger autoCloseExpiredShifts setiap hari 23:50
function setupShiftAutoCloseTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "autoCloseExpiredShifts") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("autoCloseExpiredShifts")
    .timeBased()
    .atHour(23)
    .nearMinute(50)
    .everyDays(1)
    .create();
  return "Trigger autoCloseExpiredShifts terpasang (jalan tiap hari ~23:50).";
}

// [PERF] Benchmark hot paths server. Admin-only.
// Pakai untuk diagnose lambatnya request (cold start, sheet I/O, dll).
// Hasil ditampilkan di console & dikembalikan sebagai object durasi.
function runPerfBenchmark(token) {
  validateAdminSession_(token);
  const results = {};
  const time = (name, fn) => {
    const t0 = Date.now();
    try {
      const r = fn();
      results[name] = { ms: Date.now() - t0, ok: true, size: r ? JSON.stringify(r).length : 0 };
    } catch (e) {
      results[name] = { ms: Date.now() - t0, ok: false, error: e.message };
    }
  };

  time("warmup_ping", () => CacheService.getScriptCache().get("warmup_ping"));
  time("getSS", () => getSS());
  time("getSettings", () => getSettings());
  time("getPackages", () => getPackages(token));
  time("getCustomers", () => getCustomers(token));
  time("getTransactions", () => getTransactions(token));
  time("getDashboardBundle", () => getDashboardBundle(token));
  time("getKasHarian_today", () => getKasHarian(token, new Date().toISOString()));
  // Sampling shift summary (skip jika tidak ada shifts)
  try {
    const shiftSheet = getSheet("shifts");
    const lr = shiftSheet.getLastRow();
    if (lr > 1) {
      const sample = shiftSheet.getRange(lr, 1, 1, 6).getValues()[0];
      time("computeShiftSummary_", () => computeShiftSummary_(sample[0], sample[5]));
    }
  } catch (e) { /* skip */ }

  // One-time setup helper untuk semua trigger (warmup + auto-close + backup)
  return { success: true, results };
}

// [PERF] Convenience: pasang semua trigger sekaligus.
// Cek + buat ulang warmup, autoCloseShift, dan backup harian.
function setupAllTriggers() {
  const out = [];
  out.push(setupWarmupTrigger());
  out.push(setupShiftAutoCloseTrigger());
  try { out.push(setupBackupTrigger()); } catch (e) { out.push("setupBackupTrigger: " + e.message); }
  return out.join("\n");
}

// ==========================================
// 10. OPTIMASI & SYSTEM UTILITIES
// ==========================================

// [OPT] Fungsi Warmup untuk mencegah Cold Start
// Dipanggil tiap 5 menit oleh trigger untuk menjaga V8 engine tetap panas
// dan menghangatkan koneksi spreadsheet (cache _cachedSS).
function warmup() {
  try {
    CacheService.getScriptCache().get("warmup_ping");
    // Sentuh spreadsheet ringan agar reference tetap dicache
    getSS();
  } catch (e) {
    // Silent — warmup tidak boleh mengganggu produksi
  }
}

// [OPT] Pasang trigger warmup setiap 5 menit
// Idempoten — hapus trigger lama lalu buat ulang.
function setupWarmupTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "warmup") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("warmup")
    .timeBased()
    .everyMinutes(5)
    .create();
  return "Trigger warmup terpasang (jalan tiap 5 menit). Cold start ~3-8s → ~500ms.";
}

// ==========================================
// 11. MANAJEMEN PENGGUNA (ADMIN ONLY)
// ==========================================

function getUsersList(token) {
  try {
    validateAdminSession_(token);
    const sheet = getSheet("users");
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };
    
    let users = [];
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() !== "") {
        users.push({
          username: String(data[i][0]),
          role: String(data[i][2]),
          nama: String(data[i][3])
        });
      }
    }
    return { success: true, data: users };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function saveUserAccount(token, isEdit, oldUsername, username, password, role, nama) {
  validateAdminSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    const sheet = getSheet("users");
    const data = sheet.getDataRange().getValues();
    const cleanUsername = String(username).trim().toLowerCase();
    
    if (!isEdit) {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim().toLowerCase() === cleanUsername) {
          return { success: false, message: "Username sudah terdaftar!" };
        }
      }
      const hashedPassword = hashPassword(password);
      sheet.appendRow([cleanUsername, hashedPassword, role, nama]);
      return { success: true, message: "Akun berhasil dibuat." };
    } else {
      const cleanOldUsername = String(oldUsername).trim().toLowerCase();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim().toLowerCase() === cleanOldUsername) {
          const row = i + 1;
          
          if (cleanUsername !== cleanOldUsername) {
             for (let j = 1; j < data.length; j++) {
               if (j !== i && String(data[j][0]).trim().toLowerCase() === cleanUsername) {
                 return { success: false, message: "Username baru sudah terdaftar!" };
               }
             }
          }

          // [OPT] Batch write: 4 setValue() → 1 setValues() — 4x lebih cepat
          const newPass = (password && password.trim() !== "") ? hashPassword(password) : data[i][1];
          sheet.getRange(row, 1, 1, 4).setValues([[cleanUsername, newPass, role, nama]]);
          
          return { success: true, message: "Akun berhasil diupdate." };
        }
      }
      return { success: false, message: "Akun tidak ditemukan!" };
    }
  } catch (e) {
    logError("saveUserAccount", e.message);
    return { success: false, message: "Gagal menyimpan akun: " + e.message };
  } finally {
    lock.releaseLock();
  }
}

function deleteUserAccount(token, username) {
  validateAdminSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    const sheet = getSheet("users");
    const data = sheet.getDataRange().getValues();
    const cleanUsername = String(username).trim().toLowerCase();
    
    if (cleanUsername === "admin") {
      return { success: false, message: "Akun utama admin tidak boleh dihapus!" };
    }
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === cleanUsername) {
        sheet.deleteRow(i + 1);
        return { success: true, message: "Akun berhasil dihapus." };
      }
    }
    return { success: false, message: "Akun tidak ditemukan." };
  } catch (e) {
    logError("deleteUserAccount", e.message);
    return { success: false, message: "Gagal menghapus akun: " + e.message };
  } finally {
    lock.releaseLock();
  }
}
