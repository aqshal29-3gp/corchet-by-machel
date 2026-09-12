/**
 * CROCHET BY MACHEL — Konektor Google Sheets
 * ------------------------------------------
 * Fungsi:
 *  1. Menerima pesanan dari website  -> dicatat di tab "Pesanan"
 *  2. Menerima notifikasi pembayaran (webhook Mayar/Tripay) -> status jadi LUNAS,
 *     stok di tab "Produk" otomatis berkurang, dicatat di tab "LogStok"
 *  3. Mengirim email notifikasi ke owner setiap pesanan baru & pembayaran masuk
 *  4. Menu "Crochet by Machel" di spreadsheet: setup tab, dropdown, tambah/isi stok
 *
 * CARA PASANG: lihat PANDUAN-PUBLISH.md bagian 8.
 */

// ====== PENGATURAN ======
/* =======================================================================
   TIDAK ADA YANG PERLU DIISI DI FILE INI.
   Semua pengaturan (API key, email, alamat web, ongkir, dll) ada di
   tab "Pengaturan" pada spreadsheet.

   Belum punya tabnya? Menu: Crochet by Machel -> Setup / rapikan semua tab
   ======================================================================= */

// HANYA diisi kalau project Apps Script ini dibuat TERPISAH dari spreadsheet
// (bukan lewat Extensions -> Apps Script). Ambil dari URL sheet, antara /d/ dan /edit.
const SPREADSHEET_ID = '';

/* ---------- lapisan cache & penanda versi ---------- */

/**
 * Membaca objek dari CacheService. Nilai besar dipecah karena satu kunci cache
 * dibatasi 100 KB — tab Pesanan dengan ratusan baris melewati batas itu.
 * Kalau ada satu potongan yang hilang (kadaluwarsa sebagian), seluruh entri
 * dianggap batal supaya tidak pernah menyajikan data separuh.
 */
function cacheAmbil(kunci) {
  try {
    const c = CacheService.getScriptCache();
    const n = parseInt(c.get(kunci + '_n'), 10) || 0;
    if (!n) return null;
    const kunciPotong = [];
    for (let i = 0; i < n; i++) kunciPotong.push(kunci + '_' + i);
    const ada = c.getAll(kunciPotong);
    let teks = '';
    for (let i = 0; i < n; i++) {
      const potong = ada[kunci + '_' + i];
      if (potong == null) return null;
      teks += potong;
    }
    return JSON.parse(teks);
  } catch (err) { return null; }
}

/** Menyimpan objek ke cache. Gagal menyimpan tidak boleh menggagalkan permintaan. */
function cacheSimpan(kunci, obj, detik) {
  try {
    const teks = JSON.stringify(obj);
    const POT = 90000;
    if (teks.length > POT * 10) return;
    const isi = {};
    let n = 0;
    for (let i = 0; i < teks.length; i += POT) { isi[kunci + '_' + n] = teks.substr(i, POT); n++; }
    isi[kunci + '_n'] = String(n);
    CacheService.getScriptCache().putAll(isi, Math.max(20, detik || 120));
  } catch (err) {}
}

/**
 * Penanda versi per tab, disimpan di ScriptProperties (bukan cache) supaya
 * TIDAK bisa hilang duluan dari data yang di-cache — kalau penandanya hilang
 * sementara datanya masih ada, panel akan menyajikan data usang.
 */
function versiTab(nama) {
  try { return PropertiesService.getScriptProperties().getProperty('v_' + nama) || '0'; }
  catch (err) { return String(Date.now()); }
}

/** Dipanggil setiap kali isi satu tab berubah, agar cache-nya ditinggalkan. */
function naikkanVersiTab(nama) {
  try { PropertiesService.getScriptProperties().setProperty('v_' + nama, String(Date.now())); }
  catch (err) {}
}

/* ---------- pembaca tab Pengaturan ---------- */

var _cfg = null;
function CFG() {
  if (_cfg) return _cfg;
  const map = {};
  try {
    const ss = SPREADSHEET_ID
      ? SpreadsheetApp.openById(SPREADSHEET_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName('Pengaturan');
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
        if (String(r[0] || '').trim()) map[String(r[0]).trim()] = r[1];
      });
    }
  } catch (err) {}
  _cfg = map;
  return map;
}
function P(k, bawaan) {
  const v = CFG()[k];
  return (v === undefined || v === null || String(v).trim() === '') ? bawaan : String(v).trim();
}
function PN(k, bawaan) {
  const v = parseInt(String(P(k, bawaan)).replace(/[^0-9-]/g, ''), 10);
  return isNaN(v) ? bawaan : v;
}
function PB(k, bawaan) {
  const v = String(P(k, bawaan)).toLowerCase();
  return v === 'ya' || v === 'true' || v === 'aktif' || v === '1';
}

/* ---------- nilai yang dipakai seluruh script ---------- */

// Bisa lebih dari satu, pisahkan dengan koma. Semuanya menerima notifikasi pesanan.
const EMAIL_OWNER = P('EMAIL_OWNER', '');
// Alamat yang dilihat pembeli saat membalas email dari toko.
// Dikosongkan = memakai EMAIL_OWNER yang pertama.
const EMAIL_BALASAN = P('EMAIL_BALASAN', '');
const NAMA_TOKO   = P('NAMA_TOKO', 'Crochet by Machel');
const NOMOR_WA    = P('NOMOR_WA', '6281285006165');
const INSTAGRAM   = P('INSTAGRAM', 'machel.crochet');
const MERCHANT_SHEET_ID = P('MERCHANT_SHEET_ID', '');
const MERCHANT_BRAND    = P('MERCHANT_BRAND', '');
// Kategori produk Google WAJIB salah satu nilai dari taksonomi resmi. Angka ID
// lebih aman daripada teks jalur: tidak bisa salah tanda baca atau ejaan.
// 1259 = Toys & Games > Toys > Dolls, Playsets & Toy Figures > Stuffed Animals.
const MERCHANT_KATEGORI = P('MERCHANT_KATEGORI', '1259');
const MERCHANT_PO       = PB('MERCHANT_IKUT_PREORDER', 'tidak');
// 'ya'    = sistem yang mengurangi & mengembalikan angka stok di tab Produk.
// 'tidak' = angka stok sepenuhnya milik pemilik toko. Pesanan tetap tercatat di
//           LogStok, tapi sel di tab Produk tidak pernah ditulis sistem, jadi
//           kamu bisa menyunting stok kapan saja tanpa ditimpa.
const STOK_OTOMATIS = PB('STOK_OTOMATIS', 'tidak');
// 'ya' = kolom availability yang kamu sunting sendiri di sheet feed Google
// dipertahankan saat feed ditulis ulang. Produk baru tetap diisi otomatis.
const FEED_STOK_MANUAL = PB('FEED_STOK_MANUAL', 'ya');
const URL_WEBSITE = P('URL_WEBSITE', '');

const MAYAR_API_KEY = P('MAYAR_API_KEY', '');
const MAYAR_API_URL = 'https://api.mayar.id/hl/v1/invoice/create';

const AI_AKTIF        = PB('AI_GAMBAR_AKTIF', 'tidak');
const GEMINI_API_KEY  = P('GEMINI_API_KEY', '');
const GEMINI_MODEL    = P('GEMINI_MODEL', 'gemini-3.1-flash-image-preview');
const AI_MAX_PER_HARI = PN('AI_MAX_PER_HARI', 25);
const AI_MAX_PER_IP   = PN('AI_MAX_PER_TAMU', 3);

const AI_TEKS_AKTIF     = PB('AI_TEKS_AKTIF', 'ya');
const GEMINI_TEXT_MODEL = P('GEMINI_TEXT_MODEL', 'gemini-3.1-flash-lite');
const CHAT_MAX_PER_HARI = PN('CHAT_MAX_PER_HARI', 300);
const CHAT_MAX_PER_TAMU = PN('CHAT_MAX_PER_TAMU', 25);

const RAJAONGKIR_API_KEY = P('RAJAONGKIR_API_KEY', '');
const ONGKIR_ASAL_ID     = P('ONGKIR_ASAL_ID', '');
const ONGKIR_KURIR       = P('ONGKIR_KURIR', 'jne:sicepat:jnt:anteraja:pos');
const BERAT_PER_ITEM     = PN('BERAT_PER_ITEM', 250);
const ONGKIR_FLAT        = PN('ONGKIR_FLAT', 25000);
const ONGKIR_GRATIS_MIN  = PN('ONGKIR_GRATIS_MIN', 0);

const BINDERBYTE_API_KEY = P('BINDERBYTE_API_KEY', '');
const WEBHOOK_TOKEN      = P('WEBHOOK_TOKEN', '');
// 'toko'   = alamat toko yang dikirim ke Mayar, jadi email tagihan Mayar
//            masuk ke kamu, bukan ke pembeli (pembeli hanya menerima email toko).
// 'pembeli'= alamat pembeli dikirim ke Mayar (pembeli menerima dua email).
const EMAIL_KE_MAYAR     = P('EMAIL_KE_MAYAR', 'toko');
// Alamat PENGIRIM email. Hanya bisa dipakai kalau alamat ini sudah didaftarkan
// sebagai "Send mail as" di Gmail akun pemilik script (lihat Bagian 17.2c).
const EMAIL_PENGIRIM     = P('EMAIL_PENGIRIM', '');
const MAKS_PESANAN_HARI  = PN('MAKS_PESANAN_PER_TAMU', 12);
const HARI_TIDUR         = PN('HARI_TIDUR', 90);
// Batas waktu pembayaran. Dikirim ke Mayar sebagai expiredAt DAN disimpan di
// kolom batas_bayar, supaya link tagihan dan status di sini mati bersamaan.
const JAM_BATAS_BAYAR    = PN('JAM_BATAS_BAYAR', 24);
const JAM_TAHAN_STOK     = PN('JAM_TAHAN_STOK', 24);
const JAM_PENGINGAT_BAYAR = PN('JAM_PENGINGAT_BAYAR', 6);
const STAT_AKTIF         = PB('STATISTIK_AKTIF', 'ya');
const HARI_MINTA_REVIEW  = PN('HARI_MINTA_REVIEW', 7);

const ZONA = 'Asia/Jakarta';
const T_PRODUK  = 'Produk';
const T_PESANAN = 'Pesanan';
const T_LOG     = 'LogStok';
const T_REVIEW  = 'Review';
const T_PELANGGAN = 'Pelanggan';
const T_STAT    = 'Statistik';
const T_SETTING = 'Pengaturan';
const T_SOSMED  = 'Sosmed';
const T_GALERI  = 'Galeri';
const T_GALERI_CUSTOM = 'GaleriCustom';
const T_REVIEW_CHAT = 'ReviewChat';

// Tab yang boleh disunting lewat panel admin.
const TAB_ADMIN = [T_PRODUK, T_GALERI, T_GALERI_CUSTOM, T_REVIEW_CHAT, T_SOSMED, T_PESANAN, T_REVIEW, T_SETTING, T_PELANGGAN];

// Urutan tahap pesanan yang dipakai halaman "Lacak Pesanan".
const TAHAP = ['MENUNGGU BAYAR', 'LUNAS', 'DIRAJUT', 'SIAP KIRIM', 'DIKIRIM', 'SELESAI'];


/* ---------- ENDPOINT WEBSITE & WEBHOOK ---------- */

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const token = (e && e.parameter && e.parameter.token) || '';

    // Notifikasi pembayaran dari Mayar / Tripay / Midtrans
    if (isBatalPayload(data) || isPaymentPayload(data) || isWebhookPembayaran(data)) {
      // Pengaman: webhook wajib membawa token rahasia kalau sudah diatur.
      if (WEBHOOK_TOKEN && token !== WEBHOOK_TOKEN) {
        catatWebhookMeragukan(data, '', 'Token webhook salah/tidak ada — ditolak');
        return json({ ok: false, message: 'Token tidak sah' });
      }
      if (isBatalPayload(data)) return handleBatal(data);
      if (isPaymentPayload(data)) return handlePayment(data);
      return json({ ok: true, message: 'Event diabaikan (belum lunas): ' + labelEvent(data) });
    }

    // Panel admin
    if (String(data.type || '').indexOf('admin') === 0) return routeAdmin(data);

    // Pesanan baru dari website
    if (data.type === 'order') {
      const tolak = batasiPesanan(data);
      if (tolak) return tolak;
      return handleOrder(validasiHarga(data));
    }

    // Minta satu tagihan gabungan (beberapa produk dalam satu keranjang)
    if (data.type === 'invoice') {
      const tolak = batasiPesanan(data);
      if (tolak) return tolak;
      return handleInvoice(validasiHarga(data));
    }

    // Ulasan pelanggan dari website
    if (data.type === 'review') return handleReview(data);
    if (data.type === 'stat') { periksaSambilJalan(); return handleStat(data); }

    // Pratinjau AI: foto -> boneka rajut
    if (data.type === 'ai-crochet') return handleAiCrochet(data);

    // Asisten chat di website
    if (data.type === 'chat') return handleChat(data);

    return json({ ok: false, message: 'Tipe payload tidak dikenali' });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};

  // dipakai halaman ulasan: ambil nama & produk dari no. pesanan
  if (p.action === 'order' && p.id) {
    const sh = sheet(T_PESANAN);
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1]).trim().toUpperCase() === String(p.id).trim().toUpperCase()) {
        return json({ ok: true, orderId: rows[i][1], nama: rows[i][2], produk: rows[i][5], status: rows[i][8] });
      }
    }
    return json({ ok: false, message: 'Pesanan tidak ditemukan' });
  }

  // halaman "Lacak Pesanan" di website
  // Sengaja TIDAK memanggil periksaSambilJalan(): pembeli menunggu balasan ini,
  // dan penyisiran stok bisa memakan beberapa detik. Penyisiran dititipkan pada
  // ping statistik (yang tidak ditunggu siapa pun) dan pemicu per jam.
  if (p.action === 'track' && p.id) return handleTrack(p);

  // pengecekan ongkos kirim di keranjang
  // galeri untuk website (tanpa perlu publish CSV)
  if (p.action === 'galeri') {
    const rows = sheet(T_GALERI).getDataRange().getValues();
    if (rows.length < 2) return json({ ok: true, items: [] });
    const head = rows[0].map(function (h) { return String(h).toLowerCase().trim(); });
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const o = {};
      head.forEach(function (h, k) { if (h) o[h] = rows[i][k]; });
      if (String(o.gambar || '').trim() && !/^(tidak|no|false|0)$/i.test(String(o.tampil || 'ya').trim())) out.push(o);
    }
    return json({ ok: true, items: out });
  }

  // galeri custom (foto request pelanggan vs foto boneka jadi) untuk website
  if (p.action === 'galeriCustom') {
    const rows = sheet(T_GALERI_CUSTOM).getDataRange().getValues();
    if (rows.length < 2) return json({ ok: true, items: [] });
    const head = rows[0].map(function (h) { return String(h).toLowerCase().trim(); });
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const o = {};
      head.forEach(function (h, k) { if (h) o[h] = rows[i][k]; });
      // wajib punya kedua foto; hormati kolom tampil (default ya)
      if (String(o.fotorequest || '').trim() && String(o.fotojadi || '').trim()
          && !/^(tidak|no|false|0)$/i.test(String(o.tampil || 'ya').trim())) out.push(o);
    }
    return json({ ok: true, items: out });
  }
  if (p.action === 'reviewChat') {
    const rows = sheet(T_REVIEW_CHAT).getDataRange().getValues();
    if (rows.length < 2) return json({ ok: true, items: [] });
    const headers = rows.shift().map(h => String(h).trim().toLowerCase());
    const out = rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])))
      .filter(x => String(x.gambar || '').trim() && /^(ya|yes|true|1)$/i.test(String(x.tampil || '')))
      .sort((a, b) => (Number(a.urutan) || 99) - (Number(b.urutan) || 99));
    return json({ ok: true, items: out });
  }
  if (p.action === 'kota') return cariTujuan(p.q);
  if (p.action === 'ongkir') return hitungOngkir(p);

  // Feed produk untuk Google Merchant Center (ditarik terjadwal oleh Google)
  if (p.action === 'feed' || p.feed) return feedMerchant();

  return json({ ok: true, service: NAMA_TOKO + ' order connector' });
}

/* ---------- 0b. PANEL ADMIN ---------- */

function adminPin() { return String(P('ADMIN_PIN', '')).trim(); }

/**
 * Perbandingan yang waktunya tidak bergantung pada isi — supaya lama balasan
 * tidak membocorkan berapa karakter PIN yang sudah benar.
 */
function samaAman(a, b) {
  const x = String(a), y = String(b);
  if (x.length !== y.length) return false;
  let beda = 0;
  for (let i = 0; i < x.length; i++) beda |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return beda === 0;
}

const SESI_DETIK = 21600; // 6 jam, batas maksimum CacheService

/** Menerbitkan token sesi setelah PIN terbukti benar. */
function sesiBaru() {
  const t = Utilities.getUuid().replace(/-/g, '');
  try { CacheService.getScriptCache().put('sesi_' + t, '1', SESI_DETIK); } catch (err) {}
  return t;
}

/** Memeriksa token sesi. Jauh lebih murah daripada membaca ulang tab Pengaturan. */
function sesiSah(t) {
  const s = String(t || '').trim();
  if (s.length < 24) return false;
  try { return CacheService.getScriptCache().get('sesi_' + s) === '1'; }
  catch (err) { return false; }
}

/** Mayar menolak nomor 08xx — harus +62. */
function hpMayar(v) {
  let s = String(v || '').replace(/[^0-9+]/g, '');
  if (!s) return '';
  if (s.indexOf('+') === 0) return s;
  s = s.replace(/\D/g, '');
  if (s.indexOf('62') === 0) return '+' + s;
  if (s.indexOf('0') === 0) return '+62' + s.slice(1);
  return '+62' + s;
}

function routeAdmin(d) {
  const pin = adminPin();
  if (!pin) return json({ ok: false, message: 'ADMIN_PIN belum diisi di tab Pengaturan.' });

  // Login: satu-satunya jalan yang memeriksa PIN. Berhasil = terbitkan token,
  // dan kirimkan sekalian ringkasan dasbor supaya panel tidak perlu
  // perjalanan kedua sebelum bisa menampilkan apa pun.
  if (d.type === 'adminLogin') {
    if (!samaAman(String(d.pin || '').trim(), pin)) {
      Utilities.sleep(700); // perlambat percobaan tebak
      return json({ ok: false, message: 'PIN salah.' });
    }
    let stat = null;
    try { stat = statObjek(parseInt(d.hari, 10) || 30); } catch (err) {}
    return json({ ok: true, toko: NAMA_TOKO, tabs: TAB_ADMIN, token: sesiBaru(), stat: stat });
  }

  // Permintaan lain: token dulu (murah), PIN sebagai jalan mundur untuk panel
  // versi lama yang belum mengenal token.
  if (!sesiSah(d.token) && !samaAman(String(d.pin || '').trim(), pin)) {
    Utilities.sleep(400);
    return json({ ok: false, sesiHabis: true, message: 'Sesi berakhir. Masukkan PIN lagi.' });
  }

  if (d.type === 'adminRead')    return adminRead(d);
  if (d.type === 'adminStat')    return json(statObjek(parseInt(d.hari, 10) || 30));

  // Aksi yang mengubah data dijaga kunci sekali-pakai: percobaan kedua dengan
  // kunci yang sama mengembalikan hasil yang tersimpan, tanpa menulis ulang.
  return sekaliJalan(d, function () {
    if (d.type === 'adminSave')    return adminSave(d);
    if (d.type === 'adminDelete')  return adminDelete(d);
    if (d.type === 'adminReorder') return adminReorder(d);
    if (d.type === 'adminInvoice') return adminInvoice(d);
    if (d.type === 'adminInvoiceManual') return adminInvoiceManual(d);
    return json({ ok: false, message: 'Aksi admin tidak dikenal: ' + d.type });
  });
}

/**
 * Menjalankan satu aksi paling banyak satu kali untuk setiap d.aksiId.
 *
 * Diperlukan karena permintaan bisa berhasil di sisi server sementara
 * balasannya hilang di jaringan. Tanpa penjaga ini, percobaan berikutnya
 * menambah baris kedua, menghapus baris yang salah, atau membuat pesanan
 * ganda beserta email dan penahanan stoknya.
 */
function sekaliJalan(d, kerja) {
  const id = String(d.aksiId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  if (!id) return kerja();

  const cache = CacheService.getScriptCache();
  const kunci = 'idem_' + id;

  const sudah = cache.get(kunci);
  if (sudah) {
    return ContentService.createTextOutput(sudah).setMimeType(ContentService.MimeType.JSON);
  }

  // TIDAK memakai LockService di sini. adminReorder mengambil script lock-nya
  // sendiri, dan script lock Apps Script tidak reentrant — lock di luar akan
  // membuat lock di dalam selalu gagal. Setiap handler sudah mengunci sendiri
  // bagian yang memang perlu diserialkan.
  const keluar = kerja();
  try { cache.put(kunci, keluar.getContent(), 900); } catch (err) {}
  return keluar;
}

function tabSah(nama) {
  const n = String(nama || '').trim();
  for (let i = 0; i < TAB_ADMIN.length; i++) if (TAB_ADMIN[i].toLowerCase() === n.toLowerCase()) return TAB_ADMIN[i];
  return '';
}

/** Format tanggal ringkas tanpa memanggil Utilities — dipakai per sel, jadi
 *  biaya per panggilan penting. */
function tglSel(v) {
  const p = function (n) { return (n < 10 ? '0' : '') + n; };
  return p(v.getDate()) + '/' + p(v.getMonth() + 1) + '/' + v.getFullYear() +
    ' ' + p(v.getHours()) + ':' + p(v.getMinutes());
}

/**
 * Membaca seluruh satu tab, sudah diurutkan, dalam bentuk siap kirim.
 * Hasilnya di-cache 90 detik dan ditandai versi tab, jadi membuka-tutup tab
 * atau berpindah halaman TIDAK memanggil Spreadsheet lagi.
 */
function adminBaris(nama) {
  const kunci = 'rd_' + nama + '_' + versiTab(nama);
  const dari = cacheAmbil(kunci);
  if (dari) return dari;

  const sh = sheet(nama);
  const akhirBaris = sh.getLastRow();
  const akhirKolom = sh.getLastColumn();
  if (akhirBaris < 1 || akhirKolom < 1) return { head: [], rows: [], kolomUrutan: -1 };

  // Rentang eksplisit, bukan getDataRange(): tidak menarik kolom kosong di
  // kanan yang kadang ikut terbawa karena format sel.
  const rows = sh.getRange(1, 1, akhirBaris, akhirKolom).getValues();
  const head = rows[0].map(function (h) { return String(h).trim(); });

  const isi = [];
  for (let i = 1; i < rows.length; i++) {
    const baris = rows[i];
    let kosong = true;
    for (let k = 0; k < baris.length; k++) {
      if (String(baris[k]).trim() !== '') { kosong = false; break; }
    }
    if (kosong) continue;
    const sel = new Array(baris.length);
    for (let k = 0; k < baris.length; k++) {
      const v = baris[k];
      sel[k] = v instanceof Date ? tglSel(v) : String(v);
    }
    isi.push({ baris: i + 1, urut: baris[0], sel: sel });
  }

  if (nama === T_PESANAN || nama === T_REVIEW) {
    isi.sort(function (a, b) {
      const ta = waktuKe(a.urut), tb = waktuKe(b.urut);
      return ta !== tb ? tb - ta : b.baris - a.baris;
    });
  }

  const iUrut = head.map(function (h) { return h.toLowerCase(); }).indexOf('urutan');
  if (iUrut > -1) {
    isi.sort(function (a, b) {
      const na = parseInt(a.sel[iUrut], 10), nb = parseInt(b.sel[iUrut], 10);
      const va = isNaN(na) ? 9999 : na, vb = isNaN(nb) ? 9999 : nb;
      return va !== vb ? va - vb : a.baris - b.baris;
    });
  }

  isi.forEach(function (r) { delete r.urut; });

  const hasil = { head: head, rows: isi, kolomUrutan: iUrut };
  cacheSimpan(kunci, hasil, 90);
  return hasil;
}

function adminRead(d) {
  const nama = tabSah(d.tab);
  if (!nama) return json({ ok: false, message: 'Tab tidak diizinkan.' });

  const sh = sheet(nama);
  if (nama === T_GALERI && sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 4).setValues([['judul', 'gambar', 'urutan', 'tampil']])
      .setFontWeight('bold').setBackground('#EDE6F2');
    sh.setFrozenRows(1);
    naikkanVersiTab(nama);
  }
  if (nama === T_GALERI_CUSTOM && sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 5).setValues([['judul', 'fotoRequest', 'fotoJadi', 'urutan', 'tampil']])
      .setFontWeight('bold').setBackground('#EDE6F2');
    sh.setFrozenRows(1);
    naikkanVersiTab(nama);
  }
  if (nama === T_REVIEW_CHAT && sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 5).setValues([['gambar', 'platform', 'alt', 'urutan', 'tampil']])
      .setFontWeight('bold').setBackground('#EDE6F2');
    sh.setFrozenRows(1);
  }
  if (nama === T_SOSMED && sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 7).setValues([['platform', 'tipe', 'judul', 'link', 'gambar', 'video', 'tampil']])
      .setFontWeight('bold').setBackground('#EDE6F2');
    sh.setFrozenRows(1);
    naikkanVersiTab(nama);
  }

  const semua = adminBaris(nama);

  // Pencarian dikerjakan di sini, bukan di browser: yang dikirim hanya baris
  // yang benar-benar cocok, bukan seluruh tab.
  const cari = String(d.cari || '').trim().toLowerCase().slice(0, 80);
  let daftar = semua.rows;
  if (cari) {
    daftar = daftar.filter(function (r) {
      return r.sel.join(' ').toLowerCase().indexOf(cari) > -1;
    });
  }

  // Halaman: mengirim ratusan baris sekaligus itu yang membuat panel terasa
  // berat di ponsel, bukan pembacaan sheet-nya.
  const batas = Math.min(300, Math.max(20, parseInt(d.limit, 10) || 150));
  const mulai = Math.max(0, parseInt(d.offset, 10) || 0);
  const potong = daftar.slice(mulai, mulai + batas);

  return json({
    ok: true, tab: nama, head: semua.head, rows: potong,
    kolomUrutan: semua.kolomUrutan,
    total: daftar.length, offset: mulai, limit: batas,
    adaLagi: mulai + potong.length < daftar.length
  });
}

