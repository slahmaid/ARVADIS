(function () {
  var ENDPOINT = "api/submit-cod.php";
  var PHONE_RE = /^(?:\+212[67][0-9]{8}|0[67][0-9]{8})$/;
  // Paste your deployed Google Apps Script Web App URLs here.
  var GOOGLE_SHEETS_ENDPOINTS = {
    moka: "https://script.google.com/macros/s/AKfycbxgqWCWoeLxuvY8c0fEgjxYTfASAj4etmz-cUUTul_FU3ImN0jcVCIhhzp-XjhdAVcD/exec",
    saqr: "https://script.google.com/macros/s/AKfycbxG73Gaq_OSLB1jXPNxafui0DYwXRHsKHudE-Bb0XIRnHbeh3890lNJuriDLmkWNQ0/exec",
    projectors: "https://script.google.com/macros/s/AKfycbyFeWL5WCj_jzdED9eAm2ulM4-iYrjRlDvlu8hriyfS_GAJFO5yBiGfOzGHzohRFjM/exec",
  };

  function getThankYouUrl(form, productName) {
    var explicitTarget = form.getAttribute("data-thank-you");
    if (explicitTarget) {
      return explicitTarget + "?product=" + encodeURIComponent(productName || "");
    }
    var isProjector = (productName || "").indexOf("بروجيكتور") !== -1;
    var target = isProjector ? "/thank-you-projectors" : "/thank-you-cameras";
    return target + "?product=" + encodeURIComponent(productName || "");
  }

  function detectSheetKey(form, payload) {
    var explicit = form.getAttribute("data-sheet-key");
    if (explicit) return explicit;
    var product = (payload.product || "").toLowerCase();
    if (product.indexOf("بروجيكتور") !== -1 || product.indexOf("projector") !== -1) {
      return "projectors";
    }
    if (product.indexOf("صقر") !== -1 || product.indexOf("saqr") !== -1) {
      return "saqr";
    }
    return "moka";
  }

  function ensureErrorNode(form) {
    var node = form.querySelector("[data-cod-error]");
    if (node) return node;
    node = document.createElement("p");
    node.setAttribute("data-cod-error", "");
    node.setAttribute("role", "status");
    node.className = "cod-form__submit-note";
    node.style.color = "#b91c1c";
    node.style.display = "none";
    var submitNote = form.querySelector(".cod-form__submit-note");
    if (submitNote && submitNote.parentNode) {
      submitNote.parentNode.insertBefore(node, submitNote.nextSibling);
    } else {
      form.appendChild(node);
    }
    return node;
  }

  function setPending(form, pending) {
    var submitBtn = form.querySelector(".cod-form__submit");
    if (!submitBtn) return;
    if (pending) {
      submitBtn.dataset.originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "جاري إرسال الطلب...";
      submitBtn.setAttribute("aria-busy", "true");
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = submitBtn.dataset.originalText || "أكّد طلبك الآن";
      submitBtn.removeAttribute("aria-busy");
    }
  }

  function formToPayload(form) {
    var data = new FormData(form);
    var qtyRaw = parseInt(String(data.get("quantity") || "1"), 10);
    var quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
    return {
      product: data.get("product") || "",
      name: data.get("name") || "",
      phone: normalizePhone(data.get("phone") || ""),
      city: data.get("city") || "",
      quantity: quantity,
      upsell_sd_card: data.get("upsell_sd_card") || "لا",
      page_url: window.location.href,
      page_path: window.location.pathname,
      submitted_at: new Date().toISOString(),
    };
  }

  function normalizePhone(phone) {
    return (phone || "").replace(/[.\-\s()]/g, "");
  }

  function isValidPhone(phone) {
    return PHONE_RE.test(normalizePhone(phone));
  }

  function makeFallbackWaUrl(form, payload) {
    var waNode = form.querySelector("a.cod-form__wa");
    var base = waNode ? waNode.getAttribute("href") || "" : "";
    if (!base) return "";
    var details =
      "الاسم: " +
      payload.name +
      "\nالهاتف: " +
      payload.phone +
      "\nالمدينة: " +
      payload.city +
      "\nالكمية: " +
      String(payload.quantity || 1) +
      "\nالمنتج: " +
      payload.product;
    var hasText = base.indexOf("text=") !== -1;
    return hasText
      ? base + "%0A%0A" + encodeURIComponent(details)
      : base + (base.indexOf("?") === -1 ? "?text=" : "&text=") + encodeURIComponent(details);
  }

  function submitToLocalApi(payload) {
    return fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (!res.ok || data.ok !== true) {
              throw new Error((data && data.error) || "تعذر حفظ الطلب في النظام المحلي.");
            }
            return data;
          });
      });
  }

  function submitToGoogleSheet(payload, sheetKey) {
    var url = GOOGLE_SHEETS_ENDPOINTS[sheetKey] || "";
    if (!url) {
      return Promise.reject(new Error("لم يتم إعداد رابط Google Sheet لهذا النموذج بعد."));
    }
    var isAppsScript = /script\.google\.com/i.test(url);
    if (isAppsScript) {
      var body = JSON.stringify(payload);
      // Fire-and-forget for Apps Script to avoid false timeout/CORS negatives.
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        var blob = new Blob([body], { type: "text/plain;charset=utf-8" });
        var queued = navigator.sendBeacon(url, blob);
        if (queued) {
          return Promise.resolve("beacon-queued");
        }
      }

      fetch(url, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: body,
        keepalive: true,
      }).catch(function () {
        // Ignore here: this path is best-effort and should not block UX.
      });
      return Promise.resolve("no-cors-dispatched");
    }

    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeout = setTimeout(function () {
      if (controller) controller.abort();
    }, 5000);

    return fetch(url, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
    })
      .then(function (res) {
        clearTimeout(timeout);
        if (!res.ok) {
          throw new Error("تعذر إرسال الطلب إلى Google Sheet.");
        }
        return res.text();
      })
      .catch(function (err) {
        clearTimeout(timeout);
        if (err && err.name === "AbortError") {
          throw new Error("انتهت مهلة الإرسال. حاول مجددًا أو أرسل عبر واتساب.");
        }
        throw err;
      });
  }

  function ensureQuantitySelector(form) {
    var existing = form.querySelector('input[name="quantity"]');
    if (existing) return existing;

    var fields = form.querySelector(".cod-form__fields");
    if (!fields) return null;

    var wrap = document.createElement("div");
    wrap.className = "cod-form__label cod-form__label--quantity";

    var labelText = document.createElement("span");
    labelText.className = "cod-form__label-text";
    labelText.textContent = "الكمية";
    wrap.appendChild(labelText);

    var selector = document.createElement("div");
    selector.className = "qty-selector";

    var minus = document.createElement("button");
    minus.type = "button";
    minus.className = "qty-selector__btn";
    minus.setAttribute("data-qty-minus", "");
    minus.setAttribute("aria-label", "تقليل الكمية");
    minus.textContent = "-";

    var input = document.createElement("input");
    input.className = "qty-selector__input";
    input.name = "quantity";
    input.type = "number";
    input.min = "1";
    input.step = "1";
    input.value = "1";
    input.inputMode = "numeric";
    input.setAttribute("aria-label", "الكمية");

    var plus = document.createElement("button");
    plus.type = "button";
    plus.className = "qty-selector__btn";
    plus.setAttribute("data-qty-plus", "");
    plus.setAttribute("aria-label", "زيادة الكمية");
    plus.textContent = "+";

    selector.appendChild(minus);
    selector.appendChild(input);
    selector.appendChild(plus);
    wrap.appendChild(selector);
    fields.appendChild(wrap);

    return input;
  }

  document.querySelectorAll("form.cod-form").forEach(function (form) {
    var errorNode = ensureErrorNode(form);
    var phoneInput = form.querySelector('input[name="phone"]');
    var qtyInput = ensureQuantitySelector(form);

    function clampQty() {
      if (!qtyInput) return;
      var n = parseInt(String(qtyInput.value || "1"), 10);
      if (!Number.isFinite(n) || n < 1) n = 1;
      qtyInput.value = String(n);
    }

    if (qtyInput) {
      qtyInput.addEventListener("change", clampQty);
      qtyInput.addEventListener("blur", clampQty);
      var minusBtn = form.querySelector("[data-qty-minus]");
      var plusBtn = form.querySelector("[data-qty-plus]");
      if (minusBtn) {
        minusBtn.addEventListener("click", function () {
          var n = parseInt(String(qtyInput.value || "1"), 10);
          qtyInput.value = String(Math.max(1, (Number.isFinite(n) ? n : 1) - 1));
        });
      }
      if (plusBtn) {
        plusBtn.addEventListener("click", function () {
          var n = parseInt(String(qtyInput.value || "1"), 10);
          qtyInput.value = String((Number.isFinite(n) ? n : 1) + 1);
        });
      }
    }

    if (phoneInput) {
      phoneInput.setAttribute("pattern", "(?:\\+212[67][0-9]{8}|0[67][0-9]{8})");
      phoneInput.setAttribute("title", "أدخل رقمًا مغربيًا صحيحًا: 06XXXXXXXX أو 07XXXXXXXX أو +2126XXXXXXXX أو +2127XXXXXXXX");
      phoneInput.addEventListener("input", function () {
        phoneInput.setCustomValidity("");
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errorNode.style.display = "none";
      errorNode.innerHTML = "";

      if (phoneInput && !isValidPhone(phoneInput.value)) {
        phoneInput.setCustomValidity("المرجو إدخال رقم مغربي صحيح.");
      }

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      clampQty();

      var payload = formToPayload(form);
      var productName = payload.product;
      var sheetKey = detectSheetKey(form, payload);
      setPending(form, true);

      Promise.all([
        submitToLocalApi(payload),
        submitToGoogleSheet(payload, sheetKey).catch(function (err) {
          console.warn("Google Sheets submit failed:", err);
          return null;
        }),
      ])
        .then(function () {
          window.location.href = getThankYouUrl(form, productName);
        })
        .catch(function (err) {
          var fallbackUrl = makeFallbackWaUrl(form, payload);
          var message = err && err.message ? err.message : "تعذر إرسال الطلب الآن.";
          if (/Failed to fetch/i.test(message)) {
            message =
              "تعذر الاتصال برابط Google Sheet. تأكد من نشر Apps Script كـ Web App مع صلاحية Anyone.";
          }
          if (fallbackUrl) {
            errorNode.innerHTML =
              message +
              ' يمكنك إتمام الطلب عبر <a href="' +
              fallbackUrl +
              '" target="_blank" rel="noopener noreferrer">واتساب</a>.';
          } else {
            errorNode.textContent = message;
          }
          errorNode.style.display = "block";
        })
        .finally(function () {
          setPending(form, false);
        });
    });
  });
})();
