(function (global) {
  var OWNER = "arnistartup";
  var REPO = "arnistartup.com";
  var BRANCH = "main";
  var API_VERSION = "2022-11-28";

  function utf8ToBase64(text) {
    return btoa(unescape(encodeURIComponent(text)));
  }

  function base64ToUtf8(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }

  function fileText(file) {
    return base64ToUtf8(String((file && file.content) || "").replace(/\n/g, ""));
  }

  function friendlyError(message, status) {
    var msg = String(message || "");
    var lower = msg.toLowerCase();
    if (
      lower.indexOf("resource not accessible by personal access token") !==
        -1 ||
      status === 403
    ) {
      return (
        "Your GitHub token cannot write to this repo. Create a classic token " +
        "while logged in as arnistartup with the public_repo scope " +
        "(GitHub → Settings → Developer settings → Personal access tokens → " +
        "Tokens (classic)), then log in again."
      );
    }
    return msg || "GitHub request failed (" + status + ")";
  }

  function fail(data, status) {
    var error = new Error(
      friendlyError(data && (data.message || data.error), status)
    );
    error.status = status;
    return error;
  }

  function parseSeedArray(text, ident, label) {
    var match = String(text).match(
      new RegExp(ident + "\\s*=\\s*(\\[[\\s\\S]*\\])\\s*;?\\s*$")
    );
    if (!match) throw new Error("Could not find the list in " + label);
    var literal = match[1];
    var parsed;
    try {
      parsed = JSON.parse(literal);
    } catch (err) {
      try {
        parsed = new Function("return (" + literal + ");")();
      } catch (err2) {
        throw new Error(label + " could not be parsed. " + (err.message || ""));
      }
    }
    if (!Array.isArray(parsed)) {
      throw new Error(label + " did not contain a list");
    }
    return parsed;
  }

  function serializeSeedArray(ident, items) {
    return "window." + ident + " = " + JSON.stringify(items, null, 2) + ";\n";
  }

  function headers(token) {
    return {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": API_VERSION
    };
  }

  async function api(token, path, options) {
    options = options || {};
    if (!token) throw new Error("GitHub token is missing.");

    var reqHeaders = headers(token);
    reqHeaders["Content-Type"] = "application/json";

    var res = await fetch(
      "https://api.github.com/repos/" +
        OWNER +
        "/" +
        REPO +
        "/contents/" +
        path,
      {
        method: options.method || "GET",
        headers: reqHeaders,
        body: options.body ? JSON.stringify(options.body) : undefined
      }
    );

    var data = null;
    try {
      data = await res.json();
    } catch (err) {}

    if (!res.ok) throw fail(data, res.status);
    return data;
  }

  global.ArniGithub = {
    utf8ToBase64: utf8ToBase64,
    fileText: fileText,
    parseSeedArray: parseSeedArray,
    serializeSeedArray: serializeSeedArray,

    api: api,

    putFile: function (token, path, contentBase64, message, sha) {
      var body = {
        message: message,
        content: contentBase64,
        branch: BRANCH
      };
      if (sha) body.sha = sha;
      return api(token, path, { method: "PUT", body: body });
    },

    deleteFile: async function (token, path, message) {
      var existing;
      try {
        existing = await api(token, path);
      } catch (err) {
        if (err && err.status === 404) return;
        throw err;
      }
      try {
        return await api(token, path, {
          method: "DELETE",
          body: {
            message: message,
            sha: existing.sha,
            branch: BRANCH
          }
        });
      } catch (err) {
        if (err && err.status === 404) return;
        throw err;
      }
    },

    verifyToken: async function (token) {
      if (!token) throw new Error("GitHub token is missing.");
      var res = await fetch("https://api.github.com/repos/" + OWNER + "/" + REPO, {
        headers: headers(token)
      });
      if (!res.ok) {
        var data = null;
        try {
          data = await res.json();
        } catch (err) {}
        throw fail(
          data || { message: "GitHub token could not access this repo" },
          res.status
        );
      }
      var repo = await res.json();
      if (!repo.permissions || !repo.permissions.push) {
        throw new Error(
          "This token can view the repo but cannot push. Recreate it with " +
            "write access (classic token: public_repo scope)."
        );
      }
    }
  };
})(window);
