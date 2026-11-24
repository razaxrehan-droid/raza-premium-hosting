const { getAdmin } = require("./_auth");

const MIME = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  mjs: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
  ico: "image/x-icon", txt: "text/plain; charset=utf-8",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf",
  mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg",
  pdf: "application/pdf"
};

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  try {
    const slug = req.query.slug;
    const file = req.query.file || "index.html";

    if (typeof slug !== "string" || !/^[a-z0-9-]{3,40}$/.test(slug) ||
        typeof file !== "string" || file.startsWith("/") ||
        file.includes("\\") || file.includes("\0") ||
        file.split("/").some(p => !p || p === "." || p === "..")) {
      return res.status(400).send("Invalid website path.");
    }

    const admin = getAdmin();
    const { data: site, error: siteError } = await admin
      .from("sites").select("slug").eq("slug", slug).maybeSingle();

    if (siteError || !site) return res.status(404).send("Website not found.");

    const { data, error } = await admin.storage.from("websites").download(`${slug}/${file}`);
    if (error || !data) return res.status(404).send("File not found.");

    const ext = file.split(".").pop().toLowerCase();
    const contentType = MIME[ext] || "application/octet-stream";
    const buffer = Buffer.from(await data.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Cache-Control", "public, max-age=300");

    // Uploaded HTML is sandboxed so it cannot read the hosting dashboard's origin storage.
    if (ext === "html" || file.toLowerCase().endsWith(".html")) {
      res.setHeader(
        "Content-Security-Policy",
        "sandbox allow-scripts allow-forms allow-popups; default-src * data: blob: 'unsafe-inline' 'unsafe-eval';"
      );
    }

    return res.status(200).send(buffer);
  } catch (error) {
    console.error("SITE ERROR:", error);
    return res.status(500).send("Hosting server error.");
  }
};
