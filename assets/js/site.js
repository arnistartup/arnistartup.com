(function (global) {
  var SHOP_EMAIL = "arni.startup@gmail.com";
  var SHIPPING_COST = 8;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var THROTTLE_KEY = "lastOrderSent";
  var THROTTLE_MS = 30000;

  var PRODUCTS = [
    { id: "badge-pins", name: "Badge pins", price: 2 },
    { id: "magnets", name: "Magnets", price: 3 },
    { id: "keychains", name: "Keychains", price: 4 },
    { id: "earrings", name: "Earrings", price: 3 },
    { id: "bracelets", name: "Bracelets", price: 5 }
  ];
  var THEMES = [
    { id: "hindu-god", name: "Hindu God", filterLabel: "Hindu Gods" },
    { id: "happy-birthday", name: "Happy Birthday", filterLabel: "Happy Birthday" }
  ];
  var TYPE_PRICES = { pin: 2, magnet: 3 };
  var TYPE_LABELS = { pin: "Pin", magnet: "Magnet" };

  document.addEventListener("contextmenu", function (event) {
    event.preventDefault();
  });

  if (typeof emailjs !== "undefined" && emailjs.init) {
    emailjs.init("EIgc0sAV8OCMV5mPL");
  }

  function findCategory(id) {
    var i;
    for (i = 0; i < PRODUCTS.length; i++) {
      if (PRODUCTS[i].id === id) return PRODUCTS[i];
    }
    for (i = 0; i < THEMES.length; i++) {
      if (THEMES[i].id === id) return THEMES[i];
    }
    return null;
  }

  function isThemeCategory(category) {
    return THEMES.some(function (theme) {
      return theme.id === category;
    });
  }

  function priceForCategory(category, productType) {
    if (isThemeCategory(category)) {
      return TYPE_PRICES[productType] || TYPE_PRICES.magnet;
    }
    var product = findCategory(category);
    return product && product.price ? product.price : 0;
  }

  function labelForItem(item) {
    if (isThemeCategory(item.category) && TYPE_LABELS[item.productType]) {
      return TYPE_LABELS[item.productType];
    }
    var category = findCategory(item.category);
    return (category && category.name) || item.category || "";
  }

  function slugify(value, maxLen) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, maxLen || 24);
  }

  function itemLabel(item) {
    return item.title || item.name;
  }

  function lineSummaries(items) {
    return {
      product: items.map(itemLabel).join(", "),
      quantity: items
        .map(function (item) {
          return itemLabel(item) + ": " + item.quantity;
        })
        .join("; "),
      unit_price: items
        .map(function (item) {
          return itemLabel(item) + ": $" + item.unitPrice.toFixed(2) + " each";
        })
        .join("; ")
    };
  }

  function eachMarked(selector, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), fn);
  }

  eachMarked("[data-shop-email]", function (el) {
    el.textContent = SHOP_EMAIL;
    if (el.tagName === "A") el.setAttribute("href", "mailto:" + SHOP_EMAIL);
  });
  eachMarked("[data-shipping-cost]", function (el) {
    el.textContent = "$" + SHIPPING_COST;
  });

  global.ArniSite = {
    SHOP_EMAIL: SHOP_EMAIL,
    SHIPPING_COST: SHIPPING_COST,
    PRODUCTS: PRODUCTS,
    isThemeCategory: isThemeCategory,
    priceForCategory: priceForCategory,
    labelForItem: labelForItem,
    slugify: slugify,

    filterCategories: function () {
      return [{ id: "all", label: "All" }].concat(
        PRODUCTS.map(function (product) {
          return { id: product.id, label: product.name };
        }),
        THEMES.map(function (theme) {
          return { id: theme.id, label: theme.filterLabel || theme.name };
        })
      );
    },

    uploadCategories: function () {
      return PRODUCTS.concat(THEMES).map(function (item) {
        return { id: item.id, label: item.name };
      });
    },

    isValidEmail: function (email) {
      return EMAIL_RE.test(email);
    },

    filledHoneypot: function (el) {
      return !!(el && el.value !== "");
    },

    isOrderThrottled: function () {
      try {
        return Date.now() - Number(sessionStorage.getItem(THROTTLE_KEY) || 0) < THROTTLE_MS;
      } catch (err) {
        return false;
      }
    },

    markOrderSent: function () {
      try {
        sessionStorage.setItem(THROTTLE_KEY, String(Date.now()));
      } catch (err) {}
    },

    setStatus: function (el, baseClass, message, kind) {
      if (!el) return;
      if (!message) {
        el.hidden = true;
        el.textContent = "";
        el.className = baseClass;
        return;
      }
      el.hidden = false;
      el.textContent = message;
      el.className = baseClass + (kind ? " is-" + kind : "");
    },

    shippingLabel: function (cost) {
      return cost > 0 ? "$" + Number(cost).toFixed(2) : "No shipping";
    },

    sendShopEmail: function (fields) {
      if (typeof emailjs === "undefined" || !emailjs.send) {
        return Promise.reject(new Error("EMAILJS_UNAVAILABLE"));
      }
      var lines = fields.items ? lineSummaries(fields.items) : {};
      return emailjs.send("service_cuki6nm", "template_5pzor48", {
        subject: fields.subject,
        name: fields.name,
        email: fields.email,
        product: fields.product || lines.product,
        quantity: fields.quantity || lines.quantity,
        unit_price: fields.unit_price || lines.unit_price,
        shipping_cost: fields.shipping_cost,
        estimated_total: fields.estimated_total,
        notes: fields.notes,
        to_email: SHOP_EMAIL
      });
    }
  };

  function ageFromBirth(year, month) {
    var now = new Date();
    var age = now.getFullYear() - year;
    if (now.getMonth() + 1 < month) age -= 1;
    return Math.max(0, age);
  }

  Array.prototype.forEach.call(
    document.querySelectorAll(".founder-role[data-birth-year]"),
    function (el) {
      var year = Number(el.getAttribute("data-birth-year"));
      var month = Number(el.getAttribute("data-birth-month") || 1);
      if (!year) return;
      el.textContent = "Co-Founder · Age " + ageFromBirth(year, month);
    }
  );
})(window);
