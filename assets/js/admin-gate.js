(function (global) {
  var PASSWORD = "arniadmin";
  var PREFIXES = ["catalogAdmin", "reviewsAdmin"];

  try {
    [
      "arniCatalogAdmin",
      "arniCatalogGithubToken",
      "arniReviewsAdmin",
      "arniReviewsGithubToken"
    ].forEach(function (key) {
      sessionStorage.removeItem(key);
    });
  } catch (err) {}

  function bookmarkOpen() {
    var value = new URLSearchParams(location.search).get("admin");
    return value === "1" || value === "";
  }

  function nodes(prefix) {
    return {
      panel: document.getElementById(prefix + "Panel"),
      open: document.getElementById(prefix + "Open"),
      form: document.getElementById(prefix + "Login"),
      password: document.getElementById(prefix + "Password"),
      token: document.getElementById(prefix + "Token"),
      error: document.getElementById(prefix + "Error"),
      cancel: document.getElementById(prefix + "Cancel")
    };
  }

  function setError(node, message) {
    if (!node) return;
    node.hidden = !message;
    node.textContent = message || "";
  }

  function hideForm(ui) {
    if (!ui.form) return;
    ui.form.hidden = true;
    ui.form.reset();
    setError(ui.error, "");
  }

  function ensureLoginForm(prefix, title) {
    if (document.getElementById(prefix + "Login")) return;
    var open = document.getElementById(prefix + "Open");
    if (!open) return;

    var form = document.createElement("form");
    form.className = "catalog-admin-login";
    form.id = prefix + "Login";
    form.autocomplete = "off";
    form.hidden = true;

    var heading = document.createElement("h3");
    heading.textContent = title || "Admin login";

    var note = document.createElement("p");
    note.textContent =
      "GitHub token is required to publish. Password is only a reminder.";

    function passwordField(id, placeholder) {
      var label = document.createElement("label");
      label.className = "catalog-admin-field";
      label.setAttribute("for", id);
      var input = document.createElement("input");
      input.id = id;
      input.type = "password";
      input.autocomplete = "off";
      input.placeholder = placeholder;
      input.setAttribute("aria-label", placeholder);
      input.required = true;
      label.appendChild(input);
      return label;
    }

    var row = document.createElement("div");
    row.className = "catalog-admin-login-row";
    var submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "btn-primary";
    submit.textContent = "Log in";
    row.appendChild(submit);

    var error = document.createElement("p");
    error.className = "catalog-admin-error";
    error.id = prefix + "Error";
    error.hidden = true;

    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "catalog-admin-cancel";
    cancel.id = prefix + "Cancel";
    cancel.textContent = "Cancel";

    form.appendChild(heading);
    form.appendChild(note);
    form.appendChild(passwordField(prefix + "Password", "Admin password"));
    form.appendChild(passwordField(prefix + "Token", "Github token"));
    form.appendChild(row);
    form.appendChild(error);
    form.appendChild(cancel);
    open.insertAdjacentElement("afterend", form);
  }

  if (!bookmarkOpen()) {
    PREFIXES.forEach(function (prefix) {
      var ui = nodes(prefix);
      if (ui.open) ui.open.remove();
      if (ui.form) ui.form.remove();
    });
  }

  global.ArniAdminGate = {
    showChrome: function (prefix, isAdmin) {
      var ui = nodes(prefix);
      var gate = bookmarkOpen();
      if (ui.panel) ui.panel.hidden = !gate && !isAdmin;
      if (ui.open) ui.open.hidden = isAdmin || !gate;
      hideForm(ui);
    },

    bindLogin: function (prefix, onSubmit, title) {
      if (!bookmarkOpen()) return;
      ensureLoginForm(prefix, title);
      var ui = nodes(prefix);
      if (!ui.form || !ui.open) return;

      ui.open.addEventListener("click", function () {
        ui.form.hidden = false;
        ui.open.hidden = true;
        setError(ui.error, "");
        if (ui.password) ui.password.focus();
      });

      if (ui.cancel) {
        ui.cancel.addEventListener("click", function () {
          hideForm(ui);
          ui.open.hidden = false;
        });
      }

      ui.form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var password = ui.password ? ui.password.value : "";
        var token = ui.token ? ui.token.value.trim() : "";
        if (password !== PASSWORD) {
          setError(ui.error, "Incorrect password. Try again.");
          return;
        }
        if (!token) {
          setError(ui.error, "Paste a GitHub token with Contents write access.");
          return;
        }
        setError(ui.error, "Checking GitHub access…");
        try {
          await onSubmit(token);
        } catch (err) {
          setError(ui.error, err.message || "Could not verify GitHub token.");
        }
      });
    }
  };
})(window);
