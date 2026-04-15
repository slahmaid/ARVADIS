(function () {
  document.querySelectorAll("[data-lp-gallery]").forEach(function (root) {
    var main = root.querySelector(".lp-gallery__main");
    var thumbs = Array.prototype.slice.call(root.querySelectorAll(".lp-thumb"));
    if (!main || !thumbs.length) return;

    var status = root.querySelector("[data-lp-live]");
    if (!status) {
      status = document.createElement("span");
      status.className = "visually-hidden";
      status.setAttribute("data-lp-live", "");
      status.setAttribute("aria-live", "polite");
      root.appendChild(status);
    }

    function activate(btn) {
      var src = btn.getAttribute("data-lp-src");
      var alt = btn.getAttribute("data-lp-alt") || "";
      if (!src) return;
      main.src = src;
      main.alt = alt;
      status.textContent = alt ? "تم اختيار الصورة: " + alt : "تم تغيير الصورة";
      thumbs.forEach(function (b) {
        var on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }

    thumbs.forEach(function (btn, idx) {
      btn.addEventListener("click", function () {
        activate(btn);
      });
      btn.addEventListener("keydown", function (e) {
        var key = e.key;
        if (key !== "ArrowRight" && key !== "ArrowLeft" && key !== "Home" && key !== "End") {
          return;
        }
        e.preventDefault();
        var nextIdx = idx;
        if (key === "Home") nextIdx = 0;
        else if (key === "End") nextIdx = thumbs.length - 1;
        else if (key === "ArrowRight") nextIdx = (idx + 1) % thumbs.length;
        else if (key === "ArrowLeft") nextIdx = (idx - 1 + thumbs.length) % thumbs.length;
        thumbs[nextIdx].focus();
        activate(thumbs[nextIdx]);
      });
    });
  });
})();
