"use strict";
// Low Tide City — boot placeholder. The real bootstrap replaces this file
// once the world modules land; for now it proves the page loads, paints,
// and answers the screenshot harness contract (?shot=...&seed=... stages a
// scene, paints, then sets window.__shotReady).
(function () {
  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = "#12233d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffb000";
  ctx.font = "bold 64px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("LOW TIDE CITY", canvas.width / 2, canvas.height / 2);
  if (new URLSearchParams(location.search).has("shot")) {
    window.__shotReady = true;
  }
})();
