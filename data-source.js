/* =============================================================================
   data-source.js — SATU-SATUNYA tempat konfigurasi & sumber data
   Dipakai bersama oleh:  Dashboard Penyerapan Anggaran.dc.html  &  Admin Panel.dc.html
   =============================================================================

   LANGKAH SINGKAT (detail lengkap di PANDUAN-INTEGRASI.md):
   1. Deploy Code.gs sebagai Web App  → dapat URL .../exec
   2. Tempel URL itu ke CONFIG.APPSCRIPT_URL di bawah
   3. Ubah CONFIG.MODE dari 'seed' menjadi 'appscript'
   4. Token admin TIDAK ditulis di file ini bila di-hosting publik — admin
      mengetiknya saat login (lihat CONFIG.ADMIN_TOKEN di bawah)
============================================================================= */

export const CONFIG = {
  // 'seed'      = data contoh bawaan (demo/offline, tanpa koneksi)
  // 'appscript' = Google Apps Script Web App (GET + POST) — MODE PRODUKSI
  // 'gviz'      = baca langsung Google Sheets tanpa API key (read-only, sheet publik)
  MODE: 'appscript',

  // MODE 'appscript' ---------------------------------------------------------
  APPSCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyB6--KdSIPuUTWk0Y34AZx0pSKgKjQEjGjLqHNb_yojIVn9pG51s3-gSmV8qcZvBtX/exec',

  // MODE 'gviz' -------------------------------------------------------------
  SPREADSHEET_ID: 'GANTI_DENGAN_SPREADSHEET_ID',

  // Nama tab di spreadsheet (harus sama persis)
  SHEET_ANGGARAN: 'Anggaran',
  SHEET_PENCAIRAN: 'Pencairan',
  SHEET_BUTIR: 'Butir',
  SHEET_RPD: 'RPD',

  // Kontak Tim TU untuk tombol "Hubungi TU" (format internasional tanpa + dan spasi).
  WA_TU: '628123456789',
  WA_TU_NAMA: 'Tim TU Pusdatin KP',

  // Token admin.
  // • MODE 'appscript' → BIARKAN KOSONG ''. Admin mengetik token saat login, token
  //   diverifikasi SERVER (Code.gs), dan nilainya hanya hidup di sessionStorage
  //   tab tersebut — tidak pernah ada di repositori. Ini setelan produksi.
  // • MODE 'seed'/'gviz' (demo tanpa server) → isi di sini, karena tidak ada server
  //   yang bisa memverifikasi. Bila kosong, login admin ditolak sama sekali.
  ADMIN_TOKEN: '',

  // Auto-refresh dashboard (ms). 0 = nonaktif
  REFRESH_MS: 5 * 60 * 1000
};

/* -----------------------------------------------------------------------------
   SHEET 1 — Anggaran & Komponen
   Kolom: ID_Komponen | Tipe | Parent_ID | Nama_Kegiatan | Pagu_Anggaran | Total_Realisasi
   Tipe: 'UTAMA' (Komponen Utama) atau 'SUB' (Subkomponen)
   Sisa_Anggaran & % penyerapan dihitung otomatis (tidak perlu kolom manual).
   Data di bawah = hasil parsing "Laporan Ketersediaan Dana Detail TA 2026",
   Satker 694677 Sekretariat Jenderal, Program WA.7858.
----------------------------------------------------------------------------- */
export const SEED_ANGGARAN = [
  ['051.0A', 'UTAMA', '', 'Pengelolaan Data dan Informasi', 76501000, 8280000],
  ['051.0A-521211', 'SUB', '051.0A', 'Belanja Bahan', 54901000, 6480000],
  ['051.0A-522151', 'SUB', '051.0A', 'Belanja Jasa Profesi', 21600000, 1800000],

  ['051.0B', 'UTAMA', '', 'Pengelolaan Informasi dan Komunikasi', 719780000, 143764000],
  ['051.0B-524111', 'SUB', '051.0B', 'Belanja Perjalanan Dinas Biasa', 694230000, 138324000],
  ['051.0B-524113', 'SUB', '051.0B', 'Belanja Perjalanan Dinas Dalam Kota', 25550000, 5440000],

  ['051.0E', 'UTAMA', '', 'Penyebaran Informasi', 2105000000, 489599999],
  ['051.0E-522191', 'SUB', '051.0E', 'Belanja Jasa Lainnya', 2105000000, 489599999],

  ['051.0H', 'UTAMA', '', 'Sosialisasi / FGD / Konsinyering', 195492000, 0],
  ['051.0H-521211', 'SUB', '051.0H', 'Belanja Bahan', 18000000, 0],
  ['051.0H-524114', 'SUB', '051.0H', 'Belanja Perjalanan Dinas Paket Meeting Dalam Kota', 177492000, 0],

  ['051.0I', 'UTAMA', '', 'Pembangunan dan Pengembangan Aplikasi Kementerian', 9848482000, 0],
  ['051.0I-536111', 'SUB', '051.0I', 'Belanja Modal Lainnya', 9848482000, 0],

  ['051.0J', 'UTAMA', '', 'Tata Kelola Teknologi Informasi dan SPBE', 173128000, 51113000],
  ['051.0J-521211', 'SUB', '051.0J', 'Belanja Bahan', 18225000, 0],
  ['051.0J-522131', 'SUB', '051.0J', 'Belanja Jasa Konsultan', 148143000, 49143000],
  ['051.0J-522151', 'SUB', '051.0J', 'Belanja Jasa Profesi', 5400000, 1800000],
  ['051.0J-524113', 'SUB', '051.0J', 'Belanja Perjalanan Dinas Dalam Kota', 1360000, 170000],

  ['051.0K', 'UTAMA', '', 'Penyusunan Imigrasi dan Pemasyarakatan Dalam Angka', 69660000, 0],
  ['051.0K-521211', 'SUB', '051.0K', 'Belanja Bahan', 69660000, 0],

  ['051.0L', 'UTAMA', '', 'Pengelolaan Statistik Sektoral', 206461000, 9900000],
  ['051.0L-521211', 'SUB', '051.0L', 'Belanja Bahan', 35693000, 8100000],
  ['051.0L-522151', 'SUB', '051.0L', 'Belanja Jasa Profesi', 13500000, 1800000],
  ['051.0L-524113', 'SUB', '051.0L', 'Belanja Perjalanan Dinas Dalam Kota', 3400000, 0],
  ['051.0L-524114', 'SUB', '051.0L', 'Belanja Perjalanan Dinas Paket Meeting Dalam Kota', 153868000, 0],

  ['051.0M', 'UTAMA', '', 'Pengamanan dan Pemeliharaan TI', 7445100000, 7426699993],
  ['051.0M-521211', 'SUB', '051.0M', 'Belanja Bahan', 16200000, 4050000],
  ['051.0M-522141', 'SUB', '051.0M', 'Belanja Sewa', 7420000000, 7419999993],
  ['051.0M-522151', 'SUB', '051.0M', 'Belanja Jasa Profesi', 7200000, 1800000],
  ['051.0M-524113', 'SUB', '051.0M', 'Belanja Perjalanan Dinas Dalam Kota', 1700000, 850000],

  ['051.0N', 'UTAMA', '', 'Pengadaan Lisensi', 408000000, 0],
  ['051.0N-521111', 'SUB', '051.0N', 'Belanja Keperluan Perkantoran', 408000000, 0]
];

