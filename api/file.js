
const { getAdmin } = require("./_auth");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      return res.status(405).send("Method not allowed.");
    }

    res.setHeader("Cache-Control", "no-store");

    const id = String(req.query.id || "");

    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).send("Invalid file link.");
    }

    const admin = getAdmin();

    const { data: asset, error } = await admin
      .from("hosted_assets")
      .select("object_path,file_name")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!asset) return res.status(404).send("File not found.");

    const { data, error: signedError } = await admin.storage
      .from("uploads")
      .createSignedUrl(asset.object_path, 3600);

    if (signedError) throw signedError;
    if (!data?.signedUrl) throw new Error("Could not create file link.");

    return res.redirect(302, data.signedUrl);
  } catch (error) {
    console.error("File link error:", error);
    return res.status(500).send("Could not open this file.");
  }
};
