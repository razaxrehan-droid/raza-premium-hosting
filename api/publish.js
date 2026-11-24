
const { createClient } = require("@supabase/supabase-js");
const AdmZip = require("adm-zip");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const mime = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain"
};

function contentType(file) {
  const ext = file.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  return mime[ext] || "application/octet-stream";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY ||
      !process.env.PUBLISH_SECRET) {
    return res.status(500).json({ error: "Server configuration missing" });
  }

  if (req.headers["x-publish-key"] !== process.env.PUBLISH_SECRET) {
    return res.status(401).json({ error: "Invalid publishing key" });
  }

  try {
    const { name, slug, html, zipBase64 } = req.body || {};

    if (!name || !slug) {
      return res.status(400).json({ error: "Name and slug required" });
    }

    if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
      return res.status(400).json({ error: "Invalid website slug" });
    }

    let files = [];

    if (zipBase64) {
      const buffer = Buffer.from(zipBase64, "base64");

      if (buffer.length > 4 * 1024 * 1024) {
        return res.status(413).json({ error: "ZIP limit is 4 MB" });
      }

      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();

      if (entries.length > 100) {
        return res.status(400).json({ error: "Maximum 100 files" });
      }

      for (const entry of entries) {
        if (entry.isDirectory) continue;

        const path = entry.entryName.replace(/\\/g, "/");

        if (
          path.startsWith("/") ||
          path.split("/").some(part => part === "..") ||
          path.includes("\0")
        ) {
          return res.status(400).json({ error: "Unsafe ZIP path" });
        }

        const data = entry.getData();

        if (data.length > 2 * 1024 * 1024) {
          return res.status(413).json({ error: "Individual file too large" });
        }

        files.push({ path, data });
      }
    } else if (typeof html === "string" && html.trim()) {
      files.push({
        path: "index.html",
        data: Buffer.from(html)
      });
    } else {
      return res.status(400).json({
        error: "Provide HTML or ZIP file"
      });
    }

    if (!files.some(file => file.path === "index.html")) {
      return res.status(400).json({
        error: "ZIP must contain index.html"
      });
    }

    const { data: existing } = await supabase
      .from("sites")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: "Website name already taken" });
    }

    for (const file of files) {
      const { error } = await supabase.storage
        .from("websites")
        .upload(`${slug}/${file.path}`, file.data, {
          contentType: contentType(file.path),
          upsert: false
        });

      if (error) throw error;
    }

    const { error: dbError } = await supabase
      .from("sites")
      .insert({ name, slug });

    if (dbError) {
      await supabase.storage.from("websites").remove(
        files.map(file => `${slug}/${file.path}`)
      );
      throw dbError;
    }

    return res.status(200).json({
      success: true,
      name,
      url: `/s/${slug}`,
      message: "Website published successfully!"
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Publishing failed"
    });
  }
};
