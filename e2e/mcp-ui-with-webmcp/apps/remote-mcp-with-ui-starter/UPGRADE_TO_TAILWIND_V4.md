# Upgrade Embedded UI to Tailwind v4 and Make Responsive

## Overview

This document provides instructions for upgrading the TicTacToe embedded UI example to use Tailwind CSS v4 and make it fully responsive. The embedded UI should also implement the iframe resize communication protocol to notify the host when its size changes.

## Current State

The embedded UI (`src/TicTacToe.tsx` and `src/TicTacToeWithWebMCP.tsx`) currently uses:
- **Inline `<style>` tags** with CSS-in-JS
- **Fixed pixel dimensions** (140px cells, ~480px total board width)
- **No responsive design** - breaks on mobile devices (375px-414px width)
- **No resize event communication** with the host

## Goals

1. Migrate from inline styles to **Tailwind CSS v4**
2. Make the UI **fully responsive** across all screen sizes
3. Implement **iframe resize communication** using the `ui-size-change` message type
4. Maintain existing functionality (dark mode, animations, MCP integration)
5. Provide a **modern example** for other embeddable UIs

## Step 1: Install Tailwind CSS v4

### 1.1 Install Dependencies

```bash
cd e2e/mcp-ui-with-webmcp/apps/remote-mcp-with-ui-starter
pnpm add -D tailwindcss@next @tailwindcss/vite@next
```

### 1.2 Update Vite Config

Modify `vite.config.ts` to include the Tailwind Vite plugin:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // Add Tailwind v4 Vite plugin
  ],
  // ... rest of config
});
```

### 1.3 Create Tailwind Config

Create `tailwind.config.ts` in the project root:

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // Add custom colors, animations, etc.
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  darkMode: 'media', // Use system preference for dark mode
} satisfies Config;
```

### 1.4 Update CSS File

Replace `src/index.css` content with:

```css
@import "tailwindcss";

html, body, #root {
  @apply w-full h-full overflow-hidden;
}

#root {
  @apply flex items-center justify-center p-4;
}
```

## Step 2: Convert TicTacToe Component to Tailwind

### 2.1 Remove Inline Styles

Remove the `<style>` tag from `src/TicTacToe.tsx` (currently lines 224-376).

### 2.2 Apply Tailwind Classes

Replace the component's JSX with Tailwind classes. Here's the conversion guide:

#### Container
```tsx
// Old
<div className="tic-tac-toe">

// New
<div className="flex flex-col items-center justify-center w-full h-full gap-4 sm:gap-6">
```

#### Game Board
```tsx
// Old
<div className="tic-tac-toe-board">

// New
<div className="grid grid-cols-3 gap-2 sm:gap-3 p-3 sm:p-5 bg-gray-100 dark:bg-gray-800 rounded-lg shadow-lg">
```

#### Game Cell (Responsive Sizing)
```tsx
// Old
<button className="tic-tac-toe-cell">

// New
<button
  className={cn(
    // Base styles
    "aspect-square w-full max-w-[140px] min-h-[80px] sm:min-h-[100px] md:min-h-[120px] lg:min-h-[140px]",
    "flex items-center justify-center",
    "text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold",
    "bg-white dark:bg-gray-700",
    "border-2 border-gray-300 dark:border-gray-600",
    "rounded-md sm:rounded-lg",
    "transition-all duration-150",

    // Hover/Active states
    "hover:bg-gray-50 dark:hover:bg-gray-650",
    "active:scale-95",

    // Disabled state
    "disabled:cursor-not-allowed",

    // X/O specific colors
    cell === 'X' && "text-blue-600 dark:text-blue-400",
    cell === 'O' && "text-red-600 dark:text-red-400",

    // Win animation
    isWinningCell && "animate-scale-in bg-green-100 dark:bg-green-900"
  )}
>
```

**Note:** The key to responsiveness is using:
- `aspect-square` to maintain 1:1 ratio
- `w-full` with `max-w-[140px]` to scale down on small screens
- Responsive `min-h-*` classes for different breakpoints
- Responsive text sizes (`text-4xl` to `text-7xl`)

#### Status Overlay
```tsx
<div className={cn(
  "absolute inset-0 flex items-center justify-center",
  "bg-black/50 backdrop-blur-sm",
  "rounded-lg",
  "animate-fade-in"
)}>
  <div className="text-white text-xl sm:text-2xl font-semibold">
    {status}
  </div>
</div>
```

