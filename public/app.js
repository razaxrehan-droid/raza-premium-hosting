
"use strict";

/*
  RAZA PREMIUM HOSTING
  Supabase frontend configuration.
  NEVER put the service role / secret key in this file.
*/

const SUPABASE_URL = "https://plgucryegwplskwzuwpb.supabase.co";
const SUPABASE_PUBLIC_KEY = "sb_publishable_flznM9-m0TztZGMbwa-pbg_HenQQa-c";

const ADMIN_EMAIL = "hackwizardx@gmail.com";
const SITE_URL = "https://raza-premium-hosting.vercel.app/";

const $ = (id) => document.getElementById(id);

const authView = $("authView");
const dashboardView = $("dashboardView");
const authForm = $("authForm");
const authMessage = $("authMessage");
const publishMessage = $("publishMessage");
const authSubmit = $("authSubmit");
const publishBtn = $("publishBtn");

let supabaseClient;
let isLogin = false;
let currentUser = null;
let currentAssetFilter = "all";
let otpEmail = "";
let adminUsers = [];

/* ========================================
   GENERAL HELPERS
======================================== */

function message(element, text, success = false) {
  if (!element) return;

  element.textContent = text;
  element.classList.remove("hidden", "success");

  if (success) {
    element.classList.add("success");
  }
}

function hideMessage(element) {
  if (!element) return;

  element.classList.add("hidden");
  element.textContent = "";
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function validUsername(value) {
  return /^[a-zA-Z0-9_]{3,24}$/.test(value);
}

function showAuth() {
  currentUser = null;

  dashboardView.classList.add("hidden");
  authView.classList.remove("hidden");

  $("logoutBtn").classList.add("hidden");

  $("adminPanel").hidden = true;
  $("userName").textContent = "Your username";
}

function showDashboard(user) {
  currentUser = user;

  authView.classList.add("hidden");
  dashboardView.classList.remove("hidden");

  $("logoutBtn").classList.remove("hidden");

  $("userEmail").textContent = user.email || "Your account";
  $("userEmail").title = user.email || "";

  const avatar = $("userEmail").previousElementSibling;
  if (avatar) {
    avatar.textContent = (user.email || "U").charAt(0).toUpperCase();
  }

  const initialUsername =
    user.user_metadata?.username ||
    (user.email ? user.email.split("@")[0] : "User");

  $("userName").textContent = initialUsername;

  loadProfile(user);
  loadSites();
  loadAssets();

  // Server verifies admin access. Frontend email check is only
  // used to avoid unnecessary requests for normal users.
  if (user.email?.toLowerCase() === ADMIN_EMAIL) {
    loadAdminPanel();
  } else {
    $("adminPanel").hidden = true;
  }
}

async function loadProfile(user) {
  try {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;

    const username =
      data?.username ||
      user.user_metadata?.username ||
      (user.email ? user.email.split("@")[0] : "User");

    $("userName").textContent = username;
    $("userName").title = username;
  } catch (error) {
    console.error("Profile loading error:", error);
  }
}

/* ========================================
   AUTHENTICATED API REQUESTS
======================================== */

async function accessToken() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) throw error;

  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Please log in again.");
  }

  return token;
}