/* -----------------------------------------------------------------------------
   SHEET 2 — Data Dukung Pencairan
   Kolom: ID_Pencairan | ID_Komponen | Tanggal_Cair | Nominal_Pencairan | Keterangan | Link_Dokumen_Bukti
   ID_Komponen berelasi ke kolom A Sheet 1.
----------------------------------------------------------------------------- */
const DOC = 'https://drive.google.com/file/d/CONTOH_ID_DOKUMEN/view';
export const SEED_PENCAIRAN = [
  ['PC-0001', '051.0M-522141', '2026-01-30', 3710000000, 'Pembayaran sewa infrastruktur TI tahap I', DOC],
  ['PC-0002', '051.0M-521211', '2026-02-13', 4050000, 'Pengadaan bahan pendukung pemeliharaan', DOC],
  ['PC-0003', '051.0B-524111', '2026-02-20', 45000000, 'Perjalanan dinas monitoring wilayah I', DOC],
  ['PC-0004', '051.0M-522151', '2026-03-05', 1800000, 'Honor narasumber pengamanan siber', DOC],
  ['PC-0005', '051.0A-521211', '2026-03-12', 3240000, 'Bahan rapat penyusunan data statistik', DOC],
  ['PC-0006', '051.0J-524113', '2026-03-27', 170000, 'Transport lokal koordinasi SPBE', DOC],
  ['PC-0007', '051.0A-522151', '2026-04-09', 1800000, 'Honor narasumber pengelolaan data', DOC],
  ['PC-0008', '051.0L-521211', '2026-04-17', 4050000, 'Bahan penyusunan statistik sektoral TW-I', DOC],
  ['PC-0009', '051.0E-522191', '2026-04-22', 149850000, 'Jasa produksi konten publikasi tahap I', DOC],
  ['PC-0010', '051.0J-522151', '2026-05-06', 1800000, 'Honor narasumber tata kelola TI', DOC],
  ['PC-0011', '051.0B-524111', '2026-05-14', 48324000, 'Perjalanan dinas monitoring wilayah II', DOC],
  ['PC-0012', '051.0B-524113', '2026-06-05', 4250000, 'Perjalanan dinas dalam kota TW-II', DOC],
  ['PC-0013', '051.0L-522151', '2026-06-11', 1800000, 'Honor narasumber statistik sektoral', DOC],
  ['PC-0014', '051.0A-521211', '2026-06-18', 3240000, 'Bahan FGD data dan informasi', DOC],
  ['PC-0015', '051.0E-522191', '2026-06-27', 190000000, 'Jasa produksi konten publikasi tahap II', DOC],
  ['PC-0016', '051.0M-522141', '2026-07-02', 3709999993, 'Pembayaran sewa infrastruktur TI tahap II', DOC],
  ['PC-0017', '051.0J-522131', '2026-07-15', 49143000, 'Jasa konsultan audit keamanan informasi', DOC],
  ['PC-0018', '051.0L-521211', '2026-07-21', 4050000, 'Bahan penyusunan statistik sektoral TW-II', DOC],
  ['PC-0019', '051.0B-524111', '2026-07-30', 45000000, 'Perjalanan dinas monitoring wilayah III', DOC],
  ['PC-0020', '051.0M-524113', '2026-08-04', 850000, 'Transport lokal pemeliharaan perangkat', DOC],
  ['PC-0021', '051.0E-522191', '2026-08-08', 149749999, 'Jasa produksi konten publikasi tahap III', DOC],
  ['PC-0022', '051.0B-524113', '2026-08-11', 1190000, 'Perjalanan dinas dalam kota Agustus', DOC]
];

