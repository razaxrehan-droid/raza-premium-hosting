
"use strict";

/*
  Supabase frontend configuration.
  Only use the public publishable/anon key here.
  NEVER put the service role / secret key in this file.
*/
const SUPABASE_URL = "https://plgucryegwplskwzuwpb.supabase.co";
const SUPABASE_PUBLIC_KEY = "sb_publishable_flznM9-m0TztZGMbwa-pbg_HenQQa-c";

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

function message(element, text, success = false) {
  element.textContent = text;
  element.classList.remove("hidden", "success");
  if (success) element.classList.add("success");
}

function hideMessage(element) {
  element.classList.add("hidden");
  element.textContent = "";
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function setAuthMode(login) {
  isLogin = login;
  $("authTitle").textContent = login ? "Welcome back" : "Create your account";
  $("authSubtitle").textContent = login
    ? "Log in to manage your websites."
    : "Start publishing your websites for free.";
  $("authSubmit").innerHTML = login
    ? 'Log in <span>→</span>'
    : 'Create account <span>→</span>';
  $("switchText").textContent = login
    ? "New to Raza Hosting?"
    : "Already have an account?";
  $("switchAuth").textContent = login ? "Create account" : "Log in";
  $("password").autocomplete = login ? "current-password" : "new-password";
  hideMessage(authMessage);
}

function showDashboard(user) {
  currentUser = user;
  authView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
  $("userEmail").textContent = user.email || "Your account";
  $("userEmail").title = user.email || "";
  $("userEmail").previousElementSibling.textContent =
    (user.email || "U").charAt(0).toUpperCase();

  loadSites();
  loadAssets();
}

function showAuth() {
  currentUser = null;
  dashboardView.classList.add("hidden");
  authView.classList.remove("hidden");
  $("logoutBtn").classList.add("hidden");
}

async function accessToken() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;

  const token = data.session?.access_token;
  if (!token) throw new Error("Please log in again.");

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

  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

// ========================================
// AUTHENTICATION
// ========================================

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage(authMessage);

  const email = $("email").value.trim();
  const password = $("password").value;

  authSubmit.disabled = true;
  authSubmit.textContent = isLogin ? "Logging in..." : "Creating account...";

  try {
    if (isLogin) {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      showDashboard(data.user);
    } else {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: "https://raza-premium-hosting.vercel.app/verified.html"
        }
      });

      if (error) throw error;

      if (data.session) {
        showDashboard(data.user);
      } else {
        setAuthMode(true);
        message(
          authMessage,
          "Account created. Check your email to confirm, then log in.",
          true
        );
      }
    }
  } catch (error) {
    message(authMessage, error.message || "Authentication failed.");
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

$("logoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  showAuth();
});

// ========================================
// WEBSITE ZIP PUBLISHING
// ========================================

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(String(reader.result).split(",")[1]);
    };

    reader.onerror = () => reject(new Error("Could not read ZIP file."));
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
      "Link name must be 3–40 lowercase letters, numbers or hyphens."
    );
  }

  if (!zip && !html.trim()) {
    return message(publishMessage, "Choose a ZIP file or paste HTML code.");
  }

  if (zip && zip.size > 4 * 1024 * 1024) {
    return message(publishMessage, "ZIP file must be 4 MB or smaller.");
  }

  if (!zip && new Blob([html]).size > 1024 * 1024) {
    return message(publishMessage, "HTML code must be 1 MB or smaller.");
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

    const liveUrl = new URL(result.url, window.location.origin).href;

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
    message(publishMessage, error.message || "Publishing failed.");
  } finally {
    publishBtn.disabled = false;
    publishBtn.innerHTML = 'Publish website <span>→</span>';
  }
});

// ========================================
// WEBSITE MANAGEMENT
// ========================================

async function loadSites() {
  const list = $("sitesList");
  list.innerHTML = '<div class="empty-state">Loading your websites...</div>';

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
            <a href="${url}" target="_blank" rel="noopener noreferrer">Open ↗</a>
            <button type="button" data-copy="${escapeHTML(fullUrl)}">Copy link</button>
            <button type="button" class="delete-site" data-delete="${escapeHTML(site.slug)}">Delete</button>
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
      message(publishMessage, "Copy failed. Please copy the link manually.");
    }
  }

  if (del) {
    const slug = del.dataset.delete;

    if (!confirm(`Delete website "${slug}" permanently?`)) return;

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

// ========================================
// CLOUD IMAGE / VIDEO / FILE HOSTING
// ========================================

function formatAssetSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function assetShareUrl(id) {
  return new URL(`/f/${encodeURIComponent(id)}`, location.origin).href;
}

async function loadAssets() {
  const list = $("assetsList");
  if (!list || !currentUser) return;

  list.innerHTML = '<div class="empty-state">Loading your uploads...</div>';

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
        preview = `<div class="asset-thumb asset-icon">${icon}</div>`;
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
            <small>${escapeHTML(new Date(asset.created_at).toLocaleDateString())}</small>
            <a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">
              ${escapeHTML(url)}
            </a>
          </div>
          <div class="asset-actions">
            <a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">Open</a>
            <button type="button" data-asset-copy="${escapeHTML(asset.id)}">Copy link</button>
            <button type="button" class="delete-site" data-asset-delete="${escapeHTML(asset.id)}">Delete</button>
          </div>
        </article>`;
    }).join("");
  } catch (error) {
    list.innerHTML =
      `<div class="empty-state">${escapeHTML(error.message)}</div>`;
  }
}

// Category filter buttons
document.querySelectorAll(".asset-filter").forEach(button => {
  button.addEventListener("click", () => {
    currentAssetFilter = button.dataset.filter;

    document.querySelectorAll(".asset-filter").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    loadAssets();
  });
});

// Upload selected file
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

// Copy links and delete uploaded files
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

    if (!confirm("Permanently delete this uploaded file?")) return;

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

// ========================================
// APP STARTUP
// ========================================

(async function init() {
  if (
    SUPABASE_URL.includes("YOUR_PROJECT_ID") ||
    SUPABASE_PUBLIC_KEY.includes("YOUR_SUPABASE")
  ) {
    showAuth();
    message(
      authMessage,
      "Setup required: add your Supabase Project URL and publishable/anon key in public/app.js."
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

  const { data } = await supabaseClient.auth.getSession();

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
})();
