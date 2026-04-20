(function () {
  document.querySelectorAll("[data-projector-root]").forEach(function (root) {
    var options = root.querySelectorAll("[data-projector-watt]");
    var cur = root.querySelector("[data-projector-current]");
    var cmp = root.querySelector("[data-projector-compare]");
    var productInput = root.querySelector('input[name="product"]');
    var waLink = root.querySelector("a.cod-form__wa");
    var landingHero = root.closest(".landing-hero");
    var galleryMain = landingHero ? landingHero.querySelector(".lp-gallery__main") : null;
    var galleryThumbs = landingHero
      ? landingHero.querySelectorAll(".lp-thumb[data-lp-src]")
      : [];
    var cardMediaImage = root.closest(".product-card")
      ? root.closest(".product-card").querySelector(".product-card__media img")
      : null;
    if (!options.length || !cur || !cmp) return;

    function activate(option) {
      options.forEach(function (input) {
        var wrapper = input.closest(".projector-picker__btn");
        var on = input === option;
        input.checked = on;
        if (wrapper) wrapper.classList.toggle("is-active", on);
      });
      cur.textContent = option.getAttribute("data-current") || "";
      cmp.textContent = option.getAttribute("data-compare") || "";
      if (productInput) {
        var label = option.getAttribute("data-product-label");
        if (label) productInput.value = label;
      }
      if (waLink) {
        var waHref = option.getAttribute("data-wa-href");
        if (waHref) waLink.setAttribute("href", waHref);
      }
      if (galleryMain) {
        var imageSrc = option.getAttribute("data-image-src");
        var imageAlt = option.getAttribute("data-image-alt");
        if (imageSrc) galleryMain.src = imageSrc;
        if (imageAlt) galleryMain.alt = imageAlt;
        galleryThumbs.forEach(function (thumb) {
          var on = thumb.getAttribute("data-lp-src") === imageSrc;
          thumb.classList.toggle("is-active", on);
          thumb.setAttribute("aria-pressed", on ? "true" : "false");
        });
      }
      if (cardMediaImage) {
        var cardImageSrc = option.getAttribute("data-image-src");
        var cardImageAlt = option.getAttribute("data-image-alt");
        if (cardImageSrc) cardMediaImage.src = cardImageSrc;
        if (cardImageAlt) cardMediaImage.alt = cardImageAlt;
      }
      var form = root.querySelector("form.cod-form");
      if (form) {
        form.dispatchEvent(new Event("cod:pricing-change"));
      }
    }

    options.forEach(function (option) {
      option.addEventListener("change", function () {
        if (option.checked) activate(option);
      });
    });

    var initial = root.querySelector("[data-projector-watt]:checked");
    if (initial) activate(initial);
    else if (options[0]) {
      activate(options[0]);
    }
  });
})();
