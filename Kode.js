/**
 * SISTEM MANAJEMEN LAUNDRY - SERVER SIDE
 * Termasuk Modul Marketing & Promo Code terintegrasi penuh.
 */

const DB_ID = "1vB2S0g0UpXJEXA-TmKfuVjNL78NVQJeeCgBNdfXziA0";

function doGet() {
  const settings = getSettings();
  const appName = settings.app_name || settings.nota_title || "L-Premium";
  
  const template = HtmlService.createTemplateFromFile("index");
  template.appName = appName;
  template.appLogoUrl = settings.app_logo_url || "";

  const output = template.evaluate()
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
  if (!_cachedSS) _cachedSS = SpreadsheetApp.openById(DB_ID);
  return _cachedSS;
}

function getSheet(name) {
  const ss = getSS();
  if (!ss) throw new Error("Spreadsheet tidak ditemukan.");
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error("Sheet '" + name + "' tidak ditemukan.");
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
    const ss = SpreadsheetApp.openById(DB_ID);
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

function setupDatabase() {
  const ss = SpreadsheetApp.openById(DB_ID);
  const sheets = [
    "users",
    "packages",
    "transactions",
    "settings",
    "customers",
    "promos",
  ];
  sheets.forEach((name) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      if (name === "users") {
        sheet.appendRow(["username", "password", "role", "nama"]);
        sheet.appendRow([
          "admin",
          computeHash("admin123"),
          "admin",
          "Administrator",
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
          "kode_promo",
          "diskon",
          "catatan",
        ]);
      } else if (name === "settings") {
        sheet.appendRow(["key", "value"]);
        sheet.appendRow(["nota_title", "L-PREMIUM"]);
        sheet.appendRow(["nota_subtitle", "Laundry Bersih & Wangi"]);
        sheet.appendRow(["nota_footer", "Terima kasih!"]);
      } else if (name === "customers") {
        sheet.appendRow(["id", "nama", "whatsapp", "terakhir_order"]);
      } else if (name === "promos") {
        sheet.appendRow([
          "id",
          "kode_promo",
          "tipe_diskon",
          "nilai_diskon",
          "min_transaksi",
          "berlaku_hingga",
          "status",
        ]);
      }
    } else if (name === "packages") {
      // Migration: tambah kolom kategori & status jika belum ada
      const lastCol = sheet.getLastColumn();
      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      if (headers.indexOf("kategori") === -1) {
        sheet.getRange(1, 6).setValue("kategori");
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
    const inputHash = computeHash(password);
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === username) {
        const dbPassword = String(data[i][1]).trim();
        if (dbPassword === password) {
          sheet.getRange(i + 1, 2).setValue(inputHash);
        } else if (dbPassword !== inputHash) {
          cache.put(
            attemptKey,
            (attempts ? parseInt(attempts) + 1 : 1).toString(),
            900,
          );
          return { success: false, message: "Username atau password salah!" };
        }
        cache.remove(attemptKey);
        return { success: true, role: data[i][2], nama: data[i][3] };
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

function getTransactions() {
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
      kode_promo: String(r[13] || ""),
      diskon: parseInt(r[14]) || 0,
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
              subtotal: (parseInt(r[5]) || 0) + (parseInt(r[14]) || 0),
            },
          ],
      tanggal_pelunasan: (r[18] && String(r[18]).trim() !== "") ? parseSafeDate(r[18]) : "",
      nominal_dp: parseInt(r[19]) || (parseInt(r[16]) || 0),
      nominal_pelunasan: parseInt(r[20]) || 0,
    }));
  } catch (e) {
    logError("getTransactions", e.message);
    throw new Error("Gagal baca sheet Transaksi: " + e.message);
  }
}

function createTransaction(data) {
  if (!data || !data.customer || !data.items_json)
    return { success: false, message: "Data tidak lengkap." };
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheetTrx = getSheet("transactions");
    const sheetPkg = getSheet("packages");
    const sheetPromo = getSheet("promos");

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
        if (pkgData[j][1] === items[i].paket) {
          serverHarga = parseInt(pkgData[j][2]);
          break;
        }
      }
      if (serverHarga === 0)
        return {
          success: false,
          message: "Paket " + items[i].paket + " tidak valid.",
        };
      items[i].harga = serverHarga;
      items[i].subtotal = serverHarga * parseFloat(items[i].berat);
      subtotal += items[i].subtotal;
      totalBerat += parseFloat(items[i].berat);
    }

    data.items_json = JSON.stringify(items);

    let diskon = 0;
    let appliedPromo = "";

    // Validasi Promo di Server-Side
    if (data.kode_promo) {
      const promoData = sheetPromo.getDataRange().getValues();
      const today = new Date();
      for (let i = 1; i < promoData.length; i++) {
        if (
          String(promoData[i][1]).toUpperCase() ===
          String(data.kode_promo).toUpperCase()
        ) {
          let pType = promoData[i][2];
          let pVal = parseInt(promoData[i][3]) || 0;
          let pMin = parseInt(promoData[i][4]) || 0;
          let pDate = new Date(promoData[i][5]);
          pDate.setHours(23, 59, 59, 999); // Valid hingga akhir hari
          let pStatus = promoData[i][6];

          if (pStatus === "Aktif" && today <= pDate && subtotal >= pMin) {
            appliedPromo = String(data.kode_promo).toUpperCase();
            if (pType === "Persen") diskon = subtotal * (pVal / 100);
            else diskon = pVal;
            if (diskon > subtotal) diskon = subtotal; // Cegah minus
          }
          break;
        }
      }
    }

    let grandTotal = subtotal - diskon;

    // [P0] Gunakan UUID untuk ID — menghindari collision pada transaksi bersamaan
    const id = generateId("TRX");
    const date = new Date();
    const paketLabel =
      items.length === 1 ? items[0].paket : `Multi-Item (${items.length})`;

    // [P0] Server hitung status_pembayaran sendiri — JANGAN percaya input client
    const terbayar = parseInt(data.terbayar) || 0;
    let statusPay;
    if (terbayar >= grandTotal && terbayar > 0) statusPay = "Lunas";
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
      appliedPromo,
      diskon,
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
      diskon: diskon,
      appliedPromo: appliedPromo,
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

