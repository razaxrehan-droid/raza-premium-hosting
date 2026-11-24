
"use strict";

const { createClient } = require("@supabase/supabase-js");

function getAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Server configuration missing.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
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
    const authError = new Error(
      "Your login session expired. Please log in again."
    );

    authError.status = 401;
    throw authError;
  }

  const user = data.user;

  const bannedUntil = user.banned_until
    ? new Date(user.banned_until).getTime()
    : 0;

  if (bannedUntil > Date.now()) {
    const blocked = new Error(
      "Your account has been deactivated. Contact the administrator."
    );

    blocked.status = 403;
    throw blocked;
  }

  return { admin, user };
}

module.exports = {
  getAdmin,
  requireUser
};
