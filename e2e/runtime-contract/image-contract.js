import { createRuntimeContractController } from './core.js';

export const IMAGE_TEXT_SMOKE_TOOL_NAME = 'image_text_smoke';
export const GET_SERIALIZED_PNG_TOOL_NAME = 'get_serialized_png';
export const GET_BLOB_PNG_TOOL_NAME = 'get_blob_png';
export const GET_CANVAS_PNG_TOOL_NAME = 'get_canvas_png';
export const GET_CANVAS_JPEG_TOOL_NAME = 'get_canvas_jpeg';
export const GET_CANVAS_UNSUPPORTED_MIME_TYPE_TOOL_NAME = 'get_canvas_unsupported_mime_type';
export const GET_IMAGE_ARRAY_TOOL_NAME = 'get_image_array';
export const GET_IMAGE_ELEMENT_PNG_TOOL_NAME = 'get_image_element_png';
export const DESCRIBE_INPUT_IMAGE_TOOL_NAME = 'describe_input_image';
export const GET_UNSUPPORTED_IMAGE_SOURCE_TOOL_NAME = 'get_unsupported_image_source';
export const GET_BLOB_WITHOUT_MIME_TYPE_TOOL_NAME = 'get_blob_without_mime_type';
export const GET_SERIALIZED_WITHOUT_MIME_TYPE_TOOL_NAME = 'get_serialized_without_mime_type';
export const ONE_BY_ONE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function structuredCloneFallback(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalizeArguments(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return structuredCloneFallback(value);
}

function recordInvocation(state, name, args) {
  state.invocations.push({
    name,
    arguments: normalizeArguments(args),
  });
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function createFilledCanvas(fillStyle) {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas context is unavailable');
  }
  context.fillStyle = fillStyle;
  context.fillRect(0, 0, 1, 1);
  return canvas;
}

function loadImageFromBase64(base64) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image fixture failed to load'));
    image.src = `data:image/png;base64,${base64}`;
  });
}

function installHook(controller) {
  if (typeof window !== 'undefined') {
    window.__WEBMCP_E2E__ = controller;
  }
  globalThis.__WEBMCP_E2E__ = controller;
  return controller;
}

export function createImageContractState() {
  return {
    ready: false,
    invocations: [],
  };
}

