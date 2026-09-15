import re

gs_file = "/home/pusdatinkp/machel-rebuild/AppsScript-GaleriCustom.gs"
with open(gs_file, "r") as f:
    gs_code = f.read()

# 1. Add type handler
if "type === 'kirimEmailSaja'" not in gs_code:
    gs_code = gs_code.replace(
        "if (d.type === 'invoice') return handleInvoice(d);",
        "if (d.type === 'invoice') return handleInvoice(d);\n  if (d.type === 'kirimEmailSaja') return handleKirimEmailSaja(d);"
    )

# 2. Modify handleInvoice to respect emailNanti
gs_code = gs_code.replace(
    "emailPesananDiterima(d, ringkas, waktuWib(), link);",
    "if (!d.emailNanti) emailPesananDiterima(d, ringkas, waktuWib(), link);"
)

# 3. Add handleKirimEmailSaja function
new_func = """
function handleKirimEmailSaja(d) {
  const sh = sheet(T_PESANAN);
  const row = uniqueOrderRow(d.orderId);
  if (row < 2) return json({ ok: false, msg: 'Pesanan tidak ditemukan' });
  
  const link = String(sh.getRange(row, 11).getValue() || '');
  const email = String(sh.getRange(row, 5).getValue() || '');
  const nama = String(sh.getRange(row, 2).getValue() || 'Kak');
  const items = String(sh.getRange(row, 18).getValue() || ''); // Rincian di kolom R (18)
  
  const fakeD = { buyer: { email: email, name: nama }, orderId: d.orderId };
  
  if (email && email.indexOf('@') > 0) {
    emailPesananDiterima(fakeD, items, waktuWib(), link);
  }
  return json({ ok: true });
}
"""
if "function handleKirimEmailSaja" not in gs_code:
    gs_code += new_func

with open(gs_file, "w") as f:
    f.write(gs_code)

html_file = "/home/pusdatinkp/machel-rebuild/index.html"
with open(html_file, "r") as f:
    html_code = f.read()

# Modify the frontend fetch for invoice
html_code = html_code.replace(
    'body: JSON.stringify({ ...this.orderPayload(orderId, total, "Invoice gabungan"), type: "invoice" })',
    'body: JSON.stringify({ ...this.orderPayload(orderId, total, "Invoice gabungan"), type: "invoice", emailNanti: true })'
)
# Add the second fetch
if "keepalive: true" not in html_code:
    html_code = re.sub(
        r'try \{ window\.location\.assign\(link\); \} catch \(errAssign\) \{ window\.location\.href = link; \}',
        r'try { window.location.assign(link); } catch (errAssign) { window.location.href = link; }\n        fetch(api, { method: "POST", keepalive: true, body: JSON.stringify({ type: "kirimEmailSaja", orderId: orderId }) });',
        html_code
    )

with open(html_file, "w") as f:
    f.write(html_code)

print("Patch percepatan applied!")
