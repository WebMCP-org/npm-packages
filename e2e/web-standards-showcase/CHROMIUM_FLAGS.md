# Chromium Flags Guide

**Complete guide to enabling and using the native Web Model Context API in Chromium.**

---

## 🎯 Required Flag

The Web Model Context API is an **experimental feature** in Chromium that must be explicitly enabled.

### Primary Flag

```bash
--enable-experimental-web-platform-features
```

This flag enables all experimental web platform features, including:
- Web Model Context API (`navigator.modelContext`)
- Model Context Testing API (`navigator.modelContextTesting`)
- Associated events and methods

### Optional Feature-Specific Flag

```bash
--enable-features=WebModelContext
```

This flag specifically enables the Web Model Context feature (more targeted than the general experimental flag).

---

## 🚀 Launch Methods

### Command Line (Recommended for Development)

#### Linux

```bash
# Chromium
chromium --enable-experimental-web-platform-features http://localhost:5174

# Chrome
google-chrome --enable-experimental-web-platform-features http://localhost:5174

# With data directory for isolated testing
chromium \
  --enable-experimental-web-platform-features \
  --user-data-dir=/tmp/chrome-test \
  http://localhost:5174
```

#### macOS

```bash
# Chrome
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --enable-experimental-web-platform-features \
  http://localhost:5174

# Chromium
/Applications/Chromium.app/Contents/MacOS/Chromium \
  --enable-experimental-web-platform-features \
  http://localhost:5174
```

#### Windows

```powershell
# Chrome
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --enable-experimental-web-platform-features ^
  http://localhost:5174

# Or from PowerShell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --enable-experimental-web-platform-features `
  http://localhost:5174
```

### chrome://flags (For Persistent Usage)

1. Open Chromium/Chrome
2. Navigate to: `chrome://flags`
3. Search for: **"Experimental Web Platform features"**
4. Set to: **Enabled**
5. Click: **Relaunch**
6. Navigate to your app

**Note:** This enables the feature globally for all tabs and sessions until you disable it.

---

## 🧪 Testing with Playwright

### Configuration

The showcase includes a Playwright config that automatically launches Chromium with the required flags:

```typescript
// playwright-native-showcase.config.ts
export default defineConfig({
  use: {
    launchOptions: {
      args: [
        '--enable-experimental-web-platform-features',
        '--enable-features=WebModelContext',
      ],
    },
  },
});
```

### Running Tests

```bash
# Run tests with native API
pnpm test:native-showcase

# With UI mode
pnpm test:native-showcase:ui

# Debug mode
pnpm test:native-showcase:debug
```

---

## 🔍 Verification

### Verify Flag is Active

#### Method 1: Check chrome://version

1. Navigate to `chrome://version`
2. Look for **"Command Line"** section
3. Verify `--enable-experimental-web-platform-features` is present

#### Method 2: JavaScript Console

```javascript
// Check if API exists
console.log('modelContext available:', !!navigator.modelContext);
console.log('modelContextTesting available:', !!navigator.modelContextTesting);

// Verify it's native (not polyfill)
if (navigator.modelContextTesting) {
  const constructorName = navigator.modelContextTesting.constructor.name;
  console.log('Constructor:', constructorName);
  console.log('Is Native:', !constructorName.includes('WebModelContext'));
}

// List methods
console.log('Available methods:', Object.getOwnPropertyNames(
  Object.getPrototypeOf(navigator.modelContext)
));
```

Expected output for native API:

```
modelContext available: true
modelContextTesting available: true
Constructor: ModelContextTesting (or similar native name)
Is Native: true
Available methods: [
  'constructor',
  'provideContext',
  'registerTool',
  'listTools',
  'executeTool',
  'unregisterTool',
  'clearContext',
  'addEventListener',
  'removeEventListener',
  ...
]
```

---

## 🐛 Troubleshooting

### API Not Available

**Symptoms:**
- `navigator.modelContext` is `undefined`
- Console shows no errors
- App shows "not found" error

**Solutions:**