async function apiFetch(url, options = {}) {
  const token = await accessToken();

  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`
  };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Your session expired. Please log in again.");
    }

    if (response.status === 403) {
      throw new Error(
        data.error || "Access denied. Your account may be deactivated."
      );
    }

    throw new Error(data.error || "Request failed.");
  }

  return data;
}

/* ========================================
   LOGIN / SIGNUP MODE
======================================== */

function setAuthMode(login) {
  isLogin = login;

  $("authTitle").textContent = login
    ? "Welcome back"
    : "Create your account";

  $("authSubtitle").textContent = login
    ? "Log in to manage your websites."
    : "Start publishing your websites for free.";

  $("authSubmit").innerHTML = login
    ? 'Log in <span>→</span>'
    : 'Create account <span>→</span>';

  $("switchText").textContent = login
    ? "New to Raza Hosting?"
    : "Already have an account?";

  $("switchAuth").textContent = login
    ? "Create account"
    : "Log in";

  $("password").autocomplete = login
    ? "current-password"
    : "new-password";

  $("usernameField").style.display = login ? "none" : "block";
  $("username").required = !login;

  $("forgotPassword").classList.toggle("hidden", !login);

  $("otpVerifyArea").style.display = "none";
  $("emailOtpCode").value = "";

  otpEmail = "";

  $("sendOtpBtn").textContent = "Continue with Email OTP";

  hideMessage(authMessage);
}

/* ========================================
   EMAIL OTP CONTROLS
======================================== */

const otpControls = document.createElement("div");

otpControls.id = "otpControls";

otpControls.style.cssText =
  "display:grid;gap:10px;margin-top:12px;";

otpControls.innerHTML = `
  <button
    type="button"
    id="sendOtpBtn"
    style="width:100%;padding:13px 16px;border:1px solid #ddd;border-radius:10px;background:transparent;color:inherit;font-weight:600;"
  >
    Continue with Email OTP
  </button>

  <div id="otpVerifyArea" style="display:none;gap:10px;">

    <input
      id="emailOtpCode"
      type="text"
      inputmode="numeric"
      autocomplete="one-time-code"
      maxlength="6"
      placeholder="Enter 6-digit email code"
      style="width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid #ddd;border-radius:10px;background:transparent;color:inherit;"
    >

    <button
      type="button"
      id="verifyOtpBtn"
      style="width:100%;padding:13px 16px;border:0;border-radius:10px;background:#7655dc;color:white;font-weight:700;"
    >
      Verify code and log in
    </button>

  </div>
`;

authSubmit.insertAdjacentElement("afterend", otpControls);

/* ========================================
   EMAIL OTP SEND
======================================== */

$("sendOtpBtn").addEventListener("click", async () => {
  hideMessage(authMessage);

  const email = $("email").value.trim();
  const username = $("username").value.trim();

  if (!email) {
    message(authMessage, "Please enter your email address first.");
    $("email").focus();
    return;
  }

  if (!isLogin && !validUsername(username)) {
    message(
      authMessage,
      "Username must be 3-24 characters using letters, numbers or underscore."
    );
    $("username").focus();
    return;
  }

  const button = $("sendOtpBtn");

  button.disabled = true;
  button.textContent = "Sending email code...";

  try {
    const options = {
      shouldCreateUser: !isLogin,
      emailRedirectTo: SITE_URL + "verified.html"
    };

    if (!isLogin) {
      options.data = { username };
    }

    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options
    });

    if (error) throw error;

    otpEmail = email;

    $("otpVerifyArea").style.display = "grid";

    message(
      authMessage,
      "A 6-digit code has been sent to your email. Enter it below.",
      true
    );

    $("emailOtpCode").focus();

  } catch (error) {
    message(
      authMessage,
      error.message || "Could not send the email code."
    );
  } finally {
    button.disabled = false;
    button.textContent = "Resend Email OTP";
  }
});

/* ========================================
   EMAIL OTP VERIFY
======================================== */

$("verifyOtpBtn").addEventListener("click", async () => {
  hideMessage(authMessage);

  const token = $("emailOtpCode").value.trim();

  if (!otpEmail) {
    message(authMessage, "Please request an email code first.");
    return;
  }

  if (!/^\d{6}$/.test(token)) {
    message(authMessage, "Enter the 6-digit code from your email.");
    $("emailOtpCode").focus();
    return;
  }

  const button = $("verifyOtpBtn");

  button.disabled = true;
  button.textContent = "Verifying...";

  try {
    const { data, error } = await supabaseClient.auth.verifyOtp({
      email: otpEmail,
      token,
      type: "email"
    });

    if (error) throw error;

    if (!data.user) {
      throw new Error("Verification did not return a user session.");
    }

    $("emailOtpCode").value = "";
    $("otpVerifyArea").style.display = "none";

    showDashboard(data.user);

  } catch (error) {
    message(
      authMessage,
      error.message || "Invalid or expired code."
    );
  } finally {
    button.disabled = false;
    button.textContent = "Verify code and log in";
  }
});

/* ========================================
   PASSWORD LOGIN / SIGNUP
======================================== */

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  hideMessage(authMessage);

  const email = $("email").value.trim();
  const password = $("password").value;
  const username = $("username").value.trim();

  if (!email || !password) {
    message(authMessage, "Please fill in your email and password.");
    return;
  }

  if (!isLogin && !validUsername(username)) {
    message(
      authMessage,
      "Username must be 3-24 characters using letters, numbers or underscore."
    );
    $("username").focus();
    return;
  }

  authSubmit.disabled = true;

  authSubmit.textContent = isLogin
    ? "Logging in..."
    : "Creating account...";

  try {
    if (isLogin) {
      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      showDashboard(data.user);

    } else {
      const { data, error } =
        await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: SITE_URL + "verified.html",
            data: {
              username
            }
          }
        });

      if (error) throw error;

      if (data.session) {
        showDashboard(data.user);
      } else {
        setAuthMode(true);

        message(
          authMessage,
          "Account created! Check your email to confirm your account, then log in.",
          true
        );
      }
    }

  } catch (error) {
    message(
      authMessage,
      error.message || "Authentication failed."
    );
  } finally {
    authSubmit.disabled = false;

    authSubmit.innerHTML = isLogin
      ? 'Log in <span>→</span>'
      : 'Create account <span>→</span>';
  }
});

$("switchAuth").addEventListener("click", () => {
  setAuthMode(!isLogin);
});

/* ========================================
   FORGOT PASSWORD
======================================== */

$("forgotPassword").addEventListener("click", async () => {
  hideMessage(authMessage);

  const email = $("email").value.trim();

  if (!email) {
    message(authMessage, "Enter your email address first.");
    $("email").focus();
    return;
  }

  const button = $("forgotPassword");

  button.disabled = true;
  button.textContent = "Sending recovery email...";

  try {
    const { error } =
      await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: SITE_URL + "reset-password.html"
      });

    if (error) throw error;

    message(
      authMessage,
      "Password recovery email sent. Please check your inbox.",
      true
    );

  } catch (error) {
    message(
      authMessage,
      error.message || "Could not send password recovery email."
    );
  } finally {
    button.disabled = false;
    button.textContent = "Forgot password?";
  }
});

/* ========================================
   LOGOUT
======================================== */

$("logoutBtn").addEventListener("click", async () => {
  const button = $("logoutBtn");

  button.disabled = true;

  try {
    await supabaseClient.auth.signOut();
    showAuth();
  } catch (error) {
    alert(error.message || "Could not log out.");
  } finally {
    button.disabled = false;
  }
});

/* ========================================
   WEBSITE ZIP PUBLISHING
======================================== */

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(String(reader.result).split(",")[1]);
    };

    reader.onerror = () => {
      reject(new Error("Could not read ZIP file."));
    };

    reader.readAsDataURL(file);
  });
}

$("zipFile").addEventListener("change", () => {
  const file = $("zipFile").files[0];

  hideMessage(publishMessage);

  if (!file) {
    $("fileInfo").classList.add("hidden");
    return;
  }

  if (!file.name.toLowerCase().endsWith(".zip")) {
    $("zipFile").value = "";
    message(publishMessage, "Please choose a ZIP file.");
    return;
  }

  if (file.size > 4 * 1024 * 1024) {
    $("zipFile").value = "";
    message(publishMessage, "ZIP file must be 4 MB or smaller.");
    return;
  }

  $("fileName").textContent =
    `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;

  $("fileInfo").classList.remove("hidden");
});