#### Role Selection Modal
```tsx
<div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50 p-4">
  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 sm:p-8 max-w-md w-full animate-slide-up">
    <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 text-gray-900 dark:text-white text-center">
      Choose Your Side
    </h2>
    <div className="flex gap-3 sm:gap-4">
      <button className="flex-1 py-4 sm:py-6 text-3xl sm:text-4xl font-bold rounded-lg transition-all hover:scale-105 active:scale-95 bg-blue-500 hover:bg-blue-600 text-white">
        X
      </button>
      <button className="flex-1 py-4 sm:py-6 text-3xl sm:text-4xl font-bold rounded-lg transition-all hover:scale-105 active:scale-95 bg-red-500 hover:bg-red-600 text-white">
        O
      </button>
    </div>
  </div>
</div>
```

### 2.3 Tailwind Breakpoints Reference

Tailwind v4 uses the same default breakpoints:
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

For this embedded UI, focus on:
- **Default (< 640px)**: Mobile phones
- **sm (≥ 640px)**: Large phones, small tablets
- **md (≥ 768px)**: Tablets
- **lg (≥ 1024px)**: Desktop (in iframe, this might be ~500-800px due to container)

## Step 3: Implement Resize Event Communication

### 3.1 Add ResizeObserver

Add this to `src/TicTacToeWithWebMCP.tsx` (or create a new utility hook):

```typescript
import { useEffect } from 'react';

/**
 * Hook to notify the parent window when the iframe size changes
 */
export function useIframeResizeNotification() {
  useEffect(() => {
    // Only run in iframe context
    if (window.self === window.top) return;

    const resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const { width, height } = entry.contentRect;

        // Send size change message to parent
        window.parent.postMessage(
          {
            type: 'ui-size-change',
            payload: {
              width: Math.ceil(width),
              height: Math.ceil(height),
            },
          },
          '*' // In production, specify the actual parent origin
        );
      });
    });

    // Observe the root element
    resizeObserver.observe(document.documentElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);
}
```

### 3.2 Use the Hook

In `src/TicTacToeWithWebMCP.tsx`:

```typescript
export function TicTacToeWithWebMCP() {
  // ... existing hooks

  // Add resize notification
  useIframeResizeNotification();

  // ... rest of component
}
```

### 3.3 Initial Size Notification

Send an initial size notification when the iframe is ready:

```typescript
useEffect(() => {
  // Only run in iframe context
  if (window.self === window.top) return;

  // Notify parent that iframe is ready and send initial size
  const sendInitialSize = () => {
    const { width, height } = document.documentElement.getBoundingClientRect();

    window.parent.postMessage(
      {
        type: 'ui-lifecycle-iframe-ready',
        payload: {},
      },
      '*'
    );

    window.parent.postMessage(
      {
        type: 'ui-size-change',
        payload: {
          width: Math.ceil(width),
          height: Math.ceil(height),
        },
      },
      '*'
    );
  };

  // Send after a short delay to ensure DOM is fully rendered
  const timeoutId = setTimeout(sendInitialSize, 100);

  return () => clearTimeout(timeoutId);
}, []);
```

## Step 4: Update Host to Handle Resize Events (Optional)

If you also want to update the host (chat-ui) to handle resize events, modify `src/components/assistant-ui/thread.tsx`:

```typescript
// In the UIResourceRenderer's iframeProps.onLoad callback, add a message listener:

useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    // Security: Check origin in production
    // if (event.origin !== expectedOrigin) return;

    if (event.data.type === 'ui-size-change') {
      const { width, height } = event.data.payload;
      console.log('Iframe size changed:', { width, height });

      // Optional: Adjust container or UI based on size
      // For example, you could store this in state and apply styles
    }
  };

  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []);
```

## Step 5: Testing Responsive Design

### 5.1 Test Breakpoints

Test the UI at various viewport widths:
- **320px**: iPhone SE (smallest common mobile)
- **375px**: iPhone 12/13 Mini
- **390px**: iPhone 14 Pro
- **414px**: iPhone Plus models
- **768px**: iPad Mini
- **1024px**: iPad Pro
- **1440px**: Desktop

### 5.2 Chrome DevTools

1. Open Chrome DevTools (F12)
2. Click the device toolbar icon (Cmd+Shift+M / Ctrl+Shift+M)
3. Test different device presets
4. Use responsive mode to test custom widths

### 5.3 Test in Iframe Context

