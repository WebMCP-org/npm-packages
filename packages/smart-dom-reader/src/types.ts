export type ExtractionMode = 'interactive' | 'full' | 'structure' | 'content';

export interface ElementSelector {
  css: string;
  xpath: string;
  textBased?: string;
  dataTestId?: string;
  ariaLabel?: string;
  // Ranked selector candidates by stability/robustness (highest score first)
  candidates?: ElementSelectorCandidate[];
}

export interface ElementSelectorCandidate {
  type: 'id' | 'data-testid' | 'role-aria' | 'name' | 'class-path' | 'css-path' | 'xpath' | 'text';
  value: string;
  score: number; // Higher is better
}

export interface ElementContext {
  nearestForm?: string;
  nearestSection?: string;
  nearestMain?: string;
  nearestNav?: string;
  parentChain: string[];
}

export interface ElementInteraction {
  // Compact format: only include true values
  click?: boolean; // hasClickHandler
  change?: boolean; // hasChangeHandler
  submit?: boolean; // hasSubmitHandler
  nav?: boolean; // triggersNavigation
  disabled?: boolean; // isDisabled
  hidden?: boolean; // isHidden
  role?: string; // ariaRole
  form?: string; // formAssociation
}

export interface ExtractedElement {
  tag: string;
  text: string;
  selector: ElementSelector;
  attributes: Record<string, string>;
  context: ElementContext;
  interaction: ElementInteraction;
  // bounds removed to save tokens
  children?: ExtractedElement[];
}

export interface FormInfo {
  selector: string;
  action?: string;
  method?: string;
  inputs: ExtractedElement[];
  buttons: ExtractedElement[];
}

export interface PageLandmarks {
  navigation: string[];
  main: string[];
  forms: string[];
  headers: string[];
  footers: string[];
  articles: string[];
  sections: string[];
}

export interface PageState {
  url: string;
  title: string;
  hasErrors: boolean;
  isLoading: boolean;
  hasModals: boolean;
  hasFocus?: string;
}

export interface SmartDOMResult {
  mode: ExtractionMode;
  timestamp: number;
  page: PageState;
  landmarks: PageLandmarks;
  interactive: {
    buttons: ExtractedElement[];
    links: ExtractedElement[];
    inputs: ExtractedElement[];
    forms: FormInfo[];
    clickable: ExtractedElement[];
  };
  semantic?: {
    headings: ExtractedElement[];
    images: ExtractedElement[];
    tables: ExtractedElement[];
    lists: ExtractedElement[];
    articles: ExtractedElement[];
  };
  metadata?: {
    totalElements: number;
    extractedElements: number;
    mainContent?: string;
    language?: string;
  };
}

export interface FilterOptions {
  // Element selectors to include/exclude
  includeSelectors?: string[]; // CSS selectors for elements to include
  excludeSelectors?: string[]; // CSS selectors for elements to exclude

  // Text content filters
  textContains?: string[]; // Include elements containing these text strings
  textMatches?: RegExp[]; // Include elements matching these patterns

  // Attribute filters
  hasAttributes?: string[]; // Include elements with these attributes
  attributeValues?: Record<string, string | RegExp>; // Attribute value filters

  // Element type filters
  tags?: string[]; // Include only these tag types
  interactionTypes?: Array<keyof ElementInteraction>; // Include only elements with these interactions

  // Context filters
  withinSelectors?: string[]; // Only include elements within these containers
  nearText?: string; // Include elements near this text content
}

export interface ExtractionOptions {
  mode: ExtractionMode;
  maxDepth?: number;
  includeHidden?: boolean;
  includeShadowDOM?: boolean;
  includeIframes?: boolean;
  viewportOnly?: boolean;
  mainContentOnly?: boolean;
  customSelectors?: string[];

  // Token optimization options
  attributeTruncateLength?: number; // Max length for attribute values (default: 100)
  dataAttributeTruncateLength?: number; // Max length for data-* attributes (default: 50)
  textTruncateLength?: number; // Max length for text content (default: unlimited)

  // Filtering options
  filter?: FilterOptions;
}

// Progressive Extraction Types

export interface RegionInfo {
  selector: string;
  label?: string; // Semantic label (e.g., "Navigation", "Product List")
  role?: string; // ARIA role if present
  interactiveCount: number; // Count of interactive elements
  hasForm?: boolean;
  hasList?: boolean;
  hasTable?: boolean;
  hasMedia?: boolean;
  buttonCount?: number;
  linkCount?: number;
  inputCount?: number;
  textPreview?: string; // First 50 chars of text content
}

export interface StructuralOverview {
  regions: {
    header?: RegionInfo;
    navigation?: RegionInfo[];
    main?: RegionInfo;
    sidebar?: RegionInfo[];
    footer?: RegionInfo;
    modals?: RegionInfo[];
    sections?: RegionInfo[]; // Major content sections
  };
  forms: Array<{
    selector: string;
    location: string; // Which region it's in
    inputCount: number;
    purpose?: string; // Inferred from form attributes/content
  }>;
  summary: {
    totalInteractive: number;
    totalForms: number;
    totalSections: number;
    hasModals: boolean;
    hasErrors: boolean;
    isLoading: boolean;
    mainContentSelector?: string;
  };
  suggestions?: string[]; // AI-friendly hints about what to explore next
}

export interface ContentExtractionOptions {
  includeHeadings?: boolean;
  includeLists?: boolean;
  includeTables?: boolean;
  includeMedia?: boolean;
  preserveFormatting?: boolean;
  maxTextLength?: number;
}

export interface ExtractedContent {
  selector: string;
  text: {
    headings?: Array<{ level: number; text: string }>;
    paragraphs?: string[];
    lists?: Array<{ type: 'ul' | 'ol'; items: string[] }>;
  };
  tables?: Array<{
    headers: string[];
    rows: string[][];
  }>;
  media?: Array<{
    type: 'img' | 'video' | 'audio';
    alt?: string;
    src?: string;
  }>;
  metadata: {
    wordCount: number;
    hasInteractive: boolean;
  };
}
