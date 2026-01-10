// Simple test tool for Hacker News
interface StoryInfo {
  title: string;
  url: string;
  points: number;
  rank: number;
}

navigator.modelContext.registerTool({
  name: 'get_top_stories',
  description: 'Get the top stories from Hacker News with their titles, URLs, and points',
  parameters: {
    type: 'object',
    properties: {
      count: {
        type: 'number',
        description: 'Number of stories to return (default: 5)',
      },
    },
  },
  handler: async (params: { count?: number }) => {
    const count = params.count || 5;
    const stories: StoryInfo[] = [];

    const rows = document.querySelectorAll('.athing');
    for (let i = 0; i < Math.min(count, rows.length); i++) {
      const row = rows[i];
      const titleLink = row.querySelector('.titleline > a') as HTMLAnchorElement;
      const subtextRow = row.nextElementSibling;
      const scoreEl = subtextRow?.querySelector('.score');

      stories.push({
        rank: i + 1,
        title: titleLink?.textContent || 'Unknown',
        url: titleLink?.href || '',
        points: parseInt(scoreEl?.textContent || '0', 10),
      });
    }

    return stories;
  },
});

navigator.modelContext.registerTool({
  name: 'search_stories',
  description: 'Search for stories on the current page by keyword',
  parameters: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description: 'Keyword to search for in story titles',
      },
    },
    required: ['keyword'],
  },
  handler: async (params: { keyword: string }) => {
    const keyword = params.keyword.toLowerCase();
    const matches: StoryInfo[] = [];

    const rows = document.querySelectorAll('.athing');
    rows.forEach((row, i) => {
      const titleLink = row.querySelector('.titleline > a') as HTMLAnchorElement;
      const title = titleLink?.textContent || '';

      if (title.toLowerCase().includes(keyword)) {
        const subtextRow = row.nextElementSibling;
        const scoreEl = subtextRow?.querySelector('.score');

        matches.push({
          rank: i + 1,
          title,
          url: titleLink?.href || '',
          points: parseInt(scoreEl?.textContent || '0', 10),
        });
      }
    });

    return matches;
  },
});