Since the UI runs in an iframe within the chat app:
1. Run the chat-ui app: `pnpm --filter chat-ui dev`
2. Run the remote server: `pnpm --filter remote-mcp-with-ui-starter dev`
3. Open chat-ui in browser
4. Trigger a TicTacToe game
5. Resize browser window to test responsiveness
6. Check console for `ui-size-change` messages

## Step 6: Verify Dark Mode

Tailwind v4 uses `darkMode: 'media'` by default. Verify that:
1. Dark mode activates with system preference
2. All colors have dark mode variants
3. Contrast is sufficient in both modes

Test by:
- Changing system dark mode setting
- Using Chrome DevTools: Rendering > Emulate CSS media `prefers-color-scheme: dark`

## Step 7: Performance Optimization

### 7.1 PurgeCSS

Tailwind v4 automatically purges unused CSS in production. Verify that `content` in `tailwind.config.ts` includes all source files.

### 7.2 Minimize ResizeObserver Calls

The ResizeObserver implementation already uses native browser APIs for optimal performance. Consider debouncing if the parent host has performance issues:

```typescript
import { debounce } from 'lodash-es'; // or implement your own

const notifyParent = debounce((width: number, height: number) => {
  window.parent.postMessage(
    {
      type: 'ui-size-change',
      payload: { width, height },
    },
    '*'
  );
}, 100); // Notify at most every 100ms
```

## Step 8: Documentation

### 8.1 Update README

Add a section to `README.md` explaining:
- Responsive design approach
- Supported screen sizes
- How to customize breakpoints
- How resize events work

### 8.2 Add Code Comments

Add comments to key responsive utilities:

```typescript
/**
 * TicTacToe cell responsive sizing strategy:
 * - Mobile (<640px): Scales to fit screen width minus padding
 * - Tablet (640-1024px): Slightly larger cells
 * - Desktop (>1024px): Full 140px cells
 *
 * Uses aspect-square + w-full + max-w to create fluid scaling
 * while maintaining 1:1 aspect ratio and readable text.
 */
```

## Expected Results

After completing these steps, the embedded UI should:

✅ Use Tailwind CSS v4 with zero inline styles
✅ Be fully responsive on screens from 320px to 1920px+
✅ Notify the parent host when its size changes
✅ Maintain existing functionality (game logic, MCP integration, animations)
✅ Support dark mode via system preference
✅ Serve as a modern example for other embeddable UIs
✅ Have improved maintainability (Tailwind classes > inline CSS)

## Troubleshooting

### Issue: Tailwind classes not applying

**Solution:** Ensure:
1. `@import "tailwindcss"` is in `index.css`
2. Vite plugin is configured correctly
3. Content paths include all source files
4. Browser cache is cleared

### Issue: Resize events not firing

**Solution:** Check:
1. ResizeObserver is observing `document.documentElement`
2. Running in iframe context (not standalone)
3. Browser console for `postMessage` calls
4. Parent window has message listener

### Issue: UI too small/large on certain devices

**Solution:**
1. Adjust `min-h-*` and `max-w-*` values
2. Test with actual devices or Chrome DevTools
3. Consider using container queries (Tailwind v4 feature) for more granular control

### Issue: Dark mode not working

**Solution:**
1. Verify `darkMode: 'media'` in Tailwind config
2. Check that all colors have `dark:` variants
3. Test system dark mode preference
4. Clear browser cache

## Migration Checklist

- [ ] Install Tailwind v4 dependencies
- [ ] Configure Vite plugin
- [ ] Create tailwind.config.ts
- [ ] Update index.css
- [ ] Convert TicTacToe.tsx to Tailwind classes
- [ ] Convert TicTacToeWithWebMCP.tsx overlays to Tailwind
- [ ] Implement useIframeResizeNotification hook
- [ ] Test responsive design at all breakpoints
- [ ] Test dark mode
- [ ] Verify resize events in console
- [ ] Update host message listener (optional)
- [ ] Update documentation
- [ ] Add code comments
- [ ] Test in production build

## Reference Links

- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)
- [Embeddable UI Communication Protocol](./EMBEDDING_PROTOCOL.md) *(create this from the docs you provided)*
- [ResizeObserver MDN](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver)
- [PostMessage API MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)

## Next Steps

After completing this upgrade, consider:
1. Creating additional embeddable UI examples (calendar, kanban board, etc.)
2. Creating a reusable UI component library for embeddable UIs
3. Adding TypeScript types for all message types
4. Creating a helper library for iframe communication
5. Adding unit tests for responsive behavior