/** Tanggal (teks atau Date) menjadi angka untuk diurutkan. */
function waktuKe(v) {
  if (v instanceof Date) return v.getTime();
  const s = String(v || '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime();
  const t = Date.parse(s);
  return isNaN(t) ? 0 : t;
}

/**
 * Simpan urutan hasil geser di panel admin.
 * Hanya kolom "urutan" yang ditulis — BARIS TIDAK DIPINDAH, jadi acuan
 * baris, rumus, dan nomor pesanan tetap aman.
 * d.urutan = [{baris, urutan}, ...]
 */
function adminReorder(d) {
  const nama = tabSah(d.tab);
  if (!nama) return json({ ok: false, message: 'Tab tidak diizinkan.' });

  const sh = sheet(nama);
  const head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]
    .map(function (h) { return String(h).toLowerCase().trim(); });

  let kol = head.indexOf('urutan') + 1;
  // Tab Produk belum punya kolom urutan — dibuatkan sekali di kolom paling kanan.
  if (!kol) {
    kol = Math.max(1, sh.getLastColumn()) + 1;
    sh.getRange(1, kol).setValue('urutan').setFontWeight('bold');
  }

  const daftar = (d.urutan || []).filter(function (x) { return parseInt(x.baris, 10) > 1; });
  if (!daftar.length) return json({ ok: false, message: 'Tidak ada baris untuk diurutkan.' });

  const lock = LockService.getScriptLock();
  try { lock.waitLock(8000); } catch (err) {
    return json({ ok: false, message: 'Spreadsheet sedang dipakai proses lain. Coba lagi sebentar.' });
  }
  try {
    const akhir = sh.getLastRow();
    daftar.forEach(function (x) {
      const b = parseInt(x.baris, 10);
      if (b > 1 && b <= akhir) sh.getRange(b, kol).setValue(parseInt(x.urutan, 10) || 1);
    });
    SpreadsheetApp.flush();
  } finally { try { lock.releaseLock(); } catch (e) {} }

  naikkanVersiTab(nama);
  return json({ ok: true, pesan: 'Urutan disimpan (' + daftar.length + ' baris).', kolom: kol });
}

function adminSave(d) {
  const nama = tabSah(d.tab);
  if (!nama) return json({ ok: false, message: 'Tab tidak diizinkan.' });

  const sh = sheet(nama);
  const lebar = Math.max(1, sh.getLastColumn());

  // Sanitasi: buang karakter kendali, batasi panjang per sel, dan tolak sel
  // yang diawali tanda sama dengan supaya tidak menjadi rumus di spreadsheet.
  const nilai = (d.sel || []).slice(0, lebar).map(function (v) {
    let s = String(v == null ? '' : v).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').slice(0, 2000);
    if (/^[=+@]/.test(s) || (s.charAt(0) === '-' && !/^-?\d/.test(s))) s = "'" + s;
    return s;
  });
  while (nilai.length < lebar) nilai.push('');

  const baris = parseInt(d.baris, 10) || 0;
  if (baris > 1) {
    if (baris > sh.getLastRow()) return json({ ok: false, message: 'Baris sudah tidak ada. Muat ulang dulu.' });
    sh.getRange(baris, 1, 1, lebar).setValues([nilai]);
    naikkanVersiTab(nama);
    return json({ ok: true, baris: baris, pesan: 'Perubahan tersimpan.' });
  }
  sh.appendRow(nilai);
  naikkanVersiTab(nama);
  return json({ ok: true, baris: sh.getLastRow(), pesan: 'Baris baru ditambahkan.' });
}

function adminDelete(d) {
  const nama = tabSah(d.tab);
  if (!nama) return json({ ok: false, message: 'Tab tidak diizinkan.' });
  const baris = parseInt(d.baris, 10) || 0;
  if (baris < 2) return json({ ok: false, message: 'Baris tidak sah.' });
  const sh = sheet(nama);
  if (baris > sh.getLastRow()) return json({ ok: false, message: 'Baris sudah tidak ada. Muat ulang dulu.' });
  sh.deleteRow(baris);
  naikkanVersiTab(nama);
  return json({ ok: true, pesan: 'Baris dihapus.' });
}

/**
 * Tagihan khusus yang dibuat admin (harga teman/keluarga, jasa tambahan, dll).
 * Harga TIDAK divalidasi ke tab Produk — memang disengaja bebas.
 */
/**
 * Invoice MANUAL: tercatat penuh di tab Pesanan tapi TANPA pembayaran online.
 * Untuk pelanggan yang membayar transfer/tunai/COD — teman, keluarga, atau
 * pesanan yang harganya sudah disepakati lewat chat.
 * Mengembalikan TEKS invoice siap kirim, bukan link bayar.
 */
function adminInvoiceManual(d) {
  const items = (d.items || []).filter(function (i) { return String(i.name || '').trim(); });
  if (!items.length) return json({ ok: false, message: 'Belum ada item.' });

  const b = d.buyer || {};
  if (!String(b.name || '').trim()) return json({ ok: false, message: 'Nama pelanggan belum diisi.' });

  const orderId = 'MCH-' + Utilities.formatDate(new Date(), ZONA, 'yyMMdd') + '-' +
    Math.random().toString(36).slice(2, 6).toUpperCase();

  const ongkir = parseInt(String(d.ongkir).replace(/[^0-9]/g, ''), 10) || 0;
  const diskon = parseInt(String(d.diskon).replace(/[^0-9]/g, ''), 10) || 0;
  const rapi = items.map(function (i) {
    return {
      name: String(i.name).slice(0, 120),
      qty: Math.max(1, parseInt(i.qty, 10) || 1),
      price: parseInt(String(i.price).replace(/[^0-9]/g, ''), 10) || 0
    };
  });
  const subtotal = rapi.reduce(function (t, i) { return t + i.price * i.qty; }, 0);
  const total = Math.max(0, subtotal + ongkir - diskon);
  const rp = function (n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); };

  // Dicatat sebagai pesanan biasa: ikut masuk dasbor, halaman lacak,
  // statistik, dan database pelanggan — sama seperti pesanan online.
  handleOrder({
    type: 'order', orderId: orderId, channel: d.channel || 'Invoice manual',
    buyer: {
      name: String(b.name).trim(),
      phone: String(b.phone || '').trim(),
      email: String(b.email || '').trim()
    },
    items: rapi.map(function (i) {
      return { name: i.name, kategori: 'Invoice manual', qty: i.qty, price: i.price,
        status: 'Manual', isCustom: false, opts: '' };
    }),
    shipping: { tujuan: d.tujuan || '', alamat: d.alamat || '',
      layanan: d.layanan || 'Diatur admin', biaya: ongkir },
    total: total,
    tanpaTahanStok: !!d.tanpaTahanStok,
    emailNanti: !String(b.email || '').trim()
  });

  // cara bayarnya dicatat di kolom link_tagihan supaya terlihat di dasbor
  try {
    const sh = sheet(T_PESANAN);
    sh.getRange(sh.getLastRow(), 11).setValue('MANUAL · ' + (d.caraBayar || 'Transfer / tunai'));
  } catch (err) {}

  const teks = [
    'INVOICE ' + orderId,
    NAMA_TOKO,
    Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy HH:mm') + ' WIB',
    '',
    'Kepada : ' + String(b.name).trim(),
    String(b.phone || '').trim() ? 'No. HP : ' + String(b.phone).trim() : '',
    String(d.alamat || '').trim() ? 'Alamat : ' + String(d.alamat).replace(/\n/g, ', ') : '',
    '',
    'RINCIAN',
    rapi.map(function (i, n) {
      return (n + 1) + '. ' + i.name + '  ' + i.qty + ' x ' + rp(i.price) + ' = ' + rp(i.price * i.qty);
    }).join('\n'),
    '',
    'Subtotal : ' + rp(subtotal),
    ongkir ? 'Ongkos kirim : ' + rp(ongkir) : '',
    diskon ? 'Potongan : -' + rp(diskon) : '',
    'TOTAL : ' + rp(total),
    '',
    'Cara bayar : ' + (d.caraBayar || 'Transfer / tunai'),
    d.catatanBayar ? String(d.catatanBayar) : '',
    '',
    'Terima kasih sudah memesan di ' + NAMA_TOKO + '.'
  ].filter(function (x) { return x !== ''; }).join('\n');

  return json({ ok: true, orderId: orderId, total: total, teks: teks,
    pesan: 'Invoice manual ' + orderId + ' tercatat.' });
}

function adminInvoice(d) {
  if (!MAYAR_API_KEY) return json({ ok: false, message: 'MAYAR_API_KEY belum diisi di tab Pengaturan.' });

  const items = (d.items || []).filter(function (i) { return String(i.name || '').trim(); });
  if (!items.length) return json({ ok: false, message: 'Belum ada item.' });

  const b = d.buyer || {};
  if (!String(b.name || '').trim()) return json({ ok: false, message: 'Nama pelanggan belum diisi.' });
  if (String(b.email || '').indexOf('@') < 1) return json({ ok: false, message: 'Email pelanggan belum benar.' });

  const orderId = String(d.orderId || '').trim() ||
    ('CBM-' + Utilities.formatDate(new Date(), ZONA, 'yyMMdd') + '-' +
     Math.random().toString(36).slice(2, 6).toUpperCase());

  const ongkir = parseInt(String(d.ongkir).replace(/[^0-9]/g, ''), 10) || 0;
  const diskon = parseInt(String(d.diskon).replace(/[^0-9]/g, ''), 10) || 0;

  const baris = items.map(function (i) {
    const harga = parseInt(String(i.price).replace(/[^0-9]/g, ''), 10) || 0;
    const qty = Math.max(1, parseInt(i.qty, 10) || 1);
    return { quantity: qty, rate: harga, description: String(i.name).slice(0, 120) };
  });
  if (ongkir > 0) baris.push({ quantity: 1, rate: ongkir, description: 'Ongkos kirim' });

  // Potongan dipangkas dari baris paling belakang; Mayar menolak nilai negatif.
  let sisaDiskon = diskon;
  for (let i = baris.length - 1; i >= 0 && sisaDiskon > 0; i--) {
    const nilaiBaris = baris[i].rate * baris[i].quantity;
    const potong = Math.min(sisaDiskon, nilaiBaris);
    const baru = Math.floor((nilaiBaris - potong) / baris[i].quantity);
    baris[i].rate = baru;
    baris[i].description += ' (potongan)';
    sisaDiskon -= potong;
  }
  for (let i = baris.length - 1; i >= 0; i--) if (baris[i].rate <= 0) baris.splice(i, 1);
  if (!baris.length) return json({ ok: false, message: 'Potongan menghabiskan seluruh nilai tagihan.' });

  const totalKotor = baris.reduce(function (t, x) { return t + x.rate * x.quantity; }, 0);
  if (totalKotor < 1000) return json({ ok: false, message: 'Total terlalu kecil (minimal Rp1.000).' });
  const total = totalKotor;

  let link = '', jawab = '';
  try {
    const res = UrlFetchApp.fetch(MAYAR_API_URL, {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + MAYAR_API_KEY },
      payload: JSON.stringify({
        name: String(b.name).slice(0, 80),
        email: emailUntukMayar(b.email, orderId),
        mobile: hpMayar(b.phone),
        description: NAMA_TOKO + ' — ' + orderId,
        items: baris,
        extraData: { orderId: orderId }
      }),
      muteHttpExceptions: true
    });
    jawab = res.getContentText();
    const o = JSON.parse(jawab);
    link = (o.data && o.data.link) || o.link || '';
  } catch (err) { jawab = String(err); }

  if (!link) {
    let sebab = '';
    try { const o = JSON.parse(jawab); sebab = o.messages || o.message || o.error || ''; } catch (e) {}
    return json({
      ok: false,
      message: 'Mayar menolak tagihan ini' + (sebab ? ': ' + sebab : '.'),
      detail: jawab.slice(0, 400)
    });
  }

  // catat sebagai pesanan biasa supaya masuk lacak, stok, dan rekap pelanggan
  handleOrder({
    type: 'order', orderId: orderId, channel: 'Tagihan admin',
    buyer: { name: b.name, phone: b.phone, email: b.email },
    items: items.map(function (i) {
      return {
        name: i.name, kategori: i.kategori || 'Khusus',
        qty: Math.max(1, parseInt(i.qty, 10) || 1),
        price: parseInt(String(i.price).replace(/[^0-9]/g, ''), 10) || 0,
        status: i.status || 'Pre-order', isCustom: true, opts: i.opts || ''
      };
    }),
    shipping: d.alamat || ongkir ? { biaya: ongkir, alamat: d.alamat || '', tujuan: d.tujuan || '', layanan: d.layanan || 'Diatur admin' } : null,
    total: total, catatan: d.catatan || ''
  });

  return json({ ok: true, orderId: orderId, link: link, total: total });
}

/* ---------- 0. PENGAMAN ---------- */

/**
 * Harga TIDAK boleh dipercaya dari browser — siapa pun bisa mengubahnya
 * lewat alat pengembang. Di sini setiap harga dicocokkan ulang dengan
 * tab Produk. Kalau lebih rendah dari harga asli, dikembalikan ke harga asli.
 */
function validasiHarga(d) {
  const rows = sheet(T_PRODUK).getDataRange().getValues();
  const head = rows.length ? rows[0].map(function (h) { return String(h).toLowerCase().trim(); }) : [];
  const cNama = head.indexOf('nama'), cHarga = head.indexOf('harga');

  // Daftar harga asli. Kalau tab Produk kosong/tanpa header yang benar,
  // daftar dibiarkan kosong — tapi TOTAL tetap dihitung ulang di server.
  const daftar = {};
  if (rows.length > 1 && cNama > -1 && cHarga > -1) {
    for (let i = 1; i < rows.length; i++) {
      const nama = String(rows[i][cNama] || '').trim().toLowerCase();
      if (nama) daftar[nama] = parseInt(String(rows[i][cHarga]).replace(/[^0-9]/g, ''), 10) || 0;
    }
  }

  const koreksi = [];
  (d.items || []).forEach(function (i) {
    const asli = daftar[String(i.name || '').trim().toLowerCase()];
    const kirim = parseInt(String(i.price).replace(/[^0-9]/g, ''), 10) || 0;
    i.qty = Math.max(1, Math.min(99, parseInt(i.qty, 10) || 1));
    if (asli && kirim < asli) { koreksi.push(i.name + ': ' + kirim + ' -> ' + asli); i.price = asli; }
    else i.price = kirim;
  });

  // ongkir juga diperiksa
  if (d.shipping) {
    let biaya = parseInt(String(d.shipping.biaya).replace(/[^0-9]/g, ''), 10) || 0;
    const belanja = (d.items || []).reduce(function (t, i) { return t + i.price * i.qty; }, 0);
    const gratis = ONGKIR_GRATIS_MIN > 0 && belanja >= ONGKIR_GRATIS_MIN;
    if (!RAJAONGKIR_API_KEY) biaya = gratis ? 0 : ONGKIR_FLAT; // mode flat: nilai dipaksa dari pengaturan
    if (biaya < 0) biaya = 0;
    d.shipping.biaya = biaya;
  }

  // total dihitung ulang di server, bukan diambil dari browser
  d.total = (d.items || []).reduce(function (t, i) { return t + i.price * i.qty; }, 0) +
    (d.shipping ? Number(d.shipping.biaya) || 0 : 0);

  if (koreksi.length) {
    catatWebhookMeragukan({ event: 'harga.dikoreksi' }, d.orderId || '',
      'Harga dari browser lebih rendah dari tab Produk: ' + koreksi.join('; '));
  }
  return d;
}

/** Batas jumlah pesanan per pengunjung per hari — menahan spam & bot. */
function batasiPesanan(d) {
  const props = PropertiesService.getScriptProperties();
  const hari = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
  const siapa = String((d.buyer && d.buyer.email) || (d.buyer && d.buyer.phone) || 'anon').toLowerCase().slice(0, 40);
  const kunci = 'ord_' + hari + '_' + siapa;
  const n = parseInt(props.getProperty(kunci) || '0', 10);
  if (n >= MAKS_PESANAN_HARI) {
    return json({ ok: false, message: 'Terlalu banyak pesanan hari ini. Lanjut lewat WhatsApp ya.' });
  }
  props.setProperty(kunci, String(n + 1));
  return null;
}

/* ---------- 1. PESANAN BARU ---------- */

/** Apakah satu item pesanan berstatus pre-order (dibuat setelah dipesan)? */
function poItem(i) {
  if (!i) return false;
  if (i.isCustom || i.preorder) return true;
  return /pre|inden|habis|kosong|\bpo\b/i.test(String(i.status || ''));
}

function labelPo(i) { return poItem(i) ? ' [PRE-ORDER]' : ''; }

/** Bagian penjelasan pre-order untuk email pembeli. '' kalau tidak ada. */
function catatanPo(d) {
  const po = (d.items || []).filter(poItem);
  if (!po.length) return '';
  return '= Catatan pre-order =\n' +
    po.map(function (i) { return '- ' + i.name + ' x' + (i.qty || 1); }).join('\n') + '\n' +
    'Produk pre-order dirajut satu per satu setelah pembayaran masuk, jadi bukan stok siap kirim. Perkiraan waktu pengerjaannya kami kabari lewat WhatsApp.\n\n';
}

function handleOrder(d) {
  naikkanVersiTab(T_PESANAN);
  const sh = sheet(T_PESANAN);
  const now = waktuWib();
  const items = (d.items || []).map(function (i) {
    return i.name + ' x' + i.qty + labelPo(i) + (i.opts ? ' (' + i.opts + ')' : '');
  }).join('; ');
  const detailQty = (d.items || []).map(function (i) { return i.name + '=' + i.qty; }).join(';');

  sh.appendRow([
    now,
    d.orderId || '',
    (d.buyer && d.buyer.name) || '',
    (d.buyer && d.buyer.phone) || '',
    (d.buyer && d.buyer.email) || '',
    items,
    Number(d.total || 0),
    d.channel || '',
    'MENUNGGU BAYAR',
    detailQty, '', '', '', '', '', '', '',
    now + ' | MENUNGGU BAYAR | Pesanan masuk dari website'
  ]);
  const barisBaru = sh.getLastRow();
  try { catatPelanggan(d); } catch (err) {}

  // Stok DITAHAN sejak pesanan dibuat, supaya barang yang sama tidak
  // bisa dipesan dua orang. Dilepas otomatis kalau pesanan batal/kedaluwarsa.
  try {
    if (!d.tanpaTahanStok) {
      (d.items || []).forEach(function (i) {
        const q = parseInt(i.qty, 10) || 1;
        if (String(i.name || '').trim() && q > 0) ubahStok(String(i.name).trim(), -q, 'Ditahan ' + (d.orderId || ''));
      });
    }
  } catch (err) {}
  if (d.shipping) {
    sh.getRange(barisBaru, 14).setValue(String(d.shipping.alamat || ''));
    sh.getRange(barisBaru, 15).setValue(Number(d.shipping.biaya || 0));
    sh.getRange(barisBaru, 16).setValue(String(d.shipping.kurir || '') + ' ' + String(d.shipping.layanan || ''));
  }

  // Email ke pembeli. Kalau tagihan menyusul (handleInvoice), email ditunda
  // supaya pembeli hanya menerima SATU email — lengkap dengan tombol bayar.
  if (!d.emailNanti) emailPesananDiterima(d, items, now, d.linkBayar || '');

  kirimEmail(
    '[Pesanan Baru] ' + (d.orderId || '') + ' — ' + NAMA_TOKO,
    'Pesanan baru masuk.\n\n' +
    'No. Pesanan : ' + (d.orderId || '-') + '\n' +
    'Nama        : ' + ((d.buyer && d.buyer.name) || '-') + '\n' +
    'No. HP      : ' + ((d.buyer && d.buyer.phone) || '-') + '\n' +
    'Email       : ' + ((d.buyer && d.buyer.email) || '-') + '\n' +
    'Total       : Rp' + Number(d.total || 0).toLocaleString('id-ID') + '\n' +
    'Channel     : ' + (d.channel || '-') + '\n\n' +
    'Produk:\n' + items + '\n\n' +
    blokPengirimanOwner(d.shipping) +
    'Status: MENUNGGU BAYAR (stok belum dikurangi).'
  );

  return json({ ok: true, orderId: d.orderId });
}

/**
 * Blok alamat pengiriman untuk email OWNER.
 *
 * Sebelumnya email ke owner sama sekali tidak mencetak alamat, padahal data
 * pengiriman sudah dikirim website dan sudah tersimpan di kolom 14-16 tab
 * Pesanan. Akibatnya owner harus membuka spreadsheet untuk tahu ke mana paket
 * dikirim. Alamat multi-baris dibiarkan multi-baris supaya bisa disalin apa
 * adanya ke label pengiriman.
 */
function blokPengirimanOwner(kirim) {
  if (!kirim) return 'ALAMAT KIRIM: (pembeli tidak mengisi alamat)\n\n';
  const alamat = String(kirim.alamat || '').trim();
  if (!alamat) return 'ALAMAT KIRIM: (pembeli tidak mengisi alamat)\n\n';

  const jasa = (String(kirim.kurir || '').trim() + ' ' + String(kirim.layanan || '').trim()).trim();
  const biaya = Number(kirim.biaya || 0);
  return 'ALAMAT KIRIM\n' + alamat + '\n' +
    (jasa ? 'Kurir  : ' + jasa + '\n' : '') +
    (biaya ? 'Ongkir : Rp' + biaya.toLocaleString('id-ID') + '\n' : '') +
    '\n';
}

/**
 * Email "pesanan diterima". linkBayar diisi -> muncul tombol Bayar Sekarang
 * dan pembeli tidak perlu menunggu email dari penyedia pembayaran.
 */
function emailPesananDiterima(d, items, waktu, linkBayar) {
  const kirim = d.shipping || {};
  const ongkir = Number(kirim.biaya || 0);
  const produk = Number(d.total || 0) - ongkir;

  kirimEmailPembeli(
    (d.buyer && d.buyer.email) || '',
    'Pesanan ' + (d.orderId || '') + ' diterima — ' + NAMA_TOKO,
    'Hai ' + ((d.buyer && d.buyer.name) || 'Kak') + ',\n\n' +
    'Terima kasih sudah memesan di ' + NAMA_TOKO + '. Pesananmu sudah kami catat dan sedang menunggu pembayaran.\n\n' +
    '= Rincian pesanan =\n' +
    'No. Pesanan : ' + (d.orderId || '-') + '\n' +
    'Waktu : ' + waktu + '\n' +
    'Status : MENUNGGU PEMBAYARAN\n\n' +
    '= Barang =\n' +
    (d.items || []).map(function (i) {
      return '- ' + i.name + ' x' + (i.qty || 1) + labelPo(i) +
        ' — Rp' + Number((i.price || 0) * (i.qty || 1)).toLocaleString('id-ID') +
        (i.opts ? ' (' + String(i.opts).replace(/\n/g, ', ') + ')' : '');
    }).join('\n') + (d.items && d.items.length ? '\n\n' : items + '\n\n') +
    catatanPo(d) +
    '= Pembayaran =\n' +
    'Subtotal produk : Rp' + produk.toLocaleString('id-ID') + '\n' +
    (ongkir ? 'Ongkos kirim : Rp' + ongkir.toLocaleString('id-ID') + '\n' : '') +
    'Total bayar : Rp' + Number(d.total || 0).toLocaleString('id-ID') + '\n\n' +
    (kirim.alamat
      ? '= Pengiriman =\n' +
        'Tujuan : ' + (kirim.tujuan || '-') + '\n' +
        (kirim.layanan ? 'Layanan : ' + kirim.layanan + '\n' : '') +
        'Alamat : ' + String(kirim.alamat).replace(/\n/g, ', ') + '\n\n'
      : '') +
    (linkBayar
      ? 'Selesaikan pembayaran lewat tombol di bawah. Tersedia QRIS, GoPay, ShopeePay, DANA, dan transfer bank.\n\n' +
        '[[Bayar Sekarang]] ' + linkBayar + '\n\n' +
        (d.batasBayarTeks
          ? 'Link pembayaran ini khusus untuk pesananmu dan berlaku sampai ' + d.batasBayarTeks + '. Setelah itu tagihan ditutup otomatis dan stoknya dilepas untuk pembeli lain.\n\n'
          : 'Link pembayaran ini khusus untuk pesananmu dan bisa dibuka kapan saja.\n\n')
      : 'Cara pembayarannya kami kirim lewat WhatsApp sebentar lagi.\n\n') +
    (linkLacak(d.orderId)
      ? 'Ingin memantau prosesnya? Halaman ini menampilkan tahapan pesananmu, dari dirajut sampai diterima.\n\n' +
        '[[-Lacak Pesanan]] ' + linkLacak(d.orderId) + '\n\n'
      : '') +
    'Setelah pembayaran kami terima, pesananmu langsung masuk antrean rajut dan kamu dapat email konfirmasi.\n\n' +
    'Ada yang mau ditanyakan? Balas email ini atau chat WhatsApp kami.\n\n' +
    'Salam hangat,\n' + NAMA_TOKO
  );
}

/* ---------- 1b. TAGIHAN GABUNGAN (MULTI PRODUK) ---------- */

