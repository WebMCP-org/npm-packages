import { useWebMCP } from '@mcp-b/react-webmcp';
import { z } from 'zod';

export function PostsPage() {
  const likeTool = useWebMCP({
    name: 'posts_like',
    description: 'Like a post by ID',
    inputSchema: { postId: z.string().uuid() },
    handler: async (input) => {
      await api.posts.like(input.postId);
      return { success: true };
    },
  });

  console.log(likeTool.state.isExecuting);
  return null;
}
