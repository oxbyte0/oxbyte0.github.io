(function () {
  var id = document.currentScript.dataset.gaId;
  if (!id) return;
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', id);
})();