function handleInvoice(d) {
  if (!MAYAR_API_KEY) return json({ ok: false, message: 'MAYAR_API_KEY belum diisi di script' });

  handleOrder(Object.assign({}, d, { emailNanti: true })); // catat dulu, email menyusul

  const items = (d.items || []).map(function (i) {
    return {
      quantity: Number(i.qty) || 1,
      rate: Number(i.price) || 0,
      description: String(i.name + (poItem(i) ? ' (PRE-ORDER)' : '') +
        (i.opts ? ' — ' + i.opts : '')).slice(0, 120)
    };
  });

  // ongkir jadi baris tersendiri di tagihan supaya jelas bagi pembeli
  if (d.shipping && Number(d.shipping.biaya) > 0) {
    items.push({
      quantity: 1,
      rate: Number(d.shipping.biaya),
      description: 'Ongkos kirim — ' + (d.shipping.kurir || '') + ' ' + (d.shipping.layanan || '')
    });
  }

  const body = {
    name: (d.buyer && d.buyer.name) || '',
    email: emailUntukMayar(d.buyer && d.buyer.email, d.orderId),
    mobile: (d.buyer && d.buyer.phone) || '',
    description: 'Pesanan ' + (d.orderId || '') + ' — ' + NAMA_TOKO,
    items: items,
    extraData: { orderId: d.orderId || '' }
  };
  if (URL_WEBSITE) body.redirectUrl = URL_WEBSITE;

  // BATAS WAKTU PEMBAYARAN.
  // Tanpa ini Mayar memakai batas waktunya sendiri yang tidak kita ketahui,
  // sehingga link tagihan bisa mati sementara status di tab Pesanan masih
  // MENUNGGU BAYAR selamanya. Sekarang batasnya kita tentukan sendiri,
  // dikirim ke Mayar, dan disimpan di kolom batas_bayar sebagai acuan pasti
  // untuk pemeriksaan otomatis.
  const batasMs = Date.now() + JAM_BATAS_BAYAR * 36e5;
  if (JAM_BATAS_BAYAR > 0) {
    body.expiredAt = Utilities.formatDate(new Date(batasMs), ZONA, 'yyyy-MM-dd HH:mm:ss');
    body.dueDate = Utilities.formatDate(new Date(batasMs), ZONA, 'yyyy-MM-dd');
  }

  let res = kirimKeMayar(body);
  // Sebagian akun Mayar menolak field batas waktu. Kalau itu penyebab
  // penolakannya, ulangi tanpa field tersebut supaya tagihan tetap terbit;
  // batas waktu kita sendiri tetap berlaku dari kolom batas_bayar.
  if (res.getResponseCode() >= 400 && body.expiredAt) {
    delete body.expiredAt;
    delete body.dueDate;
    res = kirimKeMayar(body);
  }

  let out = {};
  try { out = JSON.parse(res.getContentText()); } catch (err) {}
  const link = out && out.data && out.data.link;

  if (!link) {
    return json({ ok: false, message: 'Mayar menolak permintaan', detail: res.getContentText().slice(0, 300) });
  }

  // simpan link & id tagihan di kolom keterangan pesanan
  const sh = sheet(T_PESANAN);
  const last = sh.getLastRow();
  sh.getRange(last, 11).setValue(link);
  // transactionId TIDAK selalu ikut di balasan invoice/create. Tanpa id apa pun,
  // status tagihan tidak bisa ditanyakan ke Mayar dan pesanan menggantung di
  // MENUNGGU BAYAR — jadi id invoice dipakai sebagai cadangan.
  sh.getRange(last, 12).setValue(idMayar(out));
  if (JAM_BATAS_BAYAR > 0) {
    sh.getRange(last, 20).setValue(new Date(batasMs)).setNumberFormat('dd/MM/yyyy HH:mm');
    d.batasBayarTeks = Utilities.formatDate(new Date(batasMs), ZONA, 'dd/MM/yyyy HH:mm') + ' WIB';
  }

  // satu email saja ke pembeli, sudah memuat tombol bayar
  const ringkas = (d.items || []).map(function (i) {
    return i.name + ' x' + (i.qty || 1);
  }).join('; ');
  emailPesananDiterima(d, ringkas, waktuWib(), link);

  return json({ ok: true, link: link, orderId: d.orderId });
}

/** Satu permintaan pembuatan tagihan ke Mayar. */
function kirimKeMayar(body) {
  return UrlFetchApp.fetch(MAYAR_API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + MAYAR_API_KEY },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
}

/** Id yang bisa dipakai untuk menanyakan status tagihan ke Mayar. */
function idMayar(out) {
  const data = (out && out.data) || {};
  return String(data.transactionId || data.transaction_id || data.id || '').trim();
}

/** Nilai kolom waktu (Date atau teks) menjadi epoch ms. 0 kalau tidak terbaca. */
function msDari(v) {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  return waktuKe(v) || 0;
}

/**
 * Batas waktu pembayaran satu baris pesanan, dalam epoch ms.
 * Pakai kolom batas_bayar kalau terisi; kalau tidak (pesanan lama, atau
 * Mayar menolak field expiredAt), dihitung dari waktu pesanan.
 * 0 = tidak punya batas waktu.
 */
function batasBayarBaris(row) {
  const eksplisit = msDari(row[19]);
  if (eksplisit) return eksplisit;
  const t = msDari(row[0]);
  const jam = JAM_BATAS_BAYAR > 0 ? JAM_BATAS_BAYAR : JAM_TAHAN_STOK;
  return t && jam > 0 ? t + jam * 36e5 : 0;
}

/* ---------- 1c. ULASAN PELANGGAN ---------- */

function handleReview(d) {
  // batasi panjang supaya tab tidak bisa dibanjiri teks raksasa
  d.ulasan = String(d.ulasan || d.text || '').slice(0, 800);
  d.nama = String(d.nama || d.name || '').slice(0, 60);

  // batas per pengunjung (bukan global). Tanpa penanda pengunjung, dipakai
  // gabungan nama+no.pesanan supaya orang lain tidak ikut terblokir.
  const siapaR = String(d.visitor || (d.nama + '|' + (d.orderId || '')) || 'anon')
    .toLowerCase().replace(/[^a-z0-9|]/g, '').slice(0, 30) || 'anon';
  const propsR = PropertiesService.getScriptProperties();
  const kunciR = 'rev_' + Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd') + '_' + siapaR;
  const nR = parseInt(propsR.getProperty(kunciR) || '0', 10);
  if (nR >= 5) return json({ ok: false, message: 'Terima kasih! Ulasanmu hari ini sudah kami terima.' });
  propsR.setProperty(kunciR, String(nR + 1));

  const sh = sheet(T_REVIEW);
  const orderId = String(d.orderId || '').trim().toUpperCase();
  const rating = Math.max(1, Math.min(5, parseInt(d.rating, 10) || 5));

  // verifikasi: no. pesanan ada & sudah LUNAS
  let verified = false;
  let produk = String(d.produk || '').trim();
  if (orderId) {
    const rows = sheet(T_PESANAN).getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1]).trim().toUpperCase() === orderId) {
        verified = String(rows[i][8]).toUpperCase() === 'LUNAS';
        if (!produk) produk = String(rows[i][5]);
        break;
      }
    }
  }

  // ulasan 4-5 bintang dari pesanan terverifikasi -> langsung tampil
  const tampil = (verified && rating >= 4) ? 'ya' : 'tunggu';

  sh.appendRow([
    waktuWib(),
    verified ? orderId : '',
    String(d.nama || '').trim(),
    rating,
    String(d.ulasan || '').trim(),
    produk,
    tampil
  ]);

  kirimEmail(
    '[Ulasan Baru ' + rating + '/5] ' + (d.nama || '') + ' — ' + NAMA_TOKO,
    'Ulasan baru masuk.\n\n' +
    'Nama    : ' + (d.nama || '-') + '\n' +
    'Rating  : ' + rating + '/5\n' +
    'Produk  : ' + (produk || '-') + '\n' +
    'Pesanan : ' + (orderId || '-') + (verified ? ' (terverifikasi)' : ' (tidak terverifikasi)') + '\n\n' +
    (d.ulasan || '') + '\n\n' +
    (tampil === 'ya'
      ? 'Otomatis DITAMPILKAN di website (rating >= 4 & pesanan terverifikasi).'
      : 'Status: TUNGGU. Buka tab Review, ubah kolom "tampil" jadi "ya" kalau mau ditayangkan.')
  );

  return json({ ok: true, tampil: tampil });
}

/**
 * Kirim permintaan ulasan ke pesanan LUNAS yang sudah lewat HARI_MINTA_REVIEW hari
 * dan belum pernah diminta. Dijalankan otomatis lewat trigger harian
 * (menu: Aktifkan pengingat ulasan otomatis) atau manual dari menu.
 */
function kirimPermintaanReview() {
  const sh = sheet(T_PESANAN);
  const rows = sh.getDataRange().getValues();
  let terkirim = 0;

  // no. pesanan yang sudah pernah mengirim ulasan -> tidak diminta lagi
  const sudahUlas = {};
  sheet(T_REVIEW).getDataRange().getValues().slice(1).forEach(function (r) {
    const id = String(r[1] || '').trim().toUpperCase();
    if (id) sudahUlas[id] = true;
  });

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][8]).toUpperCase() !== 'LUNAS') continue;
    if (String(rows[i][12] || '').trim()) continue; // sudah pernah diminta
    if (sudahUlas[String(rows[i][1] || '').trim().toUpperCase()]) {
      sh.getRange(i + 1, 13).setValue('sudah mengulas');
      continue;
    }

    const umur = umurHari(rows[i][0]);
    if (umur !== null && umur < HARI_MINTA_REVIEW) continue;

    const email = String(rows[i][4] || '').trim();
    const nama = String(rows[i][2] || 'Kak');
    const orderId = String(rows[i][1] || '');
    const link = URL_WEBSITE
      ? String(URL_WEBSITE).trim().replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '') +
        '/?review=' + encodeURIComponent(orderId) + '#testimoni'
      : '';

    kirimEmailPembeli(
      email,
      'Sudah sampai dengan aman? Ceritakan ya, ' + nama + ' — ' + NAMA_TOKO,
      'Hai ' + nama + ',\n\n' +
      'Semoga ' + (rows[i][5] || 'pesananmu') + ' sudah sampai dengan aman dan kamu suka hasilnya.\n\n' +
      'Boleh cerita sedikit pengalamanmu? Ulasan singkat dari kamu sangat membantu pembeli lain yang masih ragu — dan jadi semangat besar bagi kami yang merajut satu per satu.\n\n' +
      (link ? 'Tulis ulasan di sini (nama & produk sudah terisi otomatis):\n' + link + '\n\n' : '') +
      'No. Pesanan : ' + orderId + '\n\n' +
      'Kalau ada yang kurang pas dengan pesananmu, balas email ini dulu — kami bantu selesaikan sebelum kamu menulis ulasan.\n\n' +
      'Terima kasih sudah memilih handmade.\n\n' +
      'Salam hangat,\n' + NAMA_TOKO
    );

    sh.getRange(i + 1, 13).setValue(waktuWib());
    terkirim++;
  }
  return terkirim;
}

function mintaReviewSekarang() {
  const n = kirimPermintaanReview();
  SpreadsheetApp.getUi().alert(n
    ? 'Permintaan ulasan terkirim ke ' + n + ' pelanggan.'
    : 'Tidak ada pesanan yang perlu diminta ulasan sekarang (harus LUNAS, lewat ' + HARI_MINTA_REVIEW + ' hari, dan belum pernah diminta).');
}

function aktifkanPengingatReview() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'kirimPermintaanReview') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('kirimPermintaanReview').timeBased().everyDays(1).atHour(10).create();
  SpreadsheetApp.getUi().alert('Pengingat ulasan otomatis aktif — dijalankan setiap hari sekitar jam 10.00 WIB.');
}

function umurHari(nilai) {
  const s = String(nilai || '').trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  const d = m ? new Date(+m[3], +m[2] - 1, +m[1]) : (nilai instanceof Date ? nilai : null);
  if (!d || isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/* ---------- 1d. PRATINJAU AI (foto -> boneka rajut) ---------- */

const GAYA_AI = {
  amigurumi: 'a soft handmade amigurumi crochet doll of this subject, chibi proportions, visible single-crochet stitch texture in yarn, safety-eye eyes, plush and rounded shapes',
  gantungan: 'a small flat crochet keychain charm of this subject, simple bold shapes, visible yarn stitches, tiny metal keyring attached',
  duduk: 'a medium sitting crochet plush of this subject with slightly oversized head, chunky yarn, visible stitch rows, hand-stitched details'
};

function handleAiCrochet(d) {
  if (!AI_AKTIF) return json({ ok: false, message: 'Fitur pratinjau AI sedang dimatikan.' });
  if (!GEMINI_API_KEY) return json({ ok: false, message: 'GEMINI_API_KEY belum diisi di script.' });
  if (!d.data) return json({ ok: false, message: 'Foto tidak terkirim.' });

  const props = PropertiesService.getScriptProperties();
  const hariIni = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
  const kunci = 'ai_' + hariIni;
  const pakai = parseInt(props.getProperty(kunci) || '0', 10);
  if (pakai >= AI_MAX_PER_HARI) {
    return json({ ok: false, message: 'Kuota pratinjau AI hari ini sudah penuh. Coba lagi besok, atau chat WhatsApp kami langsung ya.' });
  }
  const kunciTamu = 'ai_' + hariIni + '_' + String(d.visitor || 'anon').slice(0, 40);
  const pakaiTamu = parseInt(props.getProperty(kunciTamu) || '0', 10);
  if (pakaiTamu >= AI_MAX_PER_IP) {
    return json({ ok: false, message: 'Kamu sudah membuat ' + AI_MAX_PER_IP + ' pratinjau hari ini. Lanjut konsultasi lewat WhatsApp ya!' });
  }

  const gaya = GAYA_AI[String(d.gaya || 'amigurumi')] || GAYA_AI.amigurumi;
  const prompt = 'Recreate the subject of this photo as ' + gaya + '. ' +
    'Keep the subject recognisable (face shape, hair, colours, clothing colours). ' +
    'Studio product photo on a plain warm cream background, soft daylight, gentle shadow, square 1:1 framing. ' +
    'It must clearly look like a real handmade crocheted yarn object, not a 3D render, not a plastic toy, no text, no watermark.';

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL +
    ':generateContent?key=' + encodeURIComponent(GEMINI_API_KEY);

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: d.mime || 'image/jpeg', data: d.data } }
        ]
      }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
    }),
    muteHttpExceptions: true
  });

  let out = {};
  try { out = JSON.parse(res.getContentText()); } catch (err) {}

  let gambar = '';
  const parts = out && out.candidates && out.candidates[0] && out.candidates[0].content && out.candidates[0].content.parts;
  (parts || []).forEach(function (p) {
    if (!gambar && p.inlineData && p.inlineData.data) gambar = p.inlineData.data;
    if (!gambar && p.inline_data && p.inline_data.data) gambar = p.inline_data.data;
  });

  if (!gambar) {
    const pesan = (out && out.error && out.error.message) || 'Model tidak mengembalikan gambar';
    catatAi(d, 'GAGAL', pesan);
    return json({ ok: false, message: 'Pratinjau gagal dibuat. ' + pesan.slice(0, 160) });
  }

  props.setProperty(kunci, String(pakai + 1));
  props.setProperty(kunciTamu, String(pakaiTamu + 1));
  catatAi(d, 'OK', GEMINI_MODEL);

  return json({ ok: true, mime: 'image/png', data: gambar, sisaKuota: AI_MAX_PER_HARI - pakai - 1 });
}

function catatAi(d, status, catatan) {
  const sh = sheet('AiLog');
  if (sh.getLastRow() === 0) {
    sh.appendRow(['waktu', 'gaya', 'status', 'catatan', 'pengunjung']);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#E2ECF6');
    sh.setFrozenRows(1);
  }
  sh.appendRow([waktuWib(), String(d.gaya || ''), status, String(catatan || '').slice(0, 300), String(d.visitor || '')]);
}

function statusAi() {
  const props = PropertiesService.getScriptProperties();
  const hariIni = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
  const pakai = parseInt(props.getProperty('ai_' + hariIni) || '0', 10);
  SpreadsheetApp.getUi().alert(
    'Pratinjau AI: ' + (AI_AKTIF ? 'AKTIF' : 'MATI') + '\n' +
    'API key: ' + (GEMINI_API_KEY ? 'terisi' : 'KOSONG') + '\n' +
    'Model: ' + GEMINI_MODEL + '\n\n' +
    'Terpakai hari ini: ' + pakai + ' dari ' + AI_MAX_PER_HARI + ' gambar\n' +
    'Chat asisten hari ini: ' + (props.getProperty('chat_' + hariIni) || '0') + ' dari ' + CHAT_MAX_PER_HARI + ' pesan (GRATIS)\n' +
    'Perkiraan biaya hari ini: ± $' + (pakai * 0.067).toFixed(2) + '\n\n' +
    'Cara mematikan: ubah AI_AKTIF menjadi false lalu Save + Deploy New version.'
  );
}

/* ---------- 1e. ASISTEN CHAT WEBSITE (gratis) ---------- */

function panggilGeminiTeks(prompt, maxToken) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_TEXT_MODEL +
    ':generateContent?key=' + encodeURIComponent(GEMINI_API_KEY);
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        // dilebihkan karena model generasi baru memakai token "berpikir"
        maxOutputTokens: (maxToken || 400) * 4,
        // matikan mode berpikir supaya seluruh kuota dipakai untuk jawaban
        thinkingConfig: { thinkingBudget: 0 }
      }
    }),
    muteHttpExceptions: true
  });
  let out = JSON.parse(res.getContentText() || '{}');
  const cand = out && out.candidates && out.candidates[0];
  const parts = cand && cand.content && cand.content.parts;
  let teks = '';
  (parts || []).forEach(function (p) { if (p.text) teks += p.text; });

  // model menolak thinkingConfig -> coba ulang tanpa opsi itu
  if (!teks && out.error && /thinking|unknown name|invalid/i.test(out.error.message || '')) {
    const res2 = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: (maxToken || 400) * 4 }
      }),
      muteHttpExceptions: true
    });
    out = JSON.parse(res2.getContentText() || '{}');
    const p2 = out.candidates && out.candidates[0] && out.candidates[0].content && out.candidates[0].content.parts;
    (p2 || []).forEach(function (p) { if (p.text) teks += p.text; });
  }

  if (!teks) {
    const alasan = (cand && cand.finishReason) || (out.error && out.error.message) || 'tidak ada jawaban';
    if (/MAX_TOKENS/i.test(alasan)) throw new Error('Jawaban terpotong (MAX_TOKENS). Coba model lain, mis. gemini-3.1-flash-lite.');
    throw new Error(alasan);
  }
  return teks.trim();
}

function ringkasKatalog(maksBaris) {
  const rows = sheet(T_PRODUK).getDataRange().getValues();
  if (rows.length < 2) return '(katalog kosong)';
  const head = rows[0].map(function (h) { return String(h).toLowerCase().trim(); });
  const c = {
    kategori: head.indexOf('kategori'), nama: head.indexOf('nama'), harga: head.indexOf('harga'),
    stok: head.indexOf('stok'), custom: head.indexOf('custom'), desk: head.indexOf('deskripsi')
  };
  return rows.slice(1, 1 + (maksBaris || 40)).filter(function (r) { return String(r[c.nama] || '').trim(); })
    .map(function (r) {
      return '- ' + r[c.nama] +
        ' | kategori: ' + (r[c.kategori] || '-') +
        ' | harga: Rp' + Number(String(r[c.harga]).replace(/[^0-9]/g, '') || 0).toLocaleString('id-ID') +
        ' | stok: ' + (r[c.stok] || '-') +
        ' | bisa custom: ' + (String(r[c.custom]).toLowerCase() === 'ya' ? 'ya (pre-order)' : 'tidak') +
        (c.desk > -1 && r[c.desk] ? ' | ' + String(r[c.desk]).slice(0, 90) : '');
    }).join('\n');
}

function handleChat(d) {
  if (!AI_TEKS_AKTIF) return json({ ok: false, message: 'Asisten chat sedang dimatikan.' });
  if (!GEMINI_API_KEY) return json({ ok: false, message: 'GEMINI_API_KEY belum diisi di script.' });

  const props = PropertiesService.getScriptProperties();
  const hariIni = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
  const kTotal = 'chat_' + hariIni;
  const kTamu = 'chat_' + hariIni + '_' + String(d.visitor || 'anon').slice(0, 40);
  const total = parseInt(props.getProperty(kTotal) || '0', 10);
  const tamu = parseInt(props.getProperty(kTamu) || '0', 10);
  if (total >= CHAT_MAX_PER_HARI || tamu >= CHAT_MAX_PER_TAMU) {
    return json({ ok: false, message: 'Asisten sedang istirahat. Lanjut chat WhatsApp kami ya, dijawab langsung oleh Machel.' });
  }

  const riwayat = (d.history || []).slice(-6)
    .map(function (m) { return (m.role === 'user' ? 'Pelanggan' : 'Asisten') + ': ' + String(m.text).slice(0, 500); })
    .join('\n');

  const prompt =
    'Kamu "Asisten Machel", pramuniaga ramah di website toko rajut handmade "Crochet by Machel" (Indonesia).\n' +
    'Tugasmu menjawab pertanyaan calon pembeli dengan hangat, singkat, dan jujur, lalu mengarahkan mereka melanjutkan ke WhatsApp untuk memesan.\n\n' +
    'ATURAN:\n' +
    '1. Jawab dalam bahasa Indonesia santai tapi sopan. Maksimal 4 kalimat pendek. Jangan pakai emoji berlebihan (maksimal satu).\n' +
    '2. Hanya gunakan data katalog di bawah. JANGAN mengarang produk, harga, atau janji tanggal.\n' +
    '3. Kalau ditanya harga produk yang ada di katalog, sebutkan harganya. Kalau produk custom/request, jelaskan harganya mulai dari harga terkait dan final setelah diskusi.\n' +
    '4. Kalau tidak tahu (mis. stok pasti, ongkir, lama pengerjaan spesifik), katakan tidak tahu pasti lalu arahkan ke WhatsApp.\n' +
    '5. Semua boneka dibuat handmade satu per satu; produk bertanda "bisa custom" berarti pre-order (dikerjakan setelah dipesan).\n' +
    '6. Jangan pernah menyebut kamu AI/Gemini. Jangan membahas hal di luar produk rajut, pemesanan, dan pengiriman.\n' +
    '7. Tutup dengan satu ajakan singkat, mis. "Mau saya bantu lanjut ke WhatsApp?"\n' +
    '8. Kalau pelanggan minta kontak/WhatsApp/nomor: tulis nomornya apa adanya, yaitu ' + NOMOR_WA.replace(/^62/, '0') +
    ' dan sebutkan ada tombol hijau WhatsApp di bawah kotak chat ini. ' +
    'DILARANG menulis placeholder seperti [Link WhatsApp], [link], atau tanda kurung siku apa pun. ' +
    'DILARANG mengarang alamat website/link lain.\n' +
    '9. Instagram kami: @' + INSTAGRAM + '. Jangan sebut kontak lain selain itu dan WhatsApp di atas.\n\n' +
    'KATALOG SAAT INI:\n' + ringkasKatalog(40) + '\n\n' +
    'INFO TOKO: WhatsApp ' + NOMOR_WA.replace(/^62/, '0') + ', Instagram @' + INSTAGRAM + '. ' +
    'Pembayaran via QRIS/GoPay/DANA/ShopeePay/transfer bank atau konfirmasi WhatsApp. ' +
    'Bisa request bentuk apa saja dari foto referensi. Pengiriman dari Indonesia, ongkir mengikuti ekspedisi.\n\n' +
    (riwayat ? 'PERCAKAPAN SEBELUMNYA:\n' + riwayat + '\n\n' : '') +
    'Pertanyaan pelanggan: ' + String(d.message || '').slice(0, 800) + '\n\nJawabanmu:';

  let jawab = '';
  try {
    jawab = panggilGeminiTeks(prompt, 400);
  } catch (err) {
    catatChat(d, 'GAGAL', String(err.message || err));
    return json({ ok: false, message: 'Maaf, asisten sedang sibuk. Chat WhatsApp kami saja ya, dijawab langsung.' });
  }
  if (!jawab) return json({ ok: false, message: 'Maaf, belum bisa menjawab itu. Coba tanya lewat WhatsApp ya.' });

  props.setProperty(kTotal, String(total + 1));
  props.setProperty(kTamu, String(tamu + 1));
  catatChat(d, 'OK', jawab);

  return json({ ok: true, reply: jawab });
}

function catatChat(d, status, jawab) {
  const sh = sheet('ChatLog');
  if (sh.getLastRow() === 0) {
    sh.appendRow(['waktu', 'pengunjung', 'pertanyaan', 'jawaban', 'status']);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#E9F0E2');
    sh.setFrozenRows(1);
    sh.setColumnWidth(3, 320); sh.setColumnWidth(4, 420);
  }
  sh.appendRow([waktuWib(), String(d.visitor || ''), String(d.message || '').slice(0, 500), String(jawab || '').slice(0, 900), status]);
}

/* ---------- 1f. PENULIS DESKRIPSI PRODUK (gratis) ---------- */

function tulisDeskripsiKosong() { tulisDeskripsi(false); }
function tulisDeskripsiSemua() { tulisDeskripsi(true); }

