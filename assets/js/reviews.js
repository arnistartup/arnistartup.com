(function () {
  var ADMIN_SESSION_KEY = "arniReviewsAdmin";
  var ADMIN_TOKEN_KEY = "arniReviewsGithubToken";
  var ADMIN_PASSWORD = "arniadmin";
  var IDB_NAME = "arniReviews";
  var IDB_STORE = "pending";

  var GITHUB = {
    owner: "arnistartup",
    repo: "arnistartup.com",
    branch: "main",
    dataPath: "assets/js/reviews-data.js"
  };

  var published = Array.isArray(window.ARNI_REVIEWS_SEED)
    ? window.ARNI_REVIEWS_SEED.slice()
    : [];
  var pending = [];
  var isAdmin = false;
  var githubToken = "";
  var busy = false;

  var grid = document.getElementById("reviewsGrid");
  var empty = document.getElementById("reviewsEmpty");
  var form = document.getElementById("reviewForm");
  var nameInput = document.getElementById("reviewName");
  var emailInput = document.getElementById("reviewEmail");
  var textInput = document.getElementById("reviewText");
  var fileInput = document.getElementById("reviewImage");
  var preview = document.getElementById("reviewImagePreview");
  var statusEl = document.getElementById("reviewFormStatus");
  var submitBtn = document.getElementById("reviewSubmitBtn");
  var honeypot = document.getElementById("reviewWebsite");

  var adminOpen = document.getElementById("reviewsAdminOpen");
  var adminLogin = document.getElementById("reviewsAdminLogin");
  var adminPassword = document.getElementById("reviewsAdminPassword");
  var adminToken = document.getElementById("reviewsAdminToken");
  var adminError = document.getElementById("reviewsAdminError");
  var adminCancel = document.getElementById("reviewsAdminCancel");
  var adminPanel = document.getElementById("reviewsAdminPanel");
  var adminLogout = document.getElementById("reviewsAdminLogout");
  var pendingList = document.getElementById("reviewsPendingList");
  var pendingEmpty = document.getElementById("reviewsPendingEmpty");
  var publishStatus = document.getElementById("reviewsPublishStatus");

  if (!grid || !form) return;

  function setStatus(el, message, kind) {
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      el.className = "reviews-status";
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.className = "reviews-status" + (kind ? " is-" + kind : "");
  }

  function slugify(value, maxLen) {
    return String(value || "customer")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, maxLen || 24);
  }

  function isRemotePhotoUrl(src) {
    return /^https?:\/\//i.test(String(src || ""));
  }

  function configImgbbKey() {
    return typeof window.ARNI_IMGBB_API_KEY === "string"
      ? window.ARNI_IMGBB_API_KEY.trim()
      : "";
  }

  function normalizePending(item) {
    if (!item || !item.id) return null;
    return {
      id: item.id,
      name: item.name,
      email: item.email || "",
      text: item.text,
      src: item.src || "",
      previewUrl: item.previewUrl || item.src || "",
      base64: item.base64 || "",
      ext: item.ext || ".jpg",
      createdAt: item.createdAt || "",
      file: item.file
    };
  }

  function mergePending(lists) {
    var byId = {};
    lists.forEach(function (list) {
      (list || []).forEach(function (raw) {
        var item = normalizePending(raw);
        if (!item) return;
        var prev = byId[item.id];
        if (!prev) {
          byId[item.id] = item;
          return;
        }
        byId[item.id] = {
          id: item.id,
          name: item.name || prev.name,
          email: item.email || prev.email,
          text: item.text || prev.text,
          src: item.src || prev.src,
          previewUrl: item.previewUrl || prev.previewUrl || item.src || prev.src,
          base64: item.base64 || prev.base64,
          ext: item.ext || prev.ext,
          createdAt: item.createdAt || prev.createdAt,
          file: item.file || prev.file
        };
      });
    });
    return Object.keys(byId)
      .map(function (id) {
        return byId[id];
      })
      .sort(function (a, b) {
        return String(a.createdAt).localeCompare(String(b.createdAt));
      });
  }

  function openIdb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error || new Error("IndexedDB open failed"));
      };
    });
  }

  async function idbGetAll() {
    try {
      var db = await openIdb();
      return await new Promise(function (resolve, reject) {
        var req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).getAll();
        req.onsuccess = function () {
          resolve(Array.isArray(req.result) ? req.result : []);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    } catch (err) {
      return [];
    }
  }

  async function idbPut(item) {
    try {
      var db = await openIdb();
      await new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(item);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    } catch (err) {}
  }

  async function idbDelete(id) {
    try {
      var db = await openIdb();
      await new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).delete(id);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    } catch (err) {}
  }

  async function reloadPending() {
    pending = mergePending([await idbGetAll()]);
    renderPending();
    return pending;
  }

  async function dropPendingLocal(item) {
    pending = pending.filter(function (p) {
      return p.id !== item.id;
    });
    await idbDelete(item.id);
    renderPending();
  }

  async function uploadToImgbb(base64, name) {
    var key = configImgbbKey();
    if (!key) throw new Error("IMGBB_NOT_CONFIGURED");
    var body = new FormData();
    body.append("image", base64);
    if (name) body.append("name", slugify(name, 40));
    var res = await fetch(
      "https://api.imgbb.com/1/upload?key=" + encodeURIComponent(key),
      { method: "POST", body: body }
    );
    var data = null;
    try {
      data = await res.json();
    } catch (err) {}
    if (!res.ok || !data || !data.success || !data.data) {
      throw new Error(
        (data && data.error && data.error.message) ||
          "Could not upload photo to ImgBB."
      );
    }
    return {
      url: data.data.display_url || data.data.url
    };
  }

  async function fetchRemoteImageAsBase64(url) {
    var res = await fetch(url);
    if (!res.ok) throw new Error("Could not download review photo.");
    var blob = await res.blob();
    var dataUrl = await readFileAsDataURL(blob);
    var match = String(dataUrl).match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) throw new Error("Could not read review photo.");
    return {
      base64: match[2],
      ext: match[1].toLowerCase() === "png" ? ".png" : ".jpg"
    };
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

  async function compressImage(file, maxSide, quality) {
    var dataUrl = await readFileAsDataURL(file);
    var img = await loadImage(dataUrl);
    var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    var width = Math.max(1, Math.round(img.width * scale));
    var height = Math.max(1, Math.round(img.height * scale));
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    var out = canvas.toDataURL("image/jpeg", quality);
    return {
      dataUrl: out,
      base64: out.split(",")[1],
      ext: ".jpg"
    };
  }

  function utf8ToBase64(text) {
    return btoa(unescape(encodeURIComponent(text)));
  }

  function base64ToUtf8(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }

  function parseReviewsData(text) {
    var match = String(text).match(/ARNI_REVIEWS_SEED\s*=\s*(\[[\s\S]*\])\s*;?\s*$/);
    if (!match) throw new Error("Could not find reviews list");
    try {
      return JSON.parse(match[1]);
    } catch (err) {
      return new Function("return (" + match[1] + ");")();
    }
  }

  function serializeReviewsData(items) {
    return "window.ARNI_REVIEWS_SEED = " + JSON.stringify(items, null, 2) + ";\n";
  }

  function friendlyGithubError(message, status) {
    var msg = String(message || "");
    if (msg.toLowerCase().indexOf("resource not accessible") !== -1 || status === 403) {
      return "GitHub token cannot write to this repo. Use a classic token with public_repo.";
    }
    return msg || "GitHub request failed (" + status + ")";
  }

  async function githubApi(path, options) {
    options = options || {};
    if (!githubToken) throw new Error("GitHub token is missing.");
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
    } catch (err) {}
    if (!res.ok) {
      var error = new Error(friendlyGithubError(data && data.message, res.status));
      error.status = res.status;
      throw error;
    }
    return data;
  }

  async function getOrCreateReviewsData() {
    try {
      var dataFile = await githubApi(GITHUB.dataPath);
      return {
        items: parseReviewsData(base64ToUtf8(dataFile.content.replace(/\n/g, ""))),
        sha: dataFile.sha
      };
    } catch (err) {
      if (err && err.status === 404) return { items: [], sha: null };
      throw err;
    }
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

  async function deleteGithubFile(path, message) {
    try {
      var existing = await githubApi(path);
      await githubApi(path, {
        method: "DELETE",
        body: {
          message: message,
          sha: existing.sha,
          branch: GITHUB.branch
        }
      });
    } catch (err) {
      if (!err || err.status !== 404) throw err;
    }
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
      throw new Error(friendlyGithubError(data && data.message, res.status));
    }
    var repo = await res.json();
    if (!repo.permissions || !repo.permissions.push) {
      throw new Error(
        "This token can view the repo but cannot push. Use public_repo scope."
      );
    }
  }

  function renderPublished() {
    grid.innerHTML = "";
    if (!published.length) {
      empty.hidden = false;
      empty.textContent =
        "No published reviews yet. Be the first to share your experience!";
      return;
    }
    empty.hidden = true;
    published
      .slice()
      .reverse()
      .forEach(function (review) {
        var card = document.createElement("article");
        card.className = "review-card";

        var body = document.createElement("div");
        body.className = "review-card-body";

        var who = document.createElement("h3");
        who.className = "review-card-name";
        who.textContent = review.name || "Customer";

        var quote = document.createElement("p");
        quote.className = "review-card-text";
        quote.textContent = "“" + (review.text || "") + "”";

        body.appendChild(who);
        body.appendChild(quote);

        if (review.date) {
          var date = document.createElement("p");
          date.className = "review-card-date";
          date.textContent = review.date;
          body.appendChild(date);
        }

        if (isAdmin) {
          var actions = document.createElement("div");
          actions.className = "review-card-actions";
          var del = document.createElement("button");
          del.type = "button";
          del.className = "review-reject-btn";
          del.textContent = "Delete";
          del.addEventListener("click", function () {
            deletePublishedReview(review);
          });
          actions.appendChild(del);
          body.appendChild(actions);
        }

        var img = document.createElement("img");
        img.src = review.src;
        img.alt = "Photo from " + (review.name || "a customer");
        img.loading = "lazy";

        card.appendChild(body);
        card.appendChild(img);
        grid.appendChild(card);
      });
  }

  function renderPending() {
    if (!pendingList || !pendingEmpty) return;
    pendingList.innerHTML = "";
    if (!isAdmin) return;

    if (!pending.length) {
      pendingEmpty.hidden = false;
      pendingEmpty.textContent = "No pending reviews.";
      return;
    }
    pendingEmpty.hidden = true;

    pending.forEach(function (item) {
      var row = document.createElement("article");
      row.className = "review-pending-card";

      var img = document.createElement("img");
      img.src = item.previewUrl || item.src || "";
      img.alt = "Pending review photo";

      var info = document.createElement("div");
      info.className = "review-pending-info";

      var title = document.createElement("h4");
      title.textContent = item.name + (item.email ? " · " + item.email : "");

      var text = document.createElement("p");
      text.textContent = item.text;

      var actions = document.createElement("div");
      actions.className = "review-pending-actions";

      var approve = document.createElement("button");
      approve.type = "button";
      approve.className = "btn-primary";
      approve.textContent = "Approve & publish";
      approve.addEventListener("click", function () {
        publishReview(item, true);
      });

      var reject = document.createElement("button");
      reject.type = "button";
      reject.className = "review-reject-btn";
      reject.textContent = "Reject";
      reject.addEventListener("click", function () {
        rejectReview(item);
      });

      actions.appendChild(approve);
      actions.appendChild(reject);
      info.appendChild(title);
      info.appendChild(text);
      info.appendChild(actions);
      row.appendChild(img);
      row.appendChild(info);
      pendingList.appendChild(row);
    });
  }

  function setAdminUI() {
    if (adminOpen) adminOpen.hidden = isAdmin;
    if (adminLogin) adminLogin.hidden = true;
    if (adminPanel) adminPanel.hidden = !isAdmin;
    if (adminError) {
      adminError.hidden = true;
      adminError.textContent = "";
    }
    if (adminPassword) adminPassword.value = "";
    if (adminToken) adminToken.value = "";
    renderPublished();
    renderPending();
  }

  async function loginAdmin(token) {
    isAdmin = true;
    githubToken = token;
    try {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    } catch (err) {}
    setAdminUI();
    setStatus(publishStatus, "Loading pending reviews…", "busy");
    try {
      await reloadPending();
      setStatus(
        publishStatus,
        pending.length
          ? "Loaded " + pending.length + " pending review(s)."
          : "No pending reviews right now. Use Publish manually with the email photo URL if needed.",
        "ok"
      );
    } catch (err) {
      setStatus(publishStatus, err.message || "Could not load pending reviews.", "error");
    }
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

  async function ensureReviewBase64(item) {
    if (item.base64) return { base64: item.base64, ext: item.ext || ".jpg" };
    if (item.file) {
      var compressed = await compressImage(item.file, 1000, 0.85);
      return { base64: compressed.base64, ext: compressed.ext };
    }
    if (item.src && isRemotePhotoUrl(item.src)) {
      return fetchRemoteImageAsBase64(item.src);
    }
    if (item.src) {
      var file = await githubApi(item.src);
      return {
        base64: file.content.replace(/\n/g, ""),
        ext: item.ext || ".jpg"
      };
    }
    throw new Error("Review photo is missing.");
  }

  async function rejectReview(item) {
    if (!isAdmin || busy) return;
    busy = true;
    setStatus(publishStatus, "Removing pending review…", "busy");
    try {
      await dropPendingLocal(item);
      setStatus(publishStatus, "Review rejected and removed from pending.", "ok");
    } catch (err) {
      console.error(err);
      setStatus(publishStatus, err.message || "Could not reject review.", "error");
    } finally {
      busy = false;
    }
  }

  async function deletePublishedReview(review) {
    if (!isAdmin || busy) return;
    if (!githubToken) {
      setStatus(publishStatus, "Please log in again with your GitHub token.", "error");
      return;
    }
    var label = (review && review.name) || "this review";
    if (
      !window.confirm(
        "Delete the published review from " +
          label +
          "? This removes it from the site and GitHub."
      )
    ) {
      return;
    }

    busy = true;
    setStatus(publishStatus, "Deleting published review…", "busy");
    try {
      var existing = await getOrCreateReviewsData();
      var items = existing.items.filter(function (item) {
        if (review.id && item.id) return item.id !== review.id;
        return !(item.src === review.src && item.name === review.name);
      });

      await putGithubFile(
        GITHUB.dataPath,
        utf8ToBase64(serializeReviewsData(items)),
        "Delete review from " + label,
        existing.sha || undefined
      );

      if (review.src && review.src.indexOf("assets/reviews/") === 0) {
        try {
          await deleteGithubFile(
            review.src,
            "Delete review photo: " + review.src.split("/").pop()
          );
        } catch (err) {
          console.warn("Removed from list, but photo delete failed", err);
        }
      }

      published = items;
      window.ARNI_REVIEWS_SEED = items.slice();
      renderPublished();
      setStatus(
        publishStatus,
        "Review deleted. It will disappear for everyone after GitHub Pages refreshes.",
        "ok"
      );
    } catch (err) {
      console.error(err);
      setStatus(publishStatus, err.message || "Could not delete review.", "error");
    } finally {
      busy = false;
    }
  }

  async function publishReview(item, fromPending) {
    if (!isAdmin || busy) return;
    if (!githubToken) {
      setStatus(publishStatus, "Please log in again with your GitHub token.", "error");
      return;
    }

    busy = true;
    setStatus(publishStatus, "Publishing approved review to the site…", "busy");
    try {
      var imagePath = "";
      var photo = null;
      try {
        photo = await ensureReviewBase64(item);
      } catch (err) {
        if (item.src && isRemotePhotoUrl(item.src)) {
          imagePath = item.src;
        } else {
          throw err;
        }
      }

      if (photo) {
        var filename =
          "review-" + Date.now() + "-" + slugify(item.name) + (photo.ext || ".jpg");
        imagePath = "assets/reviews/" + filename;
        await putGithubFile(imagePath, photo.base64, "Publish review photo: " + filename);
      }

      var existing = await getOrCreateReviewsData();
      var items = existing.items;
      items.push({
        id: item.id || "review-" + Date.now(),
        name: item.name,
        text: item.text,
        src: imagePath,
        date: new Date().toISOString().slice(0, 10)
      });

      await putGithubFile(
        GITHUB.dataPath,
        utf8ToBase64(serializeReviewsData(items)),
        "Publish review from " + item.name,
        existing.sha || undefined
      );

      published = items;
      window.ARNI_REVIEWS_SEED = items.slice();
      renderPublished();

      if (fromPending) await dropPendingLocal(item);

      setStatus(
        publishStatus,
        "Review published! It will show for everyone after GitHub Pages refreshes.",
        "ok"
      );
    } catch (err) {
      console.error(err);
      setStatus(publishStatus, err.message || "Could not publish review.", "error");
    } finally {
      busy = false;
    }
  }

  function clearPreview() {
    if (!preview) return;
    preview.hidden = true;
    preview.removeAttribute("src");
    preview.alt = "";
  }

  if (fileInput) {
    fileInput.addEventListener("change", async function () {
      var file = fileInput.files && fileInput.files[0];
      if (!preview) return;
      if (!file) {
        clearPreview();
        return;
      }
      if (!file.type || file.type.indexOf("image/") !== 0) {
        setStatus(statusEl, "Please choose an image file.", "error");
        fileInput.value = "";
        clearPreview();
        return;
      }
      try {
        var compressed = await compressImage(file, 800, 0.75);
        preview.alt = "Selected photo preview";
        preview.src = compressed.dataUrl;
        preview.hidden = false;
        setStatus(statusEl, "");
      } catch (err) {
        clearPreview();
        setStatus(statusEl, "Could not read that image. Try another photo.", "error");
      }
    });
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (busy) return;

    var name = nameInput ? nameInput.value.trim() : "";
    var email = emailInput ? emailInput.value.trim() : "";
    var text = textInput ? textInput.value.trim() : "";
    var file = fileInput && fileInput.files && fileInput.files[0];

    if (honeypot && honeypot.value !== "") return;
    if (!name || !email || !text) {
      setStatus(statusEl, "Please fill in your name, email, and review.", "error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus(statusEl, "Please enter a valid email address.", "error");
      return;
    }
    if (!file || !file.type || file.type.indexOf("image/") !== 0) {
      setStatus(statusEl, "Please attach an image file (JPG, PNG, or WEBP).", "error");
      return;
    }
    if (!configImgbbKey()) {
      setStatus(
        statusEl,
        "Photo upload is not set up yet. Please email arni.startup@gmail.com.",
        "error"
      );
      return;
    }

    busy = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";
    }
    setStatus(statusEl, "Submitting your review for approval…", "busy");

    try {
      var mobile = window.innerWidth < 700;
      var compressed = await compressImage(
        file,
        mobile ? 800 : 900,
        mobile ? 0.62 : 0.7
      );

      setStatus(statusEl, "Uploading review photo…", "busy");
      var uploaded = await uploadToImgbb(compressed.base64, name);
      var item = {
        id: "pending-" + Date.now(),
        name: name,
        email: email,
        text: text,
        src: uploaded.url,
        previewUrl: uploaded.url,
        base64: compressed.base64,
        ext: compressed.ext,
        createdAt: new Date().toISOString()
      };

      await idbPut(item);
      pending = mergePending([pending, [item]]);
      renderPending();

      if (typeof emailjs !== "undefined" && emailjs.send) {
        setStatus(statusEl, "Sending email notification…", "busy");
        await emailjs.send("service_cuki6nm", "template_5pzor48", {
          subject: "Review received from " + name,
          name: name,
          email: email,
          product: "Website Review (pending approval)",
          quantity: "1 photo",
          unit_price: "N/A",
          shipping_cost: "N/A",
          estimated_total: "N/A",
          notes:
            "Review received from " +
            name +
            "\n\n" +
            text +
            "\n\nPhoto:\n" +
            uploaded.url +
            "\n\nOpen Reviews → Admin login → Approve & publish.\n" +
            "Or Publish manually and paste the photo URL above.",
          to_email: "arni.startup@gmail.com"
        });
      }

      form.reset();
      clearPreview();
      setStatus(
        statusEl,
        "Thank you! Your review was submitted and will appear on the site after we approve it.",
        "ok"
      );
    } catch (err) {
      console.error(err);
      setStatus(
        statusEl,
        "Could not send your review. Please email arni.startup@gmail.com.",
        "error"
      );
    } finally {
      busy = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit review";
      }
    }
  });

  if (adminOpen) {
    adminOpen.addEventListener("click", function () {
      if (adminLogin) adminLogin.hidden = false;
      adminOpen.hidden = true;
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
    });
  }

  if (adminLogin) {
    adminLogin.addEventListener("submit", async function (e) {
      e.preventDefault();
      var password = adminPassword ? adminPassword.value : "";
      var token = adminToken ? adminToken.value.trim() : "";
      if (password !== ADMIN_PASSWORD) {
        if (adminError) {
          adminError.hidden = false;
          adminError.textContent = "Incorrect password. Try again.";
        }
        return;
      }
      if (!token) {
        if (adminError) {
          adminError.hidden = false;
          adminError.textContent = "Paste a GitHub token with write access.";
        }
        return;
      }
      try {
        await verifyGithubToken(token);
        await loginAdmin(token);
      } catch (err) {
        if (adminError) {
          adminError.hidden = false;
          adminError.textContent = err.message || "Could not verify token.";
        }
      }
    });
  }

  if (adminLogout) adminLogout.addEventListener("click", logoutAdmin);

  var manualForm = document.getElementById("reviewsManualPublish");
  if (manualForm) {
    manualForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!isAdmin || busy) return;
      var name = document.getElementById("manualReviewName");
      var text = document.getElementById("manualReviewText");
      var fileEl = document.getElementById("manualReviewImage");
      var urlEl = document.getElementById("manualReviewImageUrl");
      var file = fileEl && fileEl.files && fileEl.files[0];
      var imageUrl = urlEl ? urlEl.value.trim() : "";
      if (!name || !text || !name.value.trim() || !text.value.trim()) {
        setStatus(publishStatus, "Name and review text are required.", "error");
        return;
      }
      if (!file && !imageUrl) {
        setStatus(publishStatus, "Add a photo file or a photo URL.", "error");
        return;
      }
      try {
        var payload = {
          id: "manual-" + Date.now(),
          name: name.value.trim(),
          text: text.value.trim()
        };
        if (file) {
          var compressed = await compressImage(file, 1000, 0.85);
          payload.base64 = compressed.base64;
          payload.ext = compressed.ext;
        } else {
          payload.src = imageUrl;
        }
        await publishReview(payload, false);
        manualForm.reset();
      } catch (err) {
        setStatus(publishStatus, err.message || "Could not publish.", "error");
      }
    });
  }

  try {
    if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "1") {
      githubToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
      isAdmin = !!githubToken;
    }
  } catch (err) {}

  renderPublished();
  setAdminUI();
  reloadPending().catch(function () {});
})();
