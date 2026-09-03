(function () {
  var Site = window.ArniSite;
  if (!Site) return;
  var SHIPPING_COST = Site.SHIPPING_COST;

  function getOrderItems() {
    return Array.from(document.querySelectorAll(".product-check:checked")).map(
      function (checkbox) {
        var quantityInput = checkbox
          .closest(".product-option")
          .querySelector(".product-qty");
        var quantity = Number(quantityInput.value || 0);
        var unitPrice = Number(checkbox.dataset.price);
        return {
          name: checkbox.value,
          quantity: quantity,
          unitPrice: unitPrice,
          total: quantity * unitPrice
        };
      }
    );
  }

  function getShippingCost() {
    return document.querySelector('input[name="shipping"]:checked')
      ? SHIPPING_COST
      : 0;
  }

  function getOrderTotal(items) {
    var subtotal = items.reduce(function (total, item) {
      return total + item.total;
    }, 0);
    return subtotal + getShippingCost();
  }

  function toggleShipping(radio) {
    if (radio.dataset.selected === "true") {
      radio.checked = false;
      radio.dataset.selected = "false";
    } else {
      radio.dataset.selected = "true";
    }
    updatePrice();
  }

  function toggleProduct(checkbox) {
    var quantityInput = checkbox
      .closest(".product-option")
      .querySelector(".product-qty");
    quantityInput.disabled = !checkbox.checked;
    if (checkbox.checked) {
      if (!quantityInput.value) quantityInput.value = 1;
      quantityInput.focus();
    } else {
      quantityInput.value = "";
    }
    updatePrice();
  }

  function updatePrice() {
    var items = getOrderItems();
    var summary = document.getElementById("priceSummary");
    if (!summary) return;
    if (items.length === 0) {
      summary.style.display = "none";
      summary.textContent = "";
      return;
    }
    summary.style.display = "block";
    summary.textContent =
      "Estimated total: $" + getOrderTotal(items).toFixed(2);
  }

  function fieldSuffix(id) {
    return id.split("-").map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join("");
  }

  function renderProductOptions() {
    var root = document.querySelector(".product-options");
    var products = Site.PRODUCTS;
    if (!root || !products) return;
    root.innerHTML = "";
    products.forEach(function (product) {
      var suffix = fieldSuffix(product.id);
      var checkId = "product" + suffix;
      var qtyId = "qty" + suffix;
      var row = document.createElement("div");
      row.className = "product-option";

      var check = document.createElement("input");
      check.type = "checkbox";
      check.id = checkId;
      check.className = "product-check";
      check.value = product.name;
      check.dataset.price = String(product.price);
      check.addEventListener("change", function () {
        toggleProduct(check);
      });

      var label = document.createElement("label");
      label.htmlFor = checkId;
      var name = document.createElement("span");
      name.className = "product-option-name";
      name.textContent = product.name;
      var price = document.createElement("span");
      price.className = "product-option-price";
      price.textContent = "$" + product.price + " each";
      label.appendChild(name);
      label.appendChild(document.createElement("br"));
      label.appendChild(price);

      var qty = document.createElement("input");
      qty.type = "number";
      qty.id = qtyId;
      qty.className = "product-qty";
      qty.min = "1";
      qty.placeholder = "Qty";
      qty.setAttribute("aria-label", product.name + " quantity");
      qty.disabled = true;
      qty.addEventListener("input", updatePrice);

      row.appendChild(check);
      row.appendChild(label);
      row.appendChild(qty);
      root.appendChild(row);
    });
  }

  async function submitForm() {
    var nameEl = document.getElementById("fname");
    var emailEl = document.getElementById("email");
    var notesEl = document.getElementById("notes");
    var honeypot = document.getElementById("website");
    if (!nameEl || !emailEl) return;

    var name = nameEl.value.trim();
    var email = emailEl.value.trim();
    var items = getOrderItems();
    var notes = notesEl ? notesEl.value.trim() : "";

    if (
      !name ||
      !email ||
      items.length === 0 ||
      items.some(function (item) {
        return item.quantity < 1;
      })
    ) {
      alert(
        "Please fill in your name and email, then select at least one product with a quantity!"
      );
      return;
    }

    if (Site && Site.filledHoneypot(honeypot)) return;

    if (!Site || !Site.isValidEmail(email)) {
      alert("Please enter a valid email address!");
      return;
    }

    if (Site.isOrderThrottled()) {
      alert("Please wait a moment before sending another request.");
      return;
    }

    var btn = document.querySelector(".submit-btn");
    var shippingCost = getShippingCost();
    var orderTotal = getOrderTotal(items);
    if (btn) {
      btn.textContent = "Sending...";
      btn.disabled = true;
    }

    try {
      await Site.sendShopEmail({
        subject: "New Bulk Order from " + name,
        name: name,
        email: email,
        items: items,
        shipping_cost: Site.shippingLabel(shippingCost),
        estimated_total: "$" + orderTotal.toFixed(2),
        notes: notes || "None"
      });

      Site.markOrderSent();

      var form = document.getElementById("orderForm");
      if (form) form.style.display = "none";
      var msg = document.getElementById("successMsg");
      if (!msg) return;
      msg.textContent = "";
      var line1 = document.createElement("div");
      line1.textContent = "🎉 Your order request has been sent!";
      var line2 = document.createElement("div");
      line2.className = "success-detail";
      line2.appendChild(document.createTextNode("We will reply to "));
      var emailStrong = document.createElement("strong");
      emailStrong.textContent = email;
      line2.appendChild(emailStrong);
      line2.appendChild(
        document.createTextNode(" as soon as possible. Thank you!")
      );
      msg.appendChild(line1);
      msg.appendChild(line2);
      msg.style.display = "block";
    } catch (err) {
      alert(
        "Oops! Something went wrong. Please email us directly at " +
          Site.SHOP_EMAIL
      );
      if (btn) {
        btn.textContent = "Send Order Request ✉️";
        btn.disabled = false;
      }
    }
  }

  var shippingRadio = document.getElementById("orderShipping");
  if (shippingRadio) {
    shippingRadio.addEventListener("click", function () {
      toggleShipping(shippingRadio);
    });
  }

  var submitBtn = document.querySelector("#orderForm .submit-btn");
  if (submitBtn) submitBtn.addEventListener("click", submitForm);

  renderProductOptions();
})();