function tulisDeskripsi(timpaSemua) {
  const ui = SpreadsheetApp.getUi();
  if (!GEMINI_API_KEY) return ui.alert('GEMINI_API_KEY belum diisi di baris atas script.');
  if (!AI_TEKS_AKTIF) return ui.alert('AI_TEKS_AKTIF masih false.');

  const sh = sheet(T_PRODUK);
  const rows = sh.getDataRange().getValues();
  const head = rows[0].map(function (h) { return String(h).toLowerCase().trim(); });
  const cNama = head.indexOf('nama'), cDesk = head.indexOf('deskripsi'),
        cKat = head.indexOf('kategori'), cHarga = head.indexOf('harga'), cCustom = head.indexOf('custom');
  if (cNama === -1 || cDesk === -1) return ui.alert('Header "nama" / "deskripsi" tidak ditemukan di tab Produk.');

  const target = [];
  for (let i = 1; i < rows.length; i++) {
    const nama = String(rows[i][cNama] || '').trim();
    if (!nama) continue;
    if (!timpaSemua && String(rows[i][cDesk] || '').trim()) continue;
    target.push({ baris: i + 1, nama: nama, kategori: rows[i][cKat], harga: rows[i][cHarga], custom: rows[i][cCustom] });
  }
  if (!target.length) return ui.alert('Tidak ada produk yang perlu ditulis. Semua kolom deskripsi sudah terisi.');

  const konfirm = ui.alert('Tulis deskripsi untuk ' + target.length + ' produk?' +
    (timpaSemua ? '\n\nPERHATIAN: deskripsi lama akan DITIMPA.' : ''), ui.ButtonSet.YES_NO);
  if (konfirm !== ui.Button.YES) return;

  let sukses = 0, gagal = 0;
  target.slice(0, 40).forEach(function (t) {
    const prompt =
      'Tulis satu deskripsi produk untuk toko boneka rajut handmade Indonesia bernama "Crochet by Machel".\n\n' +
      'Produk : ' + t.nama + '\n' +
      'Kategori : ' + (t.kategori || '-') + '\n' +
      'Harga : Rp' + Number(String(t.harga).replace(/[^0-9]/g, '') || 0).toLocaleString('id-ID') + '\n' +
      'Bisa custom/request : ' + (String(t.custom).toLowerCase() === 'ya' ? 'ya, pre-order' : 'tidak, ready stock') + '\n\n' +
      'ATURAN: bahasa Indonesia hangat dan sederhana, 1-2 kalimat, maksimal 22 kata total. ' +
      'Sebut kesan/manfaatnya (cocok untuk hadiah, dibuat tangan satu per satu, dsb). ' +
      'JANGAN sebut harga, JANGAN pakai emoji, JANGAN pakai tanda kutip, JANGAN awali dengan nama produk. ' +
      'Balas HANYA kalimat deskripsinya.';
    try {
      const teks = panggilGeminiTeks(prompt, 120).replace(/^["“']|["”']$/g, '').trim();
      if (teks) { sh.getRange(t.baris, cDesk + 1).setValue(teks); sukses++; } else gagal++;
    } catch (err) { gagal++; }
    Utilities.sleep(1200); // jaga batas laju free tier
  });

  ui.alert('Selesai.\nBerhasil: ' + sukses + ' produk' + (gagal ? '\nGagal: ' + gagal : '') +
    '\n\nPeriksa & rapikan kalimatnya sesuai gaya kamu ya.');
}

/* ---------- 1g. ONGKOS KIRIM ---------- */

const RO_BASE = 'https://rajaongkir.komerce.id/api/v1';

function roFetch(path) {
  const res = UrlFetchApp.fetch(RO_BASE + path, {
    method: 'get',
    headers: { key: RAJAONGKIR_API_KEY },
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText() || '{}');
}

/** Cari kota/kecamatan tujuan (dipakai kotak pencarian di keranjang). */
function cariTujuan(q) {
  q = String(q || '').trim();
  if (q.length < 3) return json({ ok: true, hasil: [] });
  if (!RAJAONGKIR_API_KEY) return json({ ok: false, mode: 'flat', message: 'Pengecekan otomatis belum aktif' });

  const cache = CacheService.getScriptCache();
  const kunci = 'kota_' + q.toLowerCase().slice(0, 30);
  const simpan = cache.get(kunci);
  if (simpan) return ContentService.createTextOutput(simpan).setMimeType(ContentService.MimeType.JSON);

  let hasil = [];
  try {
    const out = roFetch('/destination/domestic-destination?search=' + encodeURIComponent(q) + '&limit=50');
    hasil = (out.data || []).map(function (d) {
      return {
        id: d.id,
        label: [d.subdistrict_name, d.district_name, d.city_name, d.province_name].filter(Boolean).join(', '),
        kel: String(d.subdistrict_name || '').toLowerCase(),
        kec: String(d.district_name || '').toLowerCase(),
        kota: String(d.city_name || '').toLowerCase(),
        pos: d.zip_code || ''
      };
    });

    // Urutkan supaya yang paling masuk akal muncul lebih dulu:
    // nama kecamatan persis -> kelurahan persis -> awalan -> sisanya.
    const qq = q.toLowerCase().trim();
    hasil.sort(function (a, b) {
      function skor(x) {
        if (x.kec === qq) return 0;
        if (x.kel === qq) return 1;
        if (x.kota === qq) return 2;
        if (x.kec.indexOf(qq) === 0) return 3;
        if (x.kel.indexOf(qq) === 0) return 4;
        if (x.kota.indexOf(qq) === 0) return 5;
        return 6;
      }
      const d = skor(a) - skor(b);
      return d !== 0 ? d : a.label.localeCompare(b.label);
    });

    hasil = hasil.slice(0, 25).map(function (x) {
      return { id: x.id, label: x.label, pos: x.pos };
    });
  } catch (err) {}

  const teks = JSON.stringify({ ok: true, hasil: hasil });
  cache.put(kunci, teks, 21600); // simpan 6 jam, hemat kuota
  return ContentService.createTextOutput(teks).setMimeType(ContentService.MimeType.JSON);
}

/** Hitung ongkir ke satu tujuan untuk berat tertentu. */
function hitungOngkir(p) {
  const berat = Math.max(100, parseInt(p.berat, 10) || BERAT_PER_ITEM);
  const belanja = parseInt(p.belanja, 10) || 0;
  const gratis = ONGKIR_GRATIS_MIN > 0 && belanja >= ONGKIR_GRATIS_MIN;

  // tanpa API key -> ongkir flat
  if (!RAJAONGKIR_API_KEY || !ONGKIR_ASAL_ID || !p.tujuan) {
    return json({
      ok: true, mode: 'flat', gratis: gratis,
      layanan: [{
        kurir: 'Pengiriman', layanan: 'Ongkir flat se-Indonesia',
        biaya: gratis ? 0 : ONGKIR_FLAT, etd: '2-5 hari'
      }]
    });
  }

  const cache = CacheService.getScriptCache();
  const kunci = 'ongkir_' + p.tujuan + '_' + berat;
  const simpan = cache.get(kunci);
  let layanan = simpan ? JSON.parse(simpan) : null;

  if (!layanan) {
    layanan = [];
    try {
      const res = UrlFetchApp.fetch(RO_BASE + '/calculate/domestic-cost', {
        method: 'post',
        headers: { key: RAJAONGKIR_API_KEY },
        payload: {
          origin: String(ONGKIR_ASAL_ID),
          destination: String(p.tujuan),
          weight: String(berat),
          courier: ONGKIR_KURIR
        },
        muteHttpExceptions: true
      });
      const out = JSON.parse(res.getContentText() || '{}');
      layanan = (out.data || []).map(function (s) {
        return {
          kurir: String(s.name || s.code || '').toUpperCase(),
          layanan: s.service || '',
          biaya: Number(s.cost) || 0,
          etd: String(s.etd || '').replace(/hari|day[s]?/gi, '').trim() + ' hari'
        };
      }).filter(function (s) { return s.biaya > 0; })
        .sort(function (a, b) { return a.biaya - b.biaya; })
        .slice(0, 8);
    } catch (err) {}
    if (layanan.length) cache.put(kunci, JSON.stringify(layanan), 10800);
  }

  if (!layanan.length) {
    return json({
      ok: true, mode: 'flat', gratis: gratis,
      layanan: [{ kurir: 'Pengiriman', layanan: 'Ongkir flat se-Indonesia', biaya: gratis ? 0 : ONGKIR_FLAT, etd: '2-5 hari' }]
    });
  }

  if (gratis) layanan = layanan.map(function (s) { return { kurir: s.kurir, layanan: s.layanan, biaya: 0, etd: s.etd, asli: s.biaya }; });
  return json({ ok: true, mode: 'api', gratis: gratis, layanan: layanan });
}

/** Menu: cari kode kota asal untuk diisi ke ONGKIR_ASAL_ID. */
function cariKodeAsal() {
  const ui = SpreadsheetApp.getUi();
  if (!RAJAONGKIR_API_KEY) return ui.alert('RAJAONGKIR_API_KEY belum diisi di baris atas script.');
  const a = ui.prompt('Kode kota asal', 'Ketik nama kecamatan/kota tempat kamu mengirim barang:', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  try {
    const out = roFetch('/destination/domestic-destination?search=' + encodeURIComponent(a.getResponseText()) + '&limit=10');
    const baris = (out.data || []).map(function (d) {
      return d.id + '  =  ' + [d.subdistrict_name, d.district_name, d.city_name].filter(Boolean).join(', ');
    });
    ui.alert(baris.length
      ? 'Salin angka di depan yang sesuai ke ONGKIR_ASAL_ID:\n\n' + baris.join('\n')
      : 'Tidak ditemukan. Coba nama kecamatan atau kota saja.');
  } catch (err) { ui.alert('Gagal menghubungi RajaOngkir: ' + err); }
}

/**
 * Diagnosa: kenapa tagihan tidak jadi & checkout lari ke WhatsApp.
 * Menampilkan jawaban asli dari server Mayar apa adanya.
 */
function cekMayar() {
  const ui = SpreadsheetApp.getUi();
  if (!MAYAR_API_KEY) return ui.alert('MAYAR_API_KEY masih kosong di baris atas script.');

  const kunciMirip = MAYAR_API_KEY.slice(0, 6) + '…' + MAYAR_API_KEY.slice(-4);
  const body = {
    name: 'Tes Diagnosa',
    email: 'tes@contoh.com',
    mobile: '081200000000',
    description: 'Tes koneksi ' + NAMA_TOKO,
    items: [{ quantity: 1, rate: 10000, description: 'Tes produk' }],
    extraData: { orderId: 'TES-' + Date.now() }
  };

  let kode = 0, isi = '';
  try {
    const res = UrlFetchApp.fetch(MAYAR_API_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + MAYAR_API_KEY },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
    kode = res.getResponseCode();
    isi = res.getContentText();
  } catch (err) {
    return ui.alert('Gagal menghubungi Mayar sama sekali:\n' + err);
  }

  let link = '';
  try { const o = JSON.parse(isi); link = (o.data && o.data.link) || ''; } catch (e) {}

  if (link) {
    return ui.alert('BERHASIL.\n\nAPI key ' + kunciMirip + ' bisa membuat tagihan.\n\n' +
      'Link tes:\n' + link + '\n\n' +
      'Kalau website MASIH lari ke WhatsApp, berarti masalahnya di URL konektor:\n' +
      '1. Deploy → Manage deployments → salin URL /exec yang AKTIF.\n' +
      '2. Tempel ke Tweaks → Order Api Url di website.\n' +
      '(URL berubah kalau kamu memakai "New deployment", bukan "Edit → New version".)');
  }

  const petunjuk =
    kode === 401 || kode === 403 ? 'Artinya API key ditolak. Pakai key READ & WRITE, salin ulang tanpa spasi.' :
    kode === 404 ? 'Alamat API tidak ditemukan. Pastikan MAYAR_API_URL = https://api.mayar.id/hl/v1/invoice/create' :
    kode === 400 ? 'Data tagihan ditolak Mayar. Baca pesan di bawah, biasanya soal nomor HP atau item.' :
    'Server Mayar membalas dengan kode ' + kode + '.';

  ui.alert('GAGAL (kode ' + kode + ')\n\n' + petunjuk + '\n\nJawaban asli Mayar:\n' + isi.slice(0, 700));
}

/* ---------- 2. PEMBAYARAN MASUK ---------- */

/**
 * PENTING: penyedia pembayaran mengirim webhook untuk BANYAK kejadian
 * (tagihan dibuat, menunggu bayar, kedaluwarsa, batal, tes koneksi) dan
 * sebagian memakai kata "SUCCESS" untuk arti "webhook berhasil dikirim",
 * bukan "sudah dibayar". Karena itu urutannya: tolak dulu yang jelas belum
 * lunas, baru terima yang jelas lunas, lalu pastikan lagi ke server Mayar.
 */

function labelEvent(d) {
  return String(d.event || d.type || (d.data && d.data.event) || '-') + ' / ' + statusPembayaran(d);
}

function statusPembayaran(d) {
  const dd = d.data || {};
  return String(
    dd.status || dd.transactionStatus || dd.paymentStatus ||
    d.transaction_status || d.paymentStatus || d.status || ''
  ).toLowerCase().trim();
}

function isWebhookPembayaran(d) {
  return !!(d.event || d.transaction_status || d.paymentStatus || (d.data && (d.data.status || d.data.transactionStatus)));
}

// Kata status yang PASTI berarti belum / tidak lunas.
const RE_BELUM = /unpaid|belum|pending|waiting|menunggu|process|created|draft|open|active|test|expire|cancel|batal|gagal|fail|refund|void|denied|reject/;
// Status transaksi yang PASTI berarti uang sudah masuk.
// "success" TIDAK ada di sini: banyak balasan API memakainya untuk arti
// "permintaan berhasil", bukan "sudah dibayar".
const RE_LUNAS_KETAT = /^(paid|settled|settlement|capture|captured|lunas|complete|completed)$/;
// Event webhook yang hanya dikirim penyedia saat pembayaran benar-benar sukses.
const RE_EVENT_LUNAS = /payment\.received|payment\.success|payment\.settled|invoice\.paid|order\.paid|settlement/;
// Status tagihan yang berarti link pembayarannya sudah mati di sisi Mayar.
const RE_TAGIHAN_MATI = /expire|expired|kedaluwarsa|cancel|canceled|cancelled|batal|void|fail|failed|reject|rejected|closed|inactive|archived/;

// Kejadian yang berarti pesanan dibatalkan / kedaluwarsa
function isBatalPayload(d) {
  const ev = String(d.event || '').toLowerCase();
  const s = statusPembayaran(d);
  return /cancel|expire|expired|failed|gagal|batal|refund|void|denied/.test(ev + ' ' + s);
}

// Kejadian yang benar-benar berarti UANG SUDAH MASUK
function isPaymentPayload(d) {
  const ev = String(d.event || '').toLowerCase();
  const s = statusPembayaran(d);

  // 1. tolak status/event yang jelas BELUM lunas.
  //    Perhatikan: pola lama memakai kata "paid" tanpa pembatas, sehingga
  //    "unpaid" pun ikut dianggap lunas. Sekarang ditolak lebih dulu.
  if (RE_BELUM.test(ev) || /reminder|testing/.test(ev)) return false;
  if (RE_BELUM.test(s)) return false;

  // 2. event bertanda lunas dari penyedia
  if (RE_EVENT_LUNAS.test(ev)) return true;

  // 3. status transaksi bertanda lunas
  if (RE_LUNAS_KETAT.test(s)) return true;

  // 4. panggilan manual dari script/tes
  return d.type === 'payment' && !!d.orderId;
}

/**
 * Konfirmasi ulang ke server Mayar bahwa transaksi memang sudah dibayar.
 * Ini pengaman utama: walau webhook palsu/terlalu dini masuk, stok tidak
 * akan berkurang kalau server Mayar bilang belum lunas.
 * Hasil: true = lunas, false = belum, null = tidak bisa dicek.
 */
/** Data mentah satu transaksi/tagihan di Mayar, atau null kalau tidak terbaca. */
function bacaMayar(trxId) {
  if (!MAYAR_API_KEY || !trxId) return null;
  const basis = [
    'https://api.mayar.id/hl/v1/transaction/' + encodeURIComponent(trxId),
    'https://api.mayar.id/hl/v1/invoice/' + encodeURIComponent(trxId)
  ];
  for (let i = 0; i < basis.length; i++) {
    try {
      const res = UrlFetchApp.fetch(basis[i], {
        method: 'get',
        headers: { Authorization: 'Bearer ' + MAYAR_API_KEY },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() !== 200) continue;
      const out = JSON.parse(res.getContentText() || '{}');
      const data = out.data || out;
      if (data && typeof data === 'object' && !Array.isArray(data)) return data;
    } catch (err) {}
  }
  return null;
}

function statusMentahMayar(data) {
  if (!data) return '';
  return String(data.status || data.transactionStatus || data.paymentStatus || '').toLowerCase().trim();
}

/**
 * Apakah transaksi ini TERBUKTI dibayar?
 *   true  = terbukti lunas (ada penanda bayar / status lunas yang tegas)
 *   false = terbukti belum lunas
 *   null  = tidak bisa dipastikan
 * Nilai null sengaja TIDAK dianggap lunas. Inilah sebab email "lunas"
 * pernah terkirim padahal uang belum masuk: balasan Mayar yang berbunyi
 * "success" (artinya permintaan berhasil) dulu dibaca sebagai sudah dibayar.
 */
function lunasMenurutMayar(data) {
  if (!data) return null;
  if (data.isPaid === true) return true;
  if (data.isPaid === false) return false;
  const bukti = data.paidAt || data.paid_at || data.settledAt || data.settlement_date ||
    data.paymentDate || data.payment_date || data.paidDate;
  if (bukti) return true;
  const s = statusMentahMayar(data);
  if (RE_LUNAS_KETAT.test(s)) return true;
  if (RE_BELUM.test(s)) return false;
  return null;
}

function konfirmasiKeMayar(trxId) {
  return lunasMenurutMayar(bacaMayar(trxId));
}

/**
 * Status mentah satu transaksi di Mayar, huruf kecil. '' kalau tidak bisa dibaca.
 * Dipakai untuk mengenali tagihan yang KEDALUWARSA/DIBATALKAN di sisi Mayar,
 * supaya stok tidak menunggu batas waktu kita sendiri.
 */
function statusMayar(trxId) {
  return statusMentahMayar(bacaMayar(trxId));
}

/* ---------- 2b. PESANAN BATAL / KEDALUWARSA ---------- */

function handleBatal(d) {
  const cari = cariBarisPesanan(d);
  if (cari.baris === -1) return json({ ok: true, message: 'Event batal diabaikan, pesanan tidak ditemukan' });

  const sh = sheet(T_PESANAN);
  const status = String(sh.getRange(cari.baris, 9).getValue()).toUpperCase();
  const orderId = sh.getRange(cari.baris, 2).getValue();
  const ev = String(d.event || '').toLowerCase();
  const baru = /expire/.test(ev) ? 'KEDALUWARSA' : 'BATAL';

  // Stok ditahan sejak pesanan dibuat, jadi dilepas untuk status apa pun
  // yang belum pernah dibatalkan (termasuk MENUNGGU BAYAR).
  if (status !== 'BATAL' && status !== 'KEDALUWARSA') {
    const kembali = lepasTahananStok(orderId);
    kirimEmail('[' + baru + '] ' + orderId + ' — ' + NAMA_TOKO,
      'Pesanan ' + orderId + ' ' + (baru === 'KEDALUWARSA' ? 'kedaluwarsa (batas waktu pembayaran lewat)' : 'dibatalkan/refund') +
      '. Stok dikembalikan:\n' + (kembali.join('\n') || '(tidak ada)'));

    // Pembeli juga perlu diberi tahu: tanpa email ini dia menunggu, atau
    // mencoba membayar lewat link yang sudah mati.
    try {
      kirimEmailPembeli(
        String(sh.getRange(cari.baris, 5).getValue() || ''),
        (baru === 'KEDALUWARSA' ? 'Batas waktu pembayaran sudah lewat · ' : 'Pesanan dibatalkan · ') +
          orderId + ' — ' + NAMA_TOKO,
        'Hai ' + sh.getRange(cari.baris, 3).getValue() + ',\n\n' +
        (baru === 'KEDALUWARSA'
          ? 'Pesananmu belum terbayar sampai batas waktu, jadi tagihannya kami tutup dan link pembayarannya sudah tidak berlaku.\n\n'
          : 'Pesananmu dibatalkan, dan link pembayarannya sudah tidak berlaku.\n\n') +
        'No. Pesanan : ' + orderId + '\n' +
        'Produk      : ' + sh.getRange(cari.baris, 6).getValue() + '\n' +
        'Total       : Rp' + Number(sh.getRange(cari.baris, 7).getValue() || 0).toLocaleString('id-ID') + '\n\n' +
        'Masih mau lanjut? Pesan ulang di website, atau balas email ini — kami bantu buatkan tagihan baru.\n\n' +
        'Salam hangat,\n' + NAMA_TOKO
      );
    } catch (err) {}
  }

  setStatus(cari.baris, baru, 'Otomatis dari penyedia pembayaran (' + labelEvent(d) + ')');
  return json({ ok: true, orderId: orderId, status: baru });
}

/**
 * Mengembalikan stok tepat sebanyak yang PERNAH ditahan pesanan ini,
 * dihitung dari tab LogStok. Aman diulang: yang sudah dilepas tidak dihitung dua kali.
 */
function lepasTahananStok(orderId) {
  const id = String(orderId || '').trim();
  if (!id) return [];

  const sh = sheet(T_LOG);
  const rows = sh.getDataRange().getValues();
  const bersih = {};   // produk -> jumlah yang masih tertahan

  for (let i = 1; i < rows.length; i++) {
    const ket = String(rows[i][5] || '');
    if (ket.indexOf(id) === -1) continue;
    const produk = String(rows[i][1] || '').trim();
    const delta = parseInt(rows[i][2], 10) || 0;
    if (!produk || !delta) continue;
    // delta negatif = pernah ditahan; positif = pernah dilepas
    bersih[produk] = (bersih[produk] || 0) - delta;
  }

  const hasil = [];
  Object.keys(bersih).forEach(function (p) {
    const jml = bersih[p];
    if (jml > 0) hasil.push(ubahStok(p, jml, 'Batal ' + id));
  });
  return hasil;
}

function cariBarisPesanan(d) {
  const dd = d.data || {};
  const orderId = String(
    d.orderId || d.order_id || d.merchant_ref || d.reference || d.ref ||
    dd.merchantRef || dd.merchant_ref || dd.reference ||
    (d.extraData && d.extraData.orderId) || (dd.extraData && dd.extraData.orderId) || ''
  ).trim();
  const trxId = String(d.id || dd.id || dd.transactionId || d.transaction_id || '').trim();
  const email = String(d.email || d.customerEmail || dd.customerEmail || dd.email || '').trim().toLowerCase();
  const hp = String(d.mobile || d.phone || dd.customerMobile || dd.mobile || '').replace(/[^0-9]/g, '').slice(-9);
  const jumlah = parseInt(String(d.amount || dd.amount || d.total || dd.total || 0), 10) || 0;

  const rows = sheet(T_PESANAN).getDataRange().getValues();

  // 1. paling akurat: order_id
  if (orderId) {
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1]).trim().toUpperCase() === orderId.toUpperCase()) {
        return { baris: i + 1, orderId: orderId, trxId: trxId, jumlah: jumlah, cara: 'order_id' };
      }
    }
  }
  // 2. id transaksi yang tersimpan saat tagihan dibuat
  if (trxId) {
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][11] || '').trim() === trxId) {
        return { baris: i + 1, orderId: String(rows[i][1]), trxId: trxId, jumlah: jumlah, cara: 'transaksi_id' };
      }
    }
  }
  // 3. terakhir: email/HP yang cocok DAN nominalnya sama persis
  if ((email || hp) && jumlah > 0) {
    for (let i = rows.length - 1; i >= 1; i--) {
      const st = String(rows[i][8]).toUpperCase();
      if (st !== 'MENUNGGU BAYAR' && st !== '') continue;
      const rEmail = String(rows[i][4]).trim().toLowerCase();
      const rHp = String(rows[i][3]).replace(/[^0-9]/g, '').slice(-9);
      const rTotal = parseInt(String(rows[i][6]).replace(/[^0-9]/g, ''), 10) || 0;
      if (((email && rEmail === email) || (hp && rHp === hp)) && rTotal === jumlah) {
        return { baris: i + 1, orderId: String(rows[i][1]), trxId: trxId, jumlah: jumlah, cara: 'email+nominal' };
      }
    }
  }
  return { baris: -1, orderId: orderId, trxId: trxId, jumlah: jumlah, cara: '-' };
}