$("removeFile").addEventListener("click", () => {
  $("zipFile").value = "";
  $("fileInfo").classList.add("hidden");
});

$("publishForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  hideMessage(publishMessage);

  const name = $("siteName").value.trim();
  const slug = $("siteSlug").value.trim().toLowerCase();
  const html = $("htmlCode").value;
  const zip = $("zipFile").files[0];

  if (!name) {
    return message(publishMessage, "Enter your website name.");
  }

  if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
    return message(
      publishMessage,
      "Link name must be 3-40 lowercase letters, numbers or hyphens."
    );
  }

  if (!zip && !html.trim()) {
    return message(
      publishMessage,
      "Choose a ZIP file or paste HTML code."
    );
  }

  if (zip && zip.size > 4 * 1024 * 1024) {
    return message(
      publishMessage,
      "ZIP file must be 4 MB or smaller."
    );
  }

  if (!zip && new Blob([html]).size > 1024 * 1024) {
    return message(
      publishMessage,
      "HTML code must be 1 MB or smaller."
    );
  }

  publishBtn.disabled = true;
  publishBtn.textContent = "Publishing your website...";

  try {
    const payload = { name, slug };

    if (zip) {
      payload.zipBase64 = await fileToBase64(zip);
    } else {
      payload.html = html;
    }

    const result = await apiFetch("/api/publish", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const liveUrl = new URL(
      result.url,
      window.location.origin
    ).href;

    message(
      publishMessage,
      `Published successfully! Your website: ${liveUrl}`,
      true
    );

    $("siteName").value = "";
    $("siteSlug").value = "";
    $("htmlCode").value = "";
    $("zipFile").value = "";
    $("fileInfo").classList.add("hidden");
    $("fileName").textContent = "";

    await loadSites();

  } catch (error) {
    message(
      publishMessage,
      error.message || "Publishing failed."
    );
  } finally {
    publishBtn.disabled = false;
    publishBtn.innerHTML = 'Publish website <span>→</span>';
  }
});

