module.exports = async (req, res) => {
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Alive</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { background:#000; color:#00ff5a; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; margin:0; }
    .wrap { min-height:100vh; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:12px; padding:24px; text-align:center; }
    .badge { border:1px solid #00ff5a; padding:10px 14px; border-radius:10px; }
    .small { color:#66ff99; opacity:0.85; font-size:14px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="badge">JIPI IS ALIVE</div>
    <div class="small">OK</div>
  </div>
</body>
</html>`;

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
};
