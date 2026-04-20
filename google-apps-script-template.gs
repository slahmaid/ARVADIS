function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var payload = JSON.parse(e.postData.contents || "{}");
    var productName = payload.product || "";
    var variantModel = payload.variant_model || "";
    if (variantModel && productName.indexOf(variantModel) === -1) {
      productName = productName ? productName + " — " + variantModel : variantModel;
    }

    sheet.appendRow([
      new Date(),
      productName,
      payload.name || "",
      payload.phone || "",
      payload.city || "",
      payload.upsell_sd_card || "",
      payload.page_url || "",
      payload.page_path || "",
      payload.submitted_at || "",
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