function updateTransactionStatus(id, newStatus) {
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

function lunasDanAmbil(id, metode) {
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
        rowData[11] = metode; // col L (metode_pembayaran)
        rowData[12] = "Lunas"; // col M (status_pembayaran)
        rowData[16] = total; // col Q (terbayar)
        
        rowData[18] = new Date().toISOString(); // tanggal_pelunasan
        rowData[20] = total - currentDp; // nominal_pelunasan

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

function deleteTransaction(id) {
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

function getCustomers() {
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

function addCustomerData(nama, wa) {
  getSheet("customers").appendRow([
    generateId("CUST"),
    nama,
    wa,
    new Date().toISOString(),
  ]);
  return { success: true };
}

function updateCustomerData(id, nama, wa) {
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
}

function deleteCustomerData(id) {
  const sheet = getSheet("customers");
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) {
      sheet.deleteRow(i + 2);
      return { success: true };
    }
  }
  return { success: false };
}

function getPackages() {
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

function addPackage(nama, harga, durasi, satuan, kategori, status) {
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
}

function updatePackage(
  id,
  newNama,
  newHarga,
  newDurasi,
  newSatuan,
  newKategori,
  newStatus,
) {
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
}

function updatePackageStatus(id, newStatus) {
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

function deletePackage(id) {
  const sheet = getSheet("packages");
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) {
      sheet.deleteRow(i + 2);
      return { success: true };
    }
  }
  return { success: false };
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

function saveSettingsConfig(dataObj) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
    const sheet = getSheet("settings");
    const data = sheet.getDataRange().getValues();
    for (let key in dataObj) {
      let found = false;
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === key) {
          sheet.getRange(i + 1, 2).setValue(dataObj[key]);
          found = true;
          break;
        }
      }
      if (!found) sheet.appendRow([key, dataObj[key]]);
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

// FUNGSI PROMO
function getPromos() {
  const sheet = getSheet("promos");
  const rawData = sheet.getDataRange().getValues();
  if (rawData.length <= 1) return [];
  return rawData
    .slice(1)
    .filter((r) => r.join("").trim() !== "")
    .map((r) => ({
      id: r[0],
      kode_promo: String(r[1]).toUpperCase(),
      tipe_diskon: String(r[2]),
      nilai_diskon: parseInt(r[3]) || 0,
      min_transaksi: parseInt(r[4]) || 0,
      berlaku_hingga: parseSafeDate(r[5]),
      status: String(r[6]),
    }));
}

function addPromo(kode, tipe, nilai, min, tanggal, status) {
  getSheet("promos").appendRow([
    generateId("PRM"),
    kode.toUpperCase(),
    tipe,
    nilai,
    min,
    tanggal,
    status,
  ]);
  return { success: true };
}

function updatePromo(id, kode, tipe, nilai, min, tanggal, status) {
  const sheet = getSheet("promos");
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) {
      sheet
        .getRange(i + 2, 2, 1, 6)
        .setValues([[kode.toUpperCase(), tipe, nilai, min, tanggal, status]]);
      return { success: true };
    }
  }
  return { success: false };
}

function deletePromo(id) {
  const sheet = getSheet("promos");
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) {
      sheet.deleteRow(i + 2);
      return { success: true };
    }
  }
  return { success: false };
}

// FUNGSI KHUSUS LAPORAN
function getReportData(startDateStr, endDateStr) {
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
      
      let trDate = new Date(r[1]);
      let trPelunasanDate = r[18] && String(r[18]).trim() !== "" ? new Date(r[18]) : null;
      
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
        tanggal: !isNaN(trDate) ? trDate.toISOString() : new Date().toISOString(),
        customer: String(r[2] || "Pelanggan"),
        paket: String(r[3] || "Layanan"),
        berat: parseFloat(r[4]) || 0,
        total: parseInt(r[5]) || 0,
        status: String(r[6] || "Proses"),
        kasir: String(r[7] || "-"),
        metode_pembayaran: String(r[11] || "Tunai"),
        status_pembayaran: String(r[12] || "Belum Lunas"),
        diskon: parseInt(r[14]) || 0,
        terbayar: parseInt(r[16]) || (String(r[12] || "Belum Lunas") === "Lunas" ? parseInt(r[5]) || 0 : 0),
        items: r[17] || "[]",
        tanggal_pelunasan: trPelunasanDate && !isNaN(trPelunasanDate) ? trPelunasanDate.toISOString() : "",
        nominal_dp: parseInt(r[19]) || (parseInt(r[16]) || 0),
        nominal_pelunasan: parseInt(r[20]) || 0
      });
    }
    return validData;
  } catch (e) {
    logError("getReportData", e.message);
    throw new Error("Gagal ambil data laporan: " + e.message);
  }
}
