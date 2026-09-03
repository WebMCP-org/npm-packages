/**
 * Bundle entry point for Smart DOM Reader: a self-contained bundle exposing one
 * stateless extraction function that always returns markdown-formatted results.
 */

import type { ExtractionArgs, ExtractionMethod, ExtractionResult } from './bundle-types';
import { SmartDOMReader } from './smart-dom-reader';
import { MarkdownFormatter } from './markdown-formatter';
import { ProgressiveExtractor } from './progressive';
import type { ContentExtractionOptions, ExtractionOptions } from './types';

function resolveDocument(frameSelector?: string): Document {
  if (!frameSelector) return document;

  const iframe = document.querySelector(frameSelector);
  if (!(iframe instanceof HTMLIFrameElement) || !iframe.contentDocument) {
    throw new Error(`Cannot access iframe: ${frameSelector}`);
  }
  return iframe.contentDocument;
}

// Export a function that will be available after the script is loaded
// This will be wrapped in an IIFE by the bundler
export function executeExtraction<M extends ExtractionMethod>(
  method: M,
  args: ExtractionArgs[M]
): ExtractionResult {
  try {
    let result: string;

    // TS cannot narrow the indexed type `ExtractionArgs[M]` from a switch on `method`,
    // so each arm restates the arg type it already knows it has.
    switch (method) {
      case 'extractStructure': {
        const structureArgs = args as ExtractionArgs['extractStructure'];
        const { selector, frameSelector, formatOptions } = structureArgs;
        const doc = resolveDocument(frameSelector);

        const target = selector ? doc.querySelector(selector) : doc;
        if (!target) {
          return { error: `No element found matching selector: ${selector}` };
        }
        const overview = ProgressiveExtractor.extractStructure(target);

        const meta = { title: document.title, url: location.href };
        result = MarkdownFormatter.structure(
          overview,
          formatOptions ?? { detail: 'summary' },
          meta
        );
        break;
      }

      case 'extractRegion': {
        const regionArgs = args as ExtractionArgs['extractRegion'];
        const { selector, mode, frameSelector, options, formatOptions } = regionArgs;
        const doc = resolveDocument(frameSelector);

        const extractOptions: ExtractionOptions = {
          ...options,
          mode: mode || 'interactive',
        };
        const extractResult = ProgressiveExtractor.extractRegion(selector, doc, extractOptions);

        if (!extractResult) {
          return { error: `No element found matching selector: ${selector}` };
        }

        const meta = { title: document.title, url: location.href };
        result = MarkdownFormatter.region(
          extractResult,
          formatOptions ?? { detail: 'region' },
          meta
        );
        break;
      }

      case 'extractContent': {
        const contentArgs = args as ExtractionArgs['extractContent'];
        const { selector, frameSelector, options, formatOptions } = contentArgs;
        const doc = resolveDocument(frameSelector);

        const extractOptions: ContentExtractionOptions = options || {};
        const extractResult = ProgressiveExtractor.extractContent(selector, doc, extractOptions);

        if (!extractResult) {
          return { error: `No element found matching selector: ${selector}` };
        }

        const meta = { title: document.title, url: location.href };
        result = MarkdownFormatter.content(
          extractResult,
          formatOptions ?? { detail: 'region' },
          meta
        );
        break;
      }

      case 'extractInteractive': {
        const interactiveArgs = args as ExtractionArgs['extractInteractive'];
        const { selector, frameSelector, options, formatOptions } = interactiveArgs;
        const doc = resolveDocument(frameSelector);

        const target = selector ? doc.querySelector(selector) : null;
        if (selector && !target) {
          return { error: `No element found matching selector: ${selector}` };
        }

        const extractResult = target
          ? SmartDOMReader.extractFromElement(target, 'interactive', options || {})
          : SmartDOMReader.extractInteractive(doc, options || {});

        const meta = { title: document.title, url: location.href };
        result = MarkdownFormatter.region(
          extractResult,
          formatOptions ?? { detail: 'region' },
          meta
        );
        break;
      }

      case 'extractFull': {
        const fullArgs = args as ExtractionArgs['extractFull'];
        const { selector, frameSelector, options, formatOptions } = fullArgs;
        const doc = resolveDocument(frameSelector);

        const target = selector ? doc.querySelector(selector) : null;
        if (selector && !target) {
          return { error: `No element found matching selector: ${selector}` };
        }

        const extractResult = target
          ? SmartDOMReader.extractFromElement(target, 'full', options || {})
          : SmartDOMReader.extractFull(doc, options || {});

        const meta = { title: document.title, url: location.href };
        result = MarkdownFormatter.region(extractResult, formatOptions ?? { detail: 'deep' }, meta);
        break;
      }

      default:
        return { error: `Unknown method: ${method}` };
    }

    return result;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