/* ------------------------------- token admin ------------------------------
   MODE 'appscript' (produksi): token SELALU diambil dari sessionStorage — nilai
   yang diketik admin dan sudah diverifikasi server. CONFIG.ADMIN_TOKEN tidak
   pernah dipakai di mode ini, sehingga tidak ada rahasia di dalam repositori.
   MODE demo (seed/gviz): tidak ada server, jadi CONFIG.ADMIN_TOKEN yang dipakai.
-------------------------------------------------------------------------- */
const TOKEN_KEY = 'anggaran_admin_token';
const SESI_KEY = 'anggaran_sesi';

/* --------------------------- Akun & sesi login ---------------------------
   Sesi disimpan di sessionStorage: hilang saat tab ditutup, tidak dibagi
   antar-tab lain, dan tidak pernah menyimpan password.
------------------------------------------------------------------------- */
export function getSesi() {
  try { return JSON.parse(sessionStorage.getItem(SESI_KEY) || 'null'); } catch (e) { return null; }
}
export function setSesi(s) {
  try { sessionStorage.setItem(SESI_KEY, JSON.stringify(s)); } catch (e) {}
}
export function clearSesi() {
  try { sessionStorage.removeItem(SESI_KEY); } catch (e) {}
}
/** Sesi masih berlaku menurut cap waktu di sisi klien. */
export function sesiAktif() {
  const s = getSesi();
  if (!s || !s.token) return false;
  if (s.kedaluwarsa && new Date(s.kedaluwarsa) < new Date()) { clearSesi(); return false; }
  return true;
}

async function postPublik(payload) {
  if (CONFIG.MODE !== 'appscript') {
    await new Promise(r => setTimeout(r, 500));
    return { status: 'ok', simulated: true, token: 'DEMO-' + Date.now(), nama: 'Pengguna Demo',
             peran: 'ADMIN', message: 'Mode demo: verifikasi email dilewati.' };
  }
  const res = await fetch(CONFIG.APPSCRIPT_URL, {
    method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' saat menghubungi server.');
  const j = await res.json();
  if (j.status !== 'ok') throw new Error(j.message || 'Permintaan ditolak server.');
  return j;
}

export function daftarAkun(d) { return postPublik({ action: 'daftar', ...d }); }
export function verifikasiEmail(d) { return postPublik({ action: 'verifikasiEmail', ...d }); }
export async function loginAkun(d) {
  const j = await postPublik({ action: 'login', ...d });
  setSesi({ token: j.token, nama: j.nama, email: j.email || d.email, peran: j.peran, kedaluwarsa: j.kedaluwarsa });
  return j;
}
export async function logoutAkun() {
  const s = getSesi();
  clearSesi();
  if (s && s.token && CONFIG.MODE === 'appscript') {
    try { await postPublik({ action: 'logout', token: s.token }); } catch (e) {}
  }
}
export function getToken() {
  if (CONFIG.MODE !== 'appscript' && CONFIG.ADMIN_TOKEN) return CONFIG.ADMIN_TOKEN;
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
}
export function setToken(v) { try { sessionStorage.setItem(TOKEN_KEY, v); } catch (e) {} }
export function clearToken() { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} }

/* -----------------------------------------------------------------------------
   SHEET 3 — Butir Kegiatan (berkas pertanggungjawaban per subkomponen)
   Kolom: ID_Butir | ID_Komponen | Nama_Butir | Nominal | Tanggal_Terima |
          Status | Catatan | Link_Berkas | Diperbarui | Revisi
   ID_Komponen berelasi ke Sheet 1 (biasanya level SUB).

   Status = 3 TAHAP LINIER: TU → KEUANGAN → SP2D
   Revisi = PENANDA (bukan tahap). Berkas yang dikembalikan untuk diperbaiki
            tetap berada di tahapnya, hanya ditandai 'YA' pada kolom Revisi.
            Jadi tidak setiap berkas harus melewati revisi.
   Format seed: [id, komponen, nama, nominal, tanggal, status, catatan, berkas, revisi]
----------------------------------------------------------------------------- */
export const SEED_BUTIR = [
  ['BK-0001', '051.0M-522141', 'Tagihan sewa infrastruktur TI Juli', 3709999993, '2026-07-01', 'SP2D', 'SP2D terbit 02/07/2026', DOC],
  ['BK-0002', '051.0E-522191', 'Produksi konten publikasi tahap III', 149749999, '2026-08-01', 'SP2D', 'Lengkap', DOC],
  ['BK-0003', '051.0E-522191', 'Produksi konten publikasi tahap IV', 160000000, '2026-08-18', 'KEUANGAN', 'Menunggu verifikasi Tim Keuangan', DOC],
  ['BK-0004', '051.0B-524111', 'SPPD monitoring wilayah IV', 42000000, '2026-08-20', 'TU', 'Berkas diterima dari Tim Kerja', DOC],
  ['BK-0005', '051.0B-524113', 'Transport lokal Agustus', 1190000, '2026-08-11', 'SP2D', '', DOC],
  ['BK-0006', '051.0J-522131', 'Audit keamanan informasi tahap II', 45000000, '2026-08-14', 'KEUANGAN', 'Lampiran SPK belum ditandatangani', DOC, true],
  ['BK-0007', '051.0J-521211', 'Bahan rapat tata kelola TI', 9000000, '2026-08-19', 'TU', 'Kuitansi perlu dicek', DOC],
  ['BK-0008', '051.0L-521211', 'Bahan statistik sektoral TW-III', 4050000, '2026-08-12', 'KEUANGAN', '', DOC],
  ['BK-0009', '051.0L-524114', 'Paket meeting FGD statistik', 76900000, '2026-08-21', 'TU', 'RAB belum sesuai pagu', DOC, true],
  ['BK-0010', '051.0A-521211', 'Bahan FGD data dan informasi', 3240000, '2026-06-16', 'SP2D', '', DOC],
  ['BK-0011', '051.0A-522151', 'Honor narasumber pengelolaan data', 1800000, '2026-04-07', 'SP2D', '', DOC],
  ['BK-0012', '051.0M-521211', 'Bahan pemeliharaan perangkat TW-III', 4050000, '2026-08-06', 'KEUANGAN', '', DOC],
  ['BK-0013', '051.0I-536111', 'Termin I pengembangan aplikasi', 2000000000, '2026-08-25', 'TU', 'BAST menunggu tanda tangan', DOC],
  ['BK-0014', '051.0N-521111', 'Pengadaan lisensi antivirus', 120000000, '2026-08-22', 'TU', 'Berkas baru masuk', DOC]
];

