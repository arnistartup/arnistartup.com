(function () {
  var PENDING_KEY = "arniPendingReviews";
  var ADMIN_SESSION_KEY = "arniCatalogAdmin";
  var ADMIN_TOKEN_KEY = "arniCatalogGithubToken";
  var ADMIN_PASSWORD = "arniadmin";

  var GITHUB = {
    owner: "arnistartup",
    repo: "arnistartup.com",
    branch: "main",
    dataPath: "assets/js/reviews-data.js"
  };

  var published = Array.isArray(window.ARNI_REVIEWS_SEED)
    ? window.ARNI_REVIEWS_SEED.slice()
    : [];
  var pending = loadPending();
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

  function loadPending() {
    try {
      var raw = localStorage.getItem(PENDING_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function savePending() {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch (err) {
      // Image data can fill storage; keep what we can.
    }
  }

  function setStatus(el, message, kind) {
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      el.className = el.id === "reviewsPublishStatus"
        ? "reviews-status"
        : "reviews-status";
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.className = "reviews-status" + (kind ? " is-" + kind : "");
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

  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var chunk = 0x8000;
    var binary = "";
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function utf8ToBase64(text) {
    return btoa(unescape(encodeURIComponent(text)));
  }

  function base64ToUtf8(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }

  function parseReviewsData(text) {
    var match = String(text).match(
      /ARNI_REVIEWS_SEED\s*=\s*(\[[\s\S]*\])\s*;?\s*$/
    );
    if (!match) throw new Error("Could not find reviews list");
    var literal = match[1];
    try {
      return JSON.parse(literal);
    } catch (err) {
      return new Function("return (" + literal + ");")();
    }
  }

  function serializeReviewsData(items) {
    return (
      "window.ARNI_REVIEWS_SEED = " +
      JSON.stringify(items, null, 2) +
      ";\n"
    );
  }

  function friendlyGithubError(message, status) {
    var msg = String(message || "");
    if (
      msg.toLowerCase().indexOf("resource not accessible") !== -1 ||
      status === 403
    ) {
      return (
        "GitHub token cannot write to this repo. Use a classic token with public_repo."
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
    } catch (err) {}
    if (!res.ok) {
      var error = new Error(
        friendlyGithubError(data && data.message, res.status)
      );
      error.status = res.status;
      throw error;
    }
    return data;
  }

  async function getOrCreateReviewsData() {
    try {
      var dataFile = await githubApi(GITHUB.dataPath);
      var text = base64ToUtf8(dataFile.content.replace(/\n/g, ""));
      return {
        items: parseReviewsData(text),
        sha: dataFile.sha
      };
    } catch (err) {
      if (err && err.status === 404) {
        return { items: [], sha: null };
      }
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

        var img = document.createElement("img");
        img.src = review.src;
        img.alt = "Photo from " + (review.name || "a customer");
        img.loading = "lazy";

        var body = document.createElement("div");
        body.className = "review-card-body";

        var quote = document.createElement("p");
        quote.className = "review-card-text";
        quote.textContent = review.text;

        var meta = document.createElement("div");
        meta.className = "review-card-meta";
        meta.textContent =
          "— " +
          (review.name || "Customer") +
          (review.date ? " · " + review.date : "");

        body.appendChild(quote);
        body.appendChild(meta);
        card.appendChild(img);
        card.appendChild(body);
        grid.appendChild(card);
      });
  }

  function renderPending() {
    if (!pendingList || !pendingEmpty) return;
    pendingList.innerHTML = "";

    if (!isAdmin) return;

    if (!pending.length) {
      pendingEmpty.hidden = false;
      return;
    }
    pendingEmpty.hidden = true;

    pending.forEach(function (item) {
      var row = document.createElement("article");
      row.className = "review-pending-card";

      var img = document.createElement("img");
      img.src = item.previewUrl || item.src;
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
        pending = pending.filter(function (p) {
          return p.id !== item.id;
        });
        savePending();
        renderPending();
        setStatus(publishStatus, "Review rejected and removed from pending.", "ok");
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
    renderPending();
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

  async function publishReview(item, fromPending) {
    if (!isAdmin || busy) return;
    if (!githubToken) {
      setStatus(publishStatus, "Please log in again with your GitHub token.", "error");
      return;
    }

    busy = true;
    setStatus(publishStatus, "Publishing approved review to the site…", "busy");

    try {
      var base64 = item.base64;
      var ext = item.ext || ".jpg";
      if (!base64 && item.file) {
        var compressed = await compressImage(item.file, 1000, 0.85);
        base64 = compressed.base64;
        ext = compressed.ext;
      }
      if (!base64) throw new Error("Review photo is missing.");

      var filename =
        "review-" +
        Date.now() +
        "-" +
        String(item.name || "customer")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 24) +
        ext;
      var imagePath = "assets/reviews/" + filename;

      await putGithubFile(
        imagePath,
        base64,
        "Publish review photo: " + filename
      );

      var existing = await getOrCreateReviewsData();
      var items = existing.items;
      var entry = {
        id: item.id || "review-" + Date.now(),
        name: item.name,
        text: item.text,
        src: imagePath,
        date: new Date().toISOString().slice(0, 10)
      };
      items.push(entry);

      await putGithubFile(
        GITHUB.dataPath,
        utf8ToBase64(serializeReviewsData(items)),
        "Publish review from " + item.name,
        existing.sha || undefined
      );

      published = items;
      window.ARNI_REVIEWS_SEED = items.slice();
      renderPublished();

      if (fromPending) {
        pending = pending.filter(function (p) {
          return p.id !== item.id;
        });
        savePending();
        renderPending();
      }

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

  if (fileInput) {
    fileInput.addEventListener("change", async function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file || !preview) return;
      if (!file.type || file.type.indexOf("image/") !== 0) {
        setStatus(statusEl, "Please choose an image file.", "error");
        fileInput.value = "";
        preview.hidden = true;
        return;
      }
      try {
        var compressed = await compressImage(file, 800, 0.75);
        preview.src = compressed.dataUrl;
        preview.hidden = false;
        setStatus(statusEl, "");
      } catch (err) {
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
    if (!file) {
      setStatus(statusEl, "A photo is required with your review.", "error");
      return;
    }
    if (!file.type || file.type.indexOf("image/") !== 0) {
      setStatus(statusEl, "Please attach an image file (JPG, PNG, or WEBP).", "error");
      return;
    }

    busy = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";
    }
    setStatus(statusEl, "Submitting your review for approval…", "busy");

    try {
      var compressed = await compressImage(file, 900, 0.7);
      var item = {
        id: "pending-" + Date.now(),
        name: name,
        email: email,
        text: text,
        previewUrl: compressed.dataUrl,
        base64: compressed.base64,
        ext: compressed.ext,
        createdAt: new Date().toISOString()
      };

      pending.push(item);
      try {
        savePending();
      } catch (err) {
        // still continue to email
      }

      if (typeof emailjs !== "undefined" && emailjs.send) {
        await emailjs.send("service_cuki6nm", "template_5pzor48", {
          name: name,
          email: email,
          product: "Website Review (pending approval)",
          quantity: "1 photo attached",
          unit_price: "N/A",
          shipping_cost: "N/A",
          estimated_total: "N/A",
          notes:
            "NEW REVIEW PENDING APPROVAL\n\n" +
            text +
            "\n\nOpen the website → Reviews → Admin login to approve and publish.",
          to_email: "arni.startup@gmail.com"
        });
      }

      form.reset();
      if (preview) {
        preview.hidden = true;
        preview.removeAttribute("src");
      }
      renderPending();
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
        loginAdmin(token);
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
      var file = fileEl && fileEl.files && fileEl.files[0];
      if (!name || !text || !name.value.trim() || !text.value.trim() || !file) {
        setStatus(publishStatus, "Name, review text, and photo are required.", "error");
        return;
      }
      try {
        var compressed = await compressImage(file, 1000, 0.85);
        await publishReview(
          {
            id: "manual-" + Date.now(),
            name: name.value.trim(),
            text: text.value.trim(),
            base64: compressed.base64,
            ext: compressed.ext
          },
          false
        );
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
})();
