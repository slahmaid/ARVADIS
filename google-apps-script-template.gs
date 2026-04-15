function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var payload = JSON.parse(e.postData.contents || "{}");

    sheet.appendRow([
      new Date(),
      payload.product || "",
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