/* -----------------------------------------------------------------------------
   Alur berkas: 3 TAHAP LINIER — setiap berkas pasti melewati ketiganya.
       1 Verifikasi Tim TU Pusdatin KP → 2 Verifikasi Tim Keuangan → 3 SP2D
   REVISI bukan tahap, melainkan PENANDA kondisional: berkas dikembalikan untuk
   diperbaiki tetap berada di tahap saat itu, hanya ditandai revisi.
----------------------------------------------------------------------------- */
export const STATUS_BUTIR = [
  { key: 'TU', urut: 1, label: 'Verifikasi Tim TU Pusdatin KP', pendek: 'Verifikasi TU', color: 'var(--blue)', bg: 'rgba(37,99,201,.12)' },
  { key: 'KEUANGAN', urut: 2, label: 'Verifikasi Tim Keuangan', pendek: 'Verifikasi Keuangan', color: 'var(--navy-3)', bg: 'rgba(27,64,121,.12)' },
  { key: 'SP2D', urut: 3, label: 'SP2D', pendek: 'SP2D', color: 'var(--green)', bg: 'var(--green-bg)' }
];
/** Tampilan penanda revisi (dipakai bila butir.revisi === true). */
export const TANDA_REVISI = { label: 'Perlu revisi', color: 'var(--red)', bg: 'var(--red-bg)' };

export function statusButir(key) {
  const k = String(key || '').toUpperCase();
  // Data lama memakai Status='REVISI' → dipetakan ke tahap TU + penanda revisi.
  if (k === 'REVISI') return STATUS_BUTIR[0];
  return STATUS_BUTIR.find(s => s.key === k) || STATUS_BUTIR[0];
}
/** Data lama: Status='REVISI' otomatis dianggap bertanda revisi. */
export function adaRevisi(b) {
  return b.revisi === true || String(b.status || '').toUpperCase() === 'REVISI';
}

/* -----------------------------------------------------------------------------
   SHEET 4 — RPD (Rencana Penarikan Dana) per Komponen Utama per bulan
   Sumber: "RENCANA PENARIKAN DANA (RDP) PUSDATIN KP TA 2026".
   Kolom sheet: ID_Komponen | Jan | Feb | Mar | Apr | Mei | Jun | Jul | Ags | Sep | Okt | Nov | Des
   Angka RPD adalah RENCANA penarikan; realisasi dibandingkan terhadap RPD
   kumulatif s.d. bulan berjalan untuk melihat on-track / tertinggal.
----------------------------------------------------------------------------- */
export const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
export const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export const SEED_RPD = [
  //  id          Jan Feb Mar Apr Mei Jun        Jul          Ags          Sep          Okt          Nov        Des
  ['051.0A', 0, 0, 0, 0, 0, 0, 0, 28980000, 17550000, 15850000, 14121000, 0],
  ['051.0B', 0, 0, 0, 0, 0, 0, 4250000, 94703800, 215988000, 317380000, 87458200, 0],
  ['051.0E', 0, 0, 0, 0, 0, 0, 149850000, 540000000, 390000000, 390000000, 545150000, 90000000],
  ['051.0H', 0, 0, 0, 0, 0, 0, 0, 0, 195492000, 0, 0, 0],
  ['051.0I', 0, 0, 0, 0, 0, 0, 0, 0, 3939393000, 0, 5909089000, 0],
  ['051.0J', 0, 0, 0, 0, 0, 0, 0, 54993000, 4155000, 9600000, 104380000, 0],
  ['051.0K', 0, 0, 0, 0, 0, 0, 0, 21600000, 10800000, 10800000, 26460000, 0],
  ['051.0L', 0, 0, 0, 0, 0, 0, 0, 15200000, 11650000, 179611000, 0, 0],
  ['051.0M', 0, 0, 0, 0, 0, 0, 0, 7429090000, 10930000, 5080000, 0, 0],
  ['051.0N', 0, 0, 0, 0, 0, 0, 0, 8000000, 0, 0, 400000000, 0]
];