export function createImageToolDescriptors(state, options = {}) {
  const runtimeLabel = options.runtimeLabel ?? 'image';

  return {
    baseTools: [
      {
        name: IMAGE_TEXT_SMOKE_TOOL_NAME,
        description: 'Smoke test tool for image value contract pages.',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
        async execute(args) {
          const normalized = normalizeArguments(args);
          const message = typeof normalized.message === 'string' ? normalized.message : '';
          recordInvocation(state, IMAGE_TEXT_SMOKE_TOOL_NAME, normalized);
          return {
            message,
            text: `image-smoke:${message}`,
            runtime: runtimeLabel,
          };
        },
      },
      {
        name: GET_SERIALIZED_PNG_TOOL_NAME,
        description: 'Return a serialized PNG image value.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        async execute(args) {
          recordInvocation(state, GET_SERIALIZED_PNG_TOOL_NAME, normalizeArguments(args));
          return {
            type: 'image',
            data: ONE_BY_ONE_PNG_BASE64,
            mimeType: 'image/png',
          };
        },
      },
      {
        name: GET_BLOB_PNG_TOOL_NAME,
        description: 'Return a PNG image value backed by a Blob.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        async execute(args) {
          recordInvocation(state, GET_BLOB_PNG_TOOL_NAME, normalizeArguments(args));
          return {
            type: 'image',
            value: new Blob([base64ToBytes(ONE_BY_ONE_PNG_BASE64)], {
              type: 'image/png',
            }),
          };
        },
      },
      {
        name: GET_CANVAS_PNG_TOOL_NAME,
        description: 'Return a PNG image value backed by a canvas element.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        async execute(args) {
          recordInvocation(state, GET_CANVAS_PNG_TOOL_NAME, normalizeArguments(args));
          return {
            type: 'image',
            value: createFilledCanvas('#ff0000'),
          };
        },
      },
      {
        name: GET_CANVAS_JPEG_TOOL_NAME,
        description: 'Return a canvas image value with a requested JPEG MIME type.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        async execute(args) {
          recordInvocation(state, GET_CANVAS_JPEG_TOOL_NAME, normalizeArguments(args));
          return {
            type: 'image',
            value: createFilledCanvas('#0000ff'),
            mimeType: 'image/jpeg',
          };
        },
      },
      {
        name: GET_CANVAS_UNSUPPORTED_MIME_TYPE_TOOL_NAME,
        description: 'Return a canvas image value with an unsupported requested MIME type.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        async execute(args) {
          recordInvocation(
            state,
            GET_CANVAS_UNSUPPORTED_MIME_TYPE_TOOL_NAME,
            normalizeArguments(args)
          );
          return {
            type: 'image',
            value: createFilledCanvas('#00ff00'),
            mimeType: 'image/unsupported',
          };
        },
      },
      {
        name: GET_IMAGE_ARRAY_TOOL_NAME,
        description: 'Return an array containing an image value.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        async execute(args) {
          recordInvocation(state, GET_IMAGE_ARRAY_TOOL_NAME, normalizeArguments(args));
          return [
            {
              type: 'image',
              value: new Blob([base64ToBytes(ONE_BY_ONE_PNG_BASE64)], {
                type: 'image/png',
              }),
            },
          ];
        },
      },
      {
        name: GET_IMAGE_ELEMENT_PNG_TOOL_NAME,
        description: 'Return a PNG image value backed by an image element.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        async execute(args) {
          recordInvocation(state, GET_IMAGE_ELEMENT_PNG_TOOL_NAME, normalizeArguments(args));
          return {
            type: 'image',
            value: await loadImageFromBase64(ONE_BY_ONE_PNG_BASE64),
          };
        },
      },
      {
        name: DESCRIBE_INPUT_IMAGE_TOOL_NAME,
        description: 'Describe a serialized input image value.',
        inputSchema: {
          type: 'object',
          properties: {
            image: {
              type: 'object',
            },
          },
          required: ['image'],
        },
        async execute(args) {
          const normalized = normalizeArguments(args);
          recordInvocation(state, DESCRIBE_INPUT_IMAGE_TOOL_NAME, normalized);
          const image = normalized.image;
          if (!image || typeof image !== 'object' || Array.isArray(image)) {
            throw new Error('Expected image argument');
          }
          return {
            inputType: image.type,
            mimeType: image.mimeType,
            dataLength: typeof image.data === 'string' ? image.data.length : 0,
          };
        },
      },
      {
        name: GET_UNSUPPORTED_IMAGE_SOURCE_TOOL_NAME,
        description: 'Return an unsupported image source shape.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        async execute(args) {
          recordInvocation(state, GET_UNSUPPORTED_IMAGE_SOURCE_TOOL_NAME, normalizeArguments(args));
          return {
            type: 'image',
            source: {},
          };
        },
      },
      {
        name: GET_BLOB_WITHOUT_MIME_TYPE_TOOL_NAME,
        description: 'Return a Blob image value without a MIME type.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        async execute(args) {
          recordInvocation(state, GET_BLOB_WITHOUT_MIME_TYPE_TOOL_NAME, normalizeArguments(args));
          return {
            type: 'image',
            value: new Blob([base64ToBytes(ONE_BY_ONE_PNG_BASE64)]),
          };
        },
      },
      {
        name: GET_SERIALIZED_WITHOUT_MIME_TYPE_TOOL_NAME,
        description: 'Return a serialized image value without a MIME type.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        async execute(args) {
          recordInvocation(
            state,
            GET_SERIALIZED_WITHOUT_MIME_TYPE_TOOL_NAME,
            normalizeArguments(args)
          );
          return {
            type: 'image',
            data: ONE_BY_ONE_PNG_BASE64,
          };
        },
      },
    ],
  };
}

export async function installBrowserImageRuntimeContract(modelContext, options = {}) {
  if (!modelContext || typeof modelContext.registerTool !== 'function') {
    throw new Error(
      'document.modelContext.registerTool is required for the image runtime contract'
    );
  }

  const state = createImageContractState();
  const descriptors = createImageToolDescriptors(state, options);

  for (const tool of descriptors.baseTools) {
    modelContext.registerTool(tool);
  }
  state.ready = true;

  const controller = createRuntimeContractController(
    state,
    () => false,
    () => false
  );

  return installHook(controller);
}
