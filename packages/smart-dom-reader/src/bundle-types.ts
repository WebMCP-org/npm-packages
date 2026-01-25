/**
 * Type-safe interface for the stateless bundle extraction API
 */

import type { MarkdownFormatOptions } from './markdown-formatter';
import type { ContentExtractionOptions, ExtractionOptions } from './types';

export type ExtractionMethod =
  | 'extractStructure'
  | 'extractRegion'
  | 'extractContent'
  | 'extractInteractive'
  | 'extractFull';

export interface BaseExtractionArgs {
  frameSelector?: string;
  formatOptions?: MarkdownFormatOptions;
}

export interface ExtractStructureArgs extends BaseExtractionArgs {
  selector?: string;
}

export interface ExtractRegionArgs extends BaseExtractionArgs {
  selector: string;
  mode?: 'interactive' | 'full';
  options?: Partial<ExtractionOptions>;
}

export interface ExtractContentArgs extends BaseExtractionArgs {
  selector: string;
  options?: ContentExtractionOptions;
}

export interface ExtractInteractiveArgs extends BaseExtractionArgs {
  selector?: string;
  options?: Partial<ExtractionOptions>;
}

export interface ExtractFullArgs extends BaseExtractionArgs {
  selector?: string;
  options?: Partial<ExtractionOptions>;
}

export type ExtractionArgs = {
  extractStructure: ExtractStructureArgs;
  extractRegion: ExtractRegionArgs;
  extractContent: ExtractContentArgs;
  extractInteractive: ExtractInteractiveArgs;
  extractFull: ExtractFullArgs;
};

export interface ExtractionError {
  error: string;
}

export type ExtractionResult = string | ExtractionError;

export interface SmartDOMReaderBundle {
  executeExtraction<M extends ExtractionMethod>(
    method: M,
    args: ExtractionArgs[M]
  ): ExtractionResult;
}

declare global {
  interface Window {
    SmartDOMReaderBundle: SmartDOMReaderBundle;
  }
}
