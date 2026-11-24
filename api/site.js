
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const mime = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  woff2: "font/woff2",
  txt: "text/plain"
};

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const slug = req.query.slug;
    const file = req.query.file || "index.html";

    if (
      typeof slug !== "string" ||
      !/^[a-z0-9-]{3,40}$/.test(slug) ||
      typeof file !== "string" ||
      file.startsWith("/") ||
      file.split("/").some(part => !part || part === "." || part === "..")
    ) {
      return res.status(400).send("Invalid path");
    }

    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle();

    if (siteError || !site) {
      return res.status(404).send("Website not found");
    }

    const { data, error } = await supabase.storage
      .from("websites")
      .download(`${slug}/${file}`);

    if (error || !data) {
      return res.status(404).send("File not found");
    }

    const ext = file.split(".").pop().toLowerCase();

    res.setHeader(
      "Content-Type",
      mime[ext] || "application/octet-stream"
    );

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=300");

    const buffer = Buffer.from(await data.arrayBuffer());

    return res.status(200).send(buffer);

  } catch (error) {
    console.error(error);
    return res.status(500).send("Hosting server error");
  }
};
