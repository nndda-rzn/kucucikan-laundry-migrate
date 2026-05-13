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
  const sheets = ["users", "packages", "transactions", "settings", "customers", "kas_awal", "pengeluaran"];
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
          "catatan",
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
    const rawData = sheet.getRange(startRow, 1, rowCount, 21).getValues();

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
    }));
  } catch (e) {
    logError("getTransactions", e.message);
    throw new Error("Gagal baca sheet Transaksi: " + e.message);
  }
}

function createTransaction(token, data) {
  validateSession_(token);
  if (!data || !data.customer || !data.items_json)
    return { success: false, message: "Data tidak lengkap." };
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheetTrx = getSheet("transactions");
    const sheetPkg = getSheet("packages");

    let items = [];
    try {
      items = JSON.parse(data.items_json);
    } catch (e) {}
    if (!items || items.length === 0)
      return { success: false, message: "Keranjang kosong." };

    const pkgData = sheetPkg.getDataRange().getValues();
    let subtotal = 0;
    let totalBerat = 0;

    for (let i = 0; i < items.length; i++) {
      let serverHarga = 0;
      for (let j = 1; j < pkgData.length; j++) {
        if (pkgData[j][0] === items[i].id) {
          serverHarga = parseInt(pkgData[j][2]);
          break;
        }
      }
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
  validateSession_(token);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    const sheet = getSheet("transactions");
    const lastRow = sheet.getLastRow();
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === id) {
        const row = i + 2;
        const total = parseInt(sheet.getRange(row, 6).getValue()) || 0;
        const rowData = sheet.getRange(row, 1, 1, 21).getValues()[0];

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

        if (currentDp === 0) {
          rowData[11] = metode; // Timpa metode_pembayaran utama hanya jika sebelumnya 0 DP
        }

        sheet.getRange(row, 1, 1, 21).setValues([rowData]);
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
  const sheet = getSheet("customers");
  const rawData = sheet.getDataRange().getValues();
  if (rawData.length <= 1) return [];
  return rawData
    .slice(1)
    .filter((r) => r.join("").trim() !== "")
    .map((r) => ({
      id: r[0],
      nama: String(r[1] || "Anonim"),
      whatsapp: String(r[2] || ""),
      terakhir_order: parseSafeDate(r[3]),
    }))
    .reverse();
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
  const sheet = getSheet("packages");
  const rawData = sheet.getDataRange().getValues();
  if (rawData.length <= 1) return [];
  return rawData
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
  validateSession_(token);
  try {
    // [OPT] Hapus setupKasSheet_() — sheet sudah dibuat saat setupDatabase(), tidak perlu cek ulang di setiap read
    const targetDate = tanggalStr ? new Date(tanggalStr) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    
    // 1. Ambil Uang Awal
    let uangAwal = 0;
    const sheetKas = getSheet("kas_awal");
    const dataKas = sheetKas.getDataRange().getValues();
    for (let i = 1; i < dataKas.length; i++) {
      const rowDate = new Date(dataKas[i][0]);
      rowDate.setHours(0, 0, 0, 0);
      if (rowDate.getTime() === targetDate.getTime()) {
        uangAwal += parseInt(dataKas[i][1]) || 0;
      }
    }
    
    // 2. Ambil Pengeluaran
    let pengeluaranList = [];
    let totalPengeluaran = 0;
    const sheetPengeluaran = getSheet("pengeluaran");
    const dataPengeluaran = sheetPengeluaran.getDataRange().getValues();
    for (let i = 1; i < dataPengeluaran.length; i++) {
      if(dataPengeluaran[i].join("").trim() === "") continue;
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
          kasir: dataPengeluaran[i][5]
        });
        totalPengeluaran += nominal;
      }
    }
    
    return { 
      success: true, 
      uang_awal: uangAwal, 
      pengeluaran: pengeluaranList, 
      total_pengeluaran: totalPengeluaran 
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
    const rawData = sheet.getRange(2, 1, lastRow - 1, 21).getValues();
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

// ==========================================
// 10. OPTIMASI & SYSTEM UTILITIES
// ==========================================

// [OPT] Fungsi Warmup untuk mencegah Cold Start
function warmup() {
  // Hanya melakukan operasi ringan untuk menjaga V8 engine tetap panas
  CacheService.getScriptCache().get("warmup_ping");
}

function setupWarmupTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "warmup") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
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