/* ========================================
   WEBSITE MANAGEMENT
======================================== */

async function loadSites() {
  const list = $("sitesList");

  list.innerHTML =
    '<div class="empty-state">Loading your websites...</div>';

  try {
    const result = await apiFetch("/api/manage");
    const sites = result.sites || [];

    $("siteCount").textContent = sites.length;

    if (!sites.length) {
      list.innerHTML =
        '<div class="empty-state">No websites published yet. Your first project can go live above.</div>';
      return;
    }

    list.innerHTML = sites.map(site => {
      const url = `/s/${encodeURIComponent(site.slug)}`;
      const fullUrl = new URL(url, location.origin).href;

      return `
        <article class="site-item">

          <div class="site-symbol">▧</div>

          <div class="site-info">
            <b>${escapeHTML(site.name)}</b>

            <a href="${url}" target="_blank" rel="noopener noreferrer">
              ${escapeHTML(fullUrl)}
            </a>
          </div>

          <div class="site-actions">

            <a href="${url}" target="_blank" rel="noopener noreferrer">
              Open ↗
            </a>

            <button
              type="button"
              data-copy="${escapeHTML(fullUrl)}"
            >
              Copy link
            </button>

            <button
              type="button"
              class="delete-site"
              data-delete="${escapeHTML(site.slug)}"
            >
              Delete
            </button>

          </div>

        </article>`;
    }).join("");

  } catch (error) {
    list.innerHTML =
      `<div class="empty-state">${escapeHTML(error.message)}</div>`;
  }
}

$("sitesList").addEventListener("click", async (event) => {
  const copy = event.target.closest("[data-copy]");
  const del = event.target.closest("[data-delete]");

  if (copy) {
    try {
      await navigator.clipboard.writeText(copy.dataset.copy);

      copy.textContent = "Copied!";

      setTimeout(() => {
        copy.textContent = "Copy link";
      }, 1500);

    } catch {
      message(
        publishMessage,
        "Copy failed. Please copy the link manually."
      );
    }
  }

  if (del) {
    const slug = del.dataset.delete;

    if (!confirm(`Delete website "${slug}" permanently?`)) {
      return;
    }

    del.disabled = true;

    try {
      await apiFetch("/api/manage", {
        method: "DELETE",
        body: JSON.stringify({ slug })
      });

      await loadSites();

    } catch (error) {
      message(publishMessage, error.message);
      del.disabled = false;
    }
  }
});

