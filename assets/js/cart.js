(function () {
  var STORAGE_KEY = "arniCart";
  var Site = window.ArniSite;
  if (!Site) return;
  var SHIPPING_COST = Site.SHIPPING_COST;
  var SHOP_EMAIL = Site.SHOP_EMAIL;

  var cart = loadCart();

  var openBtn = document.getElementById("cartOpenBtn");
  var countEl = document.getElementById("cartCount");
  var drawer = document.getElementById("cartDrawer");
  var backdrop = document.getElementById("cartBackdrop");
  var closeBtn = document.getElementById("cartCloseBtn");
  var itemsEl = document.getElementById("cartItems");
  var emptyEl = document.getElementById("cartEmpty");
  var summaryEl = document.getElementById("cartSummary");
  var shippingInput = document.getElementById("cartShipping");
  var nameInput = document.getElementById("cartName");
  var emailInput = document.getElementById("cartEmail");
  var notesInput = document.getElementById("cartNotes");
  var placeBtn = document.getElementById("cartPlaceOrder");
  var statusEl = document.getElementById("cartStatus");
  var honeypot = document.getElementById("cartWebsite");
  var lastFocus = null;

  var FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function loadCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (err) {}
    updateCount();
  }

  function cartCount() {
    return cart.reduce(function (sum, item) {
      return sum + item.quantity;
    }, 0);
  }

  function cartSubtotal() {
    return cart.reduce(function (sum, item) {
      return sum + item.unitPrice * item.quantity;
    }, 0);
  }

  function shippingSelected() {
    return !!(shippingInput && shippingInput.checked);
  }

  function cartTotal() {
    return cartSubtotal() + (shippingSelected() ? SHIPPING_COST : 0);
  }

  function updateCount() {
    var count = cartCount();
    if (countEl) {
      countEl.textContent = String(count);
      countEl.hidden = count === 0;
    }
    if (openBtn) {
      openBtn.setAttribute("aria-label", "Open cart (" + count + " items)");
    }
  }

  function setStatus(message, kind) {
    if (Site) Site.setStatus(statusEl, "cart-status", message, kind);
  }

  function focusableInDrawer() {
    if (!drawer) return [];
    return Array.prototype.slice.call(drawer.querySelectorAll(FOCUSABLE)).filter(
      function (el) {
        if (el.closest("[hidden]") || el.getAttribute("aria-hidden") === "true") {
          return false;
        }
        if (el.tabIndex === -1) return false;
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      }
    );
  }

  function openCart() {
    if (!drawer || !backdrop) return;
    lastFocus = document.activeElement;
    drawer.hidden = false;
    backdrop.hidden = false;
    document.body.classList.add("cart-open");
    if (openBtn) openBtn.setAttribute("aria-expanded", "true");
    renderCart();
    var target = closeBtn || focusableInDrawer()[0];
    if (target) target.focus();
  }

  function closeCart() {
    if (!drawer || !backdrop) return;
    drawer.hidden = true;
    backdrop.hidden = true;
    document.body.classList.remove("cart-open");
    if (openBtn) openBtn.setAttribute("aria-expanded", "false");
    setStatus("");
    if (lastFocus && typeof lastFocus.focus === "function") {
      lastFocus.focus();
    }
    lastFocus = null;
  }

  function addItem(item) {
    var existing = cart.find(function (entry) {
      return entry.id === item.id;
    });
    if (existing) {
      existing.quantity += 1;
    } else {
      var entry = {
        id: item.id,
        title: item.title || "Handmade piece",
        category: item.category,
        src: item.src,
        unitPrice: Site.priceForCategory(item.category, item.productType),
        quantity: 1
      };
      if (item.productType) entry.productType = item.productType;
      cart.push(entry);
    }
    saveCart();
    renderCart();
    if (openBtn) {
      openBtn.classList.add("is-bump");
      setTimeout(function () {
        openBtn.classList.remove("is-bump");
      }, 350);
    }
  }

  function setQuantity(id, quantity) {
    var item = cart.find(function (entry) {
      return entry.id === id;
    });
    if (!item) return;
    item.quantity = Math.max(1, Math.min(99, quantity));
    saveCart();
    renderCart();
  }

  function removeItem(id) {
    cart = cart.filter(function (entry) {
      return entry.id !== id;
    });
    saveCart();
    renderCart();
  }

  function renderCart() {
    if (!itemsEl || !emptyEl || !summaryEl) return;

    itemsEl.innerHTML = "";

    if (cart.length === 0) {
      emptyEl.hidden = false;
      summaryEl.hidden = true;
      if (placeBtn) placeBtn.disabled = true;
      return;
    }

    emptyEl.hidden = true;
    summaryEl.hidden = false;
    if (placeBtn) placeBtn.disabled = false;

    cart.forEach(function (item) {
      var row = document.createElement("article");
      row.className = "cart-item";

      var img = document.createElement("img");
      img.src = item.src;
      img.alt = item.title;
      img.loading = "lazy";

      var info = document.createElement("div");
      info.className = "cart-item-info";

      var title = document.createElement("h3");
      title.textContent = item.title;

      var meta = document.createElement("p");
      meta.className = "cart-item-meta";
      meta.textContent =
        Site.labelForItem(item) + " · $" + item.unitPrice.toFixed(2) + " each";

      var controls = document.createElement("div");
      controls.className = "cart-item-controls";

      var minus = document.createElement("button");
      minus.type = "button";
      minus.className = "cart-qty-btn";
      minus.setAttribute("aria-label", "Decrease quantity");
      minus.textContent = "−";
      minus.addEventListener("click", function () {
        if (item.quantity <= 1) removeItem(item.id);
        else setQuantity(item.id, item.quantity - 1);
      });

      var qty = document.createElement("span");
      qty.className = "cart-qty";
      qty.textContent = String(item.quantity);

      var plus = document.createElement("button");
      plus.type = "button";
      plus.className = "cart-qty-btn";
      plus.setAttribute("aria-label", "Increase quantity");
      plus.textContent = "+";
      plus.addEventListener("click", function () {
        setQuantity(item.id, item.quantity + 1);
      });

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "cart-item-remove";
      remove.textContent = "Remove";
      remove.addEventListener("click", function () {
        removeItem(item.id);
      });

      var lineTotal = document.createElement("div");
      lineTotal.className = "cart-item-total";
      lineTotal.textContent =
        "$" + (item.unitPrice * item.quantity).toFixed(2);

      controls.appendChild(minus);
      controls.appendChild(qty);
      controls.appendChild(plus);
      controls.appendChild(remove);

      info.appendChild(title);
      info.appendChild(meta);
      info.appendChild(controls);

      row.appendChild(img);
      row.appendChild(info);
      row.appendChild(lineTotal);
      itemsEl.appendChild(row);
    });

    var subtotalEl = document.getElementById("cartSubtotal");
    var shippingEl = document.getElementById("cartShippingCost");
    var totalEl = document.getElementById("cartTotal");
    if (subtotalEl) subtotalEl.textContent = "$" + cartSubtotal().toFixed(2);
    if (shippingEl) {
      shippingEl.textContent = shippingSelected()
        ? "$" + SHIPPING_COST.toFixed(2)
        : "$0.00";
    }
    if (totalEl) totalEl.textContent = "$" + cartTotal().toFixed(2);
  }

  async function placeOrder() {
    if (!cart.length) {
      setStatus("Your cart is empty.", "error");
      return;
    }

    var name = nameInput ? nameInput.value.trim() : "";
    var email = emailInput ? emailInput.value.trim() : "";
    var notes = notesInput ? notesInput.value.trim() : "";

    if (!name || !email) {
      setStatus("Please enter your name and email.", "error");
      return;
    }
    if (Site && Site.filledHoneypot(honeypot)) return;

    if (!Site || !Site.isValidEmail(email)) {
      setStatus("Please enter a valid email address.", "error");
      return;
    }
    if (Site.isOrderThrottled()) {
      setStatus("Please wait a moment before sending another request.", "error");
      return;
    }

    var shippingCost = shippingSelected() ? SHIPPING_COST : 0;
    var orderTotal = cartTotal();

    if (placeBtn) {
      placeBtn.disabled = true;
      placeBtn.textContent = "Sending...";
    }
    setStatus("Sending your order request…", "busy");

    try {
      await Site.sendShopEmail({
        subject: "New Bulk Order from " + name,
        name: name,
        email: email,
        items: cart,
        shipping_cost: Site.shippingLabel(shippingCost),
        estimated_total: "$" + orderTotal.toFixed(2),
        notes: notes || "Catalog cart order"
      });

      Site.markOrderSent();
      cart = [];
      saveCart();
      renderCart();
      if (nameInput) nameInput.value = "";
      if (emailInput) emailInput.value = "";
      if (notesInput) notesInput.value = "";
      if (shippingInput) shippingInput.checked = false;
      setStatus(
        "Order request sent! We will reply to " + email + " soon.",
        "ok"
      );
    } catch (err) {
      console.error(err);
      setStatus(
        err && err.message === "EMAILJS_UNAVAILABLE"
          ? "Order service is unavailable. Email " + SHOP_EMAIL + "."
          : "Something went wrong. Please email " + SHOP_EMAIL + ".",
        "error"
      );
    } finally {
      if (placeBtn) {
        placeBtn.disabled = cart.length === 0;
        placeBtn.textContent = "Place order";
      }
    }
  }

  if (openBtn) openBtn.addEventListener("click", openCart);
  if (closeBtn) closeBtn.addEventListener("click", closeCart);
  if (backdrop) backdrop.addEventListener("click", closeCart);
  if (emptyEl) {
    emptyEl.addEventListener("click", function (e) {
      var link = e.target.closest("a[href='#catalog']");
      if (link) closeCart();
    });
  }
  if (shippingInput) {
    shippingInput.addEventListener("change", renderCart);
  }
  if (placeBtn) placeBtn.addEventListener("click", placeOrder);

  if (drawer) {
    drawer.addEventListener("keydown", function (e) {
      if (e.key !== "Tab" || drawer.hidden) return;
      var nodes = focusableInDrawer();
      if (!nodes.length) return;
      var first = nodes[0];
      var last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && drawer && !drawer.hidden) {
      e.preventDefault();
      closeCart();
    }
  });

  window.ArniCart = {
    addItem: addItem
  };

  updateCount();
  renderCart();
  closeCart();
})();
