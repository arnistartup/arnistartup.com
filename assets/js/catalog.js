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
    { id: "earrings", label: "Earrings" },
    { id: "hindu-god", label: "Hindu God" },
    { id: "happy-birthday", label: "Happy Birthday" }
  ];

  var UPLOAD_CATEGORIES = CATEGORIES.filter(function (cat) {
    return cat.id !== "all";
  }).map(function (cat) {
    return cat.id;
  });

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
  var typeSelect = document.getElementById("catalogUploadType");
  var typeWrap = document.getElementById("catalogUploadTypeWrap");
  var nameInput = document.getElementById("catalogUploadName");
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

  function isThemeCategory(category) {
    return !!(
      window.ArniCart &&
      typeof window.ArniCart.isThemeCategory === "function" &&
      window.ArniCart.isThemeCategory(category)
    );
  }

  function syncTypeSelect() {
    var category = categorySelect ? categorySelect.value : "";
    var needsType = isThemeCategory(category);
    if (typeWrap) typeWrap.hidden = !needsType;
    if (typeSelect && !needsType) typeSelect.value = "";
  }

  function badgeLabelForItem(item) {
    if (window.ArniCart && typeof window.ArniCart.labelForItem === "function") {
      return window.ArniCart.labelForItem(item);
    }
    return item.category || "";
  }

  function priceForItem(item) {
    if (window.ArniCart && typeof window.ArniCart.priceForCategory === "function") {
      return window.ArniCart.priceForCategory(item.category, item.productType);
    }
    return 0;
  }

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

  function utf8ToBase64(text) {
    return btoa(unescape(encodeURIComponent(text)));
  }

  function base64ToUtf8(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }

  function friendlyGithubError(message, status) {
    var msg = String(message || "");
    var lower = msg.toLowerCase();
    if (
      lower.indexOf("resource not accessible by personal access token") !==
        -1 ||
      status === 403
    ) {
      return (
        "Your GitHub token cannot write to this repo. Create a classic token " +
        "while logged in as arnistartup with the public_repo scope " +
        "(GitHub → Settings → Developer settings → Personal access tokens → " +
        "Tokens (classic)), then log in again."
      );
    }
    return msg || "GitHub request failed (" + status + ")";
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
      throw new Error(
        friendlyGithubError(
          data && (data.message || data.error),
          res.status
        )
      );
    }
    return data;
  }

  async function verifyGithubToken(token) {
    var headers = {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28"
    };

    var repoRes = await fetch(
      "https://api.github.com/repos/" + GITHUB.owner + "/" + GITHUB.repo,
      { headers: headers }
    );
    if (!repoRes.ok) {
      var repoData = null;
      try {
        repoData = await repoRes.json();
      } catch (err) {}
      throw new Error(
        friendlyGithubError(
          (repoData && repoData.message) ||
            "GitHub token could not access this repo",
          repoRes.status
        )
      );
    }

    var repoJson = await repoRes.json();
    if (!repoJson.permissions || !repoJson.permissions.push) {
      throw new Error(
        "This token can view the repo but cannot push. Recreate it with " +
          "write access (classic token: public_repo scope)."
      );
    }

    // Confirm Contents API read works (needed before upload/write).
    var contentsRes = await fetch(
      "https://api.github.com/repos/" +
        GITHUB.owner +
        "/" +
        GITHUB.repo +
        "/contents/" +
        GITHUB.dataPath,
      { headers: headers }
    );
    if (!contentsRes.ok) {
      var contentsData = null;
      try {
        contentsData = await contentsRes.json();
      } catch (err) {}
      throw new Error(
        friendlyGithubError(
          (contentsData && contentsData.message) ||
            "Token cannot read catalog-data.js",
          contentsRes.status
        )
      );
    }
  }

  function parseCatalogData(text) {
    var match = String(text).match(
      /ARNI_CATALOG_SEED\s*=\s*(\[[\s\S]*\])\s*;?\s*$/
    );
    if (!match) {
      throw new Error("Could not find the catalog list in catalog-data.js");
    }

    var literal = match[1];
    var parsed;
    try {
      // Prefer strict JSON (keys in double quotes).
      parsed = JSON.parse(literal);
    } catch (err) {
      // Fall back for hand-edited JS object literals like { id: "x" }.
      try {
        parsed = new Function("return (" + literal + ");")();
      } catch (err2) {
        throw new Error(
          "catalog-data.js could not be parsed. " + (err.message || "")
        );
      }
    }

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
    return { base64: base64, ext: ext };
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

      var media = document.createElement("div");
      media.className = "catalog-card-media";

      var img = document.createElement("img");
      img.src = item.src;
      img.alt = item.title || "Catalog item";
      img.loading = "lazy";

      media.appendChild(img);

      var meta = document.createElement("div");
      meta.className = "catalog-card-meta";

      var topRow = document.createElement("div");
      topRow.className = "catalog-card-top";

      var badge = document.createElement("span");
      badge.className = "catalog-card-badge";
      badge.textContent = badgeLabelForItem(item);

      var addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "catalog-cart-btn";
      addBtn.setAttribute(
        "aria-label",
        "Add " + (item.title || "item") + " to cart"
      );
      addBtn.textContent = "+ Add";
      addBtn.addEventListener("click", function () {
        if (window.ArniCart && typeof window.ArniCart.addItem === "function") {
          window.ArniCart.addItem(item);
        }
      });

      topRow.appendChild(badge);
      topRow.appendChild(addBtn);

      var title = document.createElement("h3");
      title.className = "catalog-card-title";
      title.textContent = item.title || "Handmade piece";

      var price = document.createElement("p");
      price.className = "catalog-card-price";
      var unit = priceForItem(item);
      price.textContent = unit ? "$" + unit.toFixed(2) : "";

      meta.appendChild(topRow);
      meta.appendChild(title);
      if (unit) meta.appendChild(price);

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

      card.appendChild(media);
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

  function titleForUpload(file, index, total) {
    var custom = nameInput ? nameInput.value.trim() : "";
    if (custom) {
      if (total > 1) return custom + " " + (index + 1);
      return custom;
    }
    return titleFromFile(file);
  }

  async function uploadOneFile(file, category, productType, index, total) {
    var compressed = await compressImage(file);
    var stem = safeFileStem(file.name);
    var filename = stem + "-" + Date.now() + compressed.ext;
    var imagePath = "assets/catalog/" + category + "/" + filename;
    var title = titleForUpload(file, index, total);
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
    if (productType) entry.productType = productType;
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

    var productType = "";
    if (isThemeCategory(category)) {
      productType = typeSelect ? typeSelect.value : "";
      if (productType !== "pin" && productType !== "magnet") {
        setStatus("Choose Pin or Magnet for this category.", "error");
        if (typeSelect) typeSelect.focus();
        if (fileInput) fileInput.value = "";
        return;
      }
    }

    var customName = nameInput ? nameInput.value.trim() : "";
    if (!customName) {
      setStatus("Enter a name before choosing photos.", "error");
      if (nameInput) nameInput.focus();
      if (fileInput) fileInput.value = "";
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
        await uploadOneFile(files[i], category, productType, i, files.length);
      }
      if (nameInput) nameInput.value = "";
      if (typeSelect) typeSelect.value = "";
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

  if (categorySelect) {
    categorySelect.addEventListener("change", syncTypeSelect);
    syncTypeSelect();
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
