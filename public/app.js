
const $ = (id) => document.getElementById(id);

// Automatically generate website slug
$("name").addEventListener("input", () => {
  if (!$("slug").dataset.edited) {
    $("slug").value = $("name").value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
  }
});

// Manual slug editing
$("slug").addEventListener("input", () => {
  $("slug").dataset.edited = "true";

  $("slug").value = $("slug").value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);
});

// Read ZIP file as Base64
async function zipToBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let binary = "";

  for (let i = 0; i < bytes.length; i += 32768) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, i + 32768)
    );
  }

  return btoa(binary);
}

// Show error
function showError(message) {
  const result = $("result");

  result.style.display = "block";
  result.className = "result error";
  result.textContent = "❌ " + message;
}

// Show success
function showSuccess(url) {
  const result = $("result");

  result.style.display = "block";
  result.className = "result";
  result.replaceChildren();

  const heading = document.createElement("strong");
  heading.textContent = "🎉 Website Published Successfully!";

  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = url;

  const copy = document.createElement("button");
  copy.textContent = "Copy Website Link";
  copy.style.marginTop = "15px";

  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      copy.textContent = "Copied!";
    } catch {
      copy.textContent = "Copy failed";
    }
  };

  result.append(
    heading,
    document.createElement("br"),
    link,
    document.createElement("br"),
    copy
  );
}

// Main publishing function
$("publish").addEventListener("click", async () => {

  const btn = $("publish");

  const name = $("name").value.trim();
  const slug = $("slug").value.trim();
  const key = $("key").value.trim();
  const zip = $("zip").files[0];
  const html = $("html").value;

  if (!name || !slug) {
    return showError("Website name and URL are required.");
  }

  if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
    return showError("Invalid website URL name.");
  }

  if (!key) {
    return showError("Publishing access key required.");
  }

  if (!zip && !html.trim()) {
    return showError("Upload ZIP or paste HTML code.");
  }

  if (zip && zip.size > 4 * 1024 * 1024) {
    return showError("ZIP file maximum size is 4 MB.");
  }

  btn.disabled = true;
  btn.textContent = "⏳ PUBLISHING...";

  try {

    const payload = {
      name,
      slug
    };

    if (zip) {
      if (!zip.name.toLowerCase().endsWith(".zip")) {
        throw new Error("Please select a ZIP file.");
      }

      payload.zipBase64 = await zipToBase64(zip);

    } else {
      payload.html = html;
    }

    const response = await fetch("/api/publish", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-publish-key": key
      },

      body: JSON.stringify(payload)
    });

    // FIX: Read response as text first
    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        "Vercel API returned HTML instead of JSON. Check API deployment and routes. Response: " +
        raw.slice(0, 180)
      );
    }

    if (!response.ok) {
      throw new Error(
        data.error || "Publishing failed."
      );
    }

    if (!data.success || !data.url) {
      throw new Error("Invalid publishing response.");
    }

    const websiteURL = new URL(
      data.url,
      window.location.origin
    ).href;

    showSuccess(websiteURL);

  } catch (error) {

    console.error("Publishing error:", error);

    showError(error.message || "Something went wrong.");

  } finally {

    btn.disabled = false;
    btn.textContent = "🚀 PUBLISH WEBSITE";

  }

});
