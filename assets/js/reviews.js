(function () {
  var Admin = window.ArniAdminGate;
  var Gh = window.ArniGithub;
  var Img = window.ArniImages;
  var Site = window.ArniSite;
  var SHOP_EMAIL = Site ? Site.SHOP_EMAIL : "";
  var DATA_PATH = "assets/js/reviews-data.js";

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
  var identityGrid = document.getElementById("reviewIdentityGrid");
  var nameInput = document.getElementById("reviewName");
  var nameLabel = document.getElementById("reviewNameLabel");
  var ratingInput = document.getElementById("reviewRating");
  var locationInput = document.getElementById("reviewLocation");
  var locationLabel = document.getElementById("reviewLocationLabel");
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

  if (!grid || !form) return;

  function setStatus(message, kind) {
    if (Site) Site.setStatus(statusEl, "reviews-status", message, kind);
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

  function setText(el, value) {
    if (el) el.textContent = value;
  }

  function setPlaceholder(el, value) {
    if (el) el.placeholder = value;
  }

  // Reviews published before ratings existed are treated as five stars.
  function ratingOf(review) {
    var value = Math.round(Number(review && review.rating));
    if (!value || value < 1) return 5;
    return Math.min(5, value);
  }

  function starsEl(rating) {
    var el = document.createElement("p");
    el.className = "review-card-stars";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", rating + " out of 5 stars");
    for (var i = 1; i <= 5; i++) {
      var star = document.createElement("span");
      if (i > rating) star.className = "is-empty";
      star.textContent = i > rating ? "☆" : "★";
      el.appendChild(star);
    }
    return el;
  }

  function attributionText(review) {
    var who = review.name || "Customer";
    return review.location ? "— " + who + ", " + review.location : "— " + who;
  }

  function formatReviewDate(value) {
    var match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return value || "";
    var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  }

  function isRemotePhotoUrl(src) {
    return /^https?:\/\//i.test(String(src || ""));
  }

  function localReviewWebpPath(src) {
    if (!src || isRemotePhotoUrl(src)) return "";
    var match = String(src).match(/^(assets\/reviews\/[^/?#]+)(\.jpe?g|\.png)$/i);
    return match ? match[1] + ".webp" : "";
  }

  function localReviewPhotoPaths(src) {
    var paths = [];
    if (src && src.indexOf("assets/reviews/") === 0) paths.push(src);
    var webp = localReviewWebpPath(src);
    if (webp) paths.push(webp);
    return paths;
  }

  function reviewPhotoEl(review) {
    var img = document.createElement("img");
    img.src = review.src;
    img.alt = "Photo from " + (review.name || "a customer");
    img.loading = "lazy";
    img.decoding = "async";

    var webpSrc = localReviewWebpPath(review.src);
    if (!webpSrc) return img;

    var picture = document.createElement("picture");
    var source = document.createElement("source");
    source.type = "image/webp";
    source.srcset = webpSrc;
    picture.appendChild(source);
    picture.appendChild(img);
    return picture;
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
    if (name && Site) body.append("name", Site.slugify(name, 40));
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

  function parseReviewsData(text) {
    return Gh.parseSeedArray(text, "ARNI_REVIEWS_SEED", "reviews-data.js");
  }

  function serializeReviewsData(items) {
    return Gh.serializeSeedArray("ARNI_REVIEWS_SEED", items);
  }

  async function getOrCreateReviewsData() {
    try {
      var dataFile = await Gh.api(githubToken, DATA_PATH);
      return {
        items: parseReviewsData(Gh.fileText(dataFile)),
        sha: dataFile.sha
      };
    } catch (err) {
      if (err && err.status === 404) return { items: [], sha: null };
      throw err;
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

        var quote = document.createElement("blockquote");
        quote.className = "review-card-text";
        quote.textContent = "“" + (review.text || "") + "”";

        var who = document.createElement("p");
        who.className = "review-card-attribution";
        who.textContent = attributionText(review);

        body.appendChild(starsEl(ratingOf(review)));
        body.appendChild(quote);
        body.appendChild(who);

        if (review.date) {
          var date = document.createElement("p");
          date.className = "review-card-date";
          date.textContent = formatReviewDate(review.date);
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

        card.appendChild(body);
        card.appendChild(reviewPhotoEl(review));
        grid.appendChild(card);
      });
  }

  function setAdminUI() {
    if (Admin) Admin.showChrome("reviewsAdmin", isAdmin);
    if (formLogout) formLogout.hidden = !isAdmin;

    setText(formTitle, isAdmin ? "Approve review" : "Write a review");
    setText(nameLabel, isAdmin ? "Name *" : "Your name *");
    setText(textLabel, isAdmin ? "Review *" : "Your review *");
    setText(photoLabel, isAdmin ? "Photo" : "Photo *");
    setText(locationLabel, isAdmin ? "Location" : "Where you're from");
    setPlaceholder(
      locationInput,
      isAdmin ? "From the review email" : "e.g. Massachusetts"
    );
    setPlaceholder(
      nameInput,
      isAdmin ? "From the review email" : "e.g. Arjun Vardha"
    );
    setPlaceholder(
      textInput,
      isAdmin ? "From the review email" : "We loved our custom badges!"
    );

    if (emailField) emailField.hidden = isAdmin;
    if (emailInput) {
      emailInput.required = !isAdmin;
      if (isAdmin) emailInput.value = "";
    }
    if (imageUrlField) imageUrlField.hidden = !isAdmin;
    if (imageUrlInput && !isAdmin) imageUrlInput.value = "";
    if (fileInput) fileInput.required = !isAdmin;
    if (identityGrid) identityGrid.classList.toggle("is-admin-publish", isAdmin);
    if (submitBtn && !busy) submitBtn.textContent = submitLabel();

    renderPublished();
  }

  function setAdmin(token) {
    githubToken = token || "";
    isAdmin = !!githubToken;
    setAdminUI();
  }

  function requireToken() {
    if (githubToken) return true;
    setStatus("Please log in again with your GitHub token.", "error");
    return false;
  }

  async function deletePublishedReview(review) {
    if (!isAdmin || busy || !requireToken()) return;
    var label = (review && review.name) || "this review";
    if (
      !confirm(
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

      await Gh.putFile(
        githubToken,
        DATA_PATH,
        Gh.utf8ToBase64(serializeReviewsData(items)),
        "Delete review from " + label,
        existing.sha || undefined
      );

      var photoPaths = localReviewPhotoPaths(review.src);
      for (var i = 0; i < photoPaths.length; i++) {
        try {
          await Gh.deleteFile(
            githubToken,
            photoPaths[i],
            "Delete review photo: " + photoPaths[i].split("/").pop()
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
    if (!isAdmin || busy || !requireToken()) return;

    setBusy(true, "Publishing…");
    setStatus("Publishing approved review to the site…", "busy");
    try {
      var imagePath = "";
      if (item.base64) {
        var filename =
          "review-" +
          Date.now() +
          "-" +
          (Site ? Site.slugify(item.name) : "customer") +
          (item.ext || ".jpg");
        imagePath = "assets/reviews/" + filename;
        await Gh.putFile(
          githubToken,
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
      var entry = {
        id: item.id || "review-" + Date.now(),
        name: item.name,
        rating: ratingOf(item),
        text: item.text,
        src: imagePath,
        date: new Date().toISOString().slice(0, 10)
      };
      if (item.location) entry.location = item.location;
      items.push(entry);

      await Gh.putFile(
        githubToken,
        DATA_PATH,
        Gh.utf8ToBase64(serializeReviewsData(items)),
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

  function bindReviewForm() {
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
        if (!Img.isImage(file)) {
          setStatus("Please choose an image file.", "error");
          fileInput.value = "";
          clearPreview();
          return;
        }
        try {
          var compressed = await Img.compress(file, {
            maxSide: 800,
            mime: "image/jpeg",
            quality: 0.75
          });
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
      var rating = ratingOf({ rating: ratingInput && ratingInput.value });
      var location = locationInput ? locationInput.value.trim() : "";
      var file = fileInput && fileInput.files && fileInput.files[0];
      var imageUrl = imageUrlInput ? imageUrlInput.value.trim() : "";

      if (Site && Site.filledHoneypot(honeypot)) return;

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
            rating: rating,
            location: location,
            text: text
          };
          if (file) {
            var compressedAdmin = await Img.compress(file, {
              maxSide: 1000,
              mime: "image/jpeg",
              quality: 0.85
            });
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
      if (!Site || !Site.isValidEmail(email)) {
        setStatus("Please enter a valid email address.", "error");
        return;
      }
      if (!Img.isImage(file)) {
        setStatus("Please attach an image file (JPG, PNG, or WEBP).", "error");
        return;
      }
      if (!configImgbbKey()) {
        setStatus(
          "Photo upload is not set up yet. Please email " + SHOP_EMAIL + ".",
          "error"
        );
        return;
      }

      setBusy(true, "Sending…");
      setStatus("Submitting your review for approval…", "busy");

      try {
        var mobile = window.innerWidth < 700;
        var compressed = await Img.compress(file, {
          maxSide: mobile ? 800 : 900,
          mime: "image/jpeg",
          quality: mobile ? 0.62 : 0.7
        });

        setStatus("Uploading review photo…", "busy");
        var uploaded = await uploadToImgbb(compressed.base64, name);

        if (Site) {
          setStatus("Sending email notification…", "busy");
          try {
            await Site.sendShopEmail({
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
                (location ? " (" + location + ")" : "") +
                "\nRating: " +
                rating +
                " of 5\n\n" +
                text +
                "\n\nPhoto:\n" +
                uploaded.url
            });
          } catch (mailErr) {
            if (!mailErr || mailErr.message !== "EMAILJS_UNAVAILABLE") throw mailErr;
          }
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
          "Could not send your review. Please email " + SHOP_EMAIL + ".",
          "error"
        );
      } finally {
        setBusy(false);
      }
    });
  }

  bindReviewForm();

  if (Admin && Gh) {
    Admin.bindLogin("reviewsAdmin", async function (token) {
      await Gh.verifyToken(token);
      setAdmin(token);
    }, "Approve review");
  }

  if (formLogout) {
    formLogout.addEventListener("click", function () {
      setAdmin("");
    });
  }

  setAdminUI();
})();
