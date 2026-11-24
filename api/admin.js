
"use strict";

const { requireUser } = require("./_auth");

const ADMIN_EMAIL = "hackwizardx@gmail.com";

function send(res, status, data) {
  return res.status(status).json(data);
}

module.exports = async function handler(req, res) {
  try {
    const { admin, user } = await requireUser(req);

    // Server-side admin verification
    if (user.email?.toLowerCase() !== ADMIN_EMAIL) {
      return send(res, 403, {
        error: "Admin access denied."
      });
    }

    // GET: List all registered users
    if (req.method === "GET") {
      const allUsers = [];
      const perPage = 1000;
      let page = 1;

      while (true) {
        const { data, error } = await admin.auth.admin.listUsers({
          page,
          perPage
        });

        if (error) throw error;

        const users = data.users || [];
        allUsers.push(...users);

        if (users.length < perPage) break;

        page++;
      }

      const ids = allUsers.map(u => u.id);
      const profileMap = {};

      // Load usernames from profiles
      for (let i = 0; i < ids.length; i += 500) {
        const batch = ids.slice(i, i + 500);

        const { data: profiles, error } = await admin
          .from("profiles")
          .select("id, username")
          .in("id", batch);

        if (error) throw error;

        for (const profile of profiles || []) {
          profileMap[profile.id] = profile.username;
        }
      }

      const result = allUsers.map(u => {
        const banned = u.banned_until &&
          new Date(u.banned_until).getTime() > Date.now();

        return {
          id: u.id,
          email: u.email || "",
          username:
            profileMap[u.id] ||
            u.user_metadata?.username ||
            (u.email ? u.email.split("@")[0] : "Not set"),
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at || null,
          is_active: !banned
        };
      });

      return send(res, 200, {
        success: true,
        users: result,
        total: result.length
      });
    }

    // POST: Activate or deactivate an account
    if (req.method === "POST") {
      const { action, userId, active } = req.body || {};

      if (action !== "status") {
        return send(res, 400, {
          error: "Invalid action."
        });
      }

      if (
        typeof userId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)
      ) {
        return send(res, 400, {
          error: "Invalid user ID."
        });
      }

      if (typeof active !== "boolean") {
        return send(res, 400, {
          error: "Invalid account status."
        });
      }

      if (userId === user.id && !active) {
        return send(res, 400, {
          error: "You cannot deactivate your own admin account."
        });
      }

      const { data: targetData, error: targetError } =
        await admin.auth.admin.getUserById(userId);

      if (targetError || !targetData?.user) {
        return send(res, 404, {
          error: "User not found."
        });
      }

      if (
        targetData.user.email?.toLowerCase() === ADMIN_EMAIL &&
        !active
      ) {
        return send(res, 400, {
          error: "The admin account cannot be deactivated."
        });
      }

      const { error: updateError } =
        await admin.auth.admin.updateUserById(userId, {
          ban_duration: active ? "none" : "876000h"
        });

      if (updateError) throw updateError;

      return send(res, 200, {
        success: true,
        message: active
          ? "Account activated successfully."
          : "Account deactivated successfully."
      });
    }

    res.setHeader("Allow", "GET, POST");

    return send(res, 405, {
      error: "Method not allowed."
    });

  } catch (error) {
    console.error("Admin API error:", error);

    return send(
      res,
      error.status || 500,
      {
        error: error.status
          ? error.message
          : "Admin operation failed. Check server configuration."
      }
    );
  }
};
