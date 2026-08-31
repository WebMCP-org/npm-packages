---
layout: ../../layouts/BlogPost.astro
title: 'MCP-B: Build MCP servers into websites'
description: 'Why MCP-B exposes website actions as structured WebMCP tools, avoiding brittle browser automation while preserving browser state, authorization, and user control.'
pubDate: '2025-01-15'
author:
  name: 'Alex Nahas'
---

> **2026 update:** MCP-B now implements and extends WebMCP, the W3C Community Group proposal for browser-native agent tools. For current guidance, read [What is WebMCP?](https://docs.mcp-b.ai/explanation/what-is-webmcp), [choose a runtime](https://docs.mcp-b.ai/how-to/choose-runtime), or [build your first tool](https://docs.mcp-b.ai/tutorials/first-tool). This post preserves the project's original design history.

With all the major security issues and data leakages the MCP ecosystem has been facing recently, the pre-authorized, user-scoped sandbox of the browser feels like more of the promised land than ever.

Every other day I see a new Launch HN or project that gives another attempt at browser automation via LLMs. Every solution I see is banking on the same idea: these models will eventually be able to navigate and interact with the browser as well as a human.

Maybe I'm just a bit more skeptical than the average AGI enthusiast, but I feel like we are building for a future that is not here yet and might not come for a while. Before we get into MCP-B, why I wrote it, and why it solves a bunch of problems with both MCP and browser automation. Let's quickly go over the current state of the ecosystem.

### Browser automation is a mess

When current AI tries to buy something online with browser automation, here's what actually happens:

1. Take a screenshot (or parse the DOM)
2. Ask the model: "Where's the 'Add to Cart' button?"
3. Model responds with coordinates or element selector
4. Click the button
5. Wait for page to update
6. Take another screenshot
7. Ask: "Did that work? What happened?"
8. Repeat for every single interaction

We're using a language model as an OCR engine with a mouse. Every click requires multiple round trips through the model. The model burns tokens answering questions like "Is this button blue or gray?" and "Where is the search box?" It has to reorient itself with every page change, parse visual layouts, and hope the UI hasn't shifted by a pixel.

## MCP and its limitations

**MCP stands for "Model Context Protocol."** It's an attempt to standardize the way we provide both information and ways to interact with the external world to LLMs. It consists of three parts:

- **A server** – This is where all the information and functions which allow the LLM to take action live
- **A client** – This lives in the same place as the LLM (sort of) and provides a standard way to interact with the capabilities the server has
- **Transports** – both the client and server have one of these. They allow the client to call the server even if they live in totally different places. If it's capable of transporting data, you can write transports for it

Right now there are two officially supported transports:

- **stdio** - allows communication between processes locally on your computer
- **streamableHttp/SSE** – allows communication between processes over HTTP

## What is MCP-B?

MCP-B extends MCP with transports for intra-browser communication. The two transports are Extension Transports (for communication within and between browser extensions) and Tab Transports (for communication between scripts in the same tab).

<img src="https://sigvelo.com/images/blog/smaller.gif" alt="MCP-B demo showing browser tools" width="1896" height="1080" loading="lazy" decoding="async" />

This means your website can be an MCP server and/or client and so can your browser extension.

## How MCP-B Works

<img src="https://sigvelo.com/images/blog/full-arch.png" alt="MCP-B browser architecture" width="1770" height="1272" loading="lazy" decoding="async" />

MCP-B really only needs 1 transport to work (The TabTransports), but the current extension makes use of both. You can think of the MCP-B extension server as an MCP server which collects all the tools from other Tab MCP servers then routes requests to the proper URL and tab when one of it's tools are called. The extension layer also does some things like tool caching and opening a tab with the properly URL of the tool if one does not already exist.

- **Tab Transports** - Use postMessage for in-page communication between your website's MCP server and any client in the same tab. This transport deviates from the official protocol a bit where I have added in some edge-cases to help the server and client find each other if the server loads in after the client
- **Extension Transports** - Use Chrome's runtime messaging for communication between extension components (sidebar, popup, background)

When you visit a website with an MCP server, the extension will inject an MCP client into the page which will reach out and look for any servers, register their tools with the extension MCP server, and listen for tool call requests from the extension or tool updates from the tab server.

## Why would I want my website to be an MCP server?

Well having your website be an MCP server isn't really that beneficial by itself. You can declare a client in the same tab and call tools on your server but that adds a layer of abstraction that is not needed when both server and client live in the same script. Not to mention, you will have to embed your own chat application in your website to benefit from it. If you do want to do this, I recommend just using the inMemoryTransports from the official SDK (they are not documented but work great)

The true power and benefit of this is when the Website is the MCP server and the extension is the MCP client. Let me explain why.

From the website's perspective, they have just wrapped some of their existing functionality (client side APIs, forms, or whatever else they want to allow the model to read/interact with) in tools (functions with a bit of information of how to use them for LLMs). That's it.

The extension injects a client into the tab when it opens up and connects to the tab server and passes along its tools to the rest of the extension. When the extension decides it wants to call a tool on the tab, it just passes that request back to the client. You get a full MCP client-server relationship with zero configuration from a user perspective. All they need to do is visit a website with an MCP server and make sure they have the extension installed!

Lucky for us, MCP supports dynamic tool updates so if the website's tools come in asynchronously or based on URL, the client automatically updates.

Website owners get to add automation to their websites without worrying about maintaining a chat application. And users can use the same interface they want for multiple websites and even get their agent to work across multiple websites like putting the output of one website's tool call into the input of another.

## Cross-Site Tool Composition

MCP-B enables tools from different websites to work together. Each site exposes its existing functionality as MCP tools, and the extension handles routing calls between them.

Site A exposes its cart state:

```typescript
// shop.example.com - reading from React state
const { cart } = useCartContext();

server.tool('getCurrentCart', 'Get current shopping cart contents', {}, async () => {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          items: cart.items.map((item) => ({
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            sku: item.sku,
          })),
          total: cart.total,
          itemCount: cart.items.length,
        }),
      },
    ],
  };
});
```

Site B wraps its existing authenticated API:

```typescript
// pricewatch.com - using their existing authenticated API
server.tool(
  'comparePrices',
  'Search for product prices across retailers',
  {
    productName: z.string().describe('Product name to search for'),
    sku: z.string().optional().describe('Product SKU for exact matching'),
  },
  async ({ productName, sku }) => {
    // This uses the site's existing API with the user's current session
    // No additional auth needed - cookies/headers are already set
    const response = await fetch('/api/products/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', // Uses existing session cookies
      body: JSON.stringify({
        query: productName,
        sku: sku,
        includeShipping: true,
      }),
    });

    const results = await response.json();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            bestPrice: results.prices[0],
            averagePrice: results.average,
            retailers: results.retailers.slice(0, 5),
          }),
        },
      ],
    };
  }
);
```

Here's what happens when the model wants to compare prices for items in the cart:

1. The extension calls `shop_example_com_getCurrentCart` on the active tab.
2. The model receives the cart data in its context and decides to check prices.
3. When it calls `pricewatch_com_comparePrices`, the extension sees this tool belongs to a different domain.
4. It opens `pricewatch.com` in a new tab (or switches to it if already open).
5. Waits for the MCP server to initialize on that tab.
6. Executes the tool call with the product data from step 1.
7. Returns the results to the model's context.

The key is that `fetch('/api/products/search')` uses whatever authentication the user already has with `pricewatch.com` - session cookies, auth headers, whatever. The MCP tool is just a thin wrapper around the site's existing API endpoints. The extension manages the tab navigation and maintains the conversation context across sites, while each site's tools operate with their own authentication context.

<img src="https://sigvelo.com/images/blog/multi-site-workflow.svg" alt="Multi-site WebMCP workflow" width="1773" height="700" loading="lazy" decoding="async" />

## Good websites are Context Engineering

Something that has been getting a lot of attention recently is context engineering (making sure that the model only has context relevant to its task). People are beginning to realize that if you give a model 100 tools and ask it to do something where only one of them would be the right one to use, it's unlikely for things to go well. That's not surprising. If I asked you to build a table and gave you a Home Depot you probably would have a harder time than if I gave you a saw, a hammer, wood, and some nails.

The cool thing about MCP-B is you can scope tools to different webpages on your app. So instead of giving the model all the tools of your website all at once, you can intentionally show it tools based on where it is in the website and what it has called so far. Think of this like a UI for LLMs. Websites don't put all of the content on one page, we limit the amount of info the user sees at any given time and expose more information behind tabs and buttons that indicate it lives there.

```jsx
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { useEffect } from 'react';
import { z } from 'zod';

// Global MCP server instance
const server = new McpServer({
  name: 'ecommerce-app',
  version: '1.0.0',
});

// Component that registers shopping cart tools when rendered
function ShoppingCartTools({ cartId, items }) {
  useEffect(() => {
    const addToCartTool = server.registerTool(
      'addToCart',
      {
        title: 'Add to Cart',
        description: 'Add an item to the shopping cart',
        inputSchema: {
          productId: z.string().describe('Product ID to add'),
          quantity: z.number().min(1).describe('Quantity to add'),
        },
      },
      async ({ productId, quantity }) => {
        await cartService.addItem(cartId, productId, quantity);
        return {
          content: [{ type: 'text', text: `Added ${quantity} of ${productId} to cart` }],
        };
      }
    );

    const removeFromCartTool = server.registerTool(
      'removeFromCart',
      {
        title: 'Remove from Cart',
        description: 'Remove an item from the shopping cart',
        inputSchema: {
          itemId: z.string().describe('Cart item ID to remove'),
        },
      },
      async ({ itemId }) => {
        await cartService.removeItem(cartId, itemId);
        return {
          content: [{ type: 'text', text: `Removed item ${itemId} from cart` }],
        };
      }
    );

    // Only show checkout tool if cart has items
    let checkoutTool;
    if (items.length > 0) {
      checkoutTool = server.registerTool(
        'checkout',
        {
          title: 'Checkout Cart',
          description: 'Proceed to checkout with current cart items',
          inputSchema: {
            paymentMethod: z.enum(['credit', 'debit', 'paypal']),
          },
        },
        async ({ paymentMethod }) => {
          const order = await checkoutService.processCart(cartId, paymentMethod);
          return {
            content: [{ type: 'text', text: `Order ${order.id} created successfully` }],
          };
        }
      );
    }

    // Cleanup when component unmounts
    return () => {
      addToCartTool.remove();
      removeFromCartTool.remove();
      checkoutTool?.remove();
    };
  }, [cartId, items.length]); // Re-register when cart changes

  return null;
}

// Product page tools
function ProductPageTools({ product, isAdmin }) {
  useEffect(() => {
    const tools = [];

    // Customer tools
    tools.push(
      server.registerTool(
        'getProductDetails',
        {
          title: 'Get Product Details',
          description: `Get detailed information about ${product.name}`,
          inputSchema: {},
        },
        async () => ({
          content: [{ type: 'text', text: JSON.stringify(product, null, 2) }],
        })
      )
    );

    // Admin-only tools
    if (isAdmin) {
      tools.push(
        server.registerTool(
          'updateProduct',
          {
            title: 'Update Product',
            description: `Update ${product.name} details`,
            inputSchema: {
              name: z.string().optional(),
              price: z.number().optional(),
              description: z.string().optional(),
            },
          },
          async (updates) => {
            await productService.update(product.id, updates);
            return {
              content: [{ type: 'text', text: 'Product updated successfully' }],
            };
          }
        ),

        server.registerTool(
          'deleteProduct',
          {
            title: 'Delete Product',
            description: `Delete ${product.name} permanently`,
            inputSchema: {},
          },
          async () => {
            await productService.delete(product.id);
            return {
              content: [{ type: 'text', text: 'Product deleted successfully' }],
            };
          }
        )
      );
    }

    return () => tools.forEach((tool) => tool.remove());
  }, [product.id, isAdmin]);

  return null;
}

// Usage in your app
function EcommerceApp() {
  const { user, cart } = useAppState();

  return (
    <Routes>
      <Route
        path="/cart"
        element={
          <>
            <CartPage />
            <ShoppingCartTools cartId={cart.id} items={cart.items} />
          </>
        }
      />
      <Route
        path="/product/:id"
        element={
          <>
            <ProductPage />
            <ProductPageTools product={currentProduct} isAdmin={user.role === 'admin'} />
          </>
        }
      />
    </Routes>
  );
}
```

In the example above, each React component manages its own tool lifecycle. Mount the component, register the tools; unmount it, clean them up. The cart page exposes `addToCart` and `removeFromCart`. Navigate away? Those tools disappear. Hit a product page as an admin? You get `updateProduct` and `deleteProduct` that regular users never see. It's basically the same pattern we use for UI state management, but applied to LLM capabilities. No more giving your model 100 tools and hoping it picks the right one. We treat the model with the same respect we give to the user.

### Tool Caching Control

Most tools for a website are included in the MCP-B context window so long as they are on the active tab. This is another way to limit the amount of tools the model can see at any given time. However, websites can tell the MCP-B client to cache their tools and it will navigate back to the website which owns them on cached tool call. This is so the model can know, "Hey x website has tools and it will have more tools when I navigate to it."

<img src="https://sigvelo.com/images/blog/dynamic-tool-caching.gif" alt="MCP-B dynamic tool caching demo" width="1668" height="1080" loading="lazy" decoding="async" />

```javascript
// Mark a tool as cacheable
server.registerTool(
  'globalAction',
  {
    title: 'Global Action',
    description: 'Available everywhere',
    annotations: {
      cache: true, // This tool persists across tabs
    },
  },
  handler
);

// Regular tool (removed when tab becomes inactive)
server.registerTool(
  'pageSpecific',
  {
    title: 'Page Specific Action',
    description: 'Only available on this page',
    // No cache annotation = not cached
  },
  handler
);
```

## Remote MCP vs Browser MCP

At this point you might be asking, isn't this what remote MCP is supposed to solve? Why are we doing it in the browser?

Well that's a fair point. Remote MCPs have the added benefit of being able to be used by remote servers that don't need a human in the loop. But actually, they don't. The OAuth2.1 spec is required in the remote MCP server implementation and it's basically only useable by local clients like Claude desktop at the moment. It's my personal belief that we as an industry have really put the cart before the ox on agentic workflows. The Mantra repeated by silicon valley has been If we just give these agents all the tools they need, they will reliably be able to automate entire workflows.

Are you aware of any serious remote MCP's that allow you to write or delete important data from a multi-tenant app? Basically all remote MCPs and most MCPs in general that operate on user data are read only.

The models just simply are not there yet and for any important work, humans are needed in the loop. I'm not saying that autonomous cloud agents are not the future, but they definitely aren't the present or near future.

The beauty of treating the browser as both the UI for the human and LLM is the human can see exactly what the agent is doing. MCP-B does this important work where the important work is already happening.

## The Auth problem

At this point, the auth issues with MCP are well known. OAuth2.1 is great, but we are basically trying to re-invent auth for agents that act on behalf of the user. This is a good long term goal, but we are quickly realizing that LLM sessions with no distinguishable credentials of their own are difficult to authorize and will require a complete re-imagining of our authorization systems. Data leakage in multi-tenant apps that have MCP servers is just not a solved problem yet.

I think a very strong case for MCP is to limit the amount of damage the model can do and the amount of data it will ever have access to. The nice thing about client side APIs in multi-tenant apps is they are hopefully already scoped to the user. If we just give the model access to that, there's not much damage they can do.

## Security & Trust Model

MCP-B definitely has security risks, but the ones that are not risks internal to the protocol itself are well known:

### For Websites:

- You only expose tools you'd already expose as buttons/forms
- Tools run in your page's context with your existing auth
- You control what tools are available based on user state
- Support for MCP's elicitation protocol for sensitive operations

### For Users:

- Extensions already require trust when installed
- All tool calls are explicit and auditable
- You can see exactly what sites expose what tools
- The human is in the loop (for now)

### For Developers:

```typescript
// Tools can be scoped to components
function AdminPanel({ user }) {
  const { registerTool } = useMcpServer();

  useEffect(() => {
    if (!user.isAdmin) return;

    const unregister = server.registerTool('deleteUser', {
      description: 'Delete a user account',
      // This tool only exists while admin panel is mounted
    });

    return () => unregister();
  }, [user.isAdmin]);
}
```

If a website wants to expose a "delete all user data" tool, that's on them. It's no different than putting a big red delete button on the page. MCP-B just makes these capabilities accessible to the LLM as well. I plan to add support for elicitation ASAP

## Try it in 5 Minutes

1. **Install the extension:** [Chrome Web Store](https://chromewebstore.google.com/detail/opojeelojlkcinlhkbahpcekdolfjmhi)

2. **Add to your website:**

   ```
   npm install @mcp-b/transports @modelcontextprotocol/sdk zod
   ```

3. **Expose a tool:**

   ```typescript
   import { TabServerTransport } from '@mcp-b/transports';
   import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

   const server = new McpServer({
     name: 'my-app',
     version: '1.0.0',
   });

   server.tool(
     'sayHello',
     'Says hello',
     {
       name: z.string(),
     },
     async ({ name }) => ({
       content: [{ type: 'text', text: `Hello ${name}!` }],
     })
   );

   await server.connect(new TabServerTransport({ allowedOrigins: ['*'] }));
   ```

4. **Visit your site and click the MCP-B extension, go to the MCP server tab and click on your tool**

## Why Not Computer Use or Browser Automation?

There are several players trying to solve browser automation for AI:

- [Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [BrowserMCP](https://browsermcp.io/)
- [Dia](https://www.diabrowser.com/)
- Anthropic's own computer use

Playwright MCP is the smartest of the bunch - they use accessibility trees instead of pixels. But here's the thing: they're all betting on the same losing horse. They're assuming models will eventually be so good they can just... figure it out. Navigate any UI, understand any layout, click the right button every time.

This is the AGI fantasy all over again. We're building tools for the models we wish we had, not the models we actually have.

So why are we teaching them to cosplay as humans clicking buttons?

Think about what these approaches are really asking:

- Computer use: "Parse these pixels and figure out what to click"
- Playwright MCP: "Here's an accessibility tree, figure out what to click"
- MCP-B: "Here's a function called `addToCart()`, call it"

One of these is not like the others.

But speed isn't even the main advantage. The real win is determinism. When you call `shop.addToCart({id: "abc123", quantity: 2})`, it either works or throws a specific error. When you try to click a button, you're hoping the UI hasn't changed, the element loaded, the viewport is right, and a dozen other things outside your control.

MCP-B is an admission that AGI is not happening tomorrow. If we're serious about automating parts of white collar work, we need to build out the infrastructure for it. LLMs work best with text and function calls, not pretending to be humans with mice. MCP-B lays the foundation for LLMs to automate the browser the way computers are meant to - through APIs.

## What can MCP-B do right now?

The MCP-B extension ships with a chat client with access to all of the MCP extension tools and a Model inspector type UI that allows you to see the active tool list and call them with manually inputed arguments. I only support tools at the moment. but supporting the entire spec is probably only one ClaudeCode session away. In terms of extension tools, I spiked on bulk generating them from chromes documentation with the bulk request api from Anthropic. It worked really well. The tools are open source and MCP-B Ships with the following tools

The full list of open source tools can be found in the [@mcp-b/extension-tools](https://www.npmjs.com/package/@mcp-b/extension-tools) package.

## The future of MCP-B

As of today, the extension is open source. I think if I am going to ask website developers to interface with an extension for their functionality to work, it needs to be open.

I want to just build a really solid MCP-host and developer tools. I currently have a simple chat application in the extension and a model-inspector like tab as well, but I'd prefer to just have it be a thin UI and a thick backend (inside the extension) for tool and context management. The extension transport allows other extensions to connect to the MCP-B extension as a client and I am also working with the guys from [chrome-mcp](https://github.com/MiguelsPizza/WebMCP) to make it so you can connect MCP-B to local MCP hosts over native ports in a standardized way.

If you are at all familiar with the dApp extensions in the crypto space, you know that multiple clients injecting the same thing into the user's tab is bad news for everyone. I'd prefer that other extensions connect to MCP-B directly instead of injecting their own tab clients. (This is probably naïve though)

Either way, we are going to need an open standard and we can take the crypto space as an example of what not to do (looking at you MetaMask)

You can find the the transports and React hooks today:

- [**@mcp-b/transports**](https://www.npmjs.com/package/@mcp-b/transports) - The core transport implementations

There a still a couple of things that need to be ironed out on the protocol:

- Figure out how to opt into tool caching and wether to cache by default
- Figure out how to delay execution of cached tools that take time to register when the url is visited
- Determine wether tool filtering should happen in the client side or be a list the clients can send to the server
- A security sign off from someone who actually knows security

At the moment, MCP-B extension collects 0 user data and the only API endpoint it interacts with is my chat endpoint. I plan to keep it that way. It's not a product, it's a bridge. If you own a "chatGPT in the sidebar" application, let me know, I'll help hook it up to MCP-B.

## Get Involved

MCP-B is open source and we'd love your help! Here's how to get involved:

- [GitHub](https://github.com/WebMCP-org/npm-packages) - Star the repo, open issues, submit PRs
- [Discord](https://discord.gg/AMRbCtN5BY) - Join the community discussion
- [Chrome Web Store](https://chromewebstore.google.com/detail/opojeelojlkcinlhkbahpcekdolfjmhi) - Install the extension and try it out
- [npm: @mcp-b/transports](https://www.npmjs.com/package/@mcp-b/transports) - Start building with the transports package
