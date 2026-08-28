(function () {
  var ADMIN_SESSION_KEY = "arniCatalogAdmin";
  var ADMIN_TOKEN_KEY = "arniCatalogGithubToken";
  // Change this password anytime — only people who know it can open upload.
  var ADMIN_PASSWORD = "arniadmin";

  var GITHUB = {
    owner: "arnistartup",
    repo: "arnistartup.com",
    branch: "main",
    dataPath: "assets/js/catalog-data.js"
  };

  var CATEGORIES = [
    { id: "all", label: "All" },
    { id: "badge-pins", label: "Badge pins" },
    { id: "magnets", label: "Magnets" },
    { id: "keychains", label: "Keychains" },
    { id: "bracelets", label: "Bracelets" },
    { id: "earrings", label: "Earrings" }
  ];

  var UPLOAD_CATEGORIES = CATEGORIES.filter(function (cat) {
    return cat.id !== "all";
  }).map(function (cat) {
    return cat.id;
  });

  var categoryLabels = CATEGORIES.reduce(function (map, cat) {
    map[cat.id] = cat.label;
    return map;
  }, {});

  var activeFilter = "all";
  var seedItems = Array.isArray(window.ARNI_CATALOG_SEED)
    ? window.ARNI_CATALOG_SEED.slice()
    : [];
  var isAdmin = false;
  var githubToken = "";
  var uploading = false;

  var grid = document.getElementById("catalogGrid");
  var empty = document.getElementById("catalogEmpty");
  var filters = document.getElementById("catalogFilters");
  var fileInput = document.getElementById("catalogFileInput");
  var uploadLabel = document.getElementById("catalogUploadLabel");
  var categorySelect = document.getElementById("catalogUploadCategory");
  var adminOpen = document.getElementById("catalogAdminOpen");
  var adminLogin = document.getElementById("catalogAdminLogin");
  var adminPassword = document.getElementById("catalogAdminPassword");
  var adminToken = document.getElementById("catalogAdminToken");
  var adminError = document.getElementById("catalogAdminError");
  var adminCancel = document.getElementById("catalogAdminCancel");
  var adminLogout = document.getElementById("catalogAdminLogout");
  var dropzone = document.getElementById("catalogDropzone");
  var statusEl = document.getElementById("catalogUploadStatus");

  if (!grid || !filters) return;

  function setStatus(message, kind) {
    if (!statusEl) return;
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.className = "catalog-upload-status";
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className =
      "catalog-upload-status" + (kind ? " is-" + kind : "");
  }

  function setAdminUI() {
    if (adminOpen) adminOpen.hidden = isAdmin;
    if (adminLogin) adminLogin.hidden = true;
    if (dropzone) dropzone.hidden = !isAdmin;
    if (adminError) {
      adminError.hidden = true;
      adminError.textContent = "";
    }
    if (adminPassword) adminPassword.value = "";
    if (adminToken) adminToken.value = "";
    if (!isAdmin) setStatus("");
    renderGrid();
  }

  function loginAdmin(token) {
    isAdmin = true;
    githubToken = token;
    try {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    } catch (err) {}
    setAdminUI();
  }

  function logoutAdmin() {
    isAdmin = false;
    githubToken = "";
    try {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch (err) {}
    setAdminUI();
  }

  function showLoginError(message) {
    if (!adminError) return;
    adminError.hidden = false;
    adminError.textContent = message;
  }

  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var chunk = 0x8000;
    var binary = "";
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, i + chunk)
      );
    }
    return btoa(binary);
  }

  function utf8ToBase64(text) {
    return btoa(unescape(encodeURIComponent(text)));
  }

  function base64ToUtf8(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }

  async function githubApi(path, options) {
    options = options || {};
    var res = await fetch(
      "https://api.github.com/repos/" +
        GITHUB.owner +
        "/" +
        GITHUB.repo +
        "/contents/" +
        path,
      {
        method: options.method || "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer " + githubToken,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json"
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      }
    );

    var data = null;
    try {
      data = await res.json();
    } catch (err) {
      data = null;
    }

    if (!res.ok) {
      var msg =
        (data && (data.message || data.error)) ||
        "GitHub request failed (" + res.status + ")";
      throw new Error(msg);
    }
    return data;
  }

  async function verifyGithubToken(token) {
    var res = await fetch(
      "https://api.github.com/repos/" + GITHUB.owner + "/" + GITHUB.repo,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer " + token,
          "X-GitHub-Api-Version": "2022-11-28"
        }
      }
    );
    if (!res.ok) {
      var data = null;
      try {
        data = await res.json();
      } catch (err) {}
      throw new Error(
        (data && data.message) ||
          "GitHub token could not access this repo (" + res.status + ")"
      );
    }
  }

  function parseCatalogData(text) {
    var cleaned = text
      .replace(/^\s*window\.ARNI_CATALOG_SEED\s*=\s*/, "")
      .replace(/;\s*$/, "")
      .trim();
    var parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      throw new Error("catalog-data.js did not contain a list");
    }
    return parsed;
  }

  function serializeCatalogData(items) {
    return (
      "window.ARNI_CATALOG_SEED = " +
      JSON.stringify(items, null, 2) +
      ";\n"
    );
  }

  function safeFileStem(name) {
    var stem = String(name || "photo")
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    return stem || "photo";
  }

  function titleFromFile(file) {
    var name = file.name.replace(/\.[^.]+$/, "");
    name = name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!name) return "Handmade piece";
    return name.replace(/\b\w/g, function (ch) {
      return ch.toUpperCase();
    });
  }

  function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  async function compressImage(file) {
    var dataUrl = await readFileAsDataURL(file);
    var img = await loadImage(dataUrl);
    var maxSide = 1200;
    var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    var width = Math.max(1, Math.round(img.width * scale));
    var height = Math.max(1, Math.round(img.height * scale));
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);

    var mime = "image/jpeg";
    var quality = 0.85;
    if (file.type === "image/png") {
      mime = "image/png";
      quality = undefined;
    }

    var outDataUrl = quality
      ? canvas.toDataURL(mime, quality)
      : canvas.toDataURL(mime);
    var base64 = outDataUrl.split(",")[1];
    var ext = mime === "image/png" ? ".png" : ".jpg";
    return { base64: base64, ext: ext, previewUrl: outDataUrl };
  }

  async function getCatalogFile() {
    return githubApi(GITHUB.dataPath);
  }

  async function putGithubFile(path, contentBase64, message, sha) {
    var body = {
      message: message,
      content: contentBase64,
      branch: GITHUB.branch
    };
    if (sha) body.sha = sha;
    return githubApi(path, { method: "PUT", body: body });
  }

  async function deleteGithubFile(path, sha, message) {
    return githubApi(path, {
      method: "DELETE",
      body: {
        message: message,
        sha: sha,
        branch: GITHUB.branch
      }
    });
  }

  function renderFilters() {
    filters.innerHTML = "";
    CATEGORIES.forEach(function (cat) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "catalog-filter" + (activeFilter === cat.id ? " is-active" : "");
      btn.setAttribute("data-filter", cat.id);
      btn.textContent = cat.label;
      btn.addEventListener("click", function () {
        activeFilter = cat.id;
        renderFilters();
        renderGrid();
      });
      filters.appendChild(btn);
    });
  }

  function renderGrid() {
    var items = seedItems.filter(function (item) {
      return activeFilter === "all" || item.category === activeFilter;
    });

    grid.innerHTML = "";

    if (items.length === 0) {
      empty.hidden = false;
      empty.textContent =
        activeFilter === "all"
          ? "No photos yet — check back soon!"
          : "No photos in this category yet. Try All, or another filter.";
      return;
    }

    empty.hidden = true;

    items.forEach(function (item) {
      var card = document.createElement("article");
      card.className = "catalog-card";
      card.setAttribute("data-category", item.category);

      var img = document.createElement("img");
      img.src = item.src;
      img.alt = item.title || "Catalog item";
      img.loading = "lazy";

      var meta = document.createElement("div");
      meta.className = "catalog-card-meta";

      var badge = document.createElement("span");
      badge.className = "catalog-card-badge";
      badge.textContent = categoryLabels[item.category] || item.category;

      var title = document.createElement("h3");
      title.className = "catalog-card-title";
      title.textContent = item.title || "Handmade piece";

      meta.appendChild(badge);
      meta.appendChild(title);

      if (isAdmin) {
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "catalog-card-remove";
        remove.setAttribute("aria-label", "Remove from GitHub catalog");
        remove.textContent = "Remove";
        remove.addEventListener("click", function () {
          removeCatalogItem(item);
        });
        meta.appendChild(remove);
      }

      card.appendChild(img);
      card.appendChild(meta);
      grid.appendChild(card);
    });
  }

  async function removeCatalogItem(item) {
    if (!isAdmin || uploading) return;
    if (
      !confirm(
        'Remove "' +
          (item.title || "this photo") +
          '" from the GitHub catalog?'
      )
    ) {
      return;
    }

    uploading = true;
    setStatus("Removing from GitHub…", "busy");

    try {
      var imagePath = item.src.replace(/^\//, "");
      try {
        var imageFile = await githubApi(imagePath);
        await deleteGithubFile(
          imagePath,
          imageFile.sha,
          "Remove catalog photo: " + (item.title || imagePath)
        );
      } catch (err) {
        // Image may already be gone; still update catalog-data.js
      }

      var dataFile = await getCatalogFile();
      var text = base64ToUtf8(dataFile.content.replace(/\n/g, ""));
      var items = parseCatalogData(text).filter(function (entry) {
        return entry.id !== item.id && entry.src !== item.src;
      });
      await putGithubFile(
        GITHUB.dataPath,
        utf8ToBase64(serializeCatalogData(items)),
        "Update catalog-data.js after removing " + (item.title || item.id),
        dataFile.sha
      );

      seedItems = items;
      window.ARNI_CATALOG_SEED = items.slice();
      renderGrid();
      setStatus("Removed from GitHub. The live site may take a minute to refresh.", "ok");
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Could not remove from GitHub.", "error");
    } finally {
      uploading = false;
    }
  }

  async function uploadOneFile(file, category, index, total) {
    var compressed = await compressImage(file);
    var stem = safeFileStem(file.name);
    var filename = stem + "-" + Date.now() + compressed.ext;
    var imagePath = "assets/catalog/" + category + "/" + filename;
    var title = titleFromFile(file);
    var id = category + "-" + stem + "-" + Date.now() + "-" + index;

    setStatus(
      "Uploading " + (index + 1) + " of " + total + " to " + category + "…",
      "busy"
    );

    await putGithubFile(
      imagePath,
      compressed.base64,
      "Add catalog photo (" + category + "): " + filename
    );

    var dataFile = await getCatalogFile();
    var text = base64ToUtf8(dataFile.content.replace(/\n/g, ""));
    var items = parseCatalogData(text);
    var entry = {
      id: id,
      title: title,
      category: category,
      src: imagePath
    };
    items.push(entry);

    await putGithubFile(
      GITHUB.dataPath,
      utf8ToBase64(serializeCatalogData(items)),
      "Add " + title + " to catalog-data.js",
      dataFile.sha
    );

    seedItems = items;
    window.ARNI_CATALOG_SEED = items.slice();
    return entry;
  }

  async function handleFiles(fileList) {
    if (!isAdmin || uploading) return;

    var category = categorySelect ? categorySelect.value : "badge-pins";
    if (UPLOAD_CATEGORIES.indexOf(category) === -1) {
      setStatus("Pick a valid category first.", "error");
      return;
    }

    var files = Array.prototype.slice.call(fileList || []).filter(function (f) {
      return f.type && f.type.indexOf("image/") === 0;
    });

    if (files.length === 0) {
      setStatus("Please choose image files (PNG, JPG, WEBP, or GIF).", "error");
      return;
    }

    if (!githubToken) {
      setStatus("Please log in again with your GitHub token.", "error");
      return;
    }

    uploading = true;
    if (fileInput) fileInput.disabled = true;
    if (uploadLabel) uploadLabel.style.opacity = "0.6";

    try {
      for (var i = 0; i < files.length; i++) {
        await uploadOneFile(files[i], category, i, files.length);
      }
      activeFilter = "all";
      renderFilters();
      renderGrid();
      setStatus(
        "Saved to assets/catalog/" +
          category +
          "/ and updated catalog-data.js. GitHub Pages may take a minute to show it for everyone.",
        "ok"
      );
    } catch (err) {
      console.error(err);
      setStatus(
        err.message ||
          "Upload failed. Check that your GitHub token can write to this repo.",
        "error"
      );
    } finally {
      uploading = false;
      if (fileInput) {
        fileInput.disabled = false;
        fileInput.value = "";
      }
      if (uploadLabel) uploadLabel.style.opacity = "";
    }
  }

  if (adminOpen) {
    adminOpen.addEventListener("click", function () {
      if (adminLogin) adminLogin.hidden = false;
      adminOpen.hidden = true;
      if (adminError) {
        adminError.hidden = true;
        adminError.textContent = "";
      }
      if (adminPassword) adminPassword.focus();
    });
  }

  if (adminCancel) {
    adminCancel.addEventListener("click", function () {
      if (adminLogin) adminLogin.hidden = true;
      if (adminOpen) adminOpen.hidden = false;
      if (adminError) {
        adminError.hidden = true;
        adminError.textContent = "";
      }
      if (adminPassword) adminPassword.value = "";
      if (adminToken) adminToken.value = "";
    });
  }

  if (adminLogin) {
    adminLogin.addEventListener("submit", async function (e) {
      e.preventDefault();
      var password = adminPassword ? adminPassword.value : "";
      var token = adminToken ? adminToken.value.trim() : "";

      if (password !== ADMIN_PASSWORD) {
        showLoginError("Incorrect password. Try again.");
        return;
      }
      if (!token) {
        showLoginError("Paste a GitHub token with Contents write access.");
        return;
      }

      showLoginError("Checking GitHub access…");
      try {
        await verifyGithubToken(token);
        loginAdmin(token);
      } catch (err) {
        showLoginError(err.message || "Could not verify GitHub token.");
      }
    });
  }

  if (adminLogout) {
    adminLogout.addEventListener("click", logoutAdmin);
  }

  if (fileInput) {
    fileInput.addEventListener("change", function (e) {
      handleFiles(e.target.files);
    });
  }

  if (dropzone) {
    ["dragenter", "dragover"].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) {
        if (!isAdmin) return;
        e.preventDefault();
        dropzone.classList.add("is-dragover");
      });
    });
    ["dragleave", "drop"].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        dropzone.classList.remove("is-dragover");
      });
    });
    dropzone.addEventListener("drop", function (e) {
      if (!isAdmin) return;
      handleFiles(e.dataTransfer.files);
    });
  }

  try {
    if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "1") {
      githubToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
      isAdmin = !!githubToken;
    }
  } catch (err) {
    isAdmin = false;
    githubToken = "";
  }

  renderFilters();
  setAdminUI();
})();
