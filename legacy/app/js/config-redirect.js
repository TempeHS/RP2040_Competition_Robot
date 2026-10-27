document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("challenge")) params.set("challenge", "1");
  params.set("file", "config.py");
  window.location.replace("simulator.html?" + params.toString());
});