1. **Verify flag is enabled:**
   ```bash
   # Check chrome://version for the flag
   # Or re-launch with explicit flag
   ```

2. **Use correct Chromium version:**
   ```bash
   # Check version
   chromium --version
   # Should be 120+ (experimental feature may vary by version)
   ```

3. **Clear cache and hard reload:**
   ```
   Ctrl+Shift+Delete (open Clear Browsing Data)
   Select "Cached images and files"
   Then: Ctrl+Shift+R (hard reload)
   ```

### Polyfill Detected Instead of Native

**Symptoms:**
- App shows "Polyfill detected" warning
- Constructor name includes "WebModelContext"

**Solutions:**

1. **Check for polyfill imports:**
   ```javascript
   // Remove these from your code:
   import '@mcp-b/global';
   import { WebModelContextPolyfill } from '...';
   ```

2. **Verify no browser extensions are injecting polyfills:**
   ```bash
   # Launch in incognito mode (disables extensions)
   chromium --enable-experimental-web-platform-features --incognito
   ```

3. **Use isolated user data directory:**
   ```bash
   chromium \
     --enable-experimental-web-platform-features \
     --user-data-dir=/tmp/chrome-clean \
     http://localhost:5174
   ```

### Methods Missing (unregisterTool, clearContext)

**Symptoms:**
- `modelContext.unregisterTool is not a function`
- `modelContext.clearContext is not a function`

**Cause:** Polyfill is being used instead of native API.

**Solution:** Follow "Polyfill Detected" troubleshooting steps above.

### Tools Not Persisting

**Symptoms:**
- Tools disappear after `provideContext()` call
- Expected Bucket B behavior not working

**Cause:** Misunderstanding of two-bucket system.

**Solution:** Review bucket architecture:
- Use `provideContext()` for replaceable tools (Bucket A)
- Use `registerTool()` for persistent tools (Bucket B)

---

## 🔬 Advanced Configuration

### Multiple Flags

Combine flags for specific scenarios:

```bash
# Chromium with multiple experimental features
chromium \
  --enable-experimental-web-platform-features \
  --enable-features=WebModelContext,DirectSockets \
  --disable-features=AutofillServerCommunication \
  --user-data-dir=/tmp/chrome-dev \
  http://localhost:5174
```

### Headless Mode (CI/CD)

```bash
# Headless with native API
chromium \
  --headless=new \
  --enable-experimental-web-platform-features \
  --disable-gpu \
  --no-sandbox \
  http://localhost:5174
```

### Debugging with DevTools Protocol

```bash
# Launch with remote debugging
chromium \
  --enable-experimental-web-platform-features \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug \
  http://localhost:5174

# Then connect to: http://localhost:9222
```

---

## 📊 Feature Detection in Code

### Robust Detection Pattern

```javascript
function detectWebModelContextAPI() {
  // Check basic availability
  if (!navigator.modelContext) {
    return {
      available: false,
      message: 'API not available'
    };
  }

  // Check for native methods
  const hasNativeMethods =
    typeof navigator.modelContext.unregisterTool === 'function' &&
    typeof navigator.modelContext.clearContext === 'function';

  if (!hasNativeMethods) {
    return {
      available: true,
      isNative: false,
      message: 'Polyfill detected'
    };
  }

  // Check testing API
  const hasTestingAPI =
    navigator.modelContextTesting &&
    typeof navigator.modelContextTesting.executeTool === 'function';

  // Verify not polyfill by constructor
  let isPolyfill = false;
  if (navigator.modelContextTesting) {
    const constructorName = navigator.modelContextTesting.constructor.name;
    isPolyfill = constructorName.includes('WebModelContext');
  }

  return {
    available: true,
    isNative: !isPolyfill,
    hasTestingAPI,
    message: isPolyfill ? 'Polyfill detected' : 'Native API ready'
  };
}

// Usage
const detection = detectWebModelContextAPI();
if (detection.isNative) {
  console.log('✅ Native API ready!');
} else {
  console.warn('⚠️', detection.message);
}
```

### Graceful Fallback

