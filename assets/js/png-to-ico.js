/*!
 * png-to-ico (browser port)
 *
 * A faithful browser port of the `png-to-ico` npm package (v3.0.2)
 * by Weilin Shi <934587911@qq.com> — https://github.com/steambap/png-to-ico
 * Licensed under the MIT License.
 *
 * The resize and ICO-encoding algorithms are ported verbatim from the
 * upstream source, with `Buffer` replaced by `Uint8Array`/`DataView` so
 * the exact same bytes are produced in the browser as by the Node CLI.
 *
 * Upstream's PNG decoding is done with `pngjs`; in the browser we decode
 * with the Canvas API, which yields the same straight (non-premultiplied)
 * RGBA byte order that `pngjs` produces.
 */
(function (global) {
	"use strict";

	/* ------------------------------------------------------------------ *
	 * lib/resize.js — ported verbatim from upstream (MIT, Guyon Roche)  *
	 * ------------------------------------------------------------------ */

	var Resize = {
		nearestNeighbor: function (src, dst) {
			var wSrc = src.width;
			var hSrc = src.height;

			var wDst = dst.width;
			var hDst = dst.height;

			var bufSrc = src.data;
			var bufDst = dst.data;

			for (var i = 0; i < hDst; i++) {
				for (var j = 0; j < wDst; j++) {
					var posDst = (i * wDst + j) * 4;

					var iSrc = Math.floor((i * hSrc) / hDst);
					var jSrc = Math.floor((j * wSrc) / wDst);
					var posSrc = (iSrc * wSrc + jSrc) * 4;

					bufDst[posDst++] = bufSrc[posSrc++];
					bufDst[posDst++] = bufSrc[posSrc++];
					bufDst[posDst++] = bufSrc[posSrc++];
					bufDst[posDst++] = bufSrc[posSrc++];
				}
			}
		},

		bilinearInterpolation: function (src, dst) {
			var wSrc = src.width;
			var hSrc = src.height;

			var wDst = dst.width;
			var hDst = dst.height;

			var bufSrc = src.data;
			var bufDst = dst.data;

			var interpolate = function (k, kMin, vMin, kMax, vMax) {
				// special case - k is integer
				if (kMin === kMax) {
					return vMin;
				}

				return Math.round((k - kMin) * vMax + (kMax - k) * vMin);
			};

			var assign = function (pos, offset, x, xMin, xMax, y, yMin, yMax) {
				var posMin = (yMin * wSrc + xMin) * 4 + offset;
				var posMax = (yMin * wSrc + xMax) * 4 + offset;
				var vMin = interpolate(x, xMin, bufSrc[posMin], xMax, bufSrc[posMax]);

				// special case, y is integer
				if (yMax === yMin) {
					bufDst[pos + offset] = vMin;
				} else {
					posMin = (yMax * wSrc + xMin) * 4 + offset;
					posMax = (yMax * wSrc + xMax) * 4 + offset;
					var vMax = interpolate(x, xMin, bufSrc[posMin], xMax, bufSrc[posMax]);

					bufDst[pos + offset] = interpolate(y, yMin, vMin, yMax, vMax);
				}
			};

			for (var i = 0; i < hDst; i++) {
				for (var j = 0; j < wDst; j++) {
					var posDst = (i * wDst + j) * 4;
					// x & y in src coordinates
					var x = (j * wSrc) / wDst;
					var xMin = Math.floor(x);
					var xMax = Math.min(Math.ceil(x), wSrc - 1);

					var y = (i * hSrc) / hDst;
					var yMin = Math.floor(y);
					var yMax = Math.min(Math.ceil(y), hSrc - 1);

					assign(posDst, 0, x, xMin, xMax, y, yMin, yMax);
					assign(posDst, 1, x, xMin, xMax, y, yMin, yMax);
					assign(posDst, 2, x, xMin, xMax, y, yMin, yMax);
					assign(posDst, 3, x, xMin, xMax, y, yMin, yMax);
				}
			}
		},

		_interpolate2D: function (src, dst, options, interpolate) {
			var bufSrc = src.data;
			var bufDst = dst.data;

			var wSrc = src.width;
			var hSrc = src.height;

			var wDst = dst.width;
			var hDst = dst.height;

			// when dst smaller than src/2, interpolate first to a multiple between 0.5 and 1.0 src, then sum squares
			var wM = Math.max(1, Math.floor(wSrc / wDst));
			var wDst2 = wDst * wM;
			var hM = Math.max(1, Math.floor(hSrc / hDst));
			var hDst2 = hDst * hM;

			// ===========================================================
			// Pass 1 - interpolate rows
			// buf1 has width of dst2 and height of src
			var buf1 = new Uint8Array(wDst2 * hSrc * 4);
			for (var i = 0; i < hSrc; i++) {
				for (var j = 0; j < wDst2; j++) {
					// i in src coords, j in dst coords

					// calculate x in src coords
					// this interpolation requires 4 sample points and the two inner ones must be real
					// the outer points can be fudged for the edges.
					// therefore (wSrc-1)/wDst2
					var x = (j * (wSrc - 1)) / wDst2;
					var xPos = Math.floor(x);
					var t = x - xPos;
					var srcPos = (i * wSrc + xPos) * 4;
					var buf1Pos = (i * wDst2 + j) * 4;

					for (var k = 0; k < 4; k++) {
						var kPos = srcPos + k;
						var x0 =
							xPos > 0 ? bufSrc[kPos - 4] : 2 * bufSrc[kPos] - bufSrc[kPos + 4];
						var x1 = bufSrc[kPos];
						var x2 = bufSrc[kPos + 4];
						var x3 =
							xPos < wSrc - 2
								? bufSrc[kPos + 8]
								: 2 * bufSrc[kPos + 4] - bufSrc[kPos];
						buf1[buf1Pos + k] = interpolate(x0, x1, x2, x3, t);
					}
				}
			}

			// ===========================================================
			// Pass 2 - interpolate columns
			// buf2 has width and height of dst2
			var buf2 = new Uint8Array(wDst2 * hDst2 * 4);
			for (var i2 = 0; i2 < hDst2; i2++) {
				for (var j2 = 0; j2 < wDst2; j2++) {
					// i&j in dst2 coords

					// calculate y in buf1 coords
					// this interpolation requires 4 sample points and the two inner ones must be real
					// the outer points can be fudged for the edges.
					// therefore (hSrc-1)/hDst2
					var y = (i2 * (hSrc - 1)) / hDst2;
					var yPos = Math.floor(y);
					var t2 = y - yPos;
					var buf1Pos = (yPos * wDst2 + j2) * 4;
					var buf2Pos = (i2 * wDst2 + j2) * 4;
					for (var k2 = 0; k2 < 4; k2++) {
						var kPos2 = buf1Pos + k2;
						var y0 =
							yPos > 0
								? buf1[kPos2 - wDst2 * 4]
								: 2 * buf1[kPos2] - buf1[kPos2 + wDst2 * 4];
						var y1 = buf1[kPos2];
						var y2 = buf1[kPos2 + wDst2 * 4];
						var y3 =
							yPos < hSrc - 2
								? buf1[kPos2 + wDst2 * 8]
								: 2 * buf1[kPos2 + wDst2 * 4] - buf1[kPos2];

						buf2[buf2Pos + k2] = interpolate(y0, y1, y2, y3, t2);
					}
				}
			}

			// ===========================================================
			// Pass 3 - scale to dst
			var m = wM * hM;
			if (m > 1) {
				for (var i3 = 0; i3 < hDst; i3++) {
					for (var j3 = 0; j3 < wDst; j3++) {
						// i&j in dst bounded coords
						var r = 0;
						var g = 0;
						var b = 0;
						var a = 0;
						var realColors = 0;

						for (var y3 = 0; y3 < hM; y3++) {
							var yPos2 = i3 * hM + y3;

							for (var x3 = 0; x3 < wM; x3++) {
								var xPos2 = j3 * wM + x3;
								var xyPos = (yPos2 * wDst2 + xPos2) * 4;
								var pixelAlpha = buf2[xyPos + 3];

								if (pixelAlpha) {
									r += buf2[xyPos];
									g += buf2[xyPos + 1];
									b += buf2[xyPos + 2];
									realColors++;
								}

								a += pixelAlpha;
							}
						}

						var pos = (i3 * wDst + j3) * 4;
						bufDst[pos] = realColors ? Math.round(r / realColors) : 0;
						bufDst[pos + 1] = realColors ? Math.round(g / realColors) : 0;
						bufDst[pos + 2] = realColors ? Math.round(b / realColors) : 0;
						bufDst[pos + 3] = Math.round(a / m);
					}
				}
			} else {
				// replace dst buffer with buf2
				dst.data = buf2;
			}
		},

		bicubicInterpolation: function (src, dst, options) {
			var interpolateCubic = function (x0, x1, x2, x3, t) {
				var a0 = x3 - x2 - x0 + x1;
				var a1 = x0 - x1 - a0;
				var a2 = x2 - x0;
				var a3 = x1;
				return Math.max(
					0,
					Math.min(255, a0 * (t * t * t) + a1 * (t * t) + a2 * t + a3)
				);
			};

			return this._interpolate2D(src, dst, options, interpolateCubic);
		},

		hermiteInterpolation: function (src, dst, options) {
			var interpolateHermite = function (x0, x1, x2, x3, t) {
				var c0 = x1;
				var c1 = 0.5 * (x2 - x0);
				var c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3;
				var c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2);
				return Math.max(
					0,
					Math.min(255, Math.round(((c3 * t + c2) * t + c1) * t + c0))
				);
			};

			return this._interpolate2D(src, dst, options, interpolateHermite);
		},

		bezierInterpolation: function (src, dst, options) {
			var interpolateBezier = function (x0, x1, x2, x3, t) {
				var cp1 = x1 + (x2 - x0) / 4;
				var cp2 = x2 - (x3 - x1) / 4;
				var nt = 1 - t;
				var c0 = x1 * nt * nt * nt;
				var c1 = 3 * cp1 * nt * nt * t;
				var c2 = 3 * cp2 * nt * t * t;
				var c3 = x2 * t * t * t;
				return Math.max(0, Math.min(255, Math.round(c0 + c1 + c2 + c3)));
			};

			return this._interpolate2D(src, dst, options, interpolateBezier);
		}
	};

	/* ------------------------------------------------------------------ *
	 * lib/png.js — ported from upstream                                *
	 * ------------------------------------------------------------------ */

	var interpolationList = [
		"nearestNeighbor",
		"bilinearInterpolation",
		"bicubicInterpolation",
		"hermiteInterpolation",
		"bezierInterpolation"
	];

	function createPNG(width, height) {
		return {
			width: width,
			height: height,
			data: new Uint8Array(width * height * 4)
		};
	}

	function resize(src, width, height, interpolation) {
		if (interpolation === undefined || interpolation === null) {
			interpolation = "bicubicInterpolation";
		}
		if (interpolationList.indexOf(interpolation) === -1) {
			throw new Error(
				'Unsupported interpolation "' +
					String(interpolation) +
					'". Expected one of: ' +
					interpolationList.join(", ") +
					"."
			);
		}

		var result = createPNG(width, height);
		Resize[interpolation](src, result);
		return result;
	}

	/* ------------------------------------------------------------------ *
	 * index.js — ported from upstream (ICO encoding)                    *
	 * ------------------------------------------------------------------ */

	// http://fileformats.wikia.com/wiki/Icon
	// the correct sizes are 256x256, 48x48, 32x32, 16x16
	var defaultSizeList = [48, 32, 16];

	function imagesToIco(images) {
		var header = getHeader(images.length);
		var headerAndIconDir = [header];
		var imageDataArr = [];

		var len = header.length;
		var offset = header.length + 16 * images.length;

		images.forEach(function (img) {
			var dir = getDir(img, offset);
			var bmpInfoHeader = getBmpInfoHeader(img);
			var dib = getDib(img);

			len += dir.length + bmpInfoHeader.length + dib.length;
			var newSize = bmpInfoHeader.length + dib.length;
			offset += newSize;

			new DataView(dir.buffer).setUint32(8, newSize, true);
			headerAndIconDir.push(dir);
			imageDataArr.push(bmpInfoHeader, dib);
		});

		return concatBytes(headerAndIconDir.concat(imageDataArr), len);
	}

	// https://en.wikipedia.org/wiki/ICO_(file_format)
	function getHeader(numOfImages) {
		var buf = new Uint8Array(6);
		var view = new DataView(buf.buffer);

		view.setUint16(0, 0, true); // Reserved. Must always be 0.
		view.setUint16(2, 1, true); // Specifies image type: 1 for icon (.ICO) image
		view.setUint16(4, numOfImages, true); // Specifies number of images in the file.

		return buf;
	}

	function getDir(img, offset) {
		var buf = new Uint8Array(16);
		var view = new DataView(buf.buffer);
		var bitmap = img;
		var width = bitmap.width >= 256 ? 0 : bitmap.width;
		var height = width;
		var bpp = 32;

		view.setUint8(0, width); // Specifies image width in pixels.
		view.setUint8(1, height); // Specifies image height in pixels.
		view.setUint8(2, 0); // Should be 0 if the image does not use a color palette.
		view.setUint8(3, 0); // Reserved. Must always be 0.
		view.setUint16(4, 1, true); // Specifies color planes. Should be 0 or 1.
		view.setUint16(6, bpp, true); // Specifies bits per pixel.
		view.setUint32(8, 0, true); // Specifies the size of the image's data in bytes
		view.setUint32(12, offset, true); // Specifies the offset of BMP or PNG data from the beginning of the ICO/CUR file

		return buf;
	}

	// https://en.wikipedia.org/wiki/BMP_file_format
	function getBmpInfoHeader(img) {
		var buf = new Uint8Array(40);
		var view = new DataView(buf.buffer);
		var bitmap = img;
		var width = bitmap.width;
		// https://en.wikipedia.org/wiki/ICO_(file_format)
		// ...Even if the AND mask is not supplied,
		// if the image is in Windows BMP format,
		// the BMP header must still specify a doubled height.
		var height = width * 2;
		var bpp = 32;

		view.setUint32(0, 40, true); // The size of this header (40 bytes)
		view.setInt32(4, width, true); // The bitmap width in pixels (signed integer)
		view.setInt32(8, height, true); // The bitmap height in pixels (signed integer)
		view.setUint16(12, 1, true); // The number of color planes (must be 1)
		view.setUint16(14, bpp, true); // The number of bits per pixel
		view.setUint32(16, 0, true); // The compression method being used.
		view.setUint32(20, 0, true); // The image size.
		view.setInt32(24, 0, true); // The horizontal resolution in pixels per meter (signed integer)
		view.setInt32(28, 0, true); // The vertical resolution in pixels per meter (signed integer)
		view.setUint32(32, 0, true); // The number of colors in the color palette, or 0 to default to 2n
		view.setUint32(36, 0, true); // The number of important colors, or 0 if every color is important.

		return buf;
	}

	// https://en.wikipedia.org/wiki/BMP_file_format
	// Note that the bitmap data starts with the lower left hand corner of the image.
	// blue green red alpha in order
	function getDib(img) {
		var bitmap = img;
		var size = bitmap.data.length;
		var width = bitmap.width;
		var height = width;
		var andMapRow = getRowStride(width);
		var andMapSize = andMapRow * height;
		var buf = new Uint8Array(size + andMapSize);
		var view = new DataView(buf.buffer);
		// xor map
		for (var y = 0; y < height; y++) {
			for (var x = 0; x < width; x++) {
				var pxColor = getPixelColor(img, x, y);

				var r = (pxColor >> 24) & 255;
				var g = (pxColor >> 16) & 255;
				var b = (pxColor >> 8) & 255;
				var a = pxColor & 255;
				var newColor = b | (g << 8) | (r << 16) | (a << 24);

				var pos = ((height - y - 1) * width + x) * 4;

				view.setInt32(pos, newColor, true);
			}
		}

		// and map. It's padded out to 32 bits per line
		for (var y2 = 0; y2 < height; y2++) {
			for (var x2 = 0; x2 < width; x2++) {
				var pxColor2 = getPixelColor(img, x2, y2);
				// TODO make threshhold configurable
				var alpha = (pxColor2 & 255) > 0 ? 0 : 1;
				var bitNum = (height - y2 - 1) * width + x2;
				// width per line in multiples of 32 bits
				var width32 =
					width % 32 === 0 ? Math.floor(width / 32) : Math.floor(width / 32) + 1;

				var line = Math.floor(bitNum / width);
				var offset = Math.floor(bitNum % width);
				var bitVal = alpha & 0x00000001;

				var pos2 = size + line * width32 * 4 + Math.floor(offset / 8);
				var newVal = buf[pos2] | (bitVal << (7 - (offset % 8)));
				buf[pos2] = newVal;
			}
		}

		return buf;
	}

	function getRowStride(width) {
		if (width % 32 === 0) {
			return width / 8;
		} else {
			return 4 * (Math.floor(width / 32) + 1);
		}
	}

	function getPixelColor(png, x, y) {
		var xi = x < 0 ? 0 : x;
		var yi = y < 0 ? 0 : y;

		if (x >= png.width) xi = png.width - 1;
		if (y >= png.height) yi = png.height - 1;

		var i =
			(xi < 0 || xi >= png.width) || (yi < 0 || yi >= png.height)
				? -1
				: (png.width * yi + xi) << 2;

		if (i < 0) return 0;

		var view = new DataView(
			png.data.buffer,
			png.data.byteOffset,
			png.data.byteLength
		);
		return view.getUint32(i, false);
	}

	function concatBytes(arrays, totalLength) {
		var out = new Uint8Array(totalLength);
		var pos = 0;
		for (var i = 0; i < arrays.length; i++) {
			out.set(arrays[i], pos);
			pos += arrays[i].length;
		}
		return out;
	}

	/* ------------------------------------------------------------------ *
	 * Public API                                                        *
	 * ------------------------------------------------------------------ */

	/**
	 * Convert a decoded RGBA image into an ICO file.
	 *
	 * Sizes are emitted in the same order as the upstream tool: the smaller
	 * resolutions first (largest to smallest) and the 256x256 master last.
	 *
	 * @param {{width:number,height:number,data:Uint8Array}} image
	 * @param {Object} [options]
	 * @param {number[]} [options.sizes]     target sizes, e.g. [16,32,48,256]
	 * @param {string}   [options.interpolation]
	 * @returns {Uint8Array} the .ico file contents
	 */
	function convertToIco(image, options) {
		options = options || {};
		var sizes =
			Array.isArray(options.sizes) && options.sizes.length
				? options.sizes.slice()
				: defaultSizeList.concat([256]);
		var interpolation = options.interpolation;

		// upstream always normalises to 256x256 first, then derives the rest
		var master =
			image.width !== 256
				? resize(image, 256, 256, interpolation)
				: image;

		// Keep the 256x256 entry last, and order the rest largest-to-smallest,
		// matching the entry order produced by the upstream implementation.
		var ordered = sizes
			.filter(function (size) { return size !== 256; })
			.sort(function (a, b) { return b - a; });
		if (sizes.indexOf(256) !== -1) ordered.push(256);

		var resized = ordered.map(function (targetSize) {
			return targetSize === 256
				? master
				: resize(master, targetSize, targetSize, interpolation);
		});

		return imagesToIco(resized);
	}

	global.PngToIco = {
		convertToIco: convertToIco,
		imagesToIco: imagesToIco,
		resize: resize,
		createPNG: createPNG,
		Resize: Resize,
		interpolationList: interpolationList,
		defaultSizeList: defaultSizeList
	};
})(typeof window !== "undefined" ? window : globalThis);
