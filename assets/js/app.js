/*!
 * PNG to ICO Converter — application logic
 *
 * Uses the browser port of the `png-to-ico` library to build the .ico file,
 * then parses the produced file back to render a preview of every embedded
 * resolution.
 */
(function () {
	"use strict";

	var MAX_FILE_SIZE = 10 * 1024 * 1024;

	var els = {
		dropzone: document.getElementById("dropzone"),
		fileInput: document.getElementById("fileInput"),
		fileName: document.getElementById("fileName"),
		sizeGrid: document.getElementById("sizeGrid"),
		interpolation: document.getElementById("interpolation"),
		convertBtn: document.getElementById("convertBtn"),
		downloadBtn: document.getElementById("downloadBtn"),
		resetBtn: document.getElementById("resetBtn"),
		status: document.getElementById("status"),
		previewSection: document.getElementById("previewSection"),
		previewGrid: document.getElementById("previewGrid")
	};

	var state = {
		file: null,
		baseName: "icon",
		icoBlob: null,
		icoUrl: null
	};

	/* ------------------------------------------------------------------ *
	 * Helpers                                                            *
	 * ------------------------------------------------------------------ */

	function setStatus(message, kind) {
		els.status.textContent = message || "";
		els.status.className = "status" + (kind ? " " + kind : "");
	}

	function selectedSizes() {
		var boxes = els.sizeGrid.querySelectorAll(".size-checkbox:checked");
		var sizes = [];
		for (var i = 0; i < boxes.length; i++) {
			sizes.push(parseInt(boxes[i].value, 10));
		}
		sizes.sort(function (a, b) { return a - b; });
		return sizes;
	}

	function formatBytes(n) {
		if (n < 1024) return n + " B";
		if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
		return (n / (1024 * 1024)).toFixed(2) + " MB";
	}

	function downloadBlob(blob, filename) {
		var url = URL.createObjectURL(blob);
		var a = document.createElement("a");
		a.style.display = "none";
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
	}

	/**
	 * Decode a PNG file into straight RGBA pixels.
	 *
	 * Uses the bundled pngjs decoder, which is the same pure-JavaScript
	 * decoder the upstream Node tool uses, so the pixels (and therefore the
	 * resulting .ico bytes) match the Node implementation exactly.
	 */
	function decodeImage(file) {
		return file.arrayBuffer().then(function (buffer) {
			var png;
			try {
				png = window.PngJs.PNG.sync.read(buffer);
			} catch (err) {
				throw new Error("That file could not be decoded as a PNG image.");
			}
			return {
				width: png.width,
				height: png.height,
				data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length)
			};
		});
	}

	/**
	 * Parse an .ico file back into its individual images so they can be previewed.
	 */
	function parseIco(blob) {
		return blob.arrayBuffer().then(function (buffer) {
			var view = new DataView(buffer);

			if (view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) {
				throw new Error("Invalid ICO header.");
			}

			var count = view.getUint16(4, true);
			var layers = [];

			for (var i = 0; i < count; i++) {
				var entry = 6 + i * 16;
				var width = view.getUint8(entry);
				var height = view.getUint8(entry + 1);
				if (width === 0) width = 256;
				if (height === 0) height = 256;

				var size = view.getUint32(entry + 8, true);
				var offset = view.getUint32(entry + 12, true);

				var bmpHeader = offset + 14 <= buffer.byteLength ? offset : null;
				var isPng =
					bmpHeader !== null &&
					view.getUint32(offset, true) === 0x89504e47;

				if (isPng) {
					var slice = buffer.slice(offset, offset + size);
					layers.push({
						width: width,
						height: height,
						url: URL.createObjectURL(new Blob([slice], { type: "image/png" }))
					});
				} else {
					// BMP/DIB format: 40-byte info header, XOR bitmap, AND mask.
					var pixelOffset = offset + 40;
					var xorSize = width * height * 4;
					var bmpData = buffer.slice(pixelOffset, pixelOffset + xorSize);

					var canvas = document.createElement("canvas");
					canvas.width = width;
					canvas.height = height;
					var ctx = canvas.getContext("2d");
					var imageData = ctx.createImageData(width, height);
					var src = new Uint8Array(bmpData);

					// DIB rows are stored bottom-up in BGRA order.
					for (var y = 0; y < height; y++) {
						var srcRow = (height - 1 - y) * width * 4;
						var dstRow = y * width * 4;
						for (var x = 0; x < width; x++) {
							var s = srcRow + x * 4;
							var d = dstRow + x * 4;
							imageData.data[d] = src[s + 2];     // R
							imageData.data[d + 1] = src[s + 1]; // G
							imageData.data[d + 2] = src[s];     // B
							imageData.data[d + 3] = src[s + 3]; // A
						}
					}
					ctx.putImageData(imageData, 0, 0);

					layers.push({
						width: width,
						height: height,
						url: canvas.toDataURL("image/png")
					});
				}
			}

			return layers;
		});
	}

	function renderPreview(layers) {
		els.previewGrid.innerHTML = "";

		layers.forEach(function (layer) {
			var item = document.createElement("div");
			item.className = "preview-item";

			var img = document.createElement("img");
			img.className = "preview-canvas";
			img.src = layer.url;
			img.alt = layer.width + " by " + layer.height + " pixels";
			img.width = 72;
			img.height = 72;

			var caption = document.createElement("div");
			caption.className = "preview-size";
			caption.textContent = layer.width + " × " + layer.height;

			item.appendChild(img);
			item.appendChild(caption);
			els.previewGrid.appendChild(item);
		});

		els.previewSection.hidden = false;
	}

	/* ------------------------------------------------------------------ *
	 * File selection                                                     *
	 * ------------------------------------------------------------------ */

	function acceptFile(file) {
		if (!file) return;

		if (file.type && file.type !== "image/png" && !/\.png$/i.test(file.name)) {
			setStatus("Please choose a PNG file.", "error");
			return;
		}

		if (file.size > MAX_FILE_SIZE) {
			setStatus("That file is too large. Please choose one under 10 MB.", "error");
			return;
		}

		state.file = file;
		state.baseName = file.name.replace(/\.png$/i, "") || "icon";

		els.fileName.textContent = file.name + "  (" + formatBytes(file.size) + ")";
		els.convertBtn.disabled = false;
		els.resetBtn.disabled = false;
		els.downloadBtn.hidden = true;
		els.downloadBtn.disabled = true;
		els.previewSection.hidden = true;
		els.previewGrid.innerHTML = "";

		if (state.icoUrl) {
			URL.revokeObjectURL(state.icoUrl);
			state.icoUrl = null;
		}
		state.icoBlob = null;

		setStatus("Ready. Press \"Convert to ICO\" to continue.", "info");
	}

	els.dropzone.addEventListener("click", function () {
		els.fileInput.click();
	});

	els.dropzone.addEventListener("keydown", function (event) {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			els.fileInput.click();
		}
	});

	els.fileInput.addEventListener("change", function (event) {
		acceptFile(event.target.files && event.target.files[0]);
	});

	["dragenter", "dragover"].forEach(function (type) {
		els.dropzone.addEventListener(type, function (event) {
			event.preventDefault();
			event.stopPropagation();
			els.dropzone.classList.add("is-dragover");
		});
	});

	["dragleave", "drop"].forEach(function (type) {
		els.dropzone.addEventListener(type, function (event) {
			event.preventDefault();
			event.stopPropagation();
			els.dropzone.classList.remove("is-dragover");
		});
	});

	els.dropzone.addEventListener("drop", function (event) {
		var dt = event.dataTransfer;
		if (dt && dt.files && dt.files.length) {
			acceptFile(dt.files[0]);
		}
	});

	// Prevent the browser from navigating away when a file is dropped outside the zone.
	window.addEventListener("dragover", function (e) { e.preventDefault(); });
	window.addEventListener("drop", function (e) { e.preventDefault(); });

	/* ------------------------------------------------------------------ *
	 * Conversion                                                         *
	 * ------------------------------------------------------------------ */

	els.convertBtn.addEventListener("click", function () {
		if (!state.file) {
			setStatus("Please choose a PNG file first.", "error");
			return;
		}

		var sizes = selectedSizes();
		if (sizes.length === 0) {
			setStatus("Please select at least one icon size.", "error");
			return;
		}

		els.convertBtn.disabled = true;
		els.downloadBtn.disabled = true;
		setStatus("Decoding image…", "info");

		decodeImage(state.file)
			.then(function (image) {
				setStatus("Resampling and building the ICO file…", "info");

				var icoBytes = window.PngToIco.convertToIco(image, {
					sizes: sizes,
					interpolation: els.interpolation.value
				});

				var blob = new Blob([icoBytes], { type: "image/x-icon" });
				state.icoBlob = blob;

				return parseIco(blob).then(function (layers) {
					renderPreview(layers);
				});
			})
			.then(function () {
				els.downloadBtn.hidden = false;
				els.downloadBtn.disabled = false;
				setStatus(
					"Done! Your .ico file is ready (" + formatBytes(state.icoBlob.size) + ").",
					"success"
				);
			})
			.catch(function (error) {
				console.error(error);
				els.downloadBtn.hidden = true;
				setStatus("Error: " + error.message, "error");
			})
			.then(function () {
				els.convertBtn.disabled = false;
			});
	});

	els.downloadBtn.addEventListener("click", function () {
		if (!state.icoBlob) return;
		downloadBlob(state.icoBlob, state.baseName + ".ico");
	});

	els.resetBtn.addEventListener("click", function () {
		state.file = null;
		state.icoBlob = null;
		if (state.icoUrl) {
			URL.revokeObjectURL(state.icoUrl);
			state.icoUrl = null;
		}
		els.fileInput.value = "";
		els.fileName.textContent = "No file selected.";
		els.convertBtn.disabled = true;
		els.downloadBtn.hidden = true;
		els.downloadBtn.disabled = true;
		els.resetBtn.disabled = true;
		els.previewSection.hidden = true;
		els.previewGrid.innerHTML = "";
		setStatus("");
	});
})();
