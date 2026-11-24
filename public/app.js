
"use strict";

// =====================================
// RAZA PREMIUM HOSTING
// Complete Frontend JavaScript
// =====================================

const $ = (id) => document.getElementById(id);

const nameInput = $("name");
const slugInput = $("slug");
const keyInput = $("key");
const zipInput = $("zip");
const htmlInput = $("html");
const publishBtn = $("publish");
const resultBox = $("result");
const fileInfo = $("fileInfo");
const fileName = $("fileName");

// =====================================
// 1. AUTO WEBSITE SLUG
// =====================================

nameInput.addEventListener("input", () => {

  if (slugInput.dataset.edited === "true") return;

  slugInput.value = nameInput.value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

});

// =====================================
// 2. MANUAL SLUG EDITING
// =====================================

slugInput.addEventListener("input", () => {

  slugInput.dataset.edited = "true";

  slugInput.value = slugInput.value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);

});

// =====================================
// 3. ZIP FILE SELECT
// =====================================

zipInput.addEventListener("change", () => {

  const file = zipInput.files[0];

  if (!file) {
    fileInfo.style.display = "none";
    return;
  }

  if (!file.name.toLowerCase().endsWith(".zip")) {
    zipInput.value = "";
    fileInfo.style.display = "none";
    showError("Please select a valid ZIP file.");
    return;
  }

  if (file.size > 4 * 1024 * 1024) {
    zipInput.value = "";
    fileInfo.style.display = "none";
    showError("ZIP file must be under 4 MB.");
    return;
  }

  fileName.textContent =
    file.name + " (" + (file.size / 1024).toFixed(1) + " KB)";

  fileInfo.style.display = "flex";

  resultBox.style.display = "none";

});

// =====================================
// 4. ZIP TO BASE64
// =====================================

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

// =====================================
// 5. SHOW ERROR
// =====================================

function showError(message) {

  resultBox.style.display = "block";
  resultBox.className = "result error";

  resultBox.textContent = "✕ " + message;

  resultBox.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });

}

// =====================================
// 6. SHOW SUCCESS
// =====================================

function showSuccess(url) {

  resultBox.style.display = "block";
  resultBox.className = "result";

  resultBox.replaceChildren();

  const heading = document.createElement("strong");

  heading.textContent =
    "SUCCESS! YOUR WEBSITE IS LIVE";

  const paragraph = document.createElement("p");

  paragraph.textContent =
    "Your website has been published successfully.";

  const link = document.createElement("a");

  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = url;

  const copyButton = document.createElement("button");

  copyButton.type = "button";
  copyButton.textContent = "COPY WEBSITE LINK";

  copyButton.addEventListener("click", async () => {

    try {

      await navigator.clipboard.writeText(url);

      copyButton.textContent = "COPIED SUCCESSFULLY!";

    } catch {

      showError("Unable to copy link. Please copy it manually.");

    }

  });

  resultBox.append(
    heading,
    paragraph,
    link,
    document.createElement("br"),
    copyButton
  );

  resultBox.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

}

// =====================================
// 7. PUBLISH WEBSITE
// =====================================

publishBtn.addEventListener("click", async () => {

  const name = nameInput.value.trim();
  const slug = slugInput.value.trim();
  const key = keyInput.value.trim();

  const zip = zipInput.files[0];
  const html = htmlInput.value;

  // Validate website name

  if (!name) {
    return showError("Please enter your website name.");
  }

  // Validate slug

  if (!/^[a-z0-9-]{3,40}$/.test(slug)) {
    return showError(
      "Website URL must contain 3-40 lowercase letters, numbers or hyphens."
    );
  }

  // Publishing authentication

  if (!key) {
    return showError(
      "Publishing access key is required."
    );
  }

  // Validate content

  if (!zip && !html.trim()) {
    return showError(
      "Please upload a ZIP file or paste HTML code."
    );
  }

  // Validate ZIP

  if (zip && zip.size > 4 * 1024 * 1024) {
    return showError(
      "ZIP file maximum size is 4 MB."
    );
  }

  // Validate HTML size

  if (!zip && new Blob([html]).size > 1024 * 1024) {
    return showError(
      "HTML code must be under 1 MB."
    );
  }

  // Start publishing

  publishBtn.disabled = true;

  publishBtn.textContent = "PUBLISHING...";

  resultBox.style.display = "none";

  try {

    // Create request payload

    const payload = {
      name: name,
      slug: slug
    };

    // ZIP publishing

    if (zip) {

      payload.zipBase64 = await zipToBase64(zip);

    }

    // HTML publishing

    else {

      payload.html = html;

    }

    // API REQUEST

    const response = await fetch("/api/publish", {

      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-publish-key": key
      },

      body: JSON.stringify(payload)

    });

    // Read response safely

    const raw = await response.text();

    let data;

    try {

      data = JSON.parse(raw);

    } catch {

      throw new Error(
        "API returned HTML instead of JSON. Check Vercel API deployment. Response: " +
        raw.slice(0, 180)
      );

    }

    // Check API status

    if (!response.ok) {

      throw new Error(
        data.error || "Website publishing failed."
      );

    }

    // Verify publishing response

    if (!data.success || !data.url) {

      throw new Error(
        "Server returned an invalid publishing response."
      );

    }

    // Create final URL

    const websiteURL = new URL(
      data.url,
      window.location.origin
    ).href;

    // Show successful publishing

    showSuccess(websiteURL);

  } catch (error) {

    console.error(
      "RAZA HOSTING ERROR:",
      error
    );

    showError(
      error.message || "Unexpected server error."
    );

  } finally {

    publishBtn.disabled = false;

    publishBtn.innerHTML =
      '<span>↗</span> PUBLISH WEBSITE <span class="button-arrow">→</span>';

  }

});

// =====================================
// 8. CLEAR ERROR WHEN EDITING
// =====================================

[nameInput, slugInput, keyInput, htmlInput].forEach(element => {

  element.addEventListener("input", () => {

    if (resultBox.classList.contains("error")) {
      resultBox.style.display = "none";
    }

  });

});

// =====================================
// 9. CONSOLE BRANDING
// =====================================

console.log(
  "%c RAZA PREMIUM HOSTING ",
  "background:#7548df;color:white;padding:10px;font-size:16px;font-weight:bold;"
);

console.log("Powered by ALI RAZA");