$("refreshBtn").addEventListener("click", loadSites);

/* ========================================
   CLOUD IMAGE / VIDEO / FILE HOSTING
======================================== */

function formatAssetSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function assetShareUrl(id) {
  return new URL(
    `/f/${encodeURIComponent(id)}`,
    location.origin
  ).href;
}

async function loadAssets() {
  const list = $("assetsList");

  if (!list || !currentUser) return;

  list.innerHTML =
    '<div class="empty-state">Loading your uploads...</div>';

  try {
    const result = await apiFetch("/api/assets");
    const assets = result.assets || [];

    const counts = {
      all: assets.length,
      image: assets.filter(a => a.category === "image").length,
      video: assets.filter(a => a.category === "video").length,
      file: assets.filter(a => a.category === "file").length
    };

    $("assetCounts").textContent =
      `All: ${counts.all} · Images: ${counts.image} · Videos: ${counts.video} · Files: ${counts.file}`;

    const filtered = currentAssetFilter === "all"
      ? assets
      : assets.filter(a => a.category === currentAssetFilter);

    if (!filtered.length) {
      list.innerHTML =
        '<div class="empty-state">No uploads in this category yet.</div>';
      return;
    }

    list.innerHTML = filtered.map(asset => {
      const url = assetShareUrl(asset.id);

      const isImage = asset.category === "image";
      const isVideo = asset.category === "video";

      let preview;

      if (isImage) {
        preview = `
          <img
            class="asset-thumb"
            src="${escapeHTML(url)}"
            alt="Image preview"
            loading="lazy"
          >`;
      } else {
        const icon = isVideo ? "▶" : "▤";

        preview = `
          <div class="asset-thumb asset-icon">
            ${icon}
          </div>`;
      }

      return `
        <article class="asset-item">

          ${preview}

          <div class="asset-info">
            <b>${escapeHTML(asset.file_name)}</b>

            <span>
              ${escapeHTML(asset.category.toUpperCase())}
              · ${formatAssetSize(Number(asset.size_bytes))}
            </span>

            <small>
              ${escapeHTML(new Date(asset.created_at).toLocaleDateString())}
            </small>

            <a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">
              ${escapeHTML(url)}
            </a>
          </div>

          <div class="asset-actions">

            <a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">
              Open
            </a>

            <button
              type="button"
              data-asset-copy="${escapeHTML(asset.id)}"
            >
              Copy link
            </button>

            <button
              type="button"
              class="delete-site"
              data-asset-delete="${escapeHTML(asset.id)}"
            >
              Delete
            </button>

          </div>

        </article>`;
    }).join("");

  } catch (error) {
    list.innerHTML =
      `<div class="empty-state">${escapeHTML(error.message)}</div>`;
  }
}

/* ASSET CATEGORY FILTER */

document.querySelectorAll(".asset-filter").forEach(button => {
  button.addEventListener("click", () => {
    currentAssetFilter = button.dataset.filter;

    document.querySelectorAll(".asset-filter").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    loadAssets();
  });
});

/* ASSET UPLOAD */

$("assetUploadBtn").addEventListener("click", async () => {
  const file = $("assetFile").files[0];
  const category = $("assetCategory").value;

  const button = $("assetUploadBtn");
  const output = $("assetMessage");

  hideMessage(output);

  if (!file) {
    message(output, "Please choose a file first.");
    return;
  }

  if (category === "image" && !file.type.startsWith("image/")) {
    message(output, "Please select an image file.");
    return;
  }

  if (category === "video" && !file.type.startsWith("video/")) {
    message(output, "Please select a video file.");
    return;
  }

  const maxSize = category === "video" ? 50 : 20;

  if (file.size > maxSize * 1024 * 1024) {
    message(output, `Maximum file size is ${maxSize} MB.`);
    return;
  }

  button.disabled = true;
  button.textContent = "Preparing upload...";

  try {
    const init = await apiFetch("/api/assets", {
      method: "POST",
      body: JSON.stringify({
        action: "create",
        fileName: file.name,
        category,
        contentType: file.type || "application/octet-stream",
        size: file.size
      })
    });

    button.textContent = "Uploading...";

    const { error: uploadError } = await supabaseClient.storage
      .from("uploads")
      .uploadToSignedUrl(init.path, init.token, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false
      });

    if (uploadError) throw uploadError;

    button.textContent = "Saving details...";

    await apiFetch("/api/assets", {
      method: "POST",
      body: JSON.stringify({
        action: "complete",
        id: init.id,
        path: init.path,
        fileName: init.fileName,
        category: init.category,
        contentType: init.contentType,
        size: init.size
      })
    });

    $("assetFile").value = "";

    message(output, "Upload completed successfully!", true);

    await loadAssets();

  } catch (error) {
    message(output, error.message || "Upload failed.");
  } finally {
    button.disabled = false;
    button.textContent = "Upload to cloud →";
  }
});