/* ============================ util & normalisasi ========================== */
export const nf = new Intl.NumberFormat('id-ID');
export const fmt = (n) => nf.format(Math.round(Number(n) || 0));
export const rupiah = (n) => 'Rp ' + fmt(n);
export const short = (n) => {
  const a = Math.abs(Number(n) || 0);
  if (a >= 1e12) return 'Rp ' + (n / 1e12).toFixed(2) + ' T';
  if (a >= 1e9) return 'Rp ' + (n / 1e9).toFixed(2) + ' M';
  if (a >= 1e6) return 'Rp ' + (n / 1e6).toFixed(1) + ' Jt';
  return 'Rp ' + fmt(n);
};
export const toNum = (v) => {
  if (typeof v === 'number') return v;
  return Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0;
};
export const tanggalID = (v) => {
  const d = v instanceof Date ? v : new Date(String(v));
  if (isNaN(d)) return String(v || '—');
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Ambang status penyerapan — ubah di sini bila kebijakan instansi berbeda. */
export const AMBANG = { AMAN: 75, WASPADA: 25 };
export function statusOf(pct) {
  if (pct > 100) return { key: 'over', label: 'Over Budget', color: 'var(--red)', bg: 'var(--red-bg)' };
  if (pct >= AMBANG.AMAN) return { key: 'aman', label: 'Aman', color: 'var(--green)', bg: 'var(--green-bg)' };
  if (pct >= AMBANG.WASPADA) return { key: 'waspada', label: 'Waspada', color: 'var(--amber)', bg: 'var(--amber-bg)' };
  return { key: 'kritis', label: 'Kritis', color: 'var(--red)', bg: 'var(--red-bg)' };
}

const rowAnggaran = (r) => ({
  id: String(r[0] ?? '').trim(),
  tipe: String(r[1] ?? 'SUB').trim().toUpperCase().startsWith('U') ? 'UTAMA' : 'SUB',
  parent: String(r[2] ?? '').trim(),
  nama: String(r[3] ?? '').trim(),
  pagu: toNum(r[4]),
  realisasi: toNum(r[5])
});
const rowPencairan = (r) => ({
  id: String(r[0] ?? '').trim(),
  komponenId: String(r[1] ?? '').trim(),
  tanggal: r[2] instanceof Date ? r[2].toISOString().slice(0, 10) : String(r[2] ?? '').slice(0, 10),
  nominal: toNum(r[3]),
  keterangan: String(r[4] ?? '').trim(),
  dokumen: String(r[5] ?? '').trim()
});

const boolID = (v) => v === true || ['ya', 'true', '1', 'y'].indexOf(String(v ?? '').trim().toLowerCase()) >= 0;
/** r[8] = penanda revisi (kolom J pada sheet; index 8 pada array seed). */
const rowButir = (r) => {
  const statusMentah = String(r[5] ?? 'TU').trim().toUpperCase();
  return {
    id: String(r[0] ?? '').trim(),
    komponenId: String(r[1] ?? '').trim(),
    nama: String(r[2] ?? '').trim(),
    nominal: toNum(r[3]),
    tanggal: r[4] instanceof Date ? r[4].toISOString().slice(0, 10) : String(r[4] ?? '').slice(0, 10),
    status: statusMentah === 'REVISI' ? 'TU' : statusMentah,   // migrasi data lama
    catatan: String(r[6] ?? '').trim(),
    berkas: String(r[7] ?? '').trim(),
    revisi: boolID(r[8]) || statusMentah === 'REVISI',
    picNama: String(r[9] ?? '').trim(),
    picNip: String(r[10] ?? '').trim(),
    picWa: normalWa(r[11])
  };
};

/** Rapikan nomor WA ke format internasional tanpa tanda baca (62812...). */
export function normalWa(v) {
  let t = String(v ?? '').replace(/[^0-9+]/g, '').replace(/^\+/, '');
  if (!t) return '';
  if (t.charAt(0) === '0') t = '62' + t.slice(1);
  else if (t.slice(0, 2) !== '62' && t.length <= 12) t = '62' + t;
  return t;
}
/** Bangun tautan wa.me lengkap dengan pesan siap kirim. */
export function linkWa(nomor, pesan) {
  const n = normalWa(nomor);
  if (!n) return '';
  return 'https://wa.me/' + n + (pesan ? '?text=' + encodeURIComponent(pesan) : '');
}

const rowRPD = (r) => {
  const out = { komponenId: String(r[0] ?? '').trim(), bulan: [] };
  for (let i = 0; i < 12; i++) out.bulan.push(toNum(r[i + 1]));
  out.total = out.bulan.reduce((t, v) => t + v, 0);
  return out;
};
const objRPD = (o) => {
  if (Array.isArray(o)) return rowRPD(o);
  const arr = [o.ID_Komponen ?? o.komponenId];
  for (let i = 0; i < 12; i++) arr.push(o.bulan ? o.bulan[i] : o[BULAN[i]]);
  return rowRPD(arr);
};

const objAnggaran = (o) => rowAnggaran([o.ID_Komponen ?? o.id, o.Tipe ?? o.tipe, o.Parent_ID ?? o.parent,
  o.Nama_Kegiatan ?? o.nama, o.Pagu_Anggaran ?? o.pagu, o.Total_Realisasi ?? o.realisasi]);
const objPencairan = (o) => rowPencairan([o.ID_Pencairan ?? o.id, o.ID_Komponen ?? o.komponenId,
  o.Tanggal_Cair ?? o.tanggal, o.Nominal_Pencairan ?? o.nominal, o.Keterangan ?? o.keterangan,
  o.Link_Dokumen_Bukti ?? o.dokumen]);
const objButir = (o) => rowButir([o.ID_Butir ?? o.id, o.ID_Komponen ?? o.komponenId, o.Nama_Butir ?? o.nama,
  o.Nominal ?? o.nominal, o.Tanggal_Terima ?? o.tanggal, o.Status ?? o.status,
  o.Catatan ?? o.catatan, o.Link_Berkas ?? o.berkas, o.Revisi ?? o.revisi,
  o.PIC_Nama ?? o.picNama, o.PIC_NIP ?? o.picNip, o.PIC_WA ?? o.picWa]);

/* ============================== pengambilan data ========================== */

/** GET data dari Apps Script Web App: {anggaran:[...], pencairan:[...]} */
async function getFromAppScript() {
  const res = await fetch(CONFIG.APPSCRIPT_URL + '?action=getAll', { redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' dari Apps Script Web App.');
  const json = await res.json();
  if (json.status === 'error') throw new Error(json.message || 'Apps Script mengembalikan error.');
  const a = json.anggaran || json.data?.anggaran || [];
  const p = json.pencairan || json.data?.pencairan || [];
  const b = json.butir || json.data?.butir || [];
  const rp = json.rpd || json.data?.rpd || [];
  return {
    anggaran: a.map(objAnggaran).filter(r => r.id),
    pencairan: p.map(objPencairan).filter(r => r.id || r.komponenId),
    butir: b.map(objButir).filter(r => r.komponenId),
    rpd: rp.length ? rp.map(objRPD).filter(r => r.komponenId) : SEED_RPD.map(rowRPD),
    source: 'Google Apps Script Web App'
  };
}

/** GET langsung dari Google Sheets via GViz (read-only, sheet harus publik). */
async function getFromGViz() {
  const one = async (sheet) => {
    const url = 'https://docs.google.com/spreadsheets/d/' + CONFIG.SPREADSHEET_ID +
      '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(sheet);
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' saat membaca sheet "' + sheet + '".');
    const t = await res.text();
    const j = JSON.parse(t.substring(t.indexOf('{'), t.lastIndexOf('}') + 1));
    return (j.table.rows || []).map(r => (r.c || []).map(c => (c ? c.f ?? c.v : '')));
  };
  const [a, p, b, rp] = await Promise.all([
    one(CONFIG.SHEET_ANGGARAN), one(CONFIG.SHEET_PENCAIRAN),
    one(CONFIG.SHEET_BUTIR).catch(() => []), one(CONFIG.SHEET_RPD).catch(() => [])
  ]);
  return {
    anggaran: a.map(rowAnggaran).filter(r => r.id),
    pencairan: p.map(rowPencairan).filter(r => r.komponenId),
    butir: b.map(r => rowButir([r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[9], r[10], r[11], r[12]])).filter(r => r.komponenId),
    rpd: rp.length ? rp.map(rowRPD).filter(r => r.komponenId) : SEED_RPD.map(rowRPD),
    source: 'Google Sheets (GViz)'
  };
}

/** Sumber data utama yang dipakai kedua halaman. */
export async function fetchAll() {
  if (CONFIG.MODE === 'appscript') return await getFromAppScript();
  if (CONFIG.MODE === 'gviz') return await getFromGViz();
  return {
    anggaran: SEED_ANGGARAN.map(rowAnggaran),
    pencairan: SEED_PENCAIRAN.map(rowPencairan),
    butir: SEED_BUTIR.map(rowButir),
    rpd: SEED_RPD.map(rowRPD),
    source: 'Data contoh (laporan TA 2026)'
  };
}

/** Data contoh sebagai fallback bila fetch gagal — dashboard tidak pernah kosong. */
export function seedFallback() {
  return {
    anggaran: SEED_ANGGARAN.map(rowAnggaran),
    pencairan: SEED_PENCAIRAN.map(rowPencairan),
    butir: SEED_BUTIR.map(rowButir),
    rpd: SEED_RPD.map(rowRPD),
    source: 'Fallback data contoh'
  };
}

/**
 * Sidik jari token (djb2) — dipakai Admin Panel untuk menandai sesi login.
 * Bila ADMIN_TOKEN diganti, sidik jari berubah sehingga semua sesi lama otomatis
 * gugur dan admin wajib login ulang.
 */
export function tokenFingerprint(token) {
  var h = 5381;
  var s = String(token || '');
  for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return 'fp' + h.toString(36);
}

/** Token demo belum diisi/masih contoh? (hanya relevan di MODE demo) */
export function tokenBelumDiset() {
  if (CONFIG.MODE === 'appscript') return false;
  return !CONFIG.ADMIN_TOKEN || CONFIG.ADMIN_TOKEN === 'GANTI_TOKEN_RAHASIA_ANDA';
}

/**
 * Verifikasi token admin. SELALU dipanggil sebelum panel admin terbuka.
 * MODE 'appscript' → diverifikasi SERVER (Code.gs action=verifyToken), sehingga
 *                    token salah tidak pernah lolos meski kode halaman diubah.
 * MODE lain (demo) → dibandingkan dengan CONFIG.ADMIN_TOKEN; bila CONFIG kosong,
 *                    tidak ada acuan sah → login ditolak.
 */
export async function verifyToken(token) {
  const t = String(token || '').trim();
  if (!t) return false;
  if (CONFIG.MODE !== 'appscript') {
    if (!CONFIG.ADMIN_TOKEN) {
      throw new Error('MODE ' + CONFIG.MODE + ' tanpa server: isi CONFIG.ADMIN_TOKEN di data-source.js terlebih dahulu.');
    }
    return t === CONFIG.ADMIN_TOKEN;
  }
  try {
    const res = await fetch(CONFIG.APPSCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'verifyToken', token: t })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (json.status === 'error' && /action tidak dikenal/i.test(json.message || '')) {
      const err = new Error('Web App belum diperbarui: Code.gs versi lama belum mengenal verifyToken. ' +
        'Tempel ulang Code.gs, lalu Deploy → Manage deployments → Edit → New version → Deploy.');
      err.stale = true;
      throw err;
    }
    return json.status === 'ok' && json.verified === true;
  } catch (e) {
    if (e && e.stale) throw e;
    throw new Error('Tidak dapat memverifikasi token ke server: ' + e.message);
  }
}

