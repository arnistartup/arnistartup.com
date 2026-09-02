(function () {
  var STORAGE_KEY = "arniCart";
  var SHIPPING_COST = 8;

  var CATEGORY_PRICES = {
    "badge-pins": 2,
    magnets: 3,
    keychains: 4,
    bracelets: 5,
    earrings: 3,
    "hindu-god": 2
  };

  var CATEGORY_LABELS = {
    "badge-pins": "Badge pins",
    magnets: "Magnets",
    keychains: "Keychains",
    bracelets: "Bracelets",
    earrings: "Earrings",
    "hindu-god": "Hindu God"
  };

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

  function priceForCategory(category) {
    return CATEGORY_PRICES[category] || 0;
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
    if (!statusEl) return;
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.className = "cart-status";
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className = "cart-status" + (kind ? " is-" + kind : "");
  }

  function openCart() {
    if (!drawer || !backdrop) return;
    drawer.hidden = false;
    backdrop.hidden = false;
    document.body.classList.add("cart-open");
    renderCart();
  }

  function closeCart() {
    if (!drawer || !backdrop) return;
    drawer.hidden = true;
    backdrop.hidden = true;
    document.body.classList.remove("cart-open");
    setStatus("");
  }

  function addItem(item) {
    var existing = cart.find(function (entry) {
      return entry.id === item.id;
    });
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({
        id: item.id,
        title: item.title || "Handmade piece",
        category: item.category,
        src: item.src,
        unitPrice: priceForCategory(item.category),
        quantity: 1
      });
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
        (CATEGORY_LABELS[item.category] || item.category) +
        " · $" +
        item.unitPrice.toFixed(2) +
        " each";

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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus("Please enter a valid email address.", "error");
      return;
    }
    if (honeypot && honeypot.value !== "") return;

    var lastSent = Number(sessionStorage.getItem("lastOrderSent") || 0);
    if (Date.now() - lastSent < 30000) {
      setStatus("Please wait a moment before sending another request.", "error");
      return;
    }

    if (typeof emailjs === "undefined" || !emailjs.send) {
      setStatus("Order service is unavailable. Email arni.startup@gmail.com.", "error");
      return;
    }

    var productSummary = cart
      .map(function (item) {
        return item.title;
      })
      .join(", ");
    var quantitySummary = cart
      .map(function (item) {
        return item.title + ": " + item.quantity;
      })
      .join("; ");
    var unitPriceSummary = cart
      .map(function (item) {
        return item.title + ": $" + item.unitPrice.toFixed(2) + " each";
      })
      .join("; ");
    var shippingCost = shippingSelected() ? SHIPPING_COST : 0;
    var orderTotal = cartTotal();

    if (placeBtn) {
      placeBtn.disabled = true;
      placeBtn.textContent = "Sending...";
    }
    setStatus("Sending your order request…", "busy");

    try {
      await emailjs.send("service_cuki6nm", "template_5pzor48", {
        subject: "New Bulk Order from " + name,
        name: name,
        email: email,
        product: productSummary,
        quantity: quantitySummary,
        unit_price: unitPriceSummary,
        shipping_cost: shippingCost > 0 ? "$" + shippingCost.toFixed(2) : "No shipping",
        estimated_total: "$" + orderTotal.toFixed(2),
        notes: notes || "Catalog cart order",
        to_email: "arni.startup@gmail.com"
      });

      sessionStorage.setItem("lastOrderSent", String(Date.now()));
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
        "Something went wrong. Please email arni.startup@gmail.com.",
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
  if (shippingInput) {
    shippingInput.addEventListener("change", renderCart);
  }
  if (placeBtn) placeBtn.addEventListener("click", placeOrder);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && drawer && !drawer.hidden) closeCart();
  });

  window.ArniCart = {
    addItem: addItem,
    priceForCategory: priceForCategory
  };

  updateCount();
  renderCart();
  closeCart();
})();