/* ASSET COPY AND DELETE */

$("assetsList").addEventListener("click", async (event) => {
  const copy = event.target.closest("[data-asset-copy]");
  const del = event.target.closest("[data-asset-delete]");

  if (copy) {
    try {
      await navigator.clipboard.writeText(
        assetShareUrl(copy.dataset.assetCopy)
      );

      copy.textContent = "Copied!";

      setTimeout(() => {
        copy.textContent = "Copy link";
      }, 1500);

    } catch {
      message(
        $("assetMessage"),
        "Copy failed. Please copy the link manually."
      );
    }
  }

  if (del) {
    const id = del.dataset.assetDelete;

    if (!confirm("Permanently delete this uploaded file?")) {
      return;
    }

    del.disabled = true;

    try {
      await apiFetch("/api/assets", {
        method: "DELETE",
        body: JSON.stringify({ id })
      });

      await loadAssets();

    } catch (error) {
      message($("assetMessage"), error.message || "Delete failed.");
      del.disabled = false;
    }
  }
});

/* ========================================
   ADMIN PANEL
======================================== */

async function loadAdminPanel() {
  const panel = $("adminPanel");

  panel.hidden = true;

  try {
    const result = await apiFetch("/api/admin");

    if (!result.success || !Array.isArray(result.users)) {
      throw new Error("Could not load admin users.");
    }

    adminUsers = result.users;

    panel.hidden = false;

    updateAdminStats();
    renderAdminUsers();

  } catch (error) {
    panel.hidden = true;

    console.error("Admin access:", error.message);
  }
}

/* ADMIN STATISTICS */

function updateAdminStats() {
  const total = adminUsers.length;

  const active = adminUsers.filter(user => user.is_active).length;

  const inactive = total - active;

  $("totalUsers").textContent = total;
  $("activeUsers").textContent = active;
  $("inactiveUsers").textContent = inactive;
}

/* ADMIN USER LIST */

function renderAdminUsers() {
  const container = $("adminUsers");

  const search = $("userSearch").value
    .trim()
    .toLowerCase();

  const filtered = adminUsers.filter(user => {
    const email = (user.email || "").toLowerCase();
    const username = (user.username || "").toLowerCase();

    return email.includes(search) || username.includes(search);
  });

  if (!filtered.length) {
    container.innerHTML =
      '<div class="empty-state">No users found.</div>';
    return;
  }

  container.innerHTML = filtered.map(user => {
    const active = user.is_active === true;

    const statusClass = active ? "active" : "inactive";

    const statusText = active ? "ACTIVE" : "DEACTIVATED";

    const actionClass = active ? "deactivate" : "activate";

    const actionText = active ? "Deactivate" : "Activate";

    const created = user.created_at
      ? new Date(user.created_at).toLocaleDateString()
      : "Unknown";

    return `
      <article class="admin-user-card">

        <div class="admin-user-info">

          <strong>${escapeHTML(user.username || "Not set")}</strong>

          <span>${escapeHTML(user.email || "No email")}</span>

          <small>Joined: ${escapeHTML(created)}</small>

          <span class="admin-status ${statusClass}">
            ${statusText}
          </span>

        </div>

        <div class="admin-user-actions">

          <button
            type="button"
            class="${actionClass}"
            data-user-status="${escapeHTML(user.id)}"
            data-active="${active ? "false" : "true"}"
          >
            ${actionText}
          </button>

          <button
            type="button"
            data-user-reset="${escapeHTML(user.id)}"
            data-user-email="${escapeHTML(user.email || "")}"
          >
            Reset Password
          </button>

        </div>

      </article>
    `;
  }).join("");
}

