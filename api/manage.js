const { requireUser } = require("./_auth");

async function collectFiles(admin, prefix, folder = "") {
  const { data, error } = await admin.storage.from("websites").list(
    [prefix, folder].filter(Boolean).join("/"),
    { limit: 1000 }
  );
  if (error) throw error;

  let paths = [];
  for (const item of data || []) {
    const relative = [folder, item.name].filter(Boolean).join("/");
    if (item.id === null) {
      paths = paths.concat(await collectFiles(admin, prefix, relative));
    } else {
      paths.push(`${prefix}/${relative}`);
    }
  }
  return paths;
}

module.exports = async (req, res) => {
  try {
    const { admin, user } = await requireUser(req);

    if (req.method === "GET") {
      const { data, error } = await admin.from("sites")
        .select("id,name,slug,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return res.status(200).json({ sites: data || [] });
    }

    if (req.method === "DELETE") {
      const { slug } = req.body || {};
      if (typeof slug !== "string" || !/^[a-z0-9-]{3,40}$/.test(slug)) {
        return res.status(400).json({ error: "Invalid website link name." });
      }

      const { data: site, error: findError } = await admin.from("sites")
        .select("id,slug").eq("slug", slug).eq("user_id", user.id).maybeSingle();

      if (findError) throw findError;
      if (!site) return res.status(404).json({ error: "Website not found in your account." });

      const paths = await collectFiles(admin, slug);
      if (paths.length) {
        const { error: removeError } = await admin.storage.from("websites").remove(paths);
        if (removeError) throw removeError;
      }

      const { error: deleteError } = await admin.from("sites")
        .delete().eq("id", site.id).eq("user_id", user.id);
      if (deleteError) throw deleteError;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error("MANAGE ERROR:", error);
    return res.status(error.status || 500).json({
      error: error.status ? error.message : (error.message || "Request failed.")
    });
  }
};
