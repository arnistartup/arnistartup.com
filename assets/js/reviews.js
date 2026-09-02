(function () {
  var ADMIN_SESSION_KEY = "arniReviewsAdmin";
  var ADMIN_TOKEN_KEY = "arniReviewsGithubToken";
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
  var isAdmin = false;
  var githubToken = "";
  var busy = false;

  var grid = document.getElementById("reviewsGrid");
  var empty = document.getElementById("reviewsEmpty");
  var form = document.getElementById("reviewForm");
  var formTitle = document.getElementById("reviewFormTitle");
  var formGrid = form && form.querySelector(".review-form-grid");
  var nameInput = document.getElementById("reviewName");
  var nameLabel = document.getElementById("reviewNameLabel");
  var emailField = document.getElementById("reviewEmailField");
  var emailInput = document.getElementById("reviewEmail");
  var textInput = document.getElementById("reviewText");
  var textLabel = document.getElementById("reviewTextLabel");
  var fileInput = document.getElementById("reviewImage");
  var photoLabel = document.getElementById("reviewPhotoLabel");
  var imageUrlField = document.getElementById("reviewImageUrlField");
  var imageUrlInput = document.getElementById("reviewImageUrl");
  var preview = document.getElementById("reviewImagePreview");
  var statusEl = document.getElementById("reviewFormStatus");
  var submitBtn = document.getElementById("reviewSubmitBtn");
  var honeypot = document.getElementById("reviewWebsite");
  var formLogout = document.getElementById("reviewsFormLogout");

  var adminOpen = document.getElementById("reviewsAdminOpen");
  var adminLogin = document.getElementById("reviewsAdminLogin");
  var adminPassword = document.getElementById("reviewsAdminPassword");
  var adminToken = document.getElementById("reviewsAdminToken");
  var adminError = document.getElementById("reviewsAdminError");
  var adminCancel = document.getElementById("reviewsAdminCancel");

  if (!grid || !form) return;

  function setStatus(message, kind) {
    if (!statusEl) return;
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.className = "reviews-status";
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className = "reviews-status" + (kind ? " is-" + kind : "");
  }

  function submitLabel() {
    return isAdmin ? "Publish review" : "Submit review";
  }

  function setBusy(nextBusy, label) {
    busy = nextBusy;
    if (!submitBtn) return;
    submitBtn.disabled = nextBusy;
    submitBtn.textContent = label || submitLabel();
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
    return { url: data.data.display_url || data.data.url };
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
    var match = String(text).match(
      /ARNI_REVIEWS_SEED\s*=\s*(\[[\s\S]*\])\s*;?\s*$/
    );
    if (!match) throw new Error("Could not find reviews list");
    return JSON.parse(match[1]);
  }

  function serializeReviewsData(items) {
    return "window.ARNI_REVIEWS_SEED = " + JSON.stringify(items, null, 2) + ";\n";
  }

  function friendlyGithubError(message, status) {
    var msg = String(message || "");
    if (
      msg.toLowerCase().indexOf("resource not accessible") !== -1 ||
      status === 403
    ) {
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
        items: parseReviewsData(
          base64ToUtf8(dataFile.content.replace(/\n/g, ""))
        ),
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

  function clearPreview() {
    if (!preview) return;
    preview.hidden = true;
    preview.removeAttribute("src");
    preview.alt = "";
  }

  function showPreview(src, alt) {
    if (!preview || !src) return;
    preview.src = src;
    preview.alt = alt || "Review photo preview";
    preview.hidden = false;
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
          del.className = "review-delete-btn";
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

  function setAdminUI() {
    if (adminOpen) adminOpen.hidden = isAdmin;
    if (adminLogin) adminLogin.hidden = true;
    if (formLogout) formLogout.hidden = !isAdmin;
    if (adminError) {
      adminError.hidden = true;
      adminError.textContent = "";
    }
    if (adminPassword) adminPassword.value = "";
    if (adminToken) adminToken.value = "";

    if (formTitle) {
      formTitle.textContent = isAdmin ? "Approve review" : "Write a review";
    }
    if (nameLabel) {
      nameLabel.textContent = isAdmin ? "Name *" : "Your name *";
    }
    if (textLabel) {
      textLabel.textContent = isAdmin ? "Review *" : "Your review *";
    }
    if (photoLabel) {
      photoLabel.textContent = isAdmin ? "Photo" : "Photo *";
    }
    if (emailField) emailField.hidden = isAdmin;
    if (emailInput) {
      emailInput.required = !isAdmin;
      if (isAdmin) emailInput.value = "";
    }
    if (imageUrlField) imageUrlField.hidden = !isAdmin;
    if (imageUrlInput && !isAdmin) imageUrlInput.value = "";
    if (fileInput) fileInput.required = !isAdmin;
    if (formGrid) formGrid.classList.toggle("is-admin-publish", isAdmin);
    if (submitBtn && !busy) submitBtn.textContent = submitLabel();
    if (nameInput) {
      nameInput.placeholder = isAdmin
        ? "From the review email"
        : "e.g. Arjun Vardha";
    }
    if (textInput) {
      textInput.placeholder = isAdmin
        ? "From the review email"
        : "We loved our custom badges!";
    }

    renderPublished();
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

  async function deletePublishedReview(review) {
    if (!isAdmin || busy) return;
    if (!githubToken) {
      setStatus("Please log in again with your GitHub token.", "error");
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

    setBusy(true, "Working…");
    setStatus("Deleting published review…", "busy");
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
        "Review deleted. It will disappear for everyone after GitHub Pages refreshes.",
        "ok"
      );
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Could not delete review.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function publishReview(item) {
    if (!isAdmin || busy) return;
    if (!githubToken) {
      setStatus("Please log in again with your GitHub token.", "error");
      return;
    }

    setBusy(true, "Publishing…");
    setStatus("Publishing approved review to the site…", "busy");
    try {
      var imagePath = "";
      if (item.base64) {
        var filename =
          "review-" +
          Date.now() +
          "-" +
          slugify(item.name) +
          (item.ext || ".jpg");
        imagePath = "assets/reviews/" + filename;
        await putGithubFile(
          imagePath,
          item.base64,
          "Publish review photo: " + filename
        );
      } else if (item.src && isRemotePhotoUrl(item.src)) {
        imagePath = item.src;
      } else {
        throw new Error("Review photo is missing.");
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
      setStatus(
        "Review published! It will show for everyone after GitHub Pages refreshes.",
        "ok"
      );
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Could not publish review.", "error");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  if (fileInput) {
    fileInput.addEventListener("change", async function () {
      var file = fileInput.files && fileInput.files[0];
      if (!preview) return;
      if (!file) {
        var url = imageUrlInput && imageUrlInput.value.trim();
        if (url) {
          showPreview(url);
          return;
        }
        clearPreview();
        return;
      }
      if (!file.type || file.type.indexOf("image/") !== 0) {
        setStatus("Please choose an image file.", "error");
        fileInput.value = "";
        clearPreview();
        return;
      }
      try {
        var compressed = await compressImage(file, 800, 0.75);
        showPreview(compressed.dataUrl, "Selected photo preview");
        setStatus("");
      } catch (err) {
        clearPreview();
        setStatus("Could not read that image. Try another photo.", "error");
      }
    });
  }

  if (imageUrlInput) {
    imageUrlInput.addEventListener("input", function () {
      var url = imageUrlInput.value.trim();
      if (!url) {
        if (!(fileInput && fileInput.files && fileInput.files[0])) clearPreview();
        return;
      }
      showPreview(url);
    });
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (busy) return;

    var name = nameInput ? nameInput.value.trim() : "";
    var email = emailInput ? emailInput.value.trim() : "";
    var text = textInput ? textInput.value.trim() : "";
    var file = fileInput && fileInput.files && fileInput.files[0];
    var imageUrl = imageUrlInput ? imageUrlInput.value.trim() : "";

    if (honeypot && honeypot.value !== "") return;

    if (isAdmin) {
      if (!name || !text) {
        setStatus("Name and review are required.", "error");
        return;
      }
      if (!file && !imageUrl) {
        setStatus("Attach a photo or paste a photo URL.", "error");
        return;
      }
      try {
        var payload = {
          id: "review-" + Date.now(),
          name: name,
          text: text
        };
        if (file) {
          var compressedAdmin = await compressImage(file, 1000, 0.85);
          payload.base64 = compressedAdmin.base64;
          payload.ext = compressedAdmin.ext;
        } else {
          payload.src = imageUrl;
        }
        await publishReview(payload);
        form.reset();
        clearPreview();
        setAdminUI();
      } catch (err) {
        /* Status already shown by publishReview */
      }
      return;
    }

    if (!name || !email || !text) {
      setStatus("Please fill in your name, email, and review.", "error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus("Please enter a valid email address.", "error");
      return;
    }
    if (!file || !file.type || file.type.indexOf("image/") !== 0) {
      setStatus("Please attach an image file (JPG, PNG, or WEBP).", "error");
      return;
    }
    if (!configImgbbKey()) {
      setStatus(
        "Photo upload is not set up yet. Please email arni.startup@gmail.com.",
        "error"
      );
      return;
    }

    setBusy(true, "Sending…");
    setStatus("Submitting your review for approval…", "busy");

    try {
      var mobile = window.innerWidth < 700;
      var compressed = await compressImage(
        file,
        mobile ? 800 : 900,
        mobile ? 0.62 : 0.7
      );

      setStatus("Uploading review photo…", "busy");
      var uploaded = await uploadToImgbb(compressed.base64, name);

      if (typeof emailjs !== "undefined" && emailjs.send) {
        setStatus("Sending email notification…", "busy");
        await emailjs.send("service_cuki6nm", "template_5pzor48", {
          subject: "Review received from " + name,
          name: name,
          email: email,
          product: "Website Review",
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
            uploaded.url,
          to_email: "arni.startup@gmail.com"
        });
      }

      form.reset();
      clearPreview();
      setStatus(
        "Thank you! Your review was submitted and will appear on the site after we approve it.",
        "ok"
      );
    } catch (err) {
      console.error(err);
      setStatus(
        "Could not send your review. Please email arni.startup@gmail.com.",
        "error"
      );
    } finally {
      setBusy(false);
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

  if (formLogout) formLogout.addEventListener("click", logoutAdmin);

  try {
    if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "1") {
      githubToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
      isAdmin = !!githubToken;
    }
  } catch (err) {}

  setAdminUI();
})();
