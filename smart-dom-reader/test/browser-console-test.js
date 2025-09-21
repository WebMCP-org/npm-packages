/**
 * Browser Console Test for Smart DOM Reader
 * Copy and paste this into the browser console on test-page.html (with YouTube content)
 * or any YouTube page to test the extraction
 */

// Check if we're on the test page or actual YouTube
const isTestPage = window.location.pathname.includes('test-page.html');
const isYouTube = window.location.hostname.includes('youtube.com');

console.log('🚀 Smart DOM Reader - YouTube Test Suite');
console.log('=========================================');
console.log(`📍 Testing on: ${window.location.href}`);
console.log(`📅 ${new Date().toLocaleString()}\n`);

// Helper function to safely get text content
const safeText = (element, maxLength = 50) => {
  const text = element?.textContent?.trim() || '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
};

// Test 1: Find key YouTube elements
console.log('🧪 Test 1: Identifying YouTube Elements');
console.log('---------------------------------------');

const elements = {
  // Video player elements
  videoPlayer: document.querySelector('video'),
  playerContainer: document.querySelector('#movie_player, .html5-video-player, #player'),
  playButton: document.querySelector(
    '.ytp-play-button, button[aria-label*="Play"], button[aria-label*="Pause"]'
  ),

  // Video metadata
  videoTitle: document.querySelector(
    'h1.ytd-video-primary-info-renderer, h1.title, h1[class*="title"], #title h1'
  ),
  channelName: document.querySelector(
    '#channel-name, #owner-name, .ytd-channel-name, #upload-info'
  ),
  subscribeButton: document.querySelector(
    'ytd-subscribe-button-renderer button, .subscribe-button, button[aria-label*="Subscribe"]'
  ),
  likeButton: document.querySelector(
    'button[aria-label*="like"], button[aria-label*="Like"], .like-button'
  ),

  // Search
  searchBox: document.querySelector(
    'input#search, input[name="search_query"], input[placeholder*="Search"]'
  ),
  searchButton: document.querySelector(
    '#search-icon-legacy, button#search-button, button[aria-label="Search"]'
  ),

  // Navigation
  sidebar: document.querySelector('#guide, #sidebar, tp-yt-app-drawer'),
  homeLink: document.querySelector('a[title="Home"], ytd-guide-entry-renderer a[href="/"]'),

  // Content areas
  primaryContent: document.querySelector('#primary, ytd-watch-flexy #primary'),
  secondaryContent: document.querySelector('#secondary, #related'),
  commentsSection: document.querySelector('#comments, ytd-comments'),

  // Recommendations
  videoCards: document.querySelectorAll(
    'ytd-video-renderer, ytd-compact-video-renderer, ytd-rich-item-renderer'
  ),
};

// Display results
Object.entries(elements).forEach(([name, element]) => {
  if (element && element.length !== undefined) {
    // NodeList
    console.log(`✅ ${name}: Found ${element.length} elements`);
  } else if (element) {
    // Single element
    const preview = element.tagName
      ? `<${element.tagName.toLowerCase()}${element.id ? ' id="' + element.id + '"' : ''}${element.className ? ' class="' + element.className.split(' ')[0] + '..."' : ''}>`
      : 'Found';
    console.log(`✅ ${name}: ${preview}`);
  } else {
    console.log(`❌ ${name}: Not found`);
  }
});

// Test 2: Extract interactive elements
console.log('\n🧪 Test 2: Extracting Interactive Elements');
console.log('------------------------------------------');

const buttons = Array.from(
  document.querySelectorAll('button, [role="button"], .yt-spec-button-shape-next')
);
const links = Array.from(document.querySelectorAll('a[href]'));
const inputs = Array.from(document.querySelectorAll('input, textarea, select'));

console.log(`📊 Found ${buttons.length} buttons`);
console.log(`📊 Found ${links.length} links`);
console.log(`📊 Found ${inputs.length} input elements`);

// Sample some buttons
console.log('\n🔘 Sample Buttons:');
buttons.slice(0, 5).forEach((btn) => {
  const label = btn.getAttribute('aria-label') || safeText(btn, 30);
  const id = btn.id || 'no-id';
  console.log(`   - "${label}" (id: ${id})`);
});

// Test 3: Test selector generation
console.log('\n🧪 Test 3: Selector Generation Test');
console.log('-----------------------------------');

const testElements = [
  elements.videoTitle,
  elements.searchBox,
  elements.subscribeButton,
  buttons[0],
].filter(Boolean);

testElements.forEach((element) => {
  if (!element) return;

  const selectors = {
    id: element.id ? `#${element.id}` : null,
    class: element.className ? `.${element.className.split(' ')[0]}` : null,
    tag: element.tagName.toLowerCase(),
    ariaLabel: element.getAttribute('aria-label'),
    dataTestId: element.getAttribute('data-testid'),
  };

  console.log(`\n📍 Element: ${safeText(element, 30)}`);
  console.log('   Selectors:');
  Object.entries(selectors).forEach(([type, value]) => {
    if (value) console.log(`     ${type}: ${value}`);
  });

  // Test if selectors work
  if (selectors.id) {
    const found = document.querySelector(selectors.id);
    console.log(`     ✅ ID selector works: ${found === element}`);
  }
});

