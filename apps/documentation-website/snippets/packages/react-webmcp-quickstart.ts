import '@mcp-b/global';
import { useWebMCP } from '@mcp-b/react-webmcp';

export function PostsPage() {
  const likeTool = useWebMCP({
    name: 'posts_like',
    description: 'Like a post by ID',
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'string' },
      },
      required: ['postId'],
    } as const,
    handler: async (input) => {
      await api.posts.like(input.postId);
      return { success: true };
    },
  });

  console.log(likeTool.state.isExecuting);
  return null;
}