/**
 * POST pencairan baru ke Apps Script (dipakai Admin Panel).
 * Catatan teknis: Content-Type dibuat 'text/plain' agar browser TIDAK mengirim
 * preflight OPTIONS — Apps Script tidak menjawab OPTIONS sehingga akan gagal CORS.
 * Body tetap berisi JSON dan di-parse dengan JSON.parse() di Code.gs.
 */
export async function postPencairan(payload) {
  if (CONFIG.MODE === 'seed') {
    await new Promise(r => setTimeout(r, 700));
    return { status: 'ok', simulated: true, id: 'PC-DEMO-' + Date.now().toString().slice(-4) };
  }
  const res = await fetch(CONFIG.APPSCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'addPencairan', token: (getSesi() || {}).token || getToken(), ...payload })
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' saat menyimpan ke Google Sheets.');
  const json = await res.json();
  if (json.status !== 'ok') throw new Error(json.message || 'Penyimpanan ditolak server.');
  return json;
}

/* ------------------------- tulis Butir Kegiatan ---------------------------
   Semua fungsi di bawah memakai pola POST yang sama (text/plain, tanpa preflight).
   ⚡ REAL-TIME: bila ingin push langsung tanpa polling, ganti isi fungsi ini
   dengan pengiriman lewat WebSocket / Firebase / Supabase channel Anda.
-------------------------------------------------------------------------- */
async function postAksi(action, payload, simulasi) {
  if (CONFIG.MODE === 'seed') {
    await new Promise(r => setTimeout(r, 500));
    return { status: 'ok', simulated: true, ...simulasi };
  }
  const res = await fetch(CONFIG.APPSCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token: (getSesi() || {}).token || getToken(), ...payload })
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' saat menghubungi Google Sheets.');
  const json = await res.json();
  if (json.status !== 'ok') throw new Error(json.message || 'Permintaan ditolak server.');
  return json;
}

