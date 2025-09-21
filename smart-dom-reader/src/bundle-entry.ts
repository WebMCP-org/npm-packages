/**
 * Bundle Entry Point for Smart DOM Reader
 *
 * This creates a self-contained bundle that can be injected and executed
 * in a stateless manner. The bundle exports a single execute function
 * that processes extraction requests and ALWAYS returns markdown-formatted results.
 */

import type { ExtractionArgs, ExtractionMethod, ExtractionResult } from './bundle-types';
import { SmartDOMReader } from './index';
import { MarkdownFormatter } from './markdown-formatter';
import { ProgressiveExtractor } from './progressive';
import type { ContentExtractionOptions, ExtractionOptions } from './types';

// Export a function that will be available after the script is loaded
// This will be wrapped in an IIFE by the bundler
export function executeExtraction<M extends ExtractionMethod>(
  method: M,
  args: ExtractionArgs[M]
): ExtractionResult {
  try {
    let result: string;

    switch (method) {
      case 'extractStructure': {
        const structureArgs = args as ExtractionArgs['extractStructure'];
        const { selector, frameSelector, formatOptions } = structureArgs;
        let doc: Document = document;

        if (frameSelector) {
          const iframe = document.querySelector(frameSelector);
          if (!iframe || !(iframe instanceof HTMLIFrameElement) || !iframe.contentDocument) {
            return { error: `Cannot access iframe: ${frameSelector}` };
          }
          doc = iframe.contentDocument;
        }

        const target = selector ? (doc.querySelector(selector) ?? doc) : doc;
        const overview = ProgressiveExtractor.extractStructure(target);

        // Always return markdown formatted result
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
        let doc: Document = document;

        if (frameSelector) {
          const iframe = document.querySelector(frameSelector);
          if (!iframe || !(iframe instanceof HTMLIFrameElement) || !iframe.contentDocument) {
            return { error: `Cannot access iframe: ${frameSelector}` };
          }
          doc = iframe.contentDocument;
        }

        const extractOptions: ExtractionOptions = {
          ...(options || {}),
          mode: mode || 'interactive',
        };
        const extractResult = ProgressiveExtractor.extractRegion(
          selector,
          doc,
          extractOptions,
          SmartDOMReader
        );

        if (!extractResult) {
          return { error: `No element found matching selector: ${selector}` };
        }

        // Always return markdown formatted result
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
        let doc: Document = document;

        if (frameSelector) {
          const iframe = document.querySelector(frameSelector);
          if (!iframe || !(iframe instanceof HTMLIFrameElement) || !iframe.contentDocument) {
            return { error: `Cannot access iframe: ${frameSelector}` };
          }
          doc = iframe.contentDocument;
        }

        const extractOptions: ContentExtractionOptions = options || {};
        const extractResult = ProgressiveExtractor.extractContent(selector, doc, extractOptions);

        if (!extractResult) {
          return { error: `No element found matching selector: ${selector}` };
        }

        // Always return markdown formatted result
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
        let doc: Document = document;

        if (frameSelector) {
          const iframe = document.querySelector(frameSelector);
          if (!iframe || !(iframe instanceof HTMLIFrameElement) || !iframe.contentDocument) {
            return { error: `Cannot access iframe: ${frameSelector}` };
          }
          doc = iframe.contentDocument;
        }

        const extractResult = selector
          ? SmartDOMReader.extractFromElement(
              doc.querySelector(selector)!,
              'interactive',
              options || {}
            )
          : SmartDOMReader.extractInteractive(doc, options || {});

        // Always return markdown formatted result
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
        let doc: Document = document;

        if (frameSelector) {
          const iframe = document.querySelector(frameSelector);
          if (!iframe || !(iframe instanceof HTMLIFrameElement) || !iframe.contentDocument) {
            return { error: `Cannot access iframe: ${frameSelector}` };
          }
          doc = iframe.contentDocument;
        }

        const extractResult = selector
          ? SmartDOMReader.extractFromElement(doc.querySelector(selector)!, 'full', options || {})
          : SmartDOMReader.extractFull(doc, options || {});

        // Always return markdown formatted result
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

// Export for direct execution without global attachment
export const SmartDOMReaderBundle = { executeExtraction };
