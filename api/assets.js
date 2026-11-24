
const crypto = require("crypto");
const { requireUser } = require("./_auth");

const LIMITS = {
  image: 20 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  file: 20 * 1024 * 1024
};

function cleanFileName(value) {
  return String(value || "upload")
    .split(/[\\/]/).pop()
    .replace(/[^\w.\- ()]/g, "_")
    .slice(0, 150) || "upload";
}

function sendError(res, error) {
  console.error("Assets API error:", error);
  return res.status(error.status || 500).json({
    error: error.message || "Upload request failed."
  });
}

module.exports = async function handler(req, res) {
  try {
    const { admin, user } = await requireUser(req);

    if (req.method === "GET") {
      const { data, error } = await admin
        .from("hosted_assets")
        .select("id,file_name,content_type,size_bytes,category,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      return res.status(200).json({ assets: data || [] });
    }

    if (req.method === "POST") {
      const body = req.body || {};

      if (body.action === "create") {
        const fileName = cleanFileName(body.fileName);
        const category = body.category;
        const contentType = String(
          body.contentType || "application/octet-stream"
        );
        const size = Number(body.size);

        if (!Object.prototype.hasOwnProperty.call(LIMITS, category)) {
          return res.status(400).json({ error: "Invalid upload category." });
        }

        if (!Number.isSafeInteger(size) || size <= 0) {
          return res.status(400).json({ error: "Invalid file size." });
        }

        if (size > LIMITS[category]) {
          return res.status(400).json({
            error: `Maximum allowed size is ${LIMITS[category] / 1024 / 1024} MB.`
          });
        }

        if (category === "image" && !contentType.startsWith("image/")) {
          return res.status(400).json({ error: "Please select an image file." });
        }

        if (category === "video" && !contentType.startsWith("video/")) {
          return res.status(400).json({ error: "Please select a video file." });
        }

        const id = crypto.randomUUID();
        const path = `${user.id}/${id}/${fileName}`;

        const { data, error } = await admin.storage
          .from("uploads")
          .createSignedUploadUrl(path);

        if (error) throw error;

        return res.status(200).json({
          id,
          path,
          token: data.token,
          fileName,
          category,
          contentType,
          size
        });
      }

      if (body.action === "complete") {
        const { id, path, fileName, category, contentType, size } = body;

        if (
          typeof id !== "string" ||
          !/^[0-9a-f-]{36}$/i.test(id) ||
          typeof path !== "string" ||
          !path.startsWith(`${user.id}/${id}/`) ||
          !Object.prototype.hasOwnProperty.call(LIMITS, category)
        ) {
          return res.status(400).json({ error: "Invalid upload details." });
        }

        const safeName = cleanFileName(fileName);
        const expectedPath = `${user.id}/${id}/${safeName}`;

        if (path !== expectedPath) {
          return res.status(400).json({ error: "Invalid file path." });
        }

        const { data: objects, error: listError } = await admin.storage
          .from("uploads")
          .list(`${user.id}/${id}`, { limit: 10 });

        if (listError) throw listError;

        const uploaded = (objects || []).find(item => item.name === safeName);

        if (!uploaded) {
          return res.status(400).json({
            error: "Uploaded file was not found."
          });
        }

        const safeSize = Number(size);
        const safeType = String(contentType || "application/octet-stream");

        if (
          !Number.isSafeInteger(safeSize) ||
          safeSize <= 0 ||
          safeSize > LIMITS[category]
        ) {
          return res.status(400).json({ error: "Invalid file size." });
        }

        if (category === "image" && !safeType.startsWith("image/")) {
          return res.status(400).json({ error: "Invalid image type." });
        }

        if (category === "video" && !safeType.startsWith("video/")) {
          return res.status(400).json({ error: "Invalid video type." });
        }

        const { data: existing, error: existingError } = await admin
          .from("hosted_assets")
          .select("id")
          .eq("id", id)
          .maybeSingle();

        if (existingError) throw existingError;

        if (existing) {
          return res.status(409).json({
            error: "This upload already exists."
          });
        }

        const { data, error } = await admin
          .from("hosted_assets")
          .insert({
            id,
            user_id: user.id,
            file_name: safeName,
            object_path: path,
            content_type: safeType,
            size_bytes: safeSize,
            category
          })
          .select("id,file_name,content_type,size_bytes,category,created_at")
          .single();

        if (error) throw error;

        return res.status(201).json({ asset: data });
      }

      return res.status(400).json({ error: "Unknown upload action." });
    }

    if (req.method === "DELETE") {
      const id = String(req.body?.id || "");

      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return res.status(400).json({ error: "Invalid file ID." });
      }

      const { data: asset, error: findError } = await admin
        .from("hosted_assets")
        .select("id,object_path")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (findError) throw findError;
      if (!asset) {
        return res.status(404).json({ error: "File not found." });
      }

      const { error: storageError } = await admin.storage
        .from("uploads")
        .remove([asset.object_path]);

      if (storageError) throw storageError;

      const { error: deleteError } = await admin
        .from("hosted_assets")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;

      return res.status(200).json({ success: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    return sendError(res, error);
  }
};