function handlePayment(d) {
  naikkanVersiTab(T_PESANAN);
  const cari = cariBarisPesanan(d);
  const baris = cari.baris;
  const orderId = cari.orderId;
  const sh = sheet(T_PESANAN);

  if (baris === -1)
    return json({ ok: false, message: 'Pesanan tidak ditemukan (ref: ' + (orderId || '-') + ')' });

  // sudah pernah diproses -> jangan kurangi stok dua kali
  const stSekarang = String(sh.getRange(baris, 9).getValue()).toUpperCase();
  if (TAHAP.indexOf(stSekarang) >= 1)
    return json({ ok: true, message: 'Sudah diproses sebelumnya (' + stSekarang + ')' });
  if (stSekarang === 'BATAL' || stSekarang === 'KEDALUWARSA')
    return json({ ok: false, message: 'Pesanan sudah ' + stSekarang + ', pembayaran diabaikan' });

  // PENGAMAN 1: tanya langsung ke server Mayar, jangan percaya webhook saja.
  // paksa = admin sendiri yang menyatakan lunas (menu Ubah status) -> lewati pemeriksaan.
  const paksa = d.paksa === true;
  const cek = paksa ? true : konfirmasiKeMayar(cari.trxId || sh.getRange(baris, 12).getValue());
  if (cek === false) {
    catatWebhookMeragukan(d, orderId, 'Server Mayar bilang BELUM lunas — diabaikan');
    return json({ ok: false, message: 'Belum lunas menurut server pembayaran, diabaikan' });
  }

  // PENGAMAN 2: kalau server tidak bisa MEMASTIKAN lunas, pesanan hanya boleh
  // dilunaskan oleh event webhook yang khusus untuk pembayaran berhasil.
  // Tanpa ini, balasan berbunyi "success" (= permintaan berhasil) bisa
  // membuat pesanan jadi LUNAS dan email lunas terkirim sebelum uang masuk.
  const tegas = paksa || RE_EVENT_LUNAS.test(String(d.event || '').toLowerCase());
  if (cek !== true && !tegas) {
    catatWebhookMeragukan(d, orderId,
      'Pembayaran belum terbukti (server tidak memastikan, event tidak tegas) — status & email pembeli TIDAK diubah');
    if (!d.uji) kirimEmail('[PERIKSA MANUAL] ' + (orderId || '-') + ' — ' + NAMA_TOKO,
      'Ada pemberitahuan pembayaran yang TIDAK bisa dipastikan lunas.\n\n' +
      'No. Pesanan : ' + (orderId || '-') + '\n' +
      'Event       : ' + labelEvent(d) + '\n' +
      'Nominal     : Rp' + Number(cari.jumlah || 0).toLocaleString('id-ID') + '\n\n' +
      'Pesanan dibiarkan MENUNGGU BAYAR dan pembeli TIDAK dikirimi email lunas.\n' +
      'Periksa dasbor Mayar. Kalau memang sudah dibayar, buka menu ' +
      '"Ubah status / input resi pesanan" lalu pilih 1 = LUNAS.\n\n' +
      'Rinciannya tercatat di tab WebhookLog.');
    return json({ ok: false, message: 'Pembayaran belum bisa dipastikan — pesanan dibiarkan MENUNGGU BAYAR' });
  }

  // nominal harus cocok kalau penyedia mengirimkannya
  const totalPesanan = parseInt(String(sh.getRange(baris, 7).getValue()).replace(/[^0-9]/g, ''), 10) || 0;
  if (!paksa && cari.jumlah > 0 && totalPesanan > 0 && Math.abs(cari.jumlah - totalPesanan) > 1000) {
    catatWebhookMeragukan(d, orderId, 'Nominal tidak cocok: bayar ' + cari.jumlah + ' vs tagihan ' + totalPesanan);
    return json({ ok: false, message: 'Nominal pembayaran tidak cocok, diabaikan' });
  }

  setStatus(baris, 'LUNAS', 'Pembayaran diterima (' + labelEvent(d) + ', cocok lewat ' + cari.cara + ')');
  try { perbaruiPelangganDariBaris(baris); } catch (err) {}

  // kurangi stok sesuai kolom detail (nama=qty;nama=qty)
  const detail = String(sh.getRange(baris, 10).getValue() || '');
  const hasil = [];
  detail.split(';').forEach(function (part) {
    const p = part.split('=');
    if (p.length !== 2) return;
    const nama = p[0].trim();
    const jml = parseInt(p[1], 10) || 0;
    // Stok sudah ditahan saat pesanan dibuat — di sini hanya dicatat, tidak dikurangi lagi.
    if (nama && jml > 0) hasil.push(nama + ' x' + jml + ' (stok sudah ditahan sejak pesanan dibuat)');
  });

  // email konfirmasi ke pembeli: pembayaran diterima
  kirimEmailPembeli(
    String(sh.getRange(baris, 5).getValue() || ''),
    'Pembayaran diterima · ' + sh.getRange(baris, 2).getValue() + ' — ' + NAMA_TOKO,
    'Hai ' + sh.getRange(baris, 3).getValue() + ',\n\n' +
    'Pembayaranmu sudah kami terima. Terima kasih banyak!\n\n' +
    'No. Pesanan : ' + sh.getRange(baris, 2).getValue() + '\n' +
    'Produk      : ' + sh.getRange(baris, 6).getValue() + '\n' +
    'Total       : Rp' + Number(sh.getRange(baris, 7).getValue() || 0).toLocaleString('id-ID') + '\n' +
    'Waktu bayar : ' + waktuWib() + '\n\n' +
    'Status: LUNAS — pesananmu masuk antrean pengerjaan.\n' +
    'Kami akan mengabari lewat WhatsApp saat boneka mulai dirajut dan saat siap dikirim.\n' +
    (linkLacak(sh.getRange(baris, 2).getValue()) ? '\nLacak pesananmu kapan saja di:\n' + linkLacak(sh.getRange(baris, 2).getValue()) + '\n' : '') +
    'Setelah pesanan sampai, kami kirim satu email singkat berisi link untuk menulis ulasan — hanya butuh 30 detik.\n\n' +
    'Terima kasih sudah memilih handmade.\n\n' +
    'Salam hangat,\n' + NAMA_TOKO
  );

  kirimEmail(
    '[LUNAS] ' + sh.getRange(baris, 2).getValue() + ' — ' + NAMA_TOKO,
    'Pembayaran diterima untuk pesanan ' + sh.getRange(baris, 2).getValue() + '.\n\n' +
    'Pembeli : ' + sh.getRange(baris, 3).getValue() + '\n' +
    'Total   : Rp' + Number(sh.getRange(baris, 7).getValue() || 0).toLocaleString('id-ID') + '\n\n' +
    'Stok diperbarui:\n' + (hasil.join('\n') || '(tidak ada perubahan)') + '\n\n' +
    // Email inilah yang dipakai owner untuk mulai mengemas, jadi alamatnya
    // dibaca ulang dari baris pesanan (kolom 14 alamat, 15 ongkir, 16 kurir).
    blokPengirimanOwner({
      alamat: sh.getRange(baris, 14).getValue(),
      biaya: sh.getRange(baris, 15).getValue(),
      layanan: sh.getRange(baris, 16).getValue()
    }) +
    'No. HP  : ' + (sh.getRange(baris, 4).getValue() || '-') + '\n\n' +
    'Silakan proses pengerjaan & pengiriman.'
  );

  return json({ ok: true, orderId: sh.getRange(baris, 2).getValue(), stok: hasil });
}

function catatWebhookMeragukan(d, orderId, alasan) {
  const sh = sheet('WebhookLog');
  if (sh.getLastRow() === 0) {
    sh.appendRow(['waktu', 'order_id', 'event', 'alasan', 'payload']);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#F6E3DE');
    sh.setFrozenRows(1);
    sh.setColumnWidth(4, 300); sh.setColumnWidth(5, 400);
  }
  sh.appendRow([waktuWib(), orderId || '-', labelEvent(d), alasan, JSON.stringify(d).slice(0, 900)]);
}

/* ---------- 2c. STATUS PENGERJAAN & PENGIRIMAN ---------- */

function setStatus(baris, status, catatan) {
  naikkanVersiTab(T_PESANAN);
  const sh = sheet(T_PESANAN);
  sh.getRange(baris, 9).setValue(status);
  const lama = String(sh.getRange(baris, 18).getValue() || '');
  const baris16 = waktuWib() + ' | ' + status + (catatan ? ' | ' + catatan : '');
  sh.getRange(baris, 18).setValue(lama ? lama + '\n' + baris16 : baris16);
}

const PESAN_TAHAP = {
  'DIRAJUT':    { judul: 'Pesananmu mulai dirajut', isi: 'Kabar baik! Boneka pesananmu sudah mulai dikerjakan. Karena dirajut satu per satu dengan tangan, kami mengerjakannya dengan teliti supaya hasilnya rapi.' },
  'SIAP KIRIM': { judul: 'Pesananmu sudah selesai dirajut', isi: 'Boneka pesananmu sudah selesai dan sedang kami rapikan serta bungkus. Sebentar lagi diserahkan ke kurir.' },
  'DIKIRIM':    { judul: 'Pesananmu sudah dikirim', isi: 'Pesananmu sudah diserahkan ke kurir dan sedang dalam perjalanan.' },
  'SELESAI':    { judul: 'Pesananmu sudah sampai', isi: 'Menurut catatan kami pesananmu sudah diterima. Semoga suka ya!' }
};

/** Menu: ubah status satu pesanan + kirim email otomatis ke pembeli. */
function promptUbahStatus() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('Lacak Pesanan', 'Masukkan No. Pesanan (mis. CBM-240822-001):', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const id = a.getResponseText().trim().toUpperCase();

  const sh = sheet(T_PESANAN);
  const rows = sh.getDataRange().getValues();
  let baris = -1;
  for (let i = 1; i < rows.length; i++) if (String(rows[i][1]).trim().toUpperCase() === id) { baris = i + 1; break; }
  if (baris === -1) return ui.alert('Pesanan ' + id + ' tidak ditemukan.');

  const b = ui.prompt('Status baru',
    'Ketik salah satu:\n\n' +
    '1 = LUNAS (pembayaran sudah kamu terima manual)\n' +
    '2 = DIRAJUT (mulai dikerjakan)\n' +
    '3 = SIAP KIRIM (selesai, siap diserahkan kurir)\n' +
    '4 = DIKIRIM (sudah diserahkan ke kurir)\n' +
    '5 = SELESAI (sudah diterima pembeli)\n' +
    '0 = BATAL (stok dikembalikan)\n\n' +
    'Status sekarang: ' + rows[baris - 1][8], ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;

  const peta = { '1': 'LUNAS', '2': 'DIRAJUT', '3': 'SIAP KIRIM', '4': 'DIKIRIM', '5': 'SELESAI', '0': 'BATAL' };
  const status = peta[b.getResponseText().trim()];
  if (!status) return ui.alert('Pilihan tidak dikenali.');

  if (status === 'BATAL') {
    handleBatal({ event: 'manual.cancel', orderId: id });
    return ui.alert('Pesanan ' + id + ' dibatalkan & stok dikembalikan.');
  }

  if (status === 'LUNAS') {
    const jawab = JSON.parse(handlePayment({ event: 'payment.received', orderId: id, paksa: true }).getContent());
    return ui.alert(jawab && jawab.ok
      ? 'Pesanan ' + id + ' ditandai LUNAS. Email konfirmasi sudah dikirim ke pembeli.'
      : 'Tidak bisa ditandai lunas: ' + ((jawab && jawab.message) || 'tanpa keterangan'));
  }

  if (status === 'DIKIRIM') {
    const c = ui.prompt('Data pengiriman', 'Ketik: kurir,nomor resi\n\nContoh: jne,JNE1234567890\n\nKurir yang didukung: jne, jnt, sicepat, anteraja, pos, tiki, ninja, wahana, lion, sap, ide, spx (shopee express)', ui.ButtonSet.OK_CANCEL);
    if (c.getSelectedButton() !== ui.Button.OK) return;
    const bagian = c.getResponseText().split(',');
    sh.getRange(baris, 16).setValue(String(bagian[0] || '').trim().toLowerCase());
    sh.getRange(baris, 17).setValue(String(bagian[1] || '').trim().toUpperCase());
  }

  setStatus(baris, status, 'Diubah manual dari spreadsheet');

  const pesan = PESAN_TAHAP[status];
  if (pesan) {
    const kurir = String(sh.getRange(baris, 16).getValue() || '');
    const resi = String(sh.getRange(baris, 17).getValue() || '');
    kirimEmailPembeli(
      String(sh.getRange(baris, 5).getValue() || ''),
      pesan.judul + ' · ' + id + ' — ' + NAMA_TOKO,
      'Hai ' + sh.getRange(baris, 3).getValue() + ',\n\n' + pesan.isi + '\n\n' +
      'No. Pesanan : ' + id + '\n' +
      'Produk      : ' + sh.getRange(baris, 6).getValue() + '\n' +
      (resi ? 'Kurir       : ' + kurir.toUpperCase() + '\nNo. Resi    : ' + resi + '\n' : '') +
      (linkLacak(id) ? '\nLacak pesananmu kapan saja di:\n' + linkLacak(id) + '\n' : '') + '\n' +
      'Salam hangat,\n' + NAMA_TOKO
    );
  }
  ui.alert('Status ' + id + ' -> ' + status + '.\nEmail pemberitahuan sudah dikirim ke pembeli.');
}

/* ---------- 2d. ENDPOINT LACAK PESANAN ---------- */

function handleTrack(p) {
  const id = String(p.id || '').trim().toUpperCase();
  const rows = sheet(T_PESANAN).getDataRange().getValues();
  let r = null;
  for (let i = 1; i < rows.length; i++) if (String(rows[i][1]).trim().toUpperCase() === id) { r = rows[i]; break; }
  if (!r) return json({ ok: false, message: 'Nomor pesanan tidak ditemukan. Periksa lagi, atau chat WhatsApp kami.' });

  const status = String(r[8] || 'MENUNGGU BAYAR').toUpperCase();
  const kurir = String(r[15] || '').toLowerCase().trim();
  const resi = String(r[16] || '').trim();

  const riwayat = String(r[17] || '').split('\n').filter(function (x) { return x.trim(); })
    .map(function (x) {
      const b = x.split('|');
      return { waktu: (b[0] || '').trim(), status: (b[1] || '').trim(), catatan: (b[2] || '').trim() };
    });

  const out = {
    ok: true,
    orderId: r[1],
    nama: samarkanNama(String(r[2] || '')),
    produk: String(r[5] || ''),
    total: Number(String(r[6]).replace(/[^0-9]/g, '')) || 0,
    waktu: String(r[0] || ''),
    status: status,
    tahap: TAHAP.indexOf(status),
    batal: status === 'BATAL' || status === 'KEDALUWARSA',
    kurir: kurir,
    resi: resi,
    riwayat: riwayat,
    linkBayar: status === 'MENUNGGU BAYAR' ? String(r[10] || '') : ''
  };

  if (kurir && resi) out.kurirLacak = lacakKurir(kurir, resi);
  return json(out);
}

function samarkanNama(n) {
  return n.split(' ').map(function (k) {
    return k.length <= 2 ? k : k[0] + k.slice(1).replace(/./g, '*');
  }).join(' ');
}

function lacakKurir(kurir, resi) {
  if (!BINDERBYTE_API_KEY) return null;
  try {
    const url = 'https://api.binderbyte.com/v1/track?api_key=' + encodeURIComponent(BINDERBYTE_API_KEY) +
      '&courier=' + encodeURIComponent(kurir) + '&awb=' + encodeURIComponent(resi);
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const out = JSON.parse(res.getContentText() || '{}');
    if (out.status !== 200 || !out.data) return null;
    return {
      status: (out.data.summary && out.data.summary.status) || '',
      tujuan: (out.data.detail && out.data.detail.receiver) || '',
      histori: (out.data.history || []).slice(0, 12).map(function (h) {
        return { waktu: h.date, status: h.desc, lokasi: h.location || '' };
      })
    };
  } catch (err) { return null; }
}

/* ---------- 2e. DATABASE PELANGGAN ---------- */

const KOLOM_PELANGGAN = ['email', 'nama', 'no_hp', 'pesanan_pertama', 'pesanan_terakhir',
  'jml_pesanan', 'jml_lunas', 'total_belanja', 'rata_rata', 'produk_terakhir',
  'kategori_favorit', 'kota', 'alamat_terakhir', 'channel', 'segmen', 'boleh_promo', 'catatan'];

function sheetPelanggan() {
  const sh = sheet(T_PELANGGAN);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, KOLOM_PELANGGAN.length).setValues([KOLOM_PELANGGAN])
      .setFontWeight('bold').setBackground('#EDE6F2');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 200); sh.setColumnWidth(2, 150); sh.setColumnWidth(13, 260);
  }
  return sh;
}

function kunciPelanggan(email, hp) {
  const e = String(email || '').trim().toLowerCase();
  if (e) return e;
  const h = String(hp || '').replace(/[^0-9]/g, '');
  return h ? 'hp:' + h.slice(-9) : '';
}

/** Tambah / perbarui satu pelanggan saat pesanan baru masuk. */
function catatPelanggan(d) {
  const b = d.buyer || {};
  const kunci = kunciPelanggan(b.email, b.phone);
  if (!kunci) return;

  const sh = sheetPelanggan();
  const rows = sh.getDataRange().getValues();
  let baris = -1;
  for (let i = 1; i < rows.length; i++) {
    if (kunciPelanggan(rows[i][0], rows[i][2]) === kunci) { baris = i + 1; break; }
  }

  const now = waktuWib();
  const produk = (d.items || []).map(function (i) { return i.name; }).join(', ');
  const kategori = (d.items || []).map(function (i) { return i.kategori; }).filter(Boolean).join(', ');
  const kirim = d.shipping || {};
  const kota = String(kirim.tujuan || '').split(',').slice(-2).join(',').trim();

  if (baris === -1) {
    sh.appendRow([
      String(b.email || '').trim().toLowerCase(), String(b.name || '').trim(), String(b.phone || '').trim(),
      now, now, 1, 0, 0, 0, produk, kategori, kota, String(kirim.alamat || ''),
      d.channel || '', 'BARU · BELUM BAYAR', 'ya', ''
    ]);
    return;
  }

  const jml = (parseInt(rows[baris - 1][5], 10) || 0) + 1;
  sh.getRange(baris, 2).setValue(String(b.name || rows[baris - 1][1]).trim());
  sh.getRange(baris, 3).setValue(String(b.phone || rows[baris - 1][2]).trim());
  sh.getRange(baris, 5).setValue(now);
  sh.getRange(baris, 6).setValue(jml);
  sh.getRange(baris, 10).setValue(produk);
  if (kategori) sh.getRange(baris, 11).setValue(kategori);
  if (kota) sh.getRange(baris, 12).setValue(kota);
  if (kirim.alamat) sh.getRange(baris, 13).setValue(String(kirim.alamat));
  sh.getRange(baris, 14).setValue(d.channel || rows[baris - 1][13]);
}

/** Setelah satu pesanan LUNAS, perbarui angka belanja pelanggannya. */
function perbaruiPelangganDariBaris(barisPesanan) {
  const p = sheet(T_PESANAN);
  const email = String(p.getRange(barisPesanan, 5).getValue() || '');
  const hp = String(p.getRange(barisPesanan, 4).getValue() || '');
  const kunci = kunciPelanggan(email, hp);
  if (!kunci) return;

  const sh = sheetPelanggan();
  const rows = sh.getDataRange().getValues();
  let baris = -1;
  for (let i = 1; i < rows.length; i++) {
    if (kunciPelanggan(rows[i][0], rows[i][2]) === kunci) { baris = i + 1; break; }
  }
  if (baris === -1) return;

  const nilai = parseInt(String(p.getRange(barisPesanan, 7).getValue()).replace(/[^0-9]/g, ''), 10) || 0;
  const lunas = (parseInt(rows[baris - 1][6], 10) || 0) + 1;
  const total = (parseInt(String(rows[baris - 1][7]).replace(/[^0-9]/g, ''), 10) || 0) + nilai;

  sh.getRange(baris, 7).setValue(lunas);
  sh.getRange(baris, 8).setValue(total);
  sh.getRange(baris, 9).setValue(Math.round(total / lunas));
  sh.getRange(baris, 15).setValue(segmenPelanggan(lunas, waktuWib()));
}

function segmenPelanggan(jmlLunas, terakhirWib) {
  if (!jmlLunas) return 'CALON · BELUM BAYAR';
  const hari = selisihHari(terakhirWib);
  const dasar = jmlLunas >= 4 ? 'LOYAL' : jmlLunas >= 2 ? 'BERULANG' : 'BARU';
  return hari > HARI_TIDUR ? dasar + ' · TIDUR' : dasar + ' · AKTIF';
}

function selisihHari(teksWib) {
  const m = String(teksWib || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return 0;
  const t = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Math.floor((Date.now() - t.getTime()) / 864e5);
}

/**
 * Menu: susun ulang seluruh tab Pelanggan dari tab Pesanan.
 * Aman dijalankan kapan saja — hasilnya selalu sesuai data pesanan terbaru.
 */
function bangunPelanggan() {
  const ui = SpreadsheetApp.getUi();
  const rows = sheet(T_PESANAN).getDataRange().getValues();
  if (rows.length < 2) return ui.alert('Belum ada pesanan yang bisa diolah.');

  const peta = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const kunci = kunciPelanggan(r[4], r[3]);
    if (!kunci) continue;
    const status = String(r[8] || '').toUpperCase();
    const nilai = parseInt(String(r[6]).replace(/[^0-9]/g, ''), 10) || 0;
    const lunas = status !== 'MENUNGGU BAYAR' && status !== 'BATAL' && status !== 'KEDALUWARSA';

    if (!peta[kunci]) {
      peta[kunci] = {
        email: String(r[4] || '').trim().toLowerCase(), nama: String(r[2] || '').trim(), hp: String(r[3] || '').trim(),
        pertama: r[0], terakhir: r[0], jml: 0, lunas: 0, total: 0,
        produk: '', kategori: {}, kota: '', alamat: '', channel: ''
      };
    }
    const p = peta[kunci];
    p.jml++;
    p.terakhir = r[0];
    if (String(r[2] || '').trim()) p.nama = String(r[2]).trim();
    if (String(r[3] || '').trim()) p.hp = String(r[3]).trim();
    if (lunas) { p.lunas++; p.total += nilai; }
    if (String(r[5] || '')) {
      p.produk = String(r[5]);
      String(r[5]).split(';').forEach(function (bagian) {
        const nama = bagian.split('x')[0].trim();
        if (nama) p.kategori[nama] = (p.kategori[nama] || 0) + 1;
      });
    }
    if (r[13]) { p.alamat = String(r[13]); p.kota = String(r[13]).split('\n').pop().trim(); }
    if (r[7]) p.channel = String(r[7]);
  }

  const daftar = Object.keys(peta).map(function (k) { return peta[k]; })
    .sort(function (a, b) { return b.total - a.total; });

  const isi = daftar.map(function (p) {
    const favorit = Object.keys(p.kategori).sort(function (a, b) { return p.kategori[b] - p.kategori[a]; })[0] || '';
    return [
      p.email, p.nama, p.hp, p.pertama, p.terakhir, p.jml, p.lunas, p.total,
      p.lunas ? Math.round(p.total / p.lunas) : 0, p.produk, favorit, p.kota, p.alamat,
      p.channel, segmenPelanggan(p.lunas, p.terakhir), 'ya', ''
    ];
  });

  const sh = sheetPelanggan();
  const catatanLama = {};
  const lama = sh.getDataRange().getValues();
  for (let i = 1; i < lama.length; i++) {
    const k = kunciPelanggan(lama[i][0], lama[i][2]);
    if (k) catatanLama[k] = { promo: lama[i][15], catatan: lama[i][16] };
  }
  isi.forEach(function (baris) {
    const k = kunciPelanggan(baris[0], baris[2]);
    if (catatanLama[k]) { baris[15] = catatanLama[k].promo || 'ya'; baris[16] = catatanLama[k].catatan || ''; }
  });

  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, KOLOM_PELANGGAN.length).clearContent();
  if (isi.length) sh.getRange(2, 1, isi.length, KOLOM_PELANGGAN.length).setValues(isi);
  sh.getRange(2, 8, Math.max(isi.length, 1), 2).setNumberFormat('#,##0');

  const hitung = { loyal: 0, berulang: 0, baru: 0, calon: 0, tidur: 0 };
  isi.forEach(function (b) {
    const s = String(b[14]);
    if (s.indexOf('LOYAL') === 0) hitung.loyal++;
    else if (s.indexOf('BERULANG') === 0) hitung.berulang++;
    else if (s.indexOf('BARU') === 0) hitung.baru++;
    else hitung.calon++;
    if (s.indexOf('TIDUR') > -1) hitung.tidur++;
  });

  ui.alert('Database pelanggan diperbarui: ' + isi.length + ' orang.\n\n' +
    'Loyal (4+ pembelian) : ' + hitung.loyal + '\n' +
    'Berulang (2-3)       : ' + hitung.berulang + '\n' +
    'Baru (1 pembelian)   : ' + hitung.baru + '\n' +
    'Calon (belum bayar)  : ' + hitung.calon + '\n' +
    'Tidur (>' + HARI_TIDUR + ' hari)     : ' + hitung.tidur + '\n\n' +
    'Catatan & izin promo yang sudah kamu isi tetap aman.');
}

/** Menu: ambil daftar kontak satu segmen untuk broadcast. */
function ambilKontakSegmen() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('Kontak untuk broadcast',
    'Ketik salah satu:\n\n' +
    '1 = Semua pelanggan yang pernah bayar\n' +
    '2 = Loyal (4+ pembelian)\n' +
    '3 = Berulang (2-3 pembelian)\n' +
    '4 = Tidur (lama tidak belanja)\n' +
    '5 = Calon (pernah pesan, belum bayar)', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;

  const pilih = a.getResponseText().trim();
  const rows = sheetPelanggan().getDataRange().getValues();
  const hp = [], email = [];

  for (let i = 1; i < rows.length; i++) {
    const s = String(rows[i][14] || '');
    const lunas = parseInt(rows[i][6], 10) || 0;
    if (String(rows[i][15]).toLowerCase() === 'tidak') continue; // hormati yang menolak promo
    const cocok =
      pilih === '1' ? lunas > 0 :
      pilih === '2' ? s.indexOf('LOYAL') === 0 :
      pilih === '3' ? s.indexOf('BERULANG') === 0 :
      pilih === '4' ? s.indexOf('TIDUR') > -1 :
      pilih === '5' ? lunas === 0 : false;
    if (!cocok) continue;
    const nomor = String(rows[i][2]).replace(/[^0-9]/g, '');
    if (nomor) hp.push(nomor.replace(/^0/, '62'));
    if (rows[i][0]) email.push(String(rows[i][0]));
  }

  if (!hp.length && !email.length) return ui.alert('Tidak ada kontak pada segmen itu.');

  const sh = sheet('Broadcast');
  sh.clear();
  sh.getRange(1, 1, 1, 2).setValues([['no_wa (62…)', 'email']]).setFontWeight('bold').setBackground('#EDE6F2');
  const maks = Math.max(hp.length, email.length);
  const isi = [];
  for (let i = 0; i < maks; i++) isi.push([hp[i] || '', email[i] || '']);
  sh.getRange(2, 1, isi.length, 2).setValues(isi);
  sh.setFrozenRows(1);
  sh.activate();

  ui.alert('Ditemukan ' + hp.length + ' nomor WhatsApp & ' + email.length + ' email.\n\n' +
    'Sudah disalin ke tab "Broadcast".\n\n' +
    'Pelanggan yang kolom boleh_promo-nya "tidak" otomatis dilewati.');
}

/**
 * Melepas stok yang ditahan pesanan yang tak dibayar lebih dari JAM_TAHAN_STOK.
 * Dipasang otomatis sebagai pemicu harian oleh setupSemua, dan bisa
 * dijalankan manual dari menu.
 */
