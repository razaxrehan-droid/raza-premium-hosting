
const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PUBLISH_SECRET } = process.env;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !PUBLISH_SECRET) {
      return res.status(500).json({
        error: "Vercel Environment Variables missing. Check Supabase settings."
      });
    }

    if (req.headers["x-publish-key"] !== PUBLISH_SECRET) {
      return res.status(401).json({
        error: "Invalid publishing key."
      });
    }

    const { name, slug, html } = req.body || {};

    if (!name || !slug || !html || !html.trim()) {
      return res.status(400).json({
        error: "Website name, slug and HTML code are required."
      });
    }

    if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
      return res.status(400).json({
        error: "Invalid website URL name."
      });
    }

    if (Buffer.byteLength(html, "utf8") > 1024 * 1024) {
      return res.status(413).json({
        error: "HTML file must be under 1 MB."
      });
    }

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: existing, error: checkError } = await supabase
      .from("sites")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle();

    if (checkError) throw new Error("Database check failed: " + checkError.message);

    if (existing) {
      return res.status(409).json({
        error: "This website URL is already taken. Choose another name."
      });
    }

    const { error: uploadError } = await supabase.storage
      .from("websites")
      .upload(`${slug}/index.html`, Buffer.from(html, "utf8"), {
        contentType: "text/html; charset=utf-8",
        upsert: false
      });

    if (uploadError) {
      throw new Error("Storage upload failed: " + uploadError.message);
    }

    const { error: dbError } = await supabase
      .from("sites")
      .insert({ name, slug });

    if (dbError) {
      await supabase.storage
        .from("websites")
        .remove([`${slug}/index.html`]);

      throw new Error("Database save failed: " + dbError.message);
    }

    return res.status(200).json({
      success: true,
      name,
      url: `/s/${slug}`,
      message: "Website published successfully!"
    });

  } catch (error) {
    console.error("PUBLISH ERROR:", error);

    return res.status(500).json({
      error: error.message || "Unknown publishing error."
    });
  }
};
