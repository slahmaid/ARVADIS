(function () {
  var button = document.getElementById("whatsapp-float");
  var footer = document.querySelector(".site-footer");
  if (!button || !footer) return;

  var rafId = null;
  function keepAboveFooter() {
    rafId = null;
    var footerRect = footer.getBoundingClientRect();
    var overlap = window.innerHeight - footerRect.top;
    var extraOffset = overlap > 0 ? overlap : 0;
    button.style.setProperty("--lift", extraOffset + "px");
  }

  function schedule() {
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(keepAboveFooter);
  }

  keepAboveFooter();
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
})();
