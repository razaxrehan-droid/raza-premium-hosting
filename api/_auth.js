const { createClient } = require("@supabase/supabase-js");

function getAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server configuration missing.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function requireUser(req) {
  const header = req.headers.authorization || "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    const error = new Error("Please log in to continue.");
    error.status = 401;
    throw error;
  }

  const admin = getAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    const authError = new Error("Your login session expired. Please log in again.");
    authError.status = 401;
    throw authError;
  }
  return { admin, user: data.user };
}

module.exports = { getAdmin, requireUser };