```javascript
// Check for native API, fallback to polyfill
if (!navigator.modelContext) {
  // Load polyfill
  await import('@mcp-b/global');
}

// Detect which implementation is active
const isNative = detectWebModelContextAPI().isNative;

if (isNative) {
  // Use native-specific features
  navigator.modelContext.clearContext();
} else {
  // Use polyfill-compatible features only
  navigator.modelContext.provideContext({ tools: [] });
}
```

---

## 🔗 Useful Links

### Chromium Source Code

- **Web Model Context Implementation:**
  - `third_party/blink/renderer/modules/model_context/`
  - `third_party/blink/web_tests/external/wpt/model-context/`

- **Feature Flags:**
  - `chrome/browser/about_flags.cc`
  - `third_party/blink/public/common/features.h`

### Chromium Source Reference

```bash
# Clone Chromium source (if needed)
git clone https://chromium.googlesource.com/chromium/src.git

# Navigate to Model Context tests
cd src/third_party/blink/web_tests/external/wpt/model-context/
```

### Web Platform Tests

- **execute-tool.html** - Tests for `executeTool()` method
- **list-tools.html** - Tests for `listTools()` method
- **tools-changed-callback.html** - Tests for change detection

---

## 📝 Flag Reference Sheet

| Flag | Purpose | When to Use |
|------|---------|-------------|
| `--enable-experimental-web-platform-features` | Enable all experimental features | Development, testing |
| `--enable-features=WebModelContext` | Enable only Model Context API | Production-like testing |
| `--user-data-dir=/tmp/chrome-test` | Isolated browser profile | Avoid conflicts |
| `--disable-extensions` | Disable all extensions | Debugging issues |
| `--incognito` | Private browsing mode | Quick isolated test |
| `--headless=new` | Headless mode | CI/CD pipelines |
| `--remote-debugging-port=9222` | DevTools Protocol access | Advanced debugging |
| `--no-sandbox` | Disable sandbox (unsafe) | CI environments only |
| `--disable-gpu` | Disable GPU acceleration | Headless environments |

---

## ⚠️ Important Notes

### Security Considerations

1. **Experimental Features:**
   - These features are EXPERIMENTAL and may change
   - Not suitable for production use
   - API may break between Chromium versions

2. **--no-sandbox Flag:**
   - ONLY use in trusted environments (CI/CD)
   - NEVER use for regular browsing
   - Disables critical security features

3. **User Data Directory:**
   - Use isolated directories for testing
   - Don't mix with your personal profile
   - Clean up temporary directories after testing

### Version Compatibility

- Feature availability depends on Chromium version
- Check release notes for API changes
- Some builds may not include experimental features
- Canary/Dev channels have latest features

### Performance Impact

- Experimental features may impact performance
- Increased memory usage possible
- Not optimized for production use

---

## 🎓 FAQ

### Q: Do I need these flags in production?

**A:** No. This is an experimental API. For production, use the polyfill (`@mcp-b/global`) which provides compatible behavior.

### Q: Will my users need to enable flags?

**A:** Not if you use the polyfill. The native API is only for testing/development of the standard itself.

### Q: How do I know which Chromium version to use?

**A:** Version 120+ is recommended. Check the Chromium release notes for the exact version that introduced the Model Context API.

### Q: Can I use this in Firefox/Safari?

**A:** No. This is a Chromium-specific experimental feature. Use the polyfill for cross-browser compatibility.

### Q: Why does the showcase reject polyfills?

**A:** To demonstrate the **native** implementation specifically. Other apps in the monorepo use the polyfill for broader compatibility.

### Q: What's the difference between native and polyfill?

**A:**

| Feature | Native | Polyfill |
|---------|--------|----------|
| `unregisterTool()` | ✅ Yes | ❌ No |
| `clearContext()` | ✅ Yes | ❌ No |
| Performance | ⚡ Faster | 🐌 Slower |
| Constructor name | Native (varies) | "WebModelContextTesting" |
| Browser support | Chromium only | All browsers |

---

**For more information, see the main [README.md](./README.md)**
