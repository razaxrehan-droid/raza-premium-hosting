const AdmZip = require("adm-zip");
const { requireUser } = require("./_auth");

const MIME = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  mjs: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  txt: "text/plain; charset=utf-8",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  pdf: "application/pdf"
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  let admin;
  let uploadedPaths = [];

  try {
    const auth = await requireUser(req);
    admin = auth.admin;
    const user = auth.user;

    const { name, slug, html, zipBase64 } = req.body || {};
    if (!name || !slug) {
      return res.status(400).json({ error: "Website name and link name are required." });
    }
    if (typeof name !== "string" || name.trim().length > 80) {
      return res.status(400).json({ error: "Website name must be 1–80 characters." });
    }
    if (typeof slug !== "string" || !/^[a-z0-9-]{3,40}$/.test(slug)) {
      return res.status(400).json({ error: "Link name must be 3–40 lowercase letters, numbers or hyphens." });
    }

    let files = [];

    if (typeof zipBase64 === "string" && zipBase64.length) {
      const buffer = Buffer.from(zipBase64, "base64");
      if (buffer.length > 4 * 1024 * 1024) {
        return res.status(413).json({ error: "ZIP file must be 4 MB or smaller." });
      }

      let entries;
      try {
        entries = new AdmZip(buffer).getEntries();
      } catch {
        return res.status(400).json({ error: "This ZIP file is damaged or invalid." });
      }

      if (entries.length > 100) {
        return res.status(400).json({ error: "A ZIP can contain up to 100 files." });
      }

      let raw = [];
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        let path = entry.entryName.replace(/\\/g, "/");
        if (path.startsWith("/") || path.includes("\0") ||
            path.split("/").some(part => !part || part === "." || part === "..")) {
          return res.status(400).json({ error: "ZIP contains an unsafe file path." });
        }
        const data = entry.getData();
        if (data.length > 2 * 1024 * 1024) {
          return res.status(413).json({ error: "Each file in the ZIP must be 2 MB or smaller." });
        }
        raw.push({ path, data });
      }

      // Support ZIPs that contain one enclosing project folder.
      if (!raw.some(f => f.path.toLowerCase() === "index.html")) {
        const first = raw[0]?.path.split("/")[0];
        if (first && raw.every(f => f.path.startsWith(first + "/"))) {
          raw = raw.map(f => ({ ...f, path: f.path.slice(first.length + 1) }));
        }
      }
      files = raw;
    } else if (typeof html === "string" && html.trim()) {
      if (Buffer.byteLength(html, "utf8") > 1024 * 1024) {
        return res.status(413).json({ error: "HTML code must be 1 MB or smaller." });
      }
      files = [{ path: "index.html", data: Buffer.from(html, "utf8") }];
    } else {
      return res.status(400).json({ error: "Paste HTML code or choose a ZIP file." });
    }

    if (!files.length || !files.some(f => f.path.toLowerCase() === "index.html")) {
      return res.status(400).json({
        error: "ZIP must include index.html. Put it in the project root or inside one top-level project folder."
      });
    }

    const totalBytes = files.reduce((sum, f) => sum + f.data.length, 0);
    if (totalBytes > 10 * 1024 * 1024) {
      return res.status(413).json({ error: "Total extracted website size must be 10 MB or smaller." });
    }

    const { data: existing, error: checkError } = await admin
      .from("sites").select("slug").eq("slug", slug).maybeSingle();
    if (checkError) throw new Error("Database check failed: " + checkError.message);
    if (existing) {
      return res.status(409).json({ error: "That link name is already taken. Please choose another." });
    }

    for (const file of files) {
      const ext = file.path.split(".").pop().toLowerCase();
      const storagePath = `${slug}/${file.path}`;
      const { error } = await admin.storage.from("websites").upload(storagePath, file.data, {
        contentType: MIME[ext] || "application/octet-stream",
        upsert: false
      });
      if (error) throw new Error(`Upload failed (${file.path}): ${error.message}`);
      uploadedPaths.push(storagePath);
    }

    const { error: insertError } = await admin.from("sites").insert({
      user_id: user.id,
      name: name.trim(),
      slug
    });

    if (insertError) throw new Error("Could not save website record: " + insertError.message);

    return res.status(200).json({
      success: true,
      name: name.trim(),
      slug,
      url: `/s/${slug}`
    });
  } catch (error) {
    console.error("PUBLISH ERROR:", error);
    if (admin && uploadedPaths.length) {
      await admin.storage.from("websites").remove(uploadedPaths);
    }
    return res.status(error.status || 500).json({
      error: error.status ? error.message : (error.message || "Publishing failed.")
    });
  }
};