function lepasTahanKedaluwarsa(diam) {
  const sh = sheet(T_PESANAN);
  const rows = sh.getDataRange().getValues();
  const sekarang = Date.now();
  const dilepas = [], lunasTerselamatkan = [];

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][8] || '').toUpperCase() !== 'MENUNGGU BAYAR') continue;

    const orderId = String(rows[i][1] || '');
    const batasBayar = batasBayarBaris(rows[i]);
    const lewatBatas = batasBayar > 0 && sekarang >= batasBayar;
    const trx = String(rows[i][11] || '').trim();
    let sebab = lewatBatas ? 'batas waktu pembayaran lewat' : '';

    // Tanya Mayar: tagihan yang sudah kedaluwarsa/dibatalkan di sana
    // TIDAK perlu menunggu batas waktu kita — stoknya dilepas sekarang.
    if (trx) {
      const dataMayar = bacaMayar(trx);
      const lunas = lunasMenurutMayar(dataMayar);
      const s = statusMentahMayar(dataMayar);
      // Hanya status yang TERBUKTI lunas yang boleh diproses di sini. Status
      // yang meragukan dibiarkan apa adanya — pelunasan menunggu webhook asli.
      if (lunas === true) {
        try { handlePayment({ event: 'payment.received', id: trx, orderId: orderId }); } catch (err) {}
        lunasTerselamatkan.push(orderId);
        continue;
      }
      // Tagihan yang sudah mati di sisi Mayar TIDAK perlu menunggu batas waktu kita.
      if (lunas === false && RE_TAGIHAN_MATI.test(s)) sebab = 'Mayar: ' + s;
      // Tagihan yang tidak bisa dibaca lagi (sudah dihapus/hilang di Mayar) dan
      // sudah lewat batas waktu: ditutup, bukan digantung selamanya.
      if (!sebab && !dataMayar && lewatBatas) sebab = 'tagihan tidak terbaca lagi di Mayar';
    }

    if (!sebab) continue;
    handleBatal({ event: 'auto.expire', orderId: orderId });
    dilepas.push(orderId + ' (' + sebab + ')');
  }

  if (!diam) {
    SpreadsheetApp.getUi().alert(
      (dilepas.length
        ? 'Stok dilepas dari ' + dilepas.length + ' pesanan:\n' + dilepas.join('\n')
        : 'Tidak ada pesanan yang perlu dilepas.\n\n' +
          'Stok dilepas kalau: tagihannya sudah kedaluwarsa/dibatalkan di Mayar, ' +
          'atau batas waktu pembayarannya lewat (' + JAM_BATAS_BAYAR + ' jam, atur di JAM_BATAS_BAYAR).') +
      (lunasTerselamatkan.length
        ? '\n\nDitemukan sudah LUNAS di Mayar & langsung diproses:\n' + lunasTerselamatkan.join('\n')
        : ''));
  }
  return dilepas.length;
}

/* ---------- 2f. STATISTIK KUNJUNGAN ---------- */

function sheetStat() {
  const sh = sheet(T_STAT);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 4).setValues([['tanggal', 'jenis', 'nama', 'jumlah']])
      .setFontWeight('bold').setBackground('#E4EDF6');
    sh.setFrozenRows(1);
    sh.setColumnWidth(3, 260);
  }
  return sh;
}

/**
 * Menambah 1 pada penghitung (tanggal, jenis, nama).
 * jenis: kunjungan | lihat_produk | keranjang | checkout
 */
function handleStat(d) {
  if (!STAT_AKTIF) return json({ ok: true, off: true });
  const jenis = String(d.jenis || '').toLowerCase().replace(/[^a-z_]/g, '').slice(0, 20);
  if (!jenis) return json({ ok: false, message: 'jenis kosong' });
  const nama = String(d.nama || '-').trim().slice(0, 80) || '-';
  const tgl = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');

  const lock = LockService.getScriptLock();
  try { lock.waitLock(4000); } catch (err) { return json({ ok: false }); }
  try {
    const sh = sheetStat();
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === tgl && String(rows[i][1]) === jenis && String(rows[i][2]) === nama) {
        sh.getRange(i + 1, 4).setValue((parseInt(rows[i][3], 10) || 0) + 1);
        return json({ ok: true });
      }
    }
    sh.appendRow([tgl, jenis, nama, 1]);
    return json({ ok: true, baru: true });
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

/**
 * Ringkasan statistik untuk dasbor panel admin.
 * d.hari = rentang hari (7 / 30 / 90)
 */
function statObjek(hariMinta) {
  const hari = Math.min(365, Math.max(1, parseInt(hariMinta, 10) || 30));

  // Dasbor dibuka berulang kali dan angkanya tidak perlu detik-per-detik.
  // Cache 3 menit menghapus dua pembacaan sheet penuh per pembukaan.
  const kunci = 'st_' + hari + '_' + versiTab(T_PESANAN) + '_' + versiTab(T_STAT);
  const dari = cacheAmbil(kunci);
  if (dari) return dari;

  const batas = Utilities.formatDate(new Date(Date.now() - hari * 864e5), ZONA, 'yyyy-MM-dd');
  const shStat = sheetStat();
  const rows = shStat.getLastRow() > 1
    ? shStat.getRange(1, 1, shStat.getLastRow(), 4).getValues() : [];

  const total = {}, produk = {}, harian = {};
  for (let i = 1; i < rows.length; i++) {
    const tgl = String(rows[i][0]);
    if (tgl < batas) continue;
    const j = String(rows[i][1]), n = String(rows[i][2]), v = parseInt(rows[i][3], 10) || 0;
    total[j] = (total[j] || 0) + v;
    if (j === 'lihat_produk') produk[n] = (produk[n] || 0) + v;
    if (j === 'kunjungan') harian[tgl] = (harian[tgl] || 0) + v;
  }

  // ringkasan penjualan dari tab Pesanan — hanya kolom yang dipakai (A..I),
  // bukan seluruh lebar tab yang berisi alamat, riwayat, dan link panjang.
  const shPes = sheet(T_PESANAN);
  const pes = shPes.getLastRow() > 1
    ? shPes.getRange(1, 1, shPes.getLastRow(), Math.min(9, shPes.getLastColumn())).getValues() : [];
  let lunas = 0, nilai = 0, menunggu = 0;
  const batasT = Date.now() - hari * 864e5;
  for (let i = 1; i < pes.length; i++) {
    if (waktuKe(pes[i][0]) < batasT) continue;
    const st = String(pes[i][8] || '').toUpperCase();
    if (st === 'MENUNGGU BAYAR') { menunggu++; continue; }
    if (st === 'BATAL' || st === 'KEDALUWARSA') continue;
    lunas++;
    nilai += parseInt(String(pes[i][6]).replace(/[^0-9]/g, ''), 10) || 0;
  }

  const urutProduk = Object.keys(produk)
    .sort(function (a, b) { return produk[b] - produk[a]; })
    .slice(0, 10)
    .map(function (n) { return { nama: n, jml: produk[n] }; });

  const tglUrut = Object.keys(harian).sort();
  const tren = tglUrut.slice(-14).map(function (t) { return { tgl: t, jml: harian[t] }; });

  const hasil = {
    ok: true, hari: hari, aktif: STAT_AKTIF, toko: NAMA_TOKO,
    kunjungan: total.kunjungan || 0,
    lihatProduk: total.lihat_produk || 0,
    keranjang: total.keranjang || 0,
    checkout: total.checkout || 0,
    pesananLunas: lunas, pesananMenunggu: menunggu, nilai: nilai,
    produk: urutProduk, tren: tren
  };
  cacheSimpan(kunci, hasil, 180);
  return hasil;
}

/** Menu: ringkasan 30 hari terakhir. */
function ringkasanStatistik() {
  const ui = SpreadsheetApp.getUi();
  const rows = sheetStat().getDataRange().getValues();
  if (rows.length < 2) return ui.alert('Belum ada data statistik. Pastikan STATISTIK_AKTIF = ya lalu buka websitemu.');

  const batas = Utilities.formatDate(new Date(Date.now() - 30 * 864e5), ZONA, 'yyyy-MM-dd');
  const total = {}, produk = {};
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) < batas) continue;
    const j = String(rows[i][1]), n = String(rows[i][2]), v = parseInt(rows[i][3], 10) || 0;
    total[j] = (total[j] || 0) + v;
    if (j === 'lihat_produk') produk[n] = (produk[n] || 0) + v;
  }

  const urut = Object.keys(produk).sort(function (a, b) { return produk[b] - produk[a]; }).slice(0, 8);
  const kunjungan = total.kunjungan || 0, co = total.checkout || 0;
  const konversi = kunjungan ? (co / kunjungan * 100).toFixed(1) + '%' : '-';

  ui.alert('30 HARI TERAKHIR\n\n' +
    'Kunjungan       : ' + kunjungan + '\n' +
    'Produk dilihat  : ' + (total.lihat_produk || 0) + '\n' +
    'Masuk keranjang : ' + (total.keranjang || 0) + '\n' +
    'Checkout        : ' + co + '\n' +
    'Konversi        : ' + konversi + '\n\n' +
    'PALING BANYAK DILIHAT\n' +
    (urut.length ? urut.map(function (n, i) { return (i + 1) + '. ' + n + ' — ' + produk[n] + 'x'; }).join('\n') : '(belum ada)'));
}

/* ---------- 2g. TES ALUR LENGKAP ---------- */

/**
 * Menjalankan satu pesanan tiruan dari awal sampai akhir, lalu
 * MEMBERSIHKAN dirinya sendiri (baris pesanan & ulasan dihapus, stok dipulihkan).
 * Aman dijalankan pada data sungguhan.
 */
function tesAlurLengkap() {
  const ui = SpreadsheetApp.getUi();
  const L = [];
  const ok = t => L.push('OK    ' + t);
  const wrn = t => L.push('CEK   ' + t);
  const bad = t => L.push('GAGAL ' + t);

  const bersih = { barisPesanan: 0, barisReview: 0, produk: '', qty: 0 };
  let gagalBerat = 0;

  try {
    /* --- 1. pengaturan --- */
    const wajib = [['EMAIL_OWNER', EMAIL_OWNER], ['URL_WEBSITE', URL_WEBSITE], ['ADMIN_PIN', adminPin()]];
    wajib.forEach(function (w) {
      if (String(w[1] || '').trim()) ok('Pengaturan ' + w[0] + ' terisi');
      else { bad('Pengaturan ' + w[0] + ' MASIH KOSONG'); gagalBerat++; }
    });
    if (MAYAR_API_KEY) ok('Kunci Mayar terisi (pembayaran otomatis siap)');
    else wrn('MAYAR_API_KEY kosong — checkout akan diarahkan ke WhatsApp');
    if (RAJAONGKIR_API_KEY && ONGKIR_ASAL_ID) ok('Ongkir otomatis aktif');
    else wrn('Ongkir memakai tarif flat Rp' + ONGKIR_FLAT);
    if (AI_TEKS_AKTIF && GEMINI_API_KEY) ok('Asisten chat aktif');
    else wrn('Asisten chat nonaktif');

    /* --- 2. tab & kolom --- */
    [T_PRODUK, T_PESANAN, T_SETTING, T_GALERI, T_SOSMED, T_REVIEW, T_PELANGGAN, T_STAT, T_LOG]
      .forEach(function (t) {
        const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(t);
        if (sh) ok('Tab ' + t + ' ada (' + Math.max(0, sh.getLastRow() - 1) + ' baris)');
        else { bad('Tab ' + t + ' TIDAK ADA — jalankan Setup / rapikan semua tab'); gagalBerat++; }
      });

    /* --- 3. produk untuk diuji --- */
    const rowsP = sheet(T_PRODUK).getDataRange().getValues();
    if (rowsP.length < 2) { bad('Tab Produk kosong — tidak bisa menguji pesanan'); throw new Error('stop'); }
    const headP = rowsP[0].map(function (h) { return String(h).toLowerCase().trim(); });
    const cNama = headP.indexOf('nama'), cHarga = headP.indexOf('harga'), cStok = headP.indexOf('stok');
    if (cNama < 0 || cHarga < 0) { bad('Tab Produk tidak punya kolom nama/harga'); throw new Error('stop'); }

    let uji = null;
    for (let i = 1; i < rowsP.length; i++) {
      const st = cStok > -1 ? parseInt(rowsP[i][cStok], 10) : 1;
      if (String(rowsP[i][cNama]).trim() && (isNaN(st) || st > 0)) {
        uji = { nama: String(rowsP[i][cNama]).trim(), harga: parseInt(String(rowsP[i][cHarga]).replace(/[^0-9]/g, ''), 10) || 10000,
          stokAwal: cStok > -1 ? (parseInt(rowsP[i][cStok], 10) || 0) : null };
        break;
      }
    }
    if (!uji) { bad('Tidak ada produk berstok untuk diuji'); throw new Error('stop'); }
    ok('Produk uji: ' + uji.nama + ' (Rp' + uji.harga + ', stok ' + uji.stokAwal + ')');

    /* --- 4. harga tidak bisa dimanipulasi --- */
    const palsu = validasiHarga({
      orderId: 'TES', items: [{ name: uji.nama, qty: 1, price: 1000 }], buyer: {}
    });
    if (palsu.items[0].price >= uji.harga) ok('Pengaman harga bekerja (Rp1.000 ditolak, dikembalikan ke Rp' + palsu.items[0].price + ')');
    else { bad('Pengaman harga TIDAK bekerja — harga palsu diterima'); gagalBerat++; }

    /* --- 5. pesanan masuk --- */
    const orderId = 'TES-' + Utilities.formatDate(new Date(), ZONA, 'yyMMdd-HHmmss');
    const emailUji = daftarAdmin()[0] || 'tes@contoh.com';
    handleOrder({
      type: 'order', orderId: orderId, channel: 'Tes sistem',
      buyer: { name: 'Tes Sistem (abaikan)', phone: '081200000000', email: emailUji },
      items: [{ name: uji.nama, kategori: 'Tes', qty: 1, price: uji.harga, status: 'Ready', isCustom: false, opts: '' }],
      shipping: { tujuan: 'Tes, Kota Tes', alamat: 'Alamat tes', layanan: 'Tes', biaya: 0 },
      total: uji.harga
    });

    const shO = sheet(T_PESANAN);
    const rowsO = shO.getDataRange().getValues();
    for (let i = rowsO.length - 1; i > 0; i--) {
      if (String(rowsO[i][1]).trim() === orderId) { bersih.barisPesanan = i + 1; break; }
    }
    if (bersih.barisPesanan) ok('Pesanan tercatat di tab Pesanan (baris ' + bersih.barisPesanan + ')');
    else { bad('Pesanan TIDAK tercatat di tab Pesanan'); gagalBerat++; }
    bersih.produk = uji.nama; bersih.qty = 1;

    /* --- 6. stok ditahan --- */
    if (!STOK_OTOMATIS) {
      ok('Stok manual (STOK_OTOMATIS = tidak): sistem sengaja tidak mengubah angka stok');
    } else if (uji.stokAwal !== null) {
      const stokKini = stokProduk(uji.nama);
      if (stokKini === uji.stokAwal - 1) ok('Stok ditahan: ' + uji.stokAwal + ' -> ' + stokKini);
      else { bad('Stok TIDAK ditahan (masih ' + stokKini + ', seharusnya ' + (uji.stokAwal - 1) + ')'); gagalBerat++; }
    }

    /* --- 6b. webhook meragukan TIDAK boleh melunasi --- */
    try {
      handlePayment({ event: 'invoice.created', status: 'success', orderId: orderId, amount: uji.harga, uji: true });
    } catch (err) {}
    const stUji = bersih.barisPesanan
      ? String(shO.getRange(bersih.barisPesanan, 9).getValue()).toUpperCase() : '';
    if (stUji === 'MENUNGGU BAYAR') ok('Webhook berbunyi "success" tanpa bukti bayar DITOLAK (email lunas tidak terkirim)');
    else { bad('BAHAYA: webhook "success" mengubah status jadi ' + stUji + ' — email lunas bisa terkirim sebelum uang masuk'); gagalBerat++; }

    /* --- 7. pelanggan --- */
    const rowsPel = sheetPelanggan().getDataRange().getValues();
    let adaPel = false;
    for (let i = 1; i < rowsPel.length; i++) if (String(rowsPel[i][0]).toLowerCase() === emailUji.toLowerCase()) adaPel = true;
    if (adaPel) ok('Pembeli masuk database Pelanggan'); else wrn('Pembeli belum masuk database Pelanggan');

    /* --- 8. tagihan Mayar --- */
    if (MAYAR_API_KEY) {
      const inv = JSON.parse(handleInvoice({
        type: 'invoice', orderId: orderId + '-INV', total: uji.harga, channel: 'Tes', tanpaTahanStok: true,
        buyer: { name: 'Tes Sistem', phone: '081200000000', email: emailUji },
        items: [{ name: uji.nama, kategori: 'Tes', qty: 1, price: uji.harga, status: 'Ready', isCustom: false, opts: '' }]
      }).getContent());
      if (inv && inv.link) ok('Tagihan Mayar dibuat: ' + String(inv.link).slice(0, 48) + '…');
      else { bad('Tagihan Mayar GAGAL: ' + ((inv && (inv.message || inv.detail)) || 'tanpa keterangan')); gagalBerat++; }
    }

    /* --- 9. ongkir --- */
    const ong = JSON.parse(hitungOngkir({ berat: 250, belanja: uji.harga, tujuan: ONGKIR_ASAL_ID || '' }).getContent());
    if (ong && ong.layanan) ok('Pengecekan ongkir menjawab' + (ong.mode === 'flat' ? ' (mode flat)' : ' (' + (ong.layanan || []).length + ' layanan)'));
    else wrn('Pengecekan ongkir tidak menjawab — keranjang akan memakai tarif flat');

    /* --- 10. lacak pesanan --- */
    const trk = JSON.parse(handleTrack({ id: orderId }).getContent());
    if (trk && trk.ok) ok('Halaman Lacak Pesanan menemukan pesanan ini');
    else { bad('Halaman Lacak Pesanan TIDAK menemukan pesanan'); gagalBerat++; }

    /* --- 11. statistik --- */
    handleStat({ jenis: 'kunjungan', nama: '-' });
    const st = statObjek(7);
    if (st && st.ok) ok('Dasbor statistik menjawab (kunjungan 7 hari: ' + st.kunjungan + ')');
    else wrn('Dasbor statistik belum menjawab');

    /* --- 12. ulasan --- */
    const rv = JSON.parse(handleReview({
      type: 'review', orderId: orderId, nama: 'Tes Sistem', rating: 5,
      ulasan: 'Ulasan tes otomatis, akan dihapus sendiri.', visitor: 'tes-sistem'
    }).getContent());
    const shR = sheet(T_REVIEW);
    const rowsR = shR.getDataRange().getValues();
    for (let i = rowsR.length - 1; i > 0; i--) {
      if (String(rowsR[i].join(' ')).indexOf(orderId) > -1) { bersih.barisReview = i + 1; break; }
    }
    if (rv && rv.ok && bersih.barisReview) ok('Ulasan tercatat & terverifikasi otomatis');
    else wrn('Ulasan tidak tercatat: ' + ((rv && rv.message) || '-'));

    /* --- 13. email --- */
    const sisa = MailApp.getRemainingDailyQuota();
    if (sisa > 5) ok('Kuota email tersisa hari ini: ' + sisa);
    else { bad('Kuota email hampir habis (' + sisa + ') — email pembeli bisa gagal'); gagalBerat++; }
    ok('Email uji dikirim ke ' + emailUji + ' — periksa kotak masuk untuk melihat tampilan HTML-nya');

  } catch (err) {
    if (String(err.message) !== 'stop') bad('Terhenti: ' + err);
  }

  /* --- BERSIH-BERSIH --- */
  try {
    const hasil = hapusDataTes(true);
    L.push('---   ' + hasil.pesanan + ' baris pesanan tes dihapus, stok dipulihkan');
    L.push('---   ' + hasil.review + ' baris ulasan tes dihapus');
    if (bersih.produk) L.push('---   Stok ' + bersih.produk + ' sekarang: ' + stokProduk(bersih.produk));
  } catch (err) { L.push('CEK   Bersih-bersih tidak lengkap: ' + err + ' — jalankan menu Hapus data tes'); }

  const judul = gagalBerat ? 'ADA ' + gagalBerat + ' MASALAH' : 'SEMUA LANGKAH LULUS';
  ui.alert('TES ALUR LENGKAP — ' + judul + '\n\n' + L.join('\n') +
    '\n\nYang masih perlu kamu cek sendiri di browser:\n' +
    '1. Buka websitemu, pastikan produk & galeri tampil.\n' +
    '2. Masukkan 1 produk ke keranjang, isi alamat, cek ongkir muncul.\n' +
    '3. Tekan bayar — pastikan halaman Mayar terbuka (jangan diselesaikan).\n' +
    '4. Buka email tes yang baru masuk, lihat tampilan HTML-nya.');
}

/**
 * Menghapus SEMUA jejak pesanan & ulasan bernomor TES-…
 * Stok dipulihkan lebih dulu lewat pembatalan resmi.
 * Dipanggil otomatis di akhir tes, dan bisa dijalankan manual dari menu.
 */
function menuHapusDataTes() { hapusDataTes(false); }
function menuPengingatBayar() { kirimPengingatBayar(false); }

/** Menu: siapa yang sebenarnya mengirim email dari sistem ini. */
function cekPengirimEmail() {
  const ui = SpreadsheetApp.getUi();
  let akun = '(tidak diketahui)', alias = [];
  try { akun = Session.getActiveUser().getEmail() || akun; } catch (err) {}
  try { alias = GmailApp.getAliases(); } catch (err) {}

  const mau = String(EMAIL_PENGIRIM || '').trim();
  const sah = pengirimSah();

  ui.alert('PENGIRIM EMAIL\n\n' +
    'Akun pemilik script : ' + akun + '\n' +
    'Alias terdaftar     : ' + (alias.length ? alias.join(', ') : '(belum ada)') + '\n\n' +
    'EMAIL_PENGIRIM      : ' + (mau || '(kosong)') + '\n' +
    'Dipakai sekarang    : ' + (sah || akun) + '\n\n' +
    (mau && !sah
      ? 'EMAIL_PENGIRIM belum terdaftar sebagai alias, jadi email tetap terkirim dari ' + akun + '.\n\n' +
        'Cara mendaftarkan (di Gmail akun ' + akun + '):\n' +
        '1. Gmail -> gerigi -> See all settings\n' +
        '2. Tab Accounts and Import -> Send mail as -> Add another email address\n' +
        '3. Isi nama & alamat, Next Step, lalu buka kotak masuk alamat itu\n' +
        '4. Salin kode verifikasi, tempel, Verify\n' +
        '5. Kembali ke sini dan jalankan menu ini lagi\n\n' +
        'Cara lain yang lebih bersih: pindahkan kepemilikan project Apps Script & spreadsheet ke akun ' + mau + '.'
      : mau
        ? 'Alias sudah sah. Pembeli melihat ' + sah + ' sebagai pengirim.'
        : 'EMAIL_PENGIRIM masih kosong, jadi pembeli melihat ' + akun + ' sebagai pengirim.\n' +
          'Isi kunci itu di tab Pengaturan kalau ingin memakai alamat bisnis.'));
}

function hapusDataTes(diam) {
  const shO = sheet(T_PESANAN);
  const hasil = { pesanan: 0, review: 0 };

  // 1. batalkan dulu supaya stok kembali
  let rows = shO.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const id = String(rows[i][1] || '').trim().toUpperCase();
    if (id.indexOf('TES-') !== 0) continue;
    const st = String(rows[i][8] || '').toUpperCase();
    if (st !== 'BATAL' && st !== 'KEDALUWARSA') {
      try { handleBatal({ event: 'tes.cleanup', orderId: rows[i][1] }); } catch (err) {}
    }
  }

  // 2. hapus barisnya dari bawah ke atas
  rows = shO.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][1] || '').trim().toUpperCase().indexOf('TES-') === 0) {
      shO.deleteRow(i + 1);
      hasil.pesanan++;
    }
  }

  // 3. ulasan tes
  const shR = sheet(T_REVIEW);
  const rowsR = shR.getDataRange().getValues();
  for (let i = rowsR.length - 1; i >= 1; i--) {
    if (rowsR[i].join(' ').toUpperCase().indexOf('TES-') > -1) { shR.deleteRow(i + 1); hasil.review++; }
  }

  if (!diam) {
    SpreadsheetApp.getUi().alert('Data tes dibersihkan.\n\n' +
      'Pesanan dihapus : ' + hasil.pesanan + '\n' +
      'Ulasan dihapus  : ' + hasil.review + '\n\n' +
      'Stok sudah dipulihkan lewat pembatalan resmi.\n' +
      'Jalankan "Perbarui database pelanggan" untuk membuang pelanggan tes.');
  }
  return hasil;
}

/** Stok terkini satu produk (null kalau tidak ada kolom stok). */
function stokProduk(nama) {
  const rows = sheet(T_PRODUK).getDataRange().getValues();
  const head = rows[0].map(function (h) { return String(h).toLowerCase().trim(); });
  const cN = head.indexOf('nama'), cS = head.indexOf('stok');
  if (cN < 0 || cS < 0) return null;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][cN]).trim().toLowerCase() === String(nama).trim().toLowerCase())
      return parseInt(rows[i][cS], 10) || 0;
  }
  return null;
}

/* ---------- 3. UBAH STOK ---------- */

function waktuWib() {
  return Utilities.formatDate(new Date(), ZONA, 'dd/MM/yyyy HH:mm:ss') + ' WIB';
}

function ubahStok(namaProduk, delta, keterangan) {
  const sh = sheet(T_PRODUK);
  const rows = sh.getDataRange().getValues();
  const head = rows[0].map(function (h) { return String(h).toLowerCase().trim(); });
  const cNama = head.indexOf('nama');
  const cStok = head.indexOf('stok');
  if (cNama === -1 || cStok === -1) return 'Header "nama"/"stok" tidak ditemukan';

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][cNama]).trim().toLowerCase() === String(namaProduk).trim().toLowerCase()) {
      const lama = parseInt(String(rows[i][cStok]).replace(/[^0-9-]/g, ''), 10);
      if (isNaN(lama)) return namaProduk + ': stok bukan angka, dilewati';
      const baru = Math.max(0, lama + delta);
      // STOK_OTOMATIS = tidak: perubahan hanya DICATAT (delta 0) supaya riwayat
      // pesanan tetap terbaca, tapi angka stok tidak disentuh. Delta 0 juga yang
      // membuat lepasTahananStok() tidak pernah mengembalikan stok dua kali.
      if (!STOK_OTOMATIS) {
        sheet(T_LOG).appendRow([waktuWib(), namaProduk, 0, lama, lama,
          (keterangan || '') + ' [stok manual, tidak diubah]']);
        return namaProduk + ': stok manual, tetap ' + lama;
      }
      sh.getRange(i + 1, cStok + 1).setValue(baru);
      // Kolom delta mencatat perubahan yang BENAR-BENAR terjadi (bukan yang diminta),
      // supaya pengembalian stok saat pembatalan tidak pernah melebihi yang ditahan.
      sheet(T_LOG).appendRow([waktuWib(), namaProduk, baru - lama, lama, baru, keterangan]);
      return namaProduk + ': ' + lama + ' -> ' + baru;
    }
  }
  return namaProduk + ': produk tidak ditemukan di tab Produk';
}

