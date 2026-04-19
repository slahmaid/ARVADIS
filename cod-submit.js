(function () {
  var ENDPOINT = "api/submit-cod.php";
  var PHONE_RE = /^(?:\+212[67][0-9]{8}|0[67][0-9]{8})$/;
  // Paste your deployed Google Apps Script Web App URLs here.
  var GOOGLE_SHEETS_ENDPOINTS = {
    moka: "https://script.google.com/macros/s/AKfycbxgqWCWoeLxuvY8c0fEgjxYTfASAj4etmz-cUUTul_FU3ImN0jcVCIhhzp-XjhdAVcD/exec",
    saqr: "https://script.google.com/macros/s/AKfycbxG73Gaq_OSLB1jXPNxafui0DYwXRHsKHudE-Bb0XIRnHbeh3890lNJuriDLmkWNQ0/exec",
    projectors: "https://script.google.com/macros/s/AKfycbyFeWL5WCj_jzdED9eAm2ulM4-iYrjRlDvlu8hriyfS_GAJFO5yBiGfOzGHzohRFjM/exec",
  };

  /**
   * Fixed line totals (MAD) for bundle / promo pricing by route key (moka | saqr | projectors)
   * and quantity. When a quantity matches, the sheet receives line_total_mad = that total and
   * unit_price_mad = total ÷ quantity (effective unit).
   *
   * Per-form overrides: add on <form class="cod-form"> e.g.
   *   data-cod-line-totals='{"2":1400,"3":2000}'
   * (same keys as quantity; merges on top of this table, form wins on duplicate keys.)
   */
  var SPECIAL_ORDER_LINE_TOTALS = {
    moka: {
      2: 1400,
    },
  };

  function mergeLineTotalRules(sheetKey, form) {
    var merged = {};
    var def = SPECIAL_ORDER_LINE_TOTALS[sheetKey];
    if (def && typeof def === "object") {
      Object.keys(def).forEach(function (k) {
        var q = parseInt(k, 10);
        var v = Number(def[k]);
        if (Number.isFinite(q) && q > 0 && Number.isFinite(v) && v > 0) {
          merged[String(q)] = v;
        }
      });
    }
    var attr = form.getAttribute("data-cod-line-totals");
    if (attr && String(attr).trim()) {
      try {
        var parsed = JSON.parse(attr);
        if (parsed && typeof parsed === "object") {
          Object.keys(parsed).forEach(function (k) {
            var q = parseInt(k, 10);
            var v = Number(parsed[k]);
            if (Number.isFinite(q) && q > 0 && Number.isFinite(v) && v > 0) {
              merged[String(q)] = v;
            }
          });
        }
      } catch (e) {}
    }
    return merged;
  }

  function applyOrderPricingOverrides(quantity, domUnit, comparePrice, lineRules) {
    var special = lineRules[String(quantity)];
    if (special != null && Number.isFinite(special) && special > 0) {
      var line = roundMoney(special);
      return {
        unit_price_mad: roundMoney(line / quantity),
        line_total_mad: line,
        compare_price_mad: comparePrice,
      };
    }
    var lineTotal =
      domUnit != null && Number.isFinite(domUnit)
        ? roundMoney(domUnit * quantity)
        : null;
    return {
      unit_price_mad: domUnit,
      line_total_mad: lineTotal,
      compare_price_mad: comparePrice,
    };
  }

  function getThankYouUrl(form, productName) {
    var explicitTarget = form.getAttribute("data-thank-you");
    if (explicitTarget) {
      return explicitTarget + "?product=" + encodeURIComponent(productName || "");
    }
    var isProjector = (productName || "").indexOf("بروجيكتور") !== -1;
    var target = isProjector ? "thank-you-projectors.html" : "thank-you-cameras.html";
    return target + "?product=" + encodeURIComponent(productName || "");
  }

  function detectSheetKey(form, payload) {
    var explicit = form.getAttribute("data-sheet-key");
    if (explicit) return explicit.trim().toLowerCase();
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
    var quantity = sanitizeQuantity(data.get("quantity"));
    var productName = (data.get("product") || "").toString();
    var sheetKey = detectSheetKey(form, { product: productName });
    var pricing = getPricingForForm(form, sheetKey);
    var lineRules = mergeLineTotalRules(sheetKey, form);
    var priced = applyOrderPricingOverrides(
      quantity,
      pricing.unit,
      pricing.compare,
      lineRules
    );
    return {
      product: productName,
      name: data.get("name") || "",
      phone: normalizePhone(data.get("phone") || ""),
      city: data.get("city") || "",
      quantity: quantity,
      unit_price_mad: priced.unit_price_mad,
      compare_price_mad: priced.compare_price_mad,
      line_total_mad: priced.line_total_mad,
      upsell_sd_card: data.get("upsell_sd_card") || "لا",
      page_url: window.location.href,
      page_path: window.location.pathname,
      submitted_at: new Date().toISOString(),
    };
  }

  function roundMoney(value) {
    return Math.round(value * 100) / 100;
  }

  function parseDisplayedMad(text) {
    if (text == null) return null;
    var m = String(text)
      .replace(/[\u00a0\u202f]/g, " ")
      .match(/[0-9]+(?:\.[0-9]+)?/);
    if (!m) return null;
    var n = parseFloat(m[0]);
    return Number.isFinite(n) ? n : null;
  }

  function getPricingForForm(form, sheetKey) {
    var unit = null;
    var compare = null;
    if (sheetKey === "projectors") {
      var prRoot = form.closest("[data-projector-root]");
      if (prRoot) {
        var curN = prRoot.querySelector("[data-projector-current]");
        var cmpN = prRoot.querySelector("[data-projector-compare]");
        unit = parseDisplayedMad(curN ? curN.textContent : "");
        compare = parseDisplayedMad(cmpN ? cmpN.textContent : "");
      }
    } else if (sheetKey === "saqr") {
      var saqrRoot = form.closest("#saqr") || form.closest(".landing-hero__content");
      if (saqrRoot) {
        var curS =
          saqrRoot.querySelector("[data-saqr-card-current-price]") ||
          saqrRoot.querySelector("[data-saqr-current-price]");
        var cmpS = saqrRoot.querySelector(".product-card__price-compare");
        unit = parseDisplayedMad(curS ? curS.textContent : "");
        compare = parseDisplayedMad(cmpS ? cmpS.textContent : "");
      }
    } else {
      var mokaRoot = form.closest(".product-card") || form.closest(".landing-hero__content");
      if (mokaRoot) {
        var curM = mokaRoot.querySelector(".product-card__price-current");
        var cmpM = mokaRoot.querySelector(".product-card__price-compare");
        unit = parseDisplayedMad(curM ? curM.textContent : "");
        compare = parseDisplayedMad(cmpM ? cmpM.textContent : "");
      }
    }
    return { unit: unit, compare: compare };
  }

  function sanitizeQuantity(value) {
    var parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 1;
    return Math.max(1, Math.min(20, parsed));
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
      payload.quantity +
      "\nسعر الوحدة (درهم): " +
      (payload.unit_price_mad != null ? payload.unit_price_mad : "") +
      "\nقبل التخفيض (درهم): " +
      (payload.compare_price_mad != null ? payload.compare_price_mad : "") +
      "\nالمجموع (درهم): " +
      (payload.line_total_mad != null ? payload.line_total_mad : "") +
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

  /** Best-effort CSV backup when PHP is available; never blocks static hosts (GitHub Pages). */
  function submitToLocalApiSilently(payload) {
    submitToLocalApi(payload).catch(function () {});
  }

  function submitToGoogleSheet(payload, sheetKey) {
    var url = GOOGLE_SHEETS_ENDPOINTS[sheetKey] || "";
    if (!url) {
      return Promise.reject(new Error("لم يتم إعداد رابط Google Sheet لهذا النموذج بعد."));
    }
    // Only send core form fields to the Google Sheet, exclude tracking fields
    var sheetPayload = {
      product: payload.product,
      name: payload.name,
      phone: payload.phone,
      city: payload.city,
      quantity: payload.quantity,
      unit_price_mad: payload.unit_price_mad,
      compare_price_mad: payload.compare_price_mad,
      line_total_mad: payload.line_total_mad,
      upsell_sd_card: payload.upsell_sd_card,
    };
    var isAppsScript = /script\.google\.com/i.test(url);
    if (isAppsScript) {
      try {
        var body = JSON.stringify(sheetPayload);
      } catch (e) {
        return Promise.reject(e);
      }
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
      body: JSON.stringify(sheetPayload),
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

  function initQuantitySelector(form) {
    var qtyWrap = form.querySelector("[data-qty-selector]");
    var qtyInput = form.querySelector('input[name="quantity"]');
    if (!qtyWrap || !qtyInput) return;

    var applyQuantity = function (nextValue) {
      var value = sanitizeQuantity(nextValue);
      qtyInput.value = String(value);
    };

    qtyWrap.querySelectorAll("[data-qty-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var current = sanitizeQuantity(qtyInput.value);
        var action = btn.getAttribute("data-qty-action");
        applyQuantity(action === "decrease" ? current - 1 : current + 1);
      });
    });

    qtyInput.addEventListener("input", function () {
      qtyInput.value = qtyInput.value.replace(/[^\d]/g, "");
    });

    qtyInput.addEventListener("blur", function () {
      applyQuantity(qtyInput.value);
    });

    applyQuantity(qtyInput.value || 1);
  }

  document.querySelectorAll("form.cod-form").forEach(function (form) {
    var errorNode = ensureErrorNode(form);
    var phoneInput = form.querySelector('input[name="phone"]');
    initQuantitySelector(form);
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

      var payload = formToPayload(form);
      var productName = payload.product;
      var sheetKey = detectSheetKey(form, payload);
      setPending(form, true);
      // Local PHP backup only (e.g. Apache). On static hosts this fails harmlessly — never block UX.
      submitToLocalApiSilently(payload);

      submitToGoogleSheet(payload, sheetKey)
        .then(function () {
          var target = getThankYouUrl(form, productName);
          if (typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(function () {
              window.location.assign(target);
            });
          } else {
            window.setTimeout(function () {
              window.location.assign(target);
            }, 0);
          }
        })
        .catch(function (sheetErr) {
          var fallbackUrl = makeFallbackWaUrl(form, payload);
          var message = sheetErr && sheetErr.message ? sheetErr.message : "تعذر إرسال الطلب الآن.";
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
          setPending(form, false);
        });
    });
  });
})();
