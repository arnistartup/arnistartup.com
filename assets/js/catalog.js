(function () {
  var Admin = window.ArniAdminGate;
  var Gh = window.ArniGithub;
  var Img = window.ArniImages;
  var Site = window.ArniSite;
  var DATA_PATH = "assets/js/catalog-data.js";
  var CATEGORIES = Site ? Site.filterCategories() : [];
  var UPLOAD_CATEGORIES = Site ? Site.uploadCategories() : [];
  var UPLOAD_IDS = UPLOAD_CATEGORIES.map(function (cat) {
    return cat.id;
  });

  var MIN_ZOOM = 1;
  var MAX_ZOOM = 4;
  var TAP_ZOOM = 2.5;
  var TAP_SLOP = 8;

  var activeFilter = "all";
  var zoomScale = MIN_ZOOM;
  var zoomPanX = 0;
  var zoomPanY = 0;
  var skipBackdropClose = false;
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
  var adminLogout = document.getElementById("catalogAdminLogout");
  var dropzone = document.getElementById("catalogDropzone");
  var statusEl = document.getElementById("catalogUploadStatus");
  var lightbox = document.getElementById("catalogLightbox");
  var lightboxStage = document.getElementById("catalogLightboxStage");
  var lightboxImage = document.getElementById("catalogLightboxImage");
  var lightboxCaption = document.getElementById("catalogLightboxCaption");
  var lightboxClose = document.getElementById("catalogLightboxClose");
  var zoomInBtn = document.getElementById("catalogLightboxZoomIn");
  var zoomOutBtn = document.getElementById("catalogLightboxZoomOut");
  var zoomLevelEl = document.getElementById("catalogLightboxZoomLevel");

  if (!grid || !filters) return;

  function syncTypeSelect() {
    var category = categorySelect ? categorySelect.value : "";
    var needsType = !!(Site && Site.isThemeCategory(category));
    if (typeWrap) typeWrap.hidden = !needsType;
    if (typeSelect && !needsType) typeSelect.value = "";
  }

  function setStatus(message, kind) {
    if (Site) Site.setStatus(statusEl, "catalog-upload-status", message, kind);
  }

  function cssPx(name, fallback) {
    if (!lightbox) return fallback;
    var n = parseFloat(getComputedStyle(lightbox).getPropertyValue(name));
    return n > 0 ? n : fallback;
  }

  function fitPhotoToViewport() {
    if (!lightbox || lightbox.hidden || !lightboxImage) return;
    var naturalW = lightboxImage.naturalWidth;
    var naturalH = lightboxImage.naturalHeight;
    if (!naturalW || !naturalH) return;

    var availableW = Math.min(
      cssPx("--lightbox-max-w", 1100),
      window.innerWidth * 0.92
    );
    var availableH = Math.min(
      cssPx("--lightbox-max-h", 900),
      Math.max(200, window.innerHeight - cssPx("--lightbox-chrome", 150))
    );
    var scale = Math.min(availableW / naturalW, availableH / naturalH);

    lightboxImage.style.width = Math.round(naturalW * scale) + "px";
    lightboxImage.style.height = Math.round(naturalH * scale) + "px";
    applyZoom();
  }

  function applyZoom() {
    if (!lightboxImage || !lightboxStage) return;

    var maxPanX = Math.max(
      0,
      (lightboxImage.offsetWidth * zoomScale - lightboxStage.clientWidth) / 2
    );
    var maxPanY = Math.max(
      0,
      (lightboxImage.offsetHeight * zoomScale - lightboxStage.clientHeight) / 2
    );
    zoomPanX = Math.min(maxPanX, Math.max(-maxPanX, zoomPanX));
    zoomPanY = Math.min(maxPanY, Math.max(-maxPanY, zoomPanY));

    lightboxImage.style.transform =
      "translate(" + zoomPanX + "px, " + zoomPanY + "px) scale(" + zoomScale + ")";
    lightboxStage.classList.toggle("is-zoomed", zoomScale > MIN_ZOOM);
    if (zoomLevelEl) {
      zoomLevelEl.textContent = Math.round(zoomScale * 100) + "%";
    }
    if (zoomInBtn) zoomInBtn.disabled = zoomScale >= MAX_ZOOM;
    if (zoomOutBtn) zoomOutBtn.disabled = zoomScale <= MIN_ZOOM;
  }

  function setZoom(nextScale, clientX, clientY) {
    if (!lightboxStage) return;
    var target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextScale));
    if (target === zoomScale) return;

    if (target === MIN_ZOOM) {
      zoomPanX = 0;
      zoomPanY = 0;
    } else if (typeof clientX === "number") {
      var rect = lightboxStage.getBoundingClientRect();
      var dx = clientX - (rect.left + rect.width / 2);
      var dy = clientY - (rect.top + rect.height / 2);
      var ratio = target / zoomScale;
      zoomPanX = dx - (dx - zoomPanX) * ratio;
      zoomPanY = dy - (dy - zoomPanY) * ratio;
    }

    zoomScale = target;
    applyZoom();
  }

  function resetZoom() {
    zoomScale = MIN_ZOOM;
    zoomPanX = 0;
    zoomPanY = 0;
    applyZoom();
  }

  function openLightbox(item) {
    if (!lightbox || !lightboxImage) return;
    var title = item.title || "Catalog item";
    lightboxImage.src = item.src;
    lightboxImage.alt = title;
    if (lightboxCaption) lightboxCaption.textContent = title;
    lightbox.hidden = false;
    document.body.classList.add("lightbox-open");
    resetZoom();
    if (lightboxImage.complete) fitPhotoToViewport();
    if (lightboxClose) lightboxClose.focus();
  }

  function closeLightbox() {
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.classList.remove("lightbox-open");
    resetZoom();
    if (lightboxImage) {
      lightboxImage.removeAttribute("src");
      lightboxImage.alt = "";
      lightboxImage.style.width = "";
      lightboxImage.style.height = "";
    }
  }

  function bindLightbox() {
    if (lightboxClose) lightboxClose.addEventListener("click", closeLightbox);
    if (zoomInBtn) {
      zoomInBtn.addEventListener("click", function () {
        setZoom(zoomScale + 0.5);
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener("click", function () {
        setZoom(zoomScale - 0.5);
      });
    }
    if (lightboxImage) {
      lightboxImage.addEventListener("load", fitPhotoToViewport);
      window.addEventListener("resize", fitPhotoToViewport);
    }
    if (lightbox) {
      lightbox.addEventListener("click", function (e) {
        var wasDragging = skipBackdropClose;
        skipBackdropClose = false;
        if (e.target === lightbox && !wasDragging) closeLightbox();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") closeLightbox();
      });
    }
    if (!lightboxStage) return;

    var pointers = {};
    var lastPointer = null;
    var pinchStartDistance = 0;
    var pinchStartScale = 1;
    var dragDistance = 0;

    function pointerCount() {
      return Object.keys(pointers).length;
    }

    function pointerList() {
      return Object.keys(pointers).map(function (id) {
        return pointers[id];
      });
    }

    lightboxStage.addEventListener("pointerdown", function (e) {
      if (pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      lastPointer = { x: e.clientX, y: e.clientY };
      dragDistance = 0;
      try {
        lightboxStage.setPointerCapture(e.pointerId);
      } catch (err) {}

      if (pointerCount() === 2) {
        var pair = pointerList();
        pinchStartDistance = Math.hypot(
          pair[0].x - pair[1].x,
          pair[0].y - pair[1].y
        );
        pinchStartScale = zoomScale;
      }
    });

    lightboxStage.addEventListener("pointermove", function (e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };

      if (pointerCount() === 2 && pinchStartDistance > 0) {
        var pair = pointerList();
        var distance = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
        setZoom(
          pinchStartScale * (distance / pinchStartDistance),
          (pair[0].x + pair[1].x) / 2,
          (pair[0].y + pair[1].y) / 2
        );
        dragDistance = Infinity;
        return;
      }

      if (pointerCount() !== 1 || !lastPointer) return;
      var dx = e.clientX - lastPointer.x;
      var dy = e.clientY - lastPointer.y;
      lastPointer = { x: e.clientX, y: e.clientY };
      dragDistance += Math.abs(dx) + Math.abs(dy);

      if (zoomScale > MIN_ZOOM) {
        zoomPanX += dx;
        zoomPanY += dy;
        lightboxStage.classList.add("is-panning");
        applyZoom();
      }
    });

    function endPointer(e) {
      if (!pointers[e.pointerId]) return;
      delete pointers[e.pointerId];
      lightboxStage.classList.remove("is-panning");

      if (pointerCount() === 0) {
        if (e.type === "pointerup" && dragDistance < TAP_SLOP) {
          setZoom(
            zoomScale > MIN_ZOOM ? MIN_ZOOM : TAP_ZOOM,
            e.clientX,
            e.clientY
          );
        } else {
          skipBackdropClose = true;
        }
        lastPointer = null;
        pinchStartDistance = 0;
      }
    }

    lightboxStage.addEventListener("pointerup", endPointer);
    lightboxStage.addEventListener("pointercancel", endPointer);
    lightboxStage.addEventListener(
      "wheel",
      function (e) {
        e.preventDefault();
        setZoom(zoomScale + (e.deltaY < 0 ? 0.3 : -0.3), e.clientX, e.clientY);
      },
      { passive: false }
    );
  }

  function setAdminUI() {
    if (Admin) Admin.showChrome("catalogAdmin", isAdmin);
    if (dropzone) dropzone.hidden = !isAdmin;
    if (!isAdmin) setStatus("");
    renderGrid();
  }

  function setAdmin(token) {
    githubToken = token || "";
    isAdmin = !!githubToken;
    setAdminUI();
  }

  function parseCatalogData(text) {
    return Gh.parseSeedArray(text, "ARNI_CATALOG_SEED", "catalog-data.js");
  }

  function serializeCatalogData(items) {
    return Gh.serializeSeedArray("ARNI_CATALOG_SEED", items);
  }

  function safeFileStem(name) {
    return (Site && Site.slugify(String(name || "photo").replace(/\.[^.]+$/, ""), 40)) ||
      "photo";
  }

  function renderFilters() {
    filters.innerHTML = "";
    CATEGORIES.forEach(function (cat) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "catalog-filter" + (activeFilter === cat.id ? " is-active" : "");
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

      var media = document.createElement("button");
      media.type = "button";
      media.className = "catalog-card-media";
      media.setAttribute(
        "aria-label",
        "View larger photo of " + (item.title || "item")
      );
      media.addEventListener("click", function () {
        openLightbox(item);
      });

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
      badge.textContent = Site ? Site.labelForItem(item) : item.category || "";

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
      var unit = Site ? Site.priceForCategory(item.category, item.productType) : 0;
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
      await Gh.deleteFile(
        githubToken,
        imagePath,
        "Remove catalog photo: " + (item.title || imagePath)
      );

      var dataFile = await Gh.api(githubToken, DATA_PATH);
      var items = parseCatalogData(Gh.fileText(dataFile)).filter(function (entry) {
        return entry.id !== item.id && entry.src !== item.src;
      });
      await Gh.putFile(
        githubToken,
        DATA_PATH,
        Gh.utf8ToBase64(serializeCatalogData(items)),
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

  function titleForUpload(index, total) {
    var custom = nameInput ? nameInput.value.trim() : "";
    return total > 1 ? custom + " " + (index + 1) : custom;
  }

  async function uploadOneFile(file, category, productType, index, total) {
    var compressed = await Img.compress(file, { maxSide: 1600 });
    var stem = safeFileStem(file.name);
    var filename = stem + "-" + Date.now() + compressed.ext;
    var imagePath = "assets/catalog/" + category + "/" + filename;
    var title = titleForUpload(index, total);
    var id = category + "-" + stem + "-" + Date.now() + "-" + index;

    setStatus(
      "Uploading " + (index + 1) + " of " + total + " to " + category + "…",
      "busy"
    );

    await Gh.putFile(
      githubToken,
      imagePath,
      compressed.base64,
      "Add catalog photo (" + category + "): " + filename
    );

    var dataFile = await Gh.api(githubToken, DATA_PATH);
    var items = parseCatalogData(Gh.fileText(dataFile));
    var entry = {
      id: id,
      title: title,
      category: category,
      src: imagePath
    };
    if (productType) entry.productType = productType;
    items.push(entry);

    await Gh.putFile(
      githubToken,
      DATA_PATH,
      Gh.utf8ToBase64(serializeCatalogData(items)),
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
    if (UPLOAD_IDS.indexOf(category) === -1) {
      setStatus("Pick a valid category first.", "error");
      return;
    }

    var productType = "";
    if (Site && Site.isThemeCategory(category)) {
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
      return Img && Img.isImage(f);
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

  if (Admin && Gh) {
    Admin.bindLogin("catalogAdmin", async function (token) {
      await Gh.verifyToken(token);
      setAdmin(token);
    }, "Admin login");
  }

  if (adminLogout) {
    adminLogout.addEventListener("click", function () {
      setAdmin("");
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", function (e) {
      handleFiles(e.target.files);
    });
  }

  if (categorySelect && UPLOAD_CATEGORIES.length) {
    UPLOAD_CATEGORIES.forEach(function (cat) {
      var option = document.createElement("option");
      option.value = cat.id;
      option.textContent = cat.label;
      categorySelect.appendChild(option);
    });
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

  bindLightbox();
  renderFilters();
  setAdminUI();
})();