// Test 4: Content structure analysis
console.log('\n🧪 Test 4: Content Structure Analysis');
console.log('-------------------------------------');

const structure = {
  totalElements: document.querySelectorAll('*').length,
  visibleButtons: Array.from(buttons).filter((btn) => {
    const rect = btn.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }).length,
  forms: document.querySelectorAll('form').length,
  iframes: document.querySelectorAll('iframe').length,
  videos: document.querySelectorAll('video').length,
  images: document.querySelectorAll('img').length,
};

console.log('📊 Page Structure:');
Object.entries(structure).forEach(([key, value]) => {
  console.log(`   ${key}: ${value}`);
});

// Test 5: YouTube-specific extraction
console.log('\n🧪 Test 5: YouTube-Specific Data Extraction');
console.log('-------------------------------------------');

const youtubeData = {
  videoTitle: safeText(elements.videoTitle, 100),
  channelName: safeText(elements.channelName, 50),
  isVideoPage: !!elements.videoPlayer,
  isHomePage: window.location.pathname === '/',
  isSearchResultsPage: window.location.pathname === '/results',
  hasComments: !!elements.commentsSection,
  recommendationCount: elements.videoCards.length,
  playerState: elements.videoPlayer
    ? {
        paused: elements.videoPlayer.paused,
        currentTime: Math.round(elements.videoPlayer.currentTime),
        duration: Math.round(elements.videoPlayer.duration),
      }
    : null,
};

console.log('📺 YouTube Data:');
Object.entries(youtubeData).forEach(([key, value]) => {
  if (value !== null && typeof value === 'object') {
    console.log(`   ${key}:`);
    Object.entries(value).forEach(([subKey, subValue]) => {
      console.log(`     ${subKey}: ${subValue}`);
    });
  } else {
    console.log(`   ${key}: ${value}`);
  }
});

// Test 6: Performance test
console.log('\n🧪 Test 6: Performance Test');
console.log('---------------------------');

const performanceTest = () => {
  const times = [];

  for (let i = 0; i < 5; i++) {
    const start = performance.now();

    // Simulate extraction
    const extracted = {
      buttons: document.querySelectorAll('button, [role="button"]'),
      links: document.querySelectorAll('a[href]'),
      inputs: document.querySelectorAll('input, textarea, select'),
    };

    const end = performance.now();
    times.push(end - start);
  }

  return {
    average: times.reduce((a, b) => a + b, 0) / times.length,
    min: Math.min(...times),
    max: Math.max(...times),
  };
};

const perfResults = performanceTest();
console.log('⚡ Performance Results:');
console.log(`   Average: ${perfResults.average.toFixed(2)}ms`);
console.log(`   Min: ${perfResults.min.toFixed(2)}ms`);
console.log(`   Max: ${perfResults.max.toFixed(2)}ms`);

// Summary
console.log('\n📊 Test Summary');
console.log('==============');

const summary = {
  pageType: isYouTube ? 'YouTube' : isTestPage ? 'Test Page with YouTube HTML' : 'Unknown',
  testsRun: 6,
  keyElementsFound: Object.values(elements).filter(
    (el) => el && (el.length === undefined ? true : el.length > 0)
  ).length,
  totalElementsFound: Object.values(elements).length,
  extractionSuccess: buttons.length > 0 && links.length > 0,
  performanceGrade: perfResults.average < 10 ? 'A' : perfResults.average < 50 ? 'B' : 'C',
};

console.log(`✅ Tests completed successfully`);
console.log(`📍 Page Type: ${summary.pageType}`);
console.log(`📊 Key Elements Found: ${summary.keyElementsFound}/${summary.totalElementsFound}`);
console.log(`⚡ Performance Grade: ${summary.performanceGrade}`);
console.log(`🎯 Extraction Success: ${summary.extractionSuccess ? 'Yes' : 'No'}`);

// Return results for further processing
window.testResults = {
  elements,
  stats: {
    buttons: buttons.length,
    links: links.length,
    inputs: inputs.length,
  },
  structure,
  youtubeData,
  performance: perfResults,
  summary,
};

console.log('\n💡 Results saved to window.testResults');
console.log('   Access with: console.log(window.testResults)');

// Test recommendations
console.log('\n💡 Recommendations:');
if (buttons.length < 10) {
  console.log('   • Low button count - check if YouTube custom elements need special handling');
}
if (perfResults.average > 50) {
  console.log('   • Performance could be improved - consider using more specific selectors');
}
if (!elements.videoPlayer && (isYouTube || isTestPage)) {
  console.log('   • Video player not found - may need to wait for dynamic content to load');
}
if (elements.videoCards.length > 50) {
  console.log('   • Many video cards found - consider viewport-only extraction for performance');
}