/** Admin/TU menerima berkas dari Tim Kerja → catat butir kegiatan baru. */
export function addButir(payload) {
  return postAksi('addButir', payload, { id: 'BK-DEMO-' + Date.now().toString().slice(-4) });
}
/** Perbarui tahapan status / isi butir kegiatan. */
export function updateButir(payload) {
  return postAksi('updateButir', payload, { id: payload.ID_Butir });
}
/** Hapus butir kegiatan. */
export function deleteButir(id) {
  return postAksi('deleteButir', { ID_Butir: id }, { id });
}

/** Butir yang sudah SP2D = bukti pencairan (dana sudah dibayarkan). */
export function sudahSP2D(b) {
  return statusButir(b.status).key === 'SP2D';
}

/** Admin: tambah komponen utama / subkomponen baru. */
export function addKomponen(payload) {
  return postAksi('addKomponen', payload, { id: payload.ID_Komponen });
}
/** Admin: hapus komponen (beserta subkomponennya bila komponen utama). */
export function deleteKomponen(id) {
  return postAksi('deleteKomponen', { ID_Komponen: id }, { id });
}
/** Riwayat perubahan (sheet Log) — untuk panel History di Panel Admin. */
export async function fetchLog(limit) {
  if (CONFIG.MODE !== 'appscript') return [];
  const url = CONFIG.APPSCRIPT_URL + '?action=getLog&limit=' + (limit || 40);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  return j.log || [];
}

/** Admin: ubah nama / pagu komponen atau subkomponen (Revisi Pagu). */
export function updateAnggaran(payload) {
  return postAksi('updateAnggaran', payload, { id: payload.ID_Komponen });
}
/** Admin: ubah RPD satu komponen utama (array 12 bulan) — Revisi RPD. */
export function updateRPD(payload) {
  return postAksi('updateRPD', payload, { id: payload.ID_Komponen });
}

