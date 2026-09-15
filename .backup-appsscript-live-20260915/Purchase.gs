/**
 * Verified purchase tracking for MachelCrochet — staging module.
 *
 * Boundaries (deliberate):
 *  - Purchase conversions are recorded ONLY from the verified PAID path
 *    (handlePaymentLocked, after verifiedMayarPayment + LockService), never from
 *    a webhook body and never from invoice creation.
 *  - Local ledger (tab PurchaseLedger) is the source of truth for "credited
 *    conversions". orderId is its unique key: exactly one row per orderId.
 *  - Offline Google Ads upload is DISABLED by default and reads credentials only
 *    from ScriptProperties (server-side), never from the order payload. It is a
 *    separate, idempotent step keyed on the same orderId, so an uncertain or
 *    failed upload can never create a second credited conversion.
 *
 * EXACT-ONCE LIMITATION (honest): true end-to-end exactly-once is impossible
 * because the Google Ads offline-upload API is a remote call whose response can
 * be lost after Ads has already accepted the click conversion. We therefore
 * guarantee exactly-once at the boundary we control (the local ledger: one row
 * per orderId, never re-sent once its state is terminal) and fail CLOSED on any
 * ambiguous provider result (non-2xx, partialFailureError, malformed body): the
 * row is marked 'uncertain' and NEVER retried, so we never double-credit. The
 * cost is a possible under-count (a conversion Ads did accept but whose ack we
 * lost stays 'uncertain'); those are listed for manual reconciliation rather
 * than blindly re-uploaded. This matches Ads' own guidance that offline uploads
 * are de-duplicated by gclid+time only on their side, which we cannot observe.
 *
 * Google Ads note: an "imported GA4" conversion action CANNOT accept offline
 * click uploads. A separate conversion action of type UPLOAD_CLICKS / PURCHASE
 * must be created manually in the Ads UI and its resource name configured in
 * ScriptProperties (ADS_CONVERSION_ACTION). See config-rollback.md.
 */

var T_PURCHASE_LEDGER = 'PurchaseLedger';
var PURCHASE_LEDGER_HEAD = ['order_id', 'waktu', 'nilai', 'currency', 'attribution', 'upload_status', 'upload_waktu', 'catatan'];

/** Read one order row by exact orderId. Throws on missing/ambiguous. */
function uniqueOrderRow(orderId) {
  if (typeof orderId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(orderId)) throw new Error('Invalid orderId');
  const rows = sheet(T_PESANAN).getDataRange().getValues();
  const matches = [];
  for (let i = 1; i < rows.length; i++) if (String(rows[i][1]).toUpperCase() === orderId.toUpperCase()) matches.push(i + 1);
  if (matches.length !== 1) throw new Error('Order missing or ambiguous');
  return matches[0];
}

/** Validated opaque click identifiers; no URL, PII, or arbitrary fields. */
function validatedAdAttribution(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid attribution');
  const out = {};
  Object.keys(value).forEach(function (key) {
    if (['gclid', 'gbraid', 'wbraid'].indexOf(key) < 0) throw new Error('Invalid attribution field');
    const v = value[key];
    if (v === '') return;
    if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(v)) throw new Error('Invalid attribution identifier');
    out[key] = v;
  });
  return out;
}

/**
 * Verify a payment against the Mayar server using only the transaction id and
 * total STORED on the order row — never values from the webhook body. Returns
 * true only when identity AND status AND amount all match unambiguously; any
 * missing field, disagreement, or unreadable response returns false (fail closed).
 */
function verifiedMayarPayment(trx, total) {
  if (!trx || !Number.isSafeInteger(total) || total <= 0) return false;
  const data = bacaMayar(trx);
  if (!data || Array.isArray(data)) return false;
  const ids = [data.id, data.transactionId, data.transaction_id].filter(function (x) { return x != null && x !== ''; });
  if (!ids.length || !ids.every(function (x) { return typeof x === 'string' && x === trx; })) return false;
  const statuses = [data.status, data.transactionStatus, data.paymentStatus].filter(function (x) { return x != null && x !== ''; });
  if (!statuses.length || !statuses.every(function (x) { return /^(paid|settled|settlement|lunas)$/i.test(String(x)); }) || data.isPaid === false) return false;
  const amounts = [data.amount, data.total].filter(function (x) { return x != null; });
  if (!amounts.length || !amounts.every(function (x) { return /^(0|[1-9][0-9]*)(\.0+)?$/.test(String(x)) && Number(x) === total; })) return false;
  if (data.currency != null && data.currency !== 'IDR') return false;
  return true;
}

