/**
 * Browser entry point: exposes the pngjs PNG decoder on `window.PngJs`.
 *
 * pngjs is pure JavaScript with no native dependencies, so it runs in the
 * browser as-is once the Node `Buffer` global is shimmed. Bundling it here
 * means the browser decodes PNGs exactly like the upstream Node tool does,
 * so the generated .ico files are byte-identical.
 *
 * Only the synchronous decoder is bundled; the async (stream-based) encoder
 * is not needed in the browser.
 */
import { Buffer } from "buffer";

import parse from "pngjs/lib/parser-sync";

globalThis.Buffer = globalThis.Buffer || Buffer;

window.PngJs = {
	PNG: {
		sync: {
			read: function (buffer, options) {
				// pngjs expects a Node Buffer (it uses Buffer slicing/concat
				// semantics internally), so wrap the input accordingly.
				var input = Buffer.isBuffer(buffer)
					? buffer
					: Buffer.from(buffer.buffer || buffer, buffer.byteOffset || 0, buffer.byteLength);
				return parse(input, options || {});
			}
		}
	}
};
