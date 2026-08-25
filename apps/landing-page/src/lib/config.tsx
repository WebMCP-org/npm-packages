import { Icons } from '@/components/icons';

export const BLUR_FADE_DELAY = 0.15;

const BOOKING_HREF = '/contact';
const ROOK_HREF = 'https://chromewebstore.google.com/detail/opojeelojlkcinlhkbahpcekdolfjmhi';

export const siteConfig = {
  name: 'MCP-B',
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
    rook: ROOK_HREF,
  },
  booking: {
    href: BOOKING_HREF,
    externalHref: 'https://cal.com/sigvelo/15min',
    calLink: 'sigvelo/15min',
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
            name: 'Rook',
            href: ROOK_HREF,
            description: 'An AI agent that lives in the browser.',
            image: '/instant-integration.png',
          },
        ],
      },
      { id: 2, name: 'Docs', href: 'https://docs.mcp-b.ai' },
      { id: 3, name: 'Blog', href: '/blog' },
      { id: 4, name: 'GitHub', href: 'https://github.com/WebMCP-org' },
      { id: 5, name: 'Book a call', href: BOOKING_HREF },
    ],
  },
  hackathonBanner: {
    title: 'OpenAI WebMCP Challenge',
    description: 'Build an agent-native web app. Submissions close September 3 at 5 p.m. PT.',
    href: 'https://openai.com/webmcp-challenge',
  },
  hero: {
    badge: {
      icon: 'stacked-icons',
      text: 'The WebMCP Company',
    },
    title: [
      {
        text: 'AI consulting',
        href: BOOKING_HREF,
        variant: 'consulting',
        preview: { title: '15 min call' },
      },
      { text: ' and ' },
      {
        text: 'products',
        href: '#demo',
        variant: 'products',
        preview: { title: 'Packages' },
      },
      { text: ' that people and agents use WebMCP.' },
    ],
    description: [
      {
        text: 'MCP-B helped inspire',
        href: '/blog/mcp-b-introduction',
        variant: 'origin',
        preview: { title: 'Original post' },
      },
      { text: ' the ' },
      {
        text: 'WebMCP spec',
        href: 'https://webmachinelearning.github.io/webmcp/',
        variant: 'spec',
        preview: {
          title: 'WebMCP draft',
          image: '/assets/social-proof/w3c.svg',
          imageFit: 'contain' as const,
        },
      },
      { text: '. Now we help ' },
      {
        text: 'developers ship agent-native web apps',
        href: 'https://docs.mcp-b.ai',
        variant: 'developers',
        preview: { title: 'Docs' },
      },
      { text: ', ' },
      {
        text: 'companies ship web-native agents',
        href: BOOKING_HREF,
        variant: 'companies',
        preview: { title: 'Build with us' },
      },
      { text: ', and ' },
      {
        text: 'users navigate the web with agents',
        href: ROOK_HREF,
        variant: 'users',
        preview: {
          title: 'Rook',
          image: '/assets/social-proof/media/chrome-webmcp-cover.png',
        },
      },
      { text: ' — all through WebMCP.' },
    ],
  },
  socialProof: {
    items: [
      {
        work: 'WebMCP Community Group draft',
        client: 'W3C Community Group',
        sector: 'Draft',
        href: 'https://webmachinelearning.github.io/webmcp/',
        image: '/assets/social-proof/w3c.svg',
        backgroundSize: '56% auto',
      },
      {
        work: 'WebMCP early preview and implementation docs',
        client: 'Chrome Developers',
        sector: 'Platform docs',
        href: 'https://developer.chrome.com/docs/ai/webmcp',
        image: '/assets/social-proof/media/chrome-webmcp-cover.png',
      },
      {
        work: 'From Hacker News to W3C with Alex Nahas',
        client: 'alphalist.CTO',
        sector: 'Podcast',
        href: 'https://alphalist.com/podcast/138-138-from-hacker-news-to-w3c-how-one-amazon-engineer-accidentally-shaped-the-future-of-ai-browsers-alex-nahas-mcp-b',
        image: '/assets/social-proof/media/alphalist-webmcp.jpg',
      },
      {
        work: 'What is WebMCP? The creator tells us',
        client: 'Zuplo',
        sector: 'Video',
        href: 'https://www.youtube.com/watch?v=51A8SVCbS8Q',
        image: '/assets/social-proof/media/zuplo-creator-webmcp.jpg',
      },
      {
        work: 'WebMCP is MCP for single-page apps',
        client: 'Jack Herrington',
        sector: 'Video',
        href: 'https://www.youtube.com/watch?v=IAfrzel524s',
        image: '/assets/social-proof/media/jack-herrington-webmcp.jpg',
      },
      {
        work: 'Inside the mind behind MCP-B with Alex Nahas',
        client: 'Incognito Mode',
        sector: 'Podcast',
        href: 'https://podcasts.apple.com/us/podcast/the-protocol-that-rewired-the-web-inside-the-mind/id1847321394?i=1000756547963',
        image: '/assets/social-proof/media/incognito-webmcp.jpg',
      },
      {
        work: 'Google Ships WebMCP',
        client: 'Forbes',
        sector: 'Press',
        href: 'https://www.forbes.com/sites/joetoscano1/2026/02/19/google-ships-webmcp-the-browser-based-backbone-for-the-agentic-web/',
        image: '/assets/social-proof/media/forbes-webmcp.jpg',
      },
      {
        work: 'Google Chrome ships WebMCP in early preview',
        client: 'VentureBeat',
        sector: 'Press',
        href: 'https://venturebeat.com/infrastructure/google-chrome-ships-webmcp-in-early-preview-turning-every-website-into-a',
        image: '/assets/social-proof/venturebeat.svg',
        backgroundSize: '62% auto',
      },
      {
        work: 'How WebMCP lets developers control agents with JavaScript',
        client: 'The New Stack',
        sector: 'Press',
        href: 'https://thenewstack.io/how-webmcp-lets-developers-control-ai-agents-with-javascript/',
        image: '/assets/social-proof/media/the-new-stack-webmcp.jpg',
      },
      {
        work: 'Making every website a tool for AI agents',
        client: 'Arcade',
        sector: 'Interview',
        href: 'https://www.arcade.dev/blog/web-mcp-alex-nahas-interview/',
        image: '/assets/social-proof/media/arcade-webmcp.webp',
      },
      {
        work: 'The why and how of WebMCP',
        client: 'Coffee with Developers',
        sector: 'Podcast',
        href: 'https://coffeewithdevelopers.buzzsprout.com/1863461/episodes/18738760-the-why-and-how-of-webmcp-alex-nahas',
        image: '/assets/social-proof/media/wearedevelopers-webmcp.jpg',
      },
      {
        work: 'Safe browser automation with WebMCP',
        client: 'MCP Academy',
        sector: 'Talk',
        href: 'https://www.youtube.com/watch?v=VPUsSugmPow',
        image: '/assets/social-proof/media/mcp-academy-webmcp.jpg',
      },
      {
        work: 'Alex Nahas on WebMCP',
        client: 'AI Tinkerers Seattle',
        sector: 'Talk',
        href: 'https://www.youtube.com/watch?v=cUcyWY0wDBE',
        image: '/assets/social-proof/media/ai-tinkerers-webmcp.jpg',
      },
      {
        work: 'What WebMCP actually is, and why it matters',
        client: 'Zuplo',
        sector: 'Interview',
        href: 'https://zuplo.com/blog/what-is-webmcp',
        image: '/assets/social-proof/media/zuplo-webmcp.png',
      },
    ],
  },
  demoSection: {
    title: 'Packages',
    description: 'Core runtime, React, agent, and browser tooling.',
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
        answer: 'Install Rook from its canonical Chrome Web Store listing linked from this page.',
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