function purchaseLedgerSheet() {
  const sh = sheet(T_PURCHASE_LEDGER);
  if (sh.getLastRow() === 0) sh.appendRow(PURCHASE_LEDGER_HEAD);
  return sh;
}

function ledgerRowFor(sh, orderId) {
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) if (String(rows[i][0]) === orderId) return i + 1;
  return -1;
}

/**
 * Append exactly one ledger row for a PAID order. Idempotent on orderId: a
 * second call for the same orderId is a no-op, so a replayed/duplicated PAID
 * event never creates a second credited conversion.
 * upload_status: 'pending' if it has a click id AND value > 0, else
 * 'no_click_id' (no click id) or 'invalid_value' (nilai <= 0, never uploaded).
 * Caller MUST hold the script lock (handlePaymentLocked) — no nested lock here
 * because the Apps Script script lock is not re-entrant.
 */
function purchaseValue(value) {
  // Sheet getValues returns numbers; legacy numeric strings use a decimal point, not currency formatting.
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[+-]?\d+(\.\d+)?$/.test(value))) return 0;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function recordPurchaseConversion(orderIdRaw) {
  const orderId = String(orderIdRaw || '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(orderId)) throw new Error('Invalid orderId');

  const sh = purchaseLedgerSheet();
  if (ledgerRowFor(sh, orderId) > -1) return { ok: true, dedup: true };
  const orderRow = uniqueOrderRow(orderId);
  const pesanan = sheet(T_PESANAN);
  const nilai = purchaseValue(pesanan.getRange(orderRow, 7).getValue());
  const attribution = validatedAdAttribution(JSON.parse(String(pesanan.getRange(orderRow, 21).getValue() || '{}')));
  const hasClick = !!(attribution.gclid || attribution.gbraid || attribution.wbraid);

  let stateInitial = 'pending';
  if (nilai <= 0) stateInitial = 'invalid_value';
  else if (!hasClick) stateInitial = 'no_click_id';

  sh.appendRow([orderId, waktuWib(), nilai, 'IDR', JSON.stringify(attribution),
    stateInitial, '', '']);
  return { ok: true, credited: true };
}

/* ---------- Offline Google Ads upload (disabled by default) ---------- */

function adsConfig() {
  const props = PropertiesService.getScriptProperties();
  const g = function (k) { return String(props.getProperty(k) || '').trim(); };
  const v = g('ADS_API_VERSION');
  return {
    enabled: /^(1|true|ya|aktif)$/i.test(g('ADS_UPLOAD_ENABLED')),
    developerToken: g('ADS_DEVELOPER_TOKEN'),
    customerId: g('ADS_CUSTOMER_ID'),
    loginCustomerId: g('ADS_LOGIN_CUSTOMER_ID'),
    conversionAction: g('ADS_CONVERSION_ACTION'),
    accessToken: g('ADS_ACCESS_TOKEN'),
    apiVersion: /^[0-9]{2}$/.test(v) ? v : '25' // ponytail: pin version; bump when Google sunsets it
  };
}

/**
 * Classify an Ads offline-upload HTTP response into a terminal, credited state
 * or a retryable one. NEVER treats an ambiguous result as success.
 *   'uploaded'  = 2xx AND body has results[] AND no partialFailureError
 *   'uncertain' = reached the server but result is ambiguous (non-2xx we can't
 *                 interpret, partialFailureError, malformed body) -> fail closed,
 *                 never retried (avoids double credit)
 *   'pending'   = never reached a decision (transport error) -> safe to retry
 */
function classifyAdsResponse(res) {
  let code, body;
  try { code = res.getResponseCode(); body = JSON.parse(res.getContentText() || '{}'); }
  catch (err) { return 'uncertain'; }
  if (code >= 200 && code < 300 && body && Array.isArray(body.results) && body.results.length && !body.partialFailureError) return 'uploaded';
  if (code === 429 || code === 503 || (code >= 500 && code < 600)) return 'pending'; // transient, retryable
  return 'uncertain';
}

function adsUploadEndpoint(cfg) {
  const v = /^[0-9]{2}$/.test(String(cfg.apiVersion || '')) ? cfg.apiVersion : '25';
  return 'https://googleads.googleapis.com/v' + v + '/customers/' + encodeURIComponent(cfg.customerId) +
    ':uploadClickConversions';
}

/**
 * Ads mensyaratkan conversionDateTime = yyyy-MM-dd HH:mm:ss+|-HH:mm dengan
 * timezone eksplisit. Ledger menyimpan waktu WIB 'dd/MM/yyyy HH:mm:ss WIB'
 * (atau ISO tanpa offset) -> normalisasi ke '+07:00'. Nilai asing yang sudah
 * ber-offset dipertahankan; yang tak terbaca -> null (field dihilangkan agar
 * Ads memakai waktu upload, bukan menolak baris).
 */
function adsConversionDateTime(waktuRaw) {
  const s = String(waktuRaw || '').trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1] + ' ' + m[4] + ':' + m[5] + ':' + m[6] + '+07:00';
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})([+-]\d{2}:?\d{2})?/);
  if (m) {
    let off = m[7] || '+07:00';
    if (/^[+-]\d{4}$/.test(off)) off = off.slice(0, 3) + ':' + off.slice(3);
    return m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + m[6] + off;
  }
  return null;
}

