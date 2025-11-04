# SEO Images Documentation

This document describes the image requirements for optimal SEO and social media sharing.

## Current Status

✅ **Favicon and PWA Icons** - Complete
- `favicon.ico` - 16x16, 32x32 favicon
- `apple-touch-icon.png` - 180x180 iOS home screen icon
- `pwa-192x192.png` - 192x192 PWA icon
- `pwa-512x512.png` - 512x512 PWA icon

⚠️ **Social Media Images** - Using temporary placeholders
- `og-image.png` - Open Graph image (currently using mcp-b-logo.png)
- `twitter-card.png` - Twitter Card image (currently using mcp-b-logo.png)

## Social Media Image Requirements

### Open Graph Image (og-image.png)
**Purpose:** Displayed when sharing the site on Facebook, LinkedIn, Slack, Discord, etc.

**Specifications:**
- Recommended size: **1200x630 pixels**
- Minimum size: 600x315 pixels
- Aspect ratio: 1.91:1
- Format: PNG or JPG
- Max file size: 8MB (but aim for <300KB for faster loading)

**Content Suggestions:**
- Include "WebMCP + MCP-UI" branding
- Showcase the chat interface or a key feature
- Add tagline: "Browser-based Model Context Protocol"
- Use high contrast and readable text
- Ensure important content is in the center (edges may be cropped)

### Twitter Card Image (twitter-card.png)
**Purpose:** Displayed when sharing the site on Twitter/X

**Specifications:**
- Recommended size: **1200x600 pixels** (or use same 1200x630 as OG image)
- Aspect ratio: 2:1
- Format: PNG, JPG, or WebP
- Max file size: 5MB (but aim for <300KB for faster loading)

**Content Suggestions:**
- Similar to OG image but optimized for 2:1 aspect ratio
- Can use the same image as og-image.png if design works for both
- Ensure text is legible when scaled down

## Testing Social Media Previews

### Before Publishing
1. **Facebook/LinkedIn:** Use [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
2. **Twitter:** Use [Twitter Card Validator](https://cards-dev.twitter.com/validator)
3. **General:** Use [OpenGraph.xyz](https://www.opengraph.xyz/)

### Steps
1. Create the images following the specifications above
2. Replace `og-image.png` and `twitter-card.png` in this directory
3. Build and deploy the application
4. Test the previews using the tools above
5. Clear cache if old images appear (use "Scrape Again" buttons)

## Design Resources

**Tools for creating social media images:**
- Figma (professional design)
- Canva (templates available)
- Adobe Express
- Photopea (free Photoshop alternative)

**Best Practices:**
- Use brand colors from the site (#1F5EFF theme color)
- Ensure text is readable on mobile previews
- Test on different backgrounds (light/dark mode)
- Include the site URL or QR code if space allows
- Avoid putting critical text at the edges
- Use high-quality, non-pixelated images

## Current Implementation

The SEO meta tags in `index.html` reference:
- `https://mcp-ui.mcp-b.ai/og-image.png`
- `https://mcp-ui.mcp-b.ai/twitter-card.png`

These files are currently placeholders using the MCP-B logo. For production, replace with properly sized and designed images.