/* ---------- 3z. FEED GOOGLE MERCHANT CENTER ---------- */

/** Alamat dasar website, tanpa slash/tanda tanya/kisi di belakang. */
function dasarWebsite() {
  return String(URL_WEBSITE || '').trim().replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '');
}

/** Nama produk menjadi penggal alamat yang aman dipakai di URL. */
function slugProduk(nama) {
  return String(nama || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/** Meloloskan karakter yang tidak boleh muncul mentah di XML. */
function xmlAman(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/**
 * Mengubah tautan Google Drive menjadi alamat yang benar-benar menyajikan
 * berkas gambarnya.
 *
 * Google Merchant Center dan crawler lain mengunduh alamat gambar apa adanya.
 * Bentuk seperti drive.google.com/open?id=... dan /file/d/ID/view adalah
 * HALAMAN pratinjau, bukan gambar, sehingga item ditolak dengan alasan gambar
 * tidak bisa diambil. Bentuk lh3.googleusercontent.com/d/ID menyajikan
 * berkasnya langsung.
 *
 * Syarat: berkas di Drive harus dibagikan "Anyone with the link".
 */
function gambarLangsung(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  if (!/drive\.google\.com|docs\.google\.com/i.test(s)) return s;

  let m = s.match(/[?&]id=([\w-]{10,})/);
  if (!m) m = s.match(/\/file\/d\/([\w-]{10,})/);
  if (!m) m = s.match(/\/d\/([\w-]{10,})/);
  return m ? 'https://lh3.googleusercontent.com/d/' + m[1] : s;
}

/**
 * Menulis satu nilai ke tab Pengaturan. Barisnya dibuat kalau belum ada.
 * Dipakai untuk nilai yang dihasilkan sistem sendiri, mis. MERCHANT_SHEET_ID.
 */
function simpanPengaturan(kunci, nilai) {
  const sh = sheet(T_SETTING);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || '').trim() === kunci) {
      sh.getRange(i + 1, 2).setValue(nilai);
      return;
    }
  }
  sh.appendRow([kunci, nilai, 'Dibuat otomatis oleh sistem']);
}

/** Kolom feed Google Merchant Center, urut sesuai yang ditulis ke sheet. */
const KOLOM_FEED = ['id', 'title', 'description', 'link', 'image_link', 'availability',
  'price', 'condition', 'brand', 'google_product_category', 'product_type', 'identifier_exists'];

/** Nilai availability yang diterima Google. Selain ini dianggap salah tulis. */
const NILAI_AVAIL = ['in_stock', 'out_of_stock', 'preorder', 'backorder'];

/**
 * Membaca ketersediaan yang SUDAH ADA di sheet feed, per id produk.
 *
 * Feed ditulis ulang setiap hari, jadi tanpa ini setiap suntingan manual di
 * kolom availability hilang esok harinya. Dipanggil sebelum sheet dikosongkan.
 */
function availManualFeed(sh) {
  const peta = {};
  const nBaris = sh.getLastRow(), nKolom = sh.getLastColumn();
  if (nBaris < 2 || nKolom < 1) return peta;

  const nilai = sh.getRange(1, 1, nBaris, nKolom).getValues();
  const head = nilai[0].map(function (h) { return String(h).toLowerCase().trim(); });
  const cId = head.indexOf('id'), cAv = head.indexOf('availability');
  if (cId < 0 || cAv < 0) return peta;

  for (let i = 1; i < nilai.length; i++) {
    const id = String(nilai[i][cId] || '').trim();
    const av = String(nilai[i][cAv] || '').trim().toLowerCase();
    if (id && NILAI_AVAIL.indexOf(av) > -1) peta[id] = av;
  }
  return peta;
}

/** Ketersediaan manual dari berkas feed, untuk pemakai di luar bangunFeedSheet. */
function availManualSheet() {
  const id = String(MERCHANT_SHEET_ID || '').trim();
  if (!id) return {};
  try { return availManualFeed(SpreadsheetApp.openById(id).getSheets()[0]); }
  catch (err) { return {}; }
}

/**
 * Satu baris feed per produk yang layak tampil di Google.
 * Dipakai bersama oleh feed XML dan feed spreadsheet supaya aturannya tunggal.
 */
function barisFeed() {
  const dasar = dasarWebsite();
  // Tanpa URL_WEBSITE, setiap item akan lahir tanpa halaman tujuan — dan Google
  // menolak SELURUH feed. Lebih baik feed kosong yang jelas sebabnya daripada
  // puluhan produk ditolak tanpa petunjuk.
  if (!dasar) return [];
  const merek = String(MERCHANT_BRAND || NAMA_TOKO || '').trim();
  const rows = sheet(T_PRODUK).getDataRange().getValues();
  const out = [];

  for (let i = 1; i < rows.length; i++) {
    const nama = String(rows[i][1] || '').trim();
    const harga = parseInt(String(rows[i][3]).replace(/[^0-9]/g, ''), 10) || 0;
    if (!nama || harga <= 0) continue;

    const custom = /^(ya|yes|true|1)$/i.test(String(rows[i][6] || '').trim());
    if (custom && !MERCHANT_PO) continue;

    // Kolom "feed" = tidak: produk tetap tampil di website tapi TIDAK dikirim ke
    // Google. Dipakai untuk produk yang judulnya menyebut karakter atau merek
    // pihak lain, yang ditolak kebijakan kekayaan intelektual Merchant Center.
    if (/^(tidak|no|false|0)$/i.test(String(rows[i][8] || '').trim())) continue;

    const gambar = gambarLangsung(rows[i][5]);
    if (!/^https?:\/\//i.test(gambar)) continue;

    const stok = parseInt(String(rows[i][4]).replace(/[^0-9-]/g, ''), 10) || 0;
    const slug = slugProduk(nama) || ('produk-' + i);
    const deskripsi = String(rows[i][2] || '').trim() ||
      nama + ' \u2014 boneka rajut handmade dari ' + (NAMA_TOKO || 'toko kami') + '.';

    out.push({
      id: slug,
      title: nama.slice(0, 150),
      description: deskripsi.slice(0, 4900),
      link: dasar + '/?produk=' + encodeURIComponent(slug) + '#koleksi',
      image_link: gambar,
      availability: stok > 0 ? 'in_stock' : 'out_of_stock',
      price: harga + '.00 IDR',
      condition: 'new',
      brand: merek,
      google_product_category: MERCHANT_KATEGORI || '',
      product_type: String(rows[i][0] || '').trim(),
      identifier_exists: 'no'
    });
  }
  return out;
}

/**
 * Menulis feed ke spreadsheet TERPISAH yang dibaca Merchant Center.
 *
 * Alasan tidak memakai URL Apps Script: alamat /exec menjawab dengan redirect
 * ke googleusercontent.com, dan penarik berkas Merchant Center sering gagal
 * mengikutinya — muncul "File not found". Spreadsheet dibaca Google secara
 * internal, jadi tidak ada pengambilan berkas yang bisa gagal.
 *
 * Tab feed sengaja jadi tab PERTAMA dan satu-satunya, karena Merchant Center
 * membaca tab pertama.
 */
function bangunFeedSheet(diam, paksaSamakan) {
  const baris = barisFeed();
  let id = String(MERCHANT_SHEET_ID || '').trim();
  let ss = null;

  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (err) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('Feed Google Merchant \u2014 ' + (NAMA_TOKO || 'Toko'));
    id = ss.getId();
    simpanPengaturan('MERCHANT_SHEET_ID', id);
  }

  const sh = ss.getSheets()[0];
  // Dibaca SEBELUM sheet dikosongkan, supaya suntingan manualmu tidak hilang.
  const manual = (FEED_STOK_MANUAL && !paksaSamakan) ? availManualFeed(sh) : {};
  sh.setName('feed');
  sh.clear();
  sh.getRange(1, 1, 1, KOLOM_FEED.length).setValues([KOLOM_FEED])
    .setFontWeight('bold').setBackground('#E4F0E6');
  sh.setFrozenRows(1);

  let dijaga = 0;
  if (baris.length) {
    const nilai = baris.map(function (b) {
      if (manual[b.id]) { b.availability = manual[b.id]; dijaga++; }
      return KOLOM_FEED.map(function (k) { return b[k] || ''; });
    });
    sh.getRange(2, 1, nilai.length, KOLOM_FEED.length).setValues(nilai);
  }

  const url = 'https://docs.google.com/spreadsheets/d/' + id + '/edit';
  if (!diam) {
    SpreadsheetApp.getUi().alert(
      'FEED GOOGLE MERCHANT SIAP\n\n' +
      'Produk di feed : ' + baris.length + '\n' +
      'Stok feed      : ' + (FEED_STOK_MANUAL && !paksaSamakan
        ? 'manual (' + dijaga + ' item memakai availability tulisanmu sendiri)'
        : 'disamakan ulang dengan tab Produk') + '\n' +
      'Berkas feed    : Feed Google Merchant \u2014 ' + (NAMA_TOKO || 'Toko') + '\n\n' +
      url + '\n\n' +
      'Cara pakai di Merchant Center:\n' +
      '1. Produk \u2192 Feed \u2192 Tambahkan feed.\n' +
      '2. Pilih "Gunakan Google Spreadsheet".\n' +
      '3. Pilih "Pilih spreadsheet yang ada" \u2192 pilih berkas di atas.\n' +
      '4. Atur jadwal pembaruan harian.\n\n' +
      'Feed ini ditulis ulang otomatis setiap hari dari tab Produk. ' +
      (FEED_STOK_MANUAL
        ? 'Kolom availability yang kamu ubah sendiri di sheet ini TIDAK ditimpa. '
          + 'Pakai menu "Samakan stok feed dengan tab Produk" kalau mau dikembalikan.'
        : 'Kolom availability selalu mengikuti angka stok di tab Produk.') +
      (dasarWebsite() ? '' : '\n\nPERINGATAN: URL_WEBSITE di tab Pengaturan masih kosong, ' +
        'jadi feed sengaja dikosongkan. Tanpa itu setiap produk lahir tanpa halaman ' +
        'tujuan dan Google menolak seluruh feed. Isi dulu, lalu jalankan menu ini lagi.') +
      (baris.length ? '' : '\n\nTidak ada produk yang lolos syarat. ' +
        'Periksa kolom harga dan kolom gambar.'));
  }
  return baris.length;
}

function menuBangunFeed() { bangunFeedSheet(false); }

/**
 * Membuang semua suntingan availability manual dan menyamakan ulang feed
 * dengan angka stok di tab Produk. Satu-satunya jalan menimpa nilai manual.
 */
function menuFeedSamakanStok() {
  const ui = SpreadsheetApp.getUi();
  const j = ui.alert('Samakan stok feed dengan tab Produk?',
    'Semua nilai availability yang kamu tulis sendiri di sheet feed akan ditimpa ' +
    'oleh angka stok di tab Produk. Tidak bisa dibatalkan.', ui.ButtonSet.OK_CANCEL);
  if (j !== ui.Button.OK) return;
  bangunFeedSheet(false, true);
}

/**
 * Menyusun sitemap.xml dari katalog yang sedang ada.
 *
 * Katalog hidup di spreadsheet, jadi sitemap statis akan selalu ketinggalan.
 * Menu ini mengeluarkan isi yang siap ditempel ke berkas sitemap.xml di repo,
 * berisi satu entri per produk yang benar-benar punya halaman tujuan.
 */
function menuSitemap() {
  const dasar = dasarWebsite();
  if (!dasar) {
    return SpreadsheetApp.getUi().alert('URL_WEBSITE di tab Pengaturan masih kosong.');
  }

  const baris = barisFeed();
  const hariIni = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    '  <url>\n    <loc>' + dasar + '/</loc>\n' +
    '    <lastmod>' + hariIni + '</lastmod>\n' +
    '    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n';

  baris.forEach(function (b) {
    // Fragmen #koleksi dibuang di sitemap: Google mengabaikannya, dan URL yang
    // sama tanpa fragmen tetap membuka halaman detail produknya.
    xml += '  <url>\n    <loc>' + xmlAman(String(b.link).replace(/#.*$/, '')) + '</loc>\n' +
      '    <lastmod>' + hariIni + '</lastmod>\n' +
      '    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n';
  });
  xml += '</urlset>';

  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui;padding:14px">' +
    '<p style="margin:0 0 10px;font-size:13px;color:#333">' +
    '<b>' + baris.length + ' produk</b> masuk sitemap. Klik <b>Pilih semua</b>, tekan Ctrl+C, ' +
    'lalu timpa seluruh isi berkas <b>sitemap.xml</b> di repo GitHub.</p>' +
    '<button id="pilih" style="margin-bottom:8px;padding:7px 14px;border:1px solid #bbb;' +
    'background:#f6f6f6;border-radius:6px;cursor:pointer;font-size:13px">Pilih semua</button>' +
    '<textarea id="isi" readonly style="width:100%;height:320px;font-family:monospace;font-size:11px;' +
    'border:1px solid #ccc;border-radius:6px;padding:8px"></textarea>' +
    // Isi ditaruh lewat JavaScript, BUKAN sebagai teks HTML. Menempelkannya
    // langsung ke markup membuat karakter < dan & lolos dua kali, sehingga yang
    // tersalin bukan XML yang sah.
    '<script>' +
    'var t=document.getElementById("isi");' +
    't.value=' + JSON.stringify(xml) + ';' +
    'document.getElementById("pilih").onclick=function(){t.focus();t.select();};' +
    '<\/script></div>')
    .setWidth(640).setHeight(460);
  SpreadsheetApp.getUi().showModalDialog(html, 'Isi sitemap.xml');
}

/**
 * Feed produk XML untuk Google Merchant Center.
 *
 * Google menarik alamat ini sesuai jadwal, jadi tab Produk tetap satu-satunya
 * tempat kamu mengurus katalog — tidak ada unggahan manual lagi.
 *
 * Yang diikutkan: produk berharga > 0 yang punya nama. Produk custom/pre-order
 * dilewati kecuali MERCHANT_IKUT_PREORDER = ya, karena Google menuntut harga
 * pasti dan barang yang benar-benar bisa dikirim.
 */
function feedMerchant() {
  const dasar = dasarWebsite();
  // Feed XML dan feed spreadsheet harus menyebut ketersediaan yang sama,
  // kalau tidak Merchant Center melihat dua nilai bertentangan untuk satu id.
  const manual = FEED_STOK_MANUAL ? availManualSheet() : {};
  const item = barisFeed().map(function (b) {
    if (manual[b.id]) b.availability = manual[b.id];
    return '<item>' +
      '<g:id>' + xmlAman(b.id) + '</g:id>' +
      '<g:title>' + xmlAman(b.title) + '</g:title>' +
      '<g:description>' + xmlAman(b.description) + '</g:description>' +
      '<g:link>' + xmlAman(b.link) + '</g:link>' +      '<g:image_link>' + xmlAman(b.image_link) + '</g:image_link>' +
      '<g:availability>' + b.availability + '</g:availability>' +
      '<g:price>' + xmlAman(b.price) + '</g:price>' +
      '<g:condition>new</g:condition>' +
      (b.brand ? '<g:brand>' + xmlAman(b.brand) + '</g:brand>' : '') +
      '<g:identifier_exists>no</g:identifier_exists>' +
      (b.google_product_category ? '<g:google_product_category>' + xmlAman(b.google_product_category) + '</g:google_product_category>' : '') +
      (b.product_type ? '<g:product_type>' + xmlAman(b.product_type) + '</g:product_type>' : '') +
      '</item>';
  });

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>' +
    '<title>' + xmlAman(NAMA_TOKO) + '</title>' +
    '<link>' + xmlAman(dasar) + '</link>' +
    '<description>' + xmlAman('Katalog produk ' + NAMA_TOKO) + '</description>' +
    item.join('') +
    '</channel></rss>';

  return ContentService.createTextOutput(xml).setMimeType(ContentService.MimeType.XML);
}

/** Menu: tampilkan alamat feed yang harus dimasukkan ke Merchant Center. */
function tampilkanUrlFeed() {
  const ui = SpreadsheetApp.getUi();
  let dasar = '';
  try { dasar = ScriptApp.getService().getUrl() || ''; } catch (err) {}

  if (!dasar) {
    return ui.alert('Alamat feed belum bisa dibaca.\n\n' +
      'Deploy dulu script ini sebagai Web app (Deploy \u2192 New deployment \u2192 Web app, ' +
      'akses "Anyone"), lalu jalankan menu ini lagi.');
  }

  const url = dasar + '?action=feed';
  const jml = (function () {
    try {
      const isi = feedMerchant().getContent();
      return (isi.match(/<item>/g) || []).length;
    } catch (err) { return -1; }
  })();

  ui.alert(
    'ALAMAT FEED GOOGLE MERCHANT CENTER\n\n' + url + '\n\n' +
    (jml >= 0 ? 'Produk yang masuk feed sekarang: ' + jml + '\n\n' : '') +
    'Cara pakai:\n' +
    '1. Merchant Center \u2192 Produk \u2192 Feed \u2192 Tambahkan feed.\n' +
    '2. Pilih "Tambahkan produk dari file", lalu "Fetch terjadwal".\n' +
    '3. Tempel alamat di atas, atur jadwal harian.\n\n' +
    'Syarat: URL_WEBSITE di tab Pengaturan sudah terisi, dan kolom gambar ' +
    'produk berisi alamat http(s) yang bisa dibuka publik.');
}

/* ---------- 4. MENU DI SPREADSHEET ---------- */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(NAMA_TOKO)
    .addItem('Setup / rapikan semua tab', 'setupSheet')
    .addItem('Tulis deskripsi produk yang kosong', 'tulisDeskripsiKosong')
    .addItem('Tulis ulang SEMUA deskripsi…', 'tulisDeskripsiSemua')
    .addSeparator()
    .addItem('Status & biaya pratinjau AI', 'statusAi')
    .addSeparator()
    .addItem('Kirim permintaan ulasan sekarang', 'mintaReviewSekarang')
    .addItem('Aktifkan pengingat ulasan otomatis', 'aktifkanPengingatReview')
    .addSeparator()
    .addItem('Pengaturan toko & API…', 'bukaPengaturan')
    .addSeparator()
    .addItem('Perbarui database pelanggan', 'bangunPelanggan')
    .addItem('Ambil kontak untuk broadcast…', 'ambilKontakSegmen')
    .addItem('Ringkasan statistik 30 hari', 'ringkasanStatistik')
    .addItem('Periksa & lepas stok pesanan batal', 'lepasTahanKedaluwarsa')
    .addItem('Kirim pengingat pembayaran sekarang', 'menuPengingatBayar')
    .addItem('Cek pengirim email', 'cekPengirimEmail')
    .addSeparator()
    .addItem('Ubah status / input resi pesanan…', 'promptUbahStatus')
    .addItem('Cari kode kota asal (ongkir)…', 'cariKodeAsal')
    .addSeparator()
    .addItem('Alamat feed Google Merchant…', 'tampilkanUrlFeed')
    .addItem('Bangun feed Google Merchant (spreadsheet)…', 'menuBangunFeed')
    .addItem('Samakan stok feed dengan tab Produk…', 'menuFeedSamakanStok')
    .addItem('Buat isi sitemap.xml…', 'menuSitemap')
    .addSeparator()
    .addItem('Periksa koneksi Mayar', 'cekMayar')
    .addItem('▶ Tes alur lengkap (aman)', 'tesAlurLengkap')
    .addItem('Hapus semua data tes', 'menuHapusDataTes')
    .addSeparator()
    .addItem('Isi ulang stok produk…', 'promptTambahStok')
    .addItem('Kurangi stok manual…', 'promptKurangiStok')
    .addToUi();
}

function setupSheet() {
  const ss = book();
  ss.setSpreadsheetTimeZone(ZONA);

  // Produk
  const p = ss.getSheetByName(T_PRODUK) || ss.insertSheet(T_PRODUK);
  const headProduk = ['kategori', 'nama', 'deskripsi', 'harga', 'stok', 'gambar', 'custom', 'link_bayar', 'feed'];
  p.getRange(1, 1, 1, headProduk.length).setValues([headProduk])
    .setFontWeight('bold').setBackground('#F6E3DE');
  p.setFrozenRows(1);
  const vCustom = SpreadsheetApp.newDataValidation()
    .requireValueInList(['ya', 'tidak'], true).setAllowInvalid(false).build();
  p.getRange(2, 7, 500, 1).setDataValidation(vCustom);
  p.getRange(2, 9, 500, 1).setDataValidation(vCustom);
  p.getRange(2, 4, 500, 1).setNumberFormat('#,##0');
  p.getRange(2, 5, 500, 1).setNumberFormat('0');

  setupPengaturan();
  sheetPelanggan();
  sheetStat();

  // pemicu harian: lepas stok pesanan yang tidak dibayar
  try { pastikanPemicu(); } catch (err) {}
  adminRead({ tab: T_GALERI });
  adminRead({ tab: T_SOSMED });

  // Pesanan
  const o = ss.getSheetByName(T_PESANAN) || ss.insertSheet(T_PESANAN);
  const headPesanan = ['waktu', 'order_id', 'nama', 'no_hp', 'email', 'produk', 'total', 'channel', 'status', 'detail_qty', 'link_tagihan', 'transaksi_id', 'review_diminta', 'alamat', 'ongkir', 'kurir', 'resi', 'riwayat_status', 'pengingat_bayar', 'batas_bayar'];
  o.getRange(1, 1, 1, headPesanan.length).setValues([headPesanan])
    .setFontWeight('bold').setBackground('#E4F0E6');
  o.setFrozenRows(1);
  o.getRange(2, 7, 1000, 1).setNumberFormat('#,##0');

  // LogStok
  const l = ss.getSheetByName(T_LOG) || ss.insertSheet(T_LOG);
  const headLog = ['waktu', 'produk', 'perubahan', 'stok_lama', 'stok_baru', 'keterangan'];
  l.getRange(1, 1, 1, headLog.length).setValues([headLog])
    .setFontWeight('bold').setBackground('#FCEFD8');
  l.setFrozenRows(1);

  // Review
  const r = ss.getSheetByName(T_REVIEW) || ss.insertSheet(T_REVIEW);
  const headReview = ['waktu', 'order_id', 'nama', 'rating', 'ulasan', 'produk', 'tampil'];
  r.getRange(1, 1, 1, headReview.length).setValues([headReview])
    .setFontWeight('bold').setBackground('#EFE0F0');
  r.setFrozenRows(1);
  r.getRange(2, 7, 500, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['ya', 'tunggu', 'tidak'], true).setAllowInvalid(false).build()
  );
  r.setColumnWidth(5, 420);

  SpreadsheetApp.getUi().alert('Selesai. Tab Produk, Pesanan, LogStok, dan Review sudah siap.\n\n' +
    'Untuk menampilkan ulasan di website: buka tab Review, copy URL-nya (sudah termasuk gid tab ini), lalu tempel ke kolom "Review Sheet URL" di panel Tweaks website.');
}

/**
 * Pemeriksaan menempel: dijalankan diam-diam saat website dipakai
 * (pesanan masuk, halaman lacak dibuka, statistik dikirim), paling sering
 * sekali per 10 menit. Ini membuat pelepasan stok TIDAK bergantung pada pemicu.
 */
function periksaSambilJalan() {
  const cache = CacheService.getScriptCache();
  if (cache.get('periksa_jalan')) return;
  cache.put('periksa_jalan', '1', 600);

  // ScriptApp.getProjectTriggers() itu mahal, jadi tidak ikut setiap sepuluh
  // menit — cukup sekali sehari. Pemicu hanya hilang saat deploy ulang.
  if (!cache.get('pemicu_cek')) {
    cache.put('pemicu_cek', '1', 21600);
    try { pastikanPemicu(); } catch (err) {}
  }
  try { lepasTahanKedaluwarsa(true); } catch (err) {}
  try { kirimPengingatBayar(true); } catch (err) {}
}

/**
 * Memastikan pemicu per jam ada. Aman dipanggil berulang: kalau sudah ada,
 * tidak membuat pemicu kedua.
 */
function pastikanPemicu() {
  const ada = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'tugasHarianStok';
  });
  if (!ada) ScriptApp.newTrigger('tugasHarianStok').timeBased().everyHours(1).create();
  return !ada;
}

/** Dipanggil pemicu otomatis tiap jam. */
function tugasHarianStok() {
  try { bangunFeedSheet(true); } catch (err) {}
  try { kirimPengingatBayar(true); } catch (err) {}
  try { lepasTahanKedaluwarsa(true); } catch (err) {}
}

/**
 * Email pengingat untuk pesanan yang belum dibayar — pengganti email
 * "Selesaikan Pembayaran Anda" dari penyedia pembayaran.
 * Dikirim SEKALI per pesanan (ditandai di kolom pengingat_bayar).
 */
