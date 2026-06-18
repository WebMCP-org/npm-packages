import { Icons } from '@/components/icons';

export const BLUR_FADE_DELAY = 0.15;

export const siteConfig = {
  name: 'MCP-B',
  parentName: 'SigVelo',
  parentUrl: 'https://sigvelo.com',
  description:
    'The WebMCP packages and browser extension. Open-source tools that let AI agents call functions your website already exposes.',
  cta: 'Read the docs',
  ctaHref: 'https://docs.mcp-b.ai',
  url: import.meta.env.PUBLIC_APP_URL || 'http://localhost:4321',
  keywords: ['WebMCP', 'MCP-B', 'browser tools', 'Model Context Protocol'],
  links: {
    email: 'alex@mcp-b.ai',
    twitter: 'https://x.com/alexnahasdev',
    discord: 'https://discord.gg/AMRbCtN5BY',
    github: 'https://github.com/WebMCP-org',
    linkedin: 'https://www.linkedin.com/company/mcp-b',
  },
  nav: {
    links: [
      {
        id: 1,
        name: 'Products',
        href: '#',
        submenu: [
          {
            id: 1,
            icon: <Icons.code className="size-4 text-muted-foreground" />,
            name: 'WebMCP Packages',
            href: '#demo',
            description: 'Core runtime, React, agent, and browser tooling.',
            image: '/multi-line-edits.png',
          },
          {
            id: 2,
            icon: <Icons.code className="size-4 text-muted-foreground" />,
            name: 'MCP-B Extension',
            href: 'https://chromewebstore.google.com/detail/mcp-b-extension/daohopfhkdelnpemnhlekblhnikhdhfa',
            description: 'Install the browser extension from Chrome Web Store.',
            image: '/instant-integration.png',
          },
        ],
      },
      { id: 2, name: 'Docs', href: 'https://docs.mcp-b.ai' },
      { id: 3, name: 'GitHub', href: 'https://github.com/WebMCP-org' },
    ],
  },
  hero: {
    badge: {
      icon: 'stacked-icons',
      text: 'Open-source WebMCP tooling',
    },
    title: 'Websites publish tools. Agents call them.',
    description:
      'MCP-B is an open-source WebMCP implementation and tooling suite: packages for publishing browser tools and an extension that connects them to agent experiences.',
    cta: {
      primary: {
        text: 'Read the docs',
        href: 'https://docs.mcp-b.ai',
      },
    },
  },
  demoSection: {
    title: 'What we ship',
    description:
      'Current packages and the browser extension, reviewed against the npm-packages source of truth.',
    items: [
      {
        id: 1,
        title: 'WebMCP Packages',
        content:
          'Core runtime, React integrations, transports, relays, extension helpers, DOM tooling, and TypeScript types.',
        contentType: 'webmcp-packages' as const,
      },
      {
        id: 2,
        title: 'MCP-B Extension',
        content:
          'A Chrome extension that discovers page-published WebMCP tools and connects them to extension-side agent experiences.',
        contentType: 'extension' as const,
      },
    ],
  },
  companyShowcase: {
    companyLogos: [
      {
        id: 1,
        name: 'Google',
        logo: <img src="/logos/google.svg" alt="Google" className="h-8 w-auto" />,
      },
      {
        id: 2,
        name: 'Microsoft',
        logo: <img src="/logos/microsoft.svg" alt="Microsoft" className="h-8 w-auto" />,
      },
      {
        id: 3,
        name: 'Amazon',
        logo: <img src="/logos/amazon.svg" alt="Amazon" className="h-8 w-auto" />,
      },
      {
        id: 4,
        name: 'JPMorgan Chase',
        logo: <img src="/logos/jpmorgan.svg" alt="JPMorgan Chase" className="h-8 w-auto" />,
      },
      {
        id: 5,
        name: 'Adobe',
        logo: <img src="/logos/adobe.svg" alt="Adobe" className="h-8 w-auto" />,
      },
      {
        id: 6,
        name: 'Target',
        logo: <img src="/logos/target.svg" alt="Target" className="h-16 w-auto" />,
      },
    ],
  },
  workflowConnectSection: {
    title: 'Publish browser tools. Connect agent clients.',
    description:
      'Use the package layer that matches your application, then connect through the extension, a relay, or an MCP-B transport.',
    ctaButton: { text: 'Choose a runtime', href: 'https://docs.mcp-b.ai/how-to/choose-runtime' },
    blocks: [
      {
        id: 1,
        icon: 'magic-click',
        title: 'Publish a focused tool surface',
        description:
          'Register typed tools through document.modelContext with clear schemas and product-level permission checks.',
      },
      {
        id: 2,
        icon: 'magic-star',
        title: 'Choose the right connection',
        description:
          'Use the extension for browser experiences, local relay for desktop clients, or transports for embedded integrations.',
      },
    ],
  },
  connectSection: {
    badge: { icon: <Icons.terminal className="size-4 text-muted-foreground" />, text: 'Build' },
    title: { before: 'Install. Publish. ', highlight: 'Connect.' },
    description: 'A practical path from a web application to an agent-callable tool surface.',
    step1: {
      title: 'Choose a runtime',
      description:
        'Start with native WebMCP or the strict polyfill. Add @mcp-b/global only when you need MCP-B extensions and transport.',
    },
    step2: {
      title: 'Register tools',
      description:
        'Publish small, typed actions through document.modelContext and keep human confirmation in the product UI.',
    },
    step3: {
      title: 'Connect an agent',
      description:
        'Install the MCP-B extension or configure the relay and transport that fits your client.',
    },
  },
  testimonialSection: {
    badge: { icon: 'quote', text: 'Open source' },
    title: { before: 'Built in the ', highlight: 'open', after: '' },
    description: 'Follow implementation, releases, and package history in the public repositories.',
    testimonials: [],
  },
  faqSection: {
    title: 'MCP-B questions',
    description: 'Short answers with links to the task-focused documentation.',
    faQitems: [
      {
        id: 1,
        question: 'Is MCP-B the official W3C implementation?',
        answer:
          'No. MCP-B is an open-source WebMCP implementation and tooling suite. The W3C specification remains the authority for the standard surface.',
      },
      {
        id: 2,
        question: 'Which API should new code use?',
        answer:
          'Use document.modelContext. navigator.modelContext remains a deprecated compatibility alias, and navigator.modelContextTesting is testing-only compatibility.',
      },
      {
        id: 3,
        question: 'Where do I install the extension?',
        answer: 'Install MCP-B from its canonical Chrome Web Store listing linked from this page.',
      },
      {
        id: 4,
        question: 'Which package should I start with?',
        answer:
          'Use the runtime chooser in Docs. The strict polyfill is the smallest portable runtime; @mcp-b/global adds MCP-B extensions and transport.',
      },
    ],
  },
  ctaSection: {
    id: 'cta',
    title: 'Ready to make your site agent-ready?',
    backgroundImage: '/agent-cta-background.png',
    button: {
      text: 'Read the docs',
      href: 'https://docs.mcp-b.ai',
    },
    subtext:
      'Install the packages, publish tools through document.modelContext, and connect an agent. Everything is open source.',
  },
};

export type SiteConfig = typeof siteConfig;