/* SEARCH USERS */

$("userSearch").addEventListener("input", () => {
  renderAdminUsers();
});

/* REFRESH ADMIN USERS */

$("refreshUsers").addEventListener("click", async () => {
  const button = $("refreshUsers");

  button.disabled = true;
  button.textContent = "Loading...";

  hideMessage($("adminMessage"));

  try {
    await loadAdminPanel();

    if (!$("adminPanel").hidden) {
      message(
        $("adminMessage"),
        "User list refreshed successfully.",
        true
      );
    }

  } finally {
    button.disabled = false;
    button.textContent = "↻ Refresh";
  }
});

/* ACTIVATE / DEACTIVATE USERS */

$("adminUsers").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-user-status]");

  if (!button) return;

  const userId = button.dataset.userStatus;
  const active = button.dataset.active === "true";

  const user = adminUsers.find(item => item.id === userId);

  if (!user) return;

  const actionText = active ? "activate" : "deactivate";

  const confirmed = confirm(
    `Are you sure you want to ${actionText} ${user.email}?`
  );

  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "Please wait...";

  hideMessage($("adminMessage"));

  try {
    const result = await apiFetch("/api/admin", {
      method: "POST",
      body: JSON.stringify({
        action: "status",
        userId,
        active
      })
    });

    message(
      $("adminMessage"),
      result.message || "Account status updated.",
      true
    );

    await loadAdminPanel();

  } catch (error) {
    message(
      $("adminMessage"),
      error.message || "Could not update account status."
    );

    button.disabled = false;
    button.textContent = active ? "Activate" : "Deactivate";
  }
});

/* SEND PASSWORD RESET EMAIL */

$("adminUsers").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-user-reset]");

  if (!button) return;

  const email = button.dataset.userEmail;

  if (!email) {
    message($("adminMessage"), "This user has no email address.");
    return;
  }

  if (!confirm(`Send password reset email to ${email}?`)) {
    return;
  }

  button.disabled = true;
  button.textContent = "Sending...";

  hideMessage($("adminMessage"));

  try {
    const { error } =
      await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: SITE_URL + "reset-password.html"
      });

    if (error) throw error;

    message(
      $("adminMessage"),
      `Password reset email sent to ${email}.`,
      true
    );

  } catch (error) {
    message(
      $("adminMessage"),
      error.message || "Could not send password reset email."
    );
  } finally {
    button.disabled = false;
    button.textContent = "Reset Password";
  }
});

/* ========================================
   APP STARTUP
======================================== */

(async function init() {
  try {
    if (
      SUPABASE_URL.includes("YOUR_PROJECT_ID") ||
      SUPABASE_PUBLIC_KEY.includes("YOUR_SUPABASE")
    ) {
      showAuth();

      message(
        authMessage,
        "Setup required: add your Supabase Project URL and public key."
      );

      return;
    }

    if (!window.supabase?.createClient) {
      showAuth();

      message(
        authMessage,
        "Supabase client failed to load. Check your internet connection."
      );

      return;
    }

    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLIC_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );

    const { data, error } =
      await supabaseClient.auth.getSession();

    if (error) throw error;

    if (data.session?.user) {
      showDashboard(data.session.user);
    } else {
      showAuth();
    }

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        showDashboard(session.user);
      } else {
        showAuth();
      }
    });

    // Default signup mode
    setAuthMode(false);

  } catch (error) {
    console.error("App startup error:", error);

    showAuth();

    message(
      authMessage,
      error.message || "Could not start the application."
    );
  }
})();