function kirimPengingatBayar(diam) {
  const sh = sheet(T_PESANAN);
  const rows = sh.getDataRange().getValues();
  const terkirim = [];

  if (JAM_PENGINGAT_BAYAR > 0) {
    const batas = Date.now() - JAM_PENGINGAT_BAYAR * 36e5;
    const kadaluwarsa = Date.now() - JAM_TAHAN_STOK * 36e5;

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][8] || '').toUpperCase() !== 'MENUNGGU BAYAR') continue;
      if (String(rows[i][18] || '').trim()) continue;            // sudah diingatkan
      const t = waktuKe(rows[i][0]);
      if (!t || t > batas) continue;                              // belum waktunya
      if (t < kadaluwarsa) continue;                              // sudah lewat batas, tidak perlu
      const email = String(rows[i][4] || '').trim();
      const link = String(rows[i][10] || '').trim();
      if (!email || email.indexOf('@') === -1) continue;

      const orderId = String(rows[i][1] || '');

      // Pengaman 1: baca ulang status TEPAT sebelum kirim. Kalau webhook
      // pembayaran masuk saat pemeriksaan berjalan, barisnya sudah berubah.
      SpreadsheetApp.flush();
      if (String(sh.getRange(i + 1, 9).getValue()).toUpperCase() !== 'MENUNGGU BAYAR') continue;

      // Pengaman 2: tanya langsung ke Mayar. Kalau ternyata sudah lunas,
      // pengingat dibatalkan dan pembayarannya diproses sekarang.
      const trx = String(rows[i][11] || '').trim();
      if (trx) {
        const lunas = konfirmasiKeMayar(trx);
        if (lunas === true) {
          try { handlePayment({ event: 'payment.received', id: trx, orderId: orderId }); } catch (err) {}
          sh.getRange(i + 1, 19).setValue('dilewati, sudah lunas');
          continue;
        }
      }

      const batasB = batasBayarBaris(rows[i]) || (t + JAM_TAHAN_STOK * 36e5);
      const sisaJam = Math.max(1, Math.round((batasB - Date.now()) / 36e5));

      kirimEmailPembeli(email,
        'Pesanan ' + orderId + ' menunggu pembayaran — ' + NAMA_TOKO,
        'Hai ' + (rows[i][2] || 'Kak') + ',\n\n' +
        'Pesananmu masih kami simpan, tapi pembayarannya belum kami terima. Barangnya kami tahan dulu supaya tidak diambil pembeli lain.\n\n' +
        '= Pesanan yang menunggu =\n' +
        'No. Pesanan : ' + orderId + '\n' +
        'Produk : ' + (rows[i][5] || '-') + '\n' +
        'Total bayar : Rp' + Number(String(rows[i][6]).replace(/[^0-9]/g, '') || 0).toLocaleString('id-ID') + '\n' +
        'Dipesan : ' + rows[i][0] + '\n\n' +
        'Mohon diselesaikan dalam ' + sisaJam + ' jam ke depan. Setelah itu barangnya kami lepas kembali ke stok.\n\n' +
        (link ? '[[Selesaikan Pembayaran]] ' + link + '\n\n' : '') +
        (linkLacak(orderId) ? '[[-Lihat Status Pesanan]] ' + linkLacak(orderId) + '\n\n' : '') +
        'Sudah membayar tapi email ini tetap masuk? Balas email ini atau chat WhatsApp kami, akan kami periksa manual.\n\n' +
        'Ada kendala saat membayar? Kami siap bantu.\n\n' +
        'Salam hangat,\n' + NAMA_TOKO);

      sh.getRange(i + 1, 19).setValue(waktuWib());
      terkirim.push(orderId);
    }
  }

  if (!diam) {
    SpreadsheetApp.getUi().alert(terkirim.length
      ? 'Pengingat pembayaran dikirim ke ' + terkirim.length + ' pesanan:\n' + terkirim.join('\n')
      : JAM_PENGINGAT_BAYAR > 0
        ? 'Tidak ada pesanan yang perlu diingatkan sekarang.\n\n' +
          'Pengingat dikirim untuk pesanan berstatus MENUNGGU BAYAR yang usianya lewat ' +
          JAM_PENGINGAT_BAYAR + ' jam dan belum pernah diingatkan.'
        : 'JAM_PENGINGAT_BAYAR = 0, pengingat dimatikan.');
  }
  return terkirim.length;
}

function promptTambahStok() { promptStok(1); }
function promptKurangiStok() { promptStok(-1); }

function promptStok(arah) {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('Nama produk (harus sama persis dengan tab Produk)');
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const b = ui.prompt('Jumlah (angka positif)');
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const jml = Math.abs(parseInt(b.getResponseText(), 10) || 0);
  if (!jml) return ui.alert('Jumlah tidak valid.');
  ui.alert(ubahStok(a.getResponseText(), arah * jml, arah > 0 ? 'Isi ulang manual' : 'Koreksi manual'));
}

/* ---------- TES MANUAL (jalankan dari editor Apps Script) ---------- */

/**
 * Pilih fungsi "tesKoneksi" di dropdown Apps Script lalu klik Run.
 * Kalau berhasil: muncul 1 baris pesanan contoh di tab Pesanan.
 */
function tesKoneksi() {
  const hasil = handleOrder({
    type: 'order',
    orderId: 'CBM-TEST' + Date.now().toString(36).toUpperCase(),
    channel: 'Tes manual',
    total: 50000,
    buyer: { name: 'Tes Pembeli', phone: '081200000000', email: 'tes@contoh.com' },
    items: [{ name: 'Produk Tes', kategori: 'Tes', qty: 1, price: 50000, status: 'Ready', isCustom: false, opts: '' }]
  });
  Logger.log(hasil.getContent());
}

/**
 * Tes pembuatan tagihan gabungan (butuh MAYAR_API_KEY read & write).
 * Pilih "tesTagihan" di dropdown -> Run -> lihat Execution log.
 * Berhasil kalau muncul {"ok":true,"link":"https://....mayar.shop/invoices/..."}
 */
function tesTagihan() {
  const hasil = handleInvoice({
    type: 'invoice',
    orderId: 'CBM-INV' + Date.now().toString(36).toUpperCase(),
    channel: 'Tes tagihan',
    total: 135000,
    buyer: { name: 'Tes Pembeli', phone: '081200000000', email: 'tes@contoh.com' },
    items: [
      { name: 'Boneka A', kategori: 'Tes', qty: 1, price: 85000, status: 'Ready', isCustom: false, opts: '' },
      { name: 'Gantungan B', kategori: 'Tes', qty: 1, price: 50000, status: 'Ready', isCustom: false, opts: '' }
    ]
  });
  Logger.log(hasil.getContent());
}

/* ---------- UTIL ---------- */

var _book = null;
function book() {
  // SpreadsheetApp.openById() adalah panggilan layanan yang mahal (~100-300 ms).
  // Tanpa penyimpanan ini, satu permintaan panel admin bisa memanggilnya puluhan
  // kali karena setiap sheet() memanggil book() lagi.
  if (_book) return _book;
  if (SPREADSHEET_ID) { _book = SpreadsheetApp.openById(SPREADSHEET_ID); return _book; }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Spreadsheet tidak ditemukan. Isi SPREADSHEET_ID di baris atas script.');
  _book = ss;
  return _book;
}

/* ---------- TAB PENGATURAN ---------- */

const DAFTAR_SETTING = [
  ['— TOKO —', '', ''],
  ['NAMA_TOKO', 'Crochet by Machel', 'Nama toko, dipakai di email & pesan'],
  ['EMAIL_OWNER', '', 'Penerima notifikasi pesanan. Boleh beberapa, pisahkan dengan koma'],
  ['EMAIL_BALASAN', '', 'Alamat balasan yang dilihat pembeli. Kosong = pakai email pertama di atas'],
  ['EMAIL_PENGIRIM', '', 'Alamat pengirim yang dilihat pembeli. WAJIB sudah didaftarkan "Send mail as" di Gmail pemilik script'],
  ['NOMOR_WA', '6281285006165', 'Format 62… — dipakai asisten chat saat pelanggan minta kontak'],
  ['INSTAGRAM', 'machel.crochet', 'Tanpa tanda @'],
  ['URL_WEBSITE', '', 'Alamat websitemu, mis. https://crochetbymachel.com'],

  ['— PEMBAYARAN —', '', ''],
  ['MAYAR_API_KEY', '', 'Mayar → Integrasi → API Key (pilih READ & WRITE)'],

  ['— ONGKOS KIRIM —', '', ''],
  ['RAJAONGKIR_API_KEY', '', 'Kosongkan kalau mau ongkir flat saja'],
  ['ONGKIR_ASAL_ID', '', 'Kode kota asal — cari lewat menu "Cari kode kota asal"'],
  ['ONGKIR_KURIR', 'jne:sicepat:jnt:anteraja:pos', 'Kurir yang dicek, dipisah titik dua'],
  ['ONGKIR_FLAT', '25000', 'Tarif flat kalau API kurir tidak dipakai/gagal'],
  ['ONGKIR_GRATIS_MIN', '0', 'Gratis ongkir di atas nominal ini. 0 = tidak ada'],
  ['BERAT_PER_ITEM', '250', 'Berat per boneka dalam gram'],
  ['BINDERBYTE_API_KEY', '', 'Opsional — status kurir tampil di halaman Lacak Pesanan'],

  ['— ASISTEN AI —', '', ''],
  ['AI_TEKS_AKTIF', 'ya', 'Asisten chat & penulis deskripsi (GRATIS). ya / tidak'],
  ['GEMINI_API_KEY', '', 'aistudio.google.com/apikey'],
  ['GEMINI_TEXT_MODEL', 'gemini-3.1-flash-lite', 'Model teks; ganti kalau ditolak'],
  ['CHAT_MAX_PER_HARI', '300', 'Batas pesan chat per hari'],
  ['CHAT_MAX_PER_TAMU', '25', 'Batas pesan chat per pengunjung per hari'],
  ['AI_GAMBAR_AKTIF', 'tidak', 'Pratinjau gambar AI — BERBAYAR. ya / tidak'],
  ['GEMINI_MODEL', 'gemini-3.1-flash-image-preview', 'Model gambar'],
  ['AI_MAX_PER_HARI', '25', 'Batas gambar per hari (pagar biaya)'],
  ['AI_MAX_PER_TAMU', '3', 'Batas gambar per pengunjung per hari'],

  ['— KEAMANAN —', '', ''],
  ['ADMIN_PIN', '', 'PIN untuk membuka panel admin. Isi angka/huruf bebas, min. 6 karakter'],
  ['WEBHOOK_TOKEN', '', 'Kata sandi rahasia untuk webhook Mayar. Isi bebas, lalu tambahkan ?token=ISI di URL webhook Mayar'],
  ['EMAIL_KE_MAYAR', 'toko', 'toko = pembeli hanya dapat email dari kita. pembeli = pembeli juga dapat email Mayar'],
  ['MAKS_PESANAN_PER_TAMU', '12', 'Batas pesanan per orang per hari (penahan spam)'],

  ['MERCHANT_SHEET_ID', '', 'Terisi otomatis oleh menu "Bangun feed Google Merchant". Jangan diubah manual'],
  ['MERCHANT_BRAND', '', 'Merek yang dikirim ke Google Merchant Center. Kosong = pakai NAMA_TOKO'],
  ['MERCHANT_KATEGORI', '1259', 'ID kategori Google. 1259 = Stuffed Animals (boneka). Pakai ANGKA dari taksonomi resmi, bukan teks'],
  ['MERCHANT_IKUT_PREORDER', 'tidak', 'Ikutkan produk custom/pre-order ke feed Google? ya / tidak'],
  ['FEED_STOK_MANUAL', 'ya', 'Pertahankan kolom availability yang kamu sunting sendiri di sheet feed saat feed ditulis ulang? ya / tidak'],

  ['— STOK & STATISTIK —', '', ''],
  ['STOK_OTOMATIS', 'tidak', 'Biarkan sistem mengurangi & mengembalikan angka stok di tab Produk? tidak = stok sepenuhnya kamu yang atur, pesanan hanya dicatat di LogStok'],
  ['JAM_BATAS_BAYAR', '24', 'Batas waktu pembayaran (jam). Dikirim ke Mayar sebagai masa berlaku tagihan; setelah lewat, pesanan jadi KEDALUWARSA & stok dilepas'],
  ['JAM_TAHAN_STOK', '24', 'Stok ditahan sekian jam untuk pesanan belum dibayar, lalu dilepas otomatis'],
  ['JAM_PENGINGAT_BAYAR', '6', 'Kirim email pengingat pembayaran sekian jam setelah pesanan dibuat. 0 = tidak mengingatkan'],
  ['STATISTIK_AKTIF', 'ya', 'Catat kunjungan & produk yang dilihat ke tab Statistik. ya / tidak'],

  ['— LAIN-LAIN —', '', ''],
  ['HARI_MINTA_REVIEW', '7', 'Kirim permintaan ulasan sekian hari setelah lunas'],
  ['HARI_TIDUR', '90', 'Pelanggan dianggap "tidur" setelah sekian hari tidak belanja']
];

/**
 * Membuat tab Pengaturan kalau belum ada, dan menambahkan kunci baru
 * tanpa menimpa nilai yang sudah kamu isi.
 */
function setupPengaturan() {
  const sh = sheet(T_SETTING);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 3).setValues([['kunci', 'nilai', 'keterangan']])
      .setFontWeight('bold').setBackground('#E4EDF6');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 200); sh.setColumnWidth(2, 300); sh.setColumnWidth(3, 420);
  }

  const ada = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
      .forEach(function (r) { if (r[0]) ada[String(r[0]).trim()] = true; });
  }

  const baru = DAFTAR_SETTING.filter(function (d) { return !ada[d[0]]; });
  if (baru.length) {
    sh.getRange(sh.getLastRow() + 1, 1, baru.length, 3).setValues(baru);
    // baris judul dibuat menonjol
    for (let i = 0; i < baru.length; i++) {
      if (baru[i][0].indexOf('—') === 0) {
        sh.getRange(sh.getLastRow() - baru.length + 1 + i, 1, 1, 3)
          .setFontWeight('bold').setBackground('#F3F0E8');
      }
    }
  }
  return baru.length;
}

/** Menu: buka tab Pengaturan & tampilkan apa yang masih kosong. */
function bukaPengaturan() {
  const tambah = setupPengaturan();
  const sh = sheet(T_SETTING);
  sh.activate();

  const rows = sh.getDataRange().getValues();
  const kosong = [];
  const wajib = { EMAIL_OWNER: 'notifikasi pesanan', URL_WEBSITE: 'link di email pelanggan', MAYAR_API_KEY: 'pembayaran otomatis' };
  for (let i = 1; i < rows.length; i++) {
    const k = String(rows[i][0] || '').trim();
    if (wajib[k] && String(rows[i][1] || '').trim() === '') kosong.push('• ' + k + ' — ' + wajib[k]);
  }

  SpreadsheetApp.getUi().alert(
    'Tab Pengaturan siap.' + (tambah ? '\n\n' + tambah + ' pengaturan baru ditambahkan.' : '') +
    (kosong.length ? '\n\nMasih kosong:\n' + kosong.join('\n') : '\n\nSemua pengaturan penting sudah terisi.') +
    '\n\nIsi kolom "nilai" saja. Setelah mengubah, tidak perlu deploy ulang — cukup tunggu beberapa detik.'
  );
}

var _sheetCache = {};
function sheet(nama) {
  // getSheetByName() juga panggilan layanan. Objeknya tetap hidup selama satu
  // eksekusi, jadi aman disimpan dan menghemat banyak perjalanan bolak-balik.
  if (_sheetCache[nama]) return _sheetCache[nama];
  const ss = book();
  _sheetCache[nama] = ss.getSheetByName(nama) || ss.insertSheet(nama);
  return _sheetCache[nama];
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Link lacak untuk satu pesanan tertentu.
 * Menghasilkan mis. https://user.github.io/toko/?pesanan=CBM-XXX#lacak
 * (tanda ? harus di depan #, kalau tidak halaman tidak membacanya).
 */
function linkLacak(orderId) {
  const dasar = String(URL_WEBSITE || '').trim().replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '');
  if (!dasar) return '';
  if (!orderId) return dasar + '/#lacak';
  return dasar + '/?pesanan=' + encodeURIComponent(orderId) + '#lacak';
}

/**
 * Alamat email yang dikirim ke Mayar saat membuat tagihan.
 * Mode 'toko' membuat email tagihan Mayar masuk ke kotak masuk toko,
 * sehingga pembeli hanya menerima satu email — email kita sendiri.
 */
function emailUntukMayar(emailPembeli, orderId) {
  if (String(EMAIL_KE_MAYAR).toLowerCase() === 'pembeli') return String(emailPembeli || '').trim();

  const toko = emailBalasan();
  if (!toko || toko.indexOf('@') < 1) return String(emailPembeli || '').trim();

  // Mayar menyimpan satu profil pelanggan per alamat email, lengkap dengan
  // NAMANYA. Kalau alamat toko dipakai apa adanya, halaman pembayaran akan
  // menampilkan nama dari profil lama itu — bukan nama pembeli sekarang.
  // Karena itu setiap pesanan memakai alias unik (alamat+kode@gmail.com):
  // surat tetap masuk ke kotak masuk toko, tapi Mayar melihatnya sebagai
  // pelanggan baru sehingga nama yang tampil selalu nama pembeli.
  const kode = String(orderId || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 24) ||
    Utilities.formatDate(new Date(), ZONA, 'yyMMddHHmmss');
  const p = toko.split('@');
  return p[0].split('+')[0] + '+' + kode + '@' + p[1];
}

/** Semua alamat admin, dipisah koma/titik koma/spasi. */
function daftarAdmin() {
  return String(EMAIL_OWNER || '').split(/[,;\s]+/)
    .map(function (x) { return x.trim(); })
    .filter(function (x) { return x.indexOf('@') > 0 && x.indexOf('ganti@') !== 0; });
}

/** Alamat yang dipakai pembeli untuk membalas. */
function emailBalasan() {
  const b = String(EMAIL_BALASAN || '').trim();
  if (b.indexOf('@') > 0) return b;
  return daftarAdmin()[0] || '';
}

function kirimEmail(subjek, isi) {
  const admin = daftarAdmin();
  if (!admin.length) return;
  try {
    const dariAdmin = pengirimSah();
    MailApp.sendEmail({
      to: admin[0],
      cc: admin.slice(1).join(','),
      from: dariAdmin || undefined,
      subject: subjek,
      body: isi,
      name: NAMA_TOKO
    });
  } catch (err) {}
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Membungkus pesan teks biasa menjadi email HTML bergaya toko.
 * Aturan penulisan isi (tetap seperti sekarang, tidak perlu diubah):
 *   "Label : nilai"  -> baris tabel rincian
 *   "= Judul ="      -> judul bagian
 *   "[[Label]] https://…" -> tombol dengan label sendiri
 *   baris berisi URL -> tombol (label dari opsi.tombol)
 *   "- item"         -> butir daftar
 */
function htmlEmail(judul, isi, opsi) {
  opsi = opsi || {};
  const C = { coklat: '#3D2C25', terakota: '#A8604F', krem: '#FDF8F3',
    garis: '#EFE0D2', lembut: '#7C6559', kartu: '#FFFFFF' };

  const baris = String(isi || '').split('\n');
  const blok = [];
  let tabel = [], daftar = [];

  function tutupTabel() {
    if (!tabel.length) return;
    blok.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ' +
      'style="border-collapse:separate;border-spacing:0;background:' + C.krem +
      ';border:1px solid ' + C.garis + ';border-radius:14px;margin:6px 0 14px">' +
      tabel.join('') + '</table>');
    tabel = [];
  }
  function tutupDaftar() {
    if (!daftar.length) return;
    blok.push('<ul style="margin:4px 0 14px;padding-left:20px;color:' + C.coklat +
      ';font-size:15px;line-height:1.75">' + daftar.join('') + '</ul>');
    daftar = [];
  }

  baris.forEach(function (b) {
    const t = b.trim();
    if (!t) { tutupTabel(); tutupDaftar(); return; }

    const jd = t.match(/^=\s*(.+?)\s*=$/);
    if (jd) {
      tutupTabel(); tutupDaftar();
      blok.push('<p style="margin:20px 0 8px;font-family:Georgia,serif;font-size:13px;' +
        'letter-spacing:1.6px;text-transform:uppercase;color:' + C.terakota + '">' + esc(jd[1]) + '</p>');
      return;
    }

    // "[[Label]] https://…" -> tombol berlabel sendiri.
    // Awalan "-" pada label membuat tombolnya bergaya garis (sekunder).
    const berlabel = t.match(/^\[\[(.{1,40}?)\]\]\s*(https?:\/\/\S+)$/);
    const url = berlabel ? null : t.match(/^(https?:\/\/\S+)$/);
    if (berlabel || url) {
      tutupTabel(); tutupDaftar();
      let label = berlabel ? berlabel[1] : (opsi.tombol || 'Buka halaman');
      const alamat = berlabel ? berlabel[2] : url[1];
      const sekunder = label.charAt(0) === '-';
      if (sekunder) label = label.slice(1).trim();
      blok.push(sekunder
        ? '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:2px 0 18px">' +
          '<tr><td style="border-radius:999px;border:1.5px solid ' + C.terakota + '">' +
          '<a href="' + esc(alamat) + '" style="display:inline-block;padding:12px 26px;font-family:Georgia,serif;' +
          'font-size:14px;font-weight:bold;color:' + C.terakota + ';text-decoration:none;border-radius:999px">' +
          esc(label) + '</a></td></tr></table>'
        : '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px">' +
          '<tr><td style="border-radius:999px;background:' + C.terakota + '">' +
          '<a href="' + esc(alamat) + '" style="display:inline-block;padding:14px 30px;font-family:Georgia,serif;' +
          'font-size:15px;font-weight:bold;color:#fff;text-decoration:none;border-radius:999px">' +
          esc(label) + '</a></td></tr></table>');
      return;
    }

    const kv = t.match(/^([A-Za-z0-9 _.\/()%-]{2,28}?)\s*:\s*(.+)$/);
    if (kv && !/^https?$/i.test(kv[1])) {
      tutupDaftar();
      const tebal = /total|bayar|lunas/i.test(kv[1]);
      tabel.push('<tr>' +
        '<td style="padding:11px 16px;border-bottom:1px solid ' + C.garis + ';font-size:13px;color:' +
        C.lembut + ';white-space:nowrap;vertical-align:top">' + esc(kv[1]) + '</td>' +
        '<td style="padding:11px 16px;border-bottom:1px solid ' + C.garis + ';font-size:14.5px;' +
        (tebal ? 'font-weight:bold;' : '') + 'color:' + C.coklat + ';text-align:right">' +
        esc(kv[2]) + '</td></tr>');
      return;
    }

    if (/^[-•]\s+/.test(t)) {
      tutupTabel();
      daftar.push('<li style="margin-bottom:5px">' + esc(t.replace(/^[-•]\s+/, '')) + '</li>');
      return;
    }

    tutupTabel(); tutupDaftar();
    blok.push('<p style="margin:0 0 13px;font-size:15px;line-height:1.75;color:' + C.coklat + '">' +
      esc(t).replace(/(https?:\/\/[^\s]+)/g,
        '<a href="$1" style="color:' + C.terakota + '">$1</a>') + '</p>');
  });
  tutupTabel(); tutupDaftar();

  const ig = INSTAGRAM ? '<a href="https://instagram.com/' + esc(INSTAGRAM) +
    '" style="color:#C9AE97;text-decoration:none">@' + esc(INSTAGRAM) + '</a>' : '';
  const wa = NOMOR_WA ? '<a href="https://wa.me/' + esc(NOMOR_WA) +
    '" style="color:#C9AE97;text-decoration:none">WhatsApp</a>' : '';

  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(judul) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#F3E9DF">' +
    '<div style="display:none;max-height:0;overflow:hidden">' + esc(judul) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3E9DF;padding:26px 12px">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:' +
    C.kartu + ';border-radius:22px;overflow:hidden;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">' +

    // kepala
    '<tr><td style="background:' + C.terakota + ';padding:26px 30px">' +
    '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="width:46px;vertical-align:middle">' +
    '<div style="width:44px;height:44px;border-radius:50%;background:#F6E3DE;text-align:center;' +
    'line-height:44px;font-family:Georgia,serif;font-size:20px;font-weight:bold;color:' + C.terakota + '">' +
    esc(String(NAMA_TOKO).trim().slice(0, 1).toUpperCase() || 'C') + '</div></td>' +
    '<td style="padding-left:13px;vertical-align:middle">' +
    '<div style="font-family:Georgia,serif;font-size:18px;font-weight:bold;color:#fff;letter-spacing:.2px">' +
    esc(NAMA_TOKO) + '</div>' +
    '<div style="font-size:12px;color:#F3D9D1;margin-top:2px">Boneka rajut buatan tangan</div>' +
    '</td></tr></table></td></tr>' +

    // isi
    '<tr><td style="padding:28px 30px 8px">' +
    '<h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:22px;line-height:1.35;color:' +
    C.coklat + ';font-weight:normal">' + esc(judul) + '</h1>' +
    blok.join('') + '</td></tr>' +

    // kaki
    '<tr><td style="background:' + C.coklat + ';padding:22px 30px;text-align:center">' +
    '<div style="font-size:12.5px;color:#C9AE97;line-height:1.7">' +
    'Ada yang ingin ditanyakan? Balas email ini' + (wa ? ' atau chat ' + wa : '') + '.</div>' +
    (ig ? '<div style="margin-top:9px;font-size:12.5px;color:#C9AE97">' + ig + '</div>' : '') +
    '<div style="margin-top:13px;font-size:11px;color:#8A7364">© ' + NAMA_TOKO + '</div>' +
    '</td></tr></table></td></tr></table></body></html>';
}

/**
 * Alamat pengirim yang sah untuk akun pemilik script.
 * Apps Script hanya boleh mengirim dari alamat akun itu sendiri atau dari
 * alias yang sudah diverifikasi lewat "Send mail as" di Gmail.
 * Kalau EMAIL_PENGIRIM belum terdaftar, dikembalikan '' supaya email tetap
 * terkirim (dari alamat akun) daripada gagal sama sekali.
 */
function pengirimSah() {
  const mau = String(EMAIL_PENGIRIM || '').trim().toLowerCase();
  if (!mau || mau.indexOf('@') < 1) return '';

  const cache = CacheService.getScriptCache();
  const kunci = 'alias_' + mau;
  const simpan = cache.get(kunci);
  if (simpan !== null) return simpan === '1' ? mau : '';

  let sah = false;
  try {
    if (Session.getActiveUser().getEmail().toLowerCase() === mau) sah = true;
    else sah = GmailApp.getAliases().some(function (a) { return String(a).toLowerCase() === mau; });
  } catch (err) { sah = false; }

  cache.put(kunci, sah ? '1' : '0', 1800);
  return sah ? mau : '';
}

function kirimEmailPembeli(email, subjek, isi, opsi) {
  if (!email || email.indexOf('@') === -1) return;
  const judul = String(subjek).split(' — ')[0].split(' - ')[0].trim() || subjek;
  const dari = pengirimSah();
  const surat = {
    to: email,
    subject: subjek,
    body: isi,
    htmlBody: htmlEmail(judul, isi, opsi),
    name: NAMA_TOKO,
    replyTo: emailBalasan() || undefined
  };
  if (dari) surat.from = dari;

  try {
    if (dari) GmailApp.sendEmail(email, subjek, isi, surat);
    else MailApp.sendEmail(surat);
  } catch (err) {
    try { MailApp.sendEmail({ to: email, subject: subjek, body: isi, name: NAMA_TOKO }); } catch (e2) {}
  }
}