/**
 * Upload ledger rows in 'pending' state that carry a click id. One row at a
 * time, each keyed on its orderId, so a lost response cannot double-credit:
 * the row's state advances only to a terminal value the next run will skip.
 */
function uploadPendingConversions() {
  const cfg = adsConfig();
  if (!cfg.enabled) return { ok: true, skipped: 'disabled' };
  if (!cfg.developerToken || !cfg.customerId || !cfg.conversionAction || !cfg.accessToken) {
    return { ok: false, message: 'Ads credentials incomplete (ScriptProperties)' };
  }

  const lock = LockService.getScriptLock();
  try { lock.waitLock(8000); } catch (err) { return { ok: false, message: 'busy' }; }
  try {
    const sh = purchaseLedgerSheet();
    const rows = sh.getDataRange().getValues();
    let uploaded = 0, uncertain = 0, retry = 0;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][5]) !== 'pending') continue;
      const orderId = String(rows[i][0]);
      const nilai = purchaseValue(rows[i][2]);
      if (!(nilai > 0)) { sh.getRange(i + 1, 6).setValue('invalid_value'); continue; }
      let attribution = {};
      try { attribution = JSON.parse(String(rows[i][4] || '{}')); } catch (err) {}
      const click = { gclid: attribution.gclid, gbraid: attribution.gbraid, wbraid: attribution.wbraid };
      if (!click.gclid && !click.gbraid && !click.wbraid) { sh.getRange(i + 1, 6).setValue('no_click_id'); continue; }

      const conversion = {
        conversionAction: cfg.conversionAction,
        conversionValue: nilai,
        currencyCode: 'IDR',
        orderId: orderId
      };
      const dt = adsConversionDateTime(rows[i][1]);
      if (dt) conversion.conversionDateTime = dt;
      if (click.gclid) conversion.gclid = click.gclid;
      else if (click.gbraid) conversion.gbraid = click.gbraid;
      else if (click.wbraid) conversion.wbraid = click.wbraid;

      let state;
      try {
        const res = UrlFetchApp.fetch(adsUploadEndpoint(cfg), {
          method: 'post', contentType: 'application/json',
          headers: {
            Authorization: 'Bearer ' + cfg.accessToken,
            'developer-token': cfg.developerToken,
            'login-customer-id': cfg.loginCustomerId || cfg.customerId
          },
          payload: JSON.stringify({ conversions: [conversion], partialFailure: true }),
          muteHttpExceptions: true
        });
        state = classifyAdsResponse(res);
      } catch (err) {
        state = 'pending'; // transport failure -> retryable, no credit
      }

      if (state === 'pending') { retry++; continue; }
      sh.getRange(i + 1, 6).setValue(state);
      sh.getRange(i + 1, 7).setValue(waktuWib());
      if (state === 'uploaded') uploaded++; else uncertain++;
    }
    return { ok: true, uploaded: uploaded, uncertain: uncertain, retryable: retry };
  } finally { try { lock.releaseLock(); } catch (e) {} }
}