/**
 * Susun struktur hierarki + agregasi.
 *
 * REALISASI berasal dari BUTIR KEGIATAN berstatus SP2D — tidak ada input
 * pencairan terpisah. Begitu Admin menetapkan sebuah butir ke tahap SP2D,
 * nominalnya otomatis masuk realisasi komponen tersebut.
 * Kolom Total_Realisasi di Sheet 1 hanya dipakai sebagai cadangan untuk
 * komponen yang belum punya butir sama sekali (data lama).
 *
 * RPD (Rencana Penarikan Dana) dilampirkan per komponen utama, lengkap dengan
 * nilai kumulatif s.d. bulan berjalan untuk mengukur on-track/tertinggal.
 */
export function buildTree(anggaran, pencairan, butir, rpd, bulanAcuan) {
  const subs = anggaran.filter(r => r.tipe === 'SUB');
  const byKomponen = {};
  (pencairan || []).forEach(p => {
    (byKomponen[p.komponenId] = byKomponen[p.komponenId] || []).push(p);
  });
  const butirBy = {};
  (butir || []).forEach(b => {
    (butirBy[b.komponenId] = butirBy[b.komponenId] || []).push(b);
  });
  const rpdBy = {};
  (rpd && rpd.length ? rpd : SEED_RPD.map(rowRPD)).forEach(r => { rpdBy[r.komponenId] = r; });

  const urutButir = (arr) => arr.slice().sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));
  const bulanKini = Number.isInteger(bulanAcuan) ? bulanAcuan : new Date().getMonth();  // 0-11

  const utama = anggaran.filter(r => r.tipe === 'UTAMA').map(u => {
    const children = subs.filter(s => s.parent === u.id).map(s => {
      const items = urutButir(butirBy[s.id] || []);
      // Realisasi = jumlah nominal butir yang sudah SP2D.
      const realisasi = items.length ? items.filter(sudahSP2D).reduce((t, x) => t + x.nominal, 0) : s.realisasi;
      const pct = s.pagu > 0 ? (realisasi / s.pagu) * 100 : 0;
      const docs = items.filter(sudahSP2D);          // bukti pencairan = butir SP2D
      return { ...s, realisasi, sisa: s.pagu - realisasi, pct, status: statusOf(pct), docs, butir: items, ringkas: ringkasButir(items) };
    });
    const pagu = children.length ? children.reduce((t, c) => t + c.pagu, 0) : u.pagu;
    const items = urutButir(children.reduce((all, c) => all.concat(c.butir), (butirBy[u.id] || []).slice()));
    const realisasi = children.length
      ? children.reduce((t, c) => t + c.realisasi, 0)
      : (items.length ? items.filter(sudahSP2D).reduce((t, x) => t + x.nominal, 0) : u.realisasi);
    const pct = pagu > 0 ? (realisasi / pagu) * 100 : 0;
    const docs = items.filter(sudahSP2D);

    // --- RPD ---
    const r = rpdBy[u.id] || { bulan: new Array(12).fill(0), total: 0 };
    const rpdSd = r.bulan.slice(0, bulanKini + 1).reduce((t, v) => t + v, 0);
    const pctRpd = rpdSd > 0 ? (realisasi / rpdSd) * 100 : (realisasi > 0 ? 100 : 0);

    return {
      ...u, pagu, realisasi, sisa: pagu - realisasi, pct, status: statusOf(pct),
      children, docs, butir: items, ringkas: ringkasButir(items),
      rpd: r.bulan, rpdTotal: r.total, rpdSd, pctRpd, adaRpd: r.total > 0
    };
  });

  const pagu = utama.reduce((t, u) => t + u.pagu, 0);
  const realisasi = utama.reduce((t, u) => t + u.realisasi, 0);
  const rpdSd = utama.reduce((t, u) => t + u.rpdSd, 0);
  const rpdTotal = utama.reduce((t, u) => t + u.rpdTotal, 0);
  const semuaButir = butir || [];
  const totals = {
    pagu, realisasi, sisa: pagu - realisasi,
    pct: pagu ? (realisasi / pagu) * 100 : 0,
    avg: utama.length ? utama.reduce((t, u) => t + u.pct, 0) / utama.length : 0,
    rpdSd, rpdTotal, bulanKini,
    pctRpd: rpdSd ? (realisasi / rpdSd) * 100 : 0,
    nKomponen: utama.length,
    nPencairan: semuaButir.filter(sudahSP2D).length,   // bukti pencairan = butir SP2D
    nButir: semuaButir.length,
    ringkasButir: ringkasButir(semuaButir),
    // Kurva RPD kumulatif untuk grafik bulanan.
    kurvaRpd: BULAN.map((_, i) => utama.reduce((t, u) => t + u.rpd.slice(0, i + 1).reduce((x, v) => x + v, 0), 0))
  };
  return { utama, totals };
}

/** Hitung jumlah butir per tahapan status + nominal yang masih berproses. */
export function ringkasButir(items) {
  const out = { total: (items || []).length, nominalTotal: 0, nominalSelesai: 0, nominalProses: 0, REVISI: 0 };
  STATUS_BUTIR.forEach(s => { out[s.key] = 0; });
  (items || []).forEach(b => {
    const k = statusButir(b.status).key;
    out[k] = (out[k] || 0) + 1;
    if (adaRevisi(b)) out.REVISI++;          // penanda, bukan tahap — bisa tumpang tindih
    out.nominalTotal += b.nominal;
    if (k === 'SP2D') out.nominalSelesai += b.nominal; else out.nominalProses += b.nominal;
  });
  out.pctSelesai = out.total ? (out.SP2D / out.total) * 100 : 0;
  return out;
}
