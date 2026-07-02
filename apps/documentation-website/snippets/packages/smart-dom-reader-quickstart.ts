import { ProgressiveExtractor, SmartDOMReader } from '@mcp-b/smart-dom-reader';

const data = SmartDOMReader.extractInteractive(document);

const structure = ProgressiveExtractor.extractStructure(document);
const region = ProgressiveExtractor.extractRegion(structure.summary.mainContentSelector, document, {
  mode: 'interactive',
});
