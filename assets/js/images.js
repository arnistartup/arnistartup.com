(function (global) {
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

  global.ArniImages = {
    compress: async function (file, options) {
      options = options || {};
      var maxSide = options.maxSide || 1600;
      var mime = options.mime;
      var quality = options.quality;
      var dataUrl = await readFileAsDataURL(file);
      var img = await loadImage(dataUrl);
      var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

      if (!mime) {
        mime = file.type === "image/png" ? "image/png" : "image/jpeg";
      }
      if (mime === "image/jpeg" && quality == null) quality = 0.85;

      var out =
        mime === "image/jpeg"
          ? canvas.toDataURL(mime, quality)
          : canvas.toDataURL(mime);
      return {
        dataUrl: out,
        base64: out.split(",")[1],
        ext: mime === "image/png" ? ".png" : ".jpg"
      };
    },

    isImage: function (file) {
      return !!(file && file.type && file.type.indexOf("image/") === 0);
    }
  };
})(window);
