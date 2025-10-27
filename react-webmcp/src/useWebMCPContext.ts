import { useRef } from 'react';
import type { WebMCPReturn } from './types.js';
import { useWebMCP } from './useWebMCP.js';

/**
 * Convenience hook for exposing read-only context data to AI assistants.
 *
 * This is a simplified wrapper around {@link useWebMCP} specifically designed for
 * context tools that expose data without performing actions. The hook automatically
 * configures appropriate annotations (read-only, idempotent) and handles value
 * serialization.
 *
 * @template T - The type of context data to expose
 *
 * @param name - Unique identifier for the context tool (e.g., 'context_current_post')
 * @param description - Human-readable description of the context for AI assistants
 * @param getValue - Function that returns the current context value
 * @returns Tool execution state and control methods
 *
 * @public
 *
 * @example
 * Expose current post context:
 * ```tsx
 * function PostDetailPage() {
 *   const { postId } = useParams();
 *   const { data: post } = useQuery(['post', postId], () => fetchPost(postId));
 *
 *   useWebMCPContext(
 *     'context_current_post',
 *     'Get the currently viewed post ID and metadata',
 *     () => ({
 *       postId,
 *       title: post?.title,
 *       author: post?.author,
 *       tags: post?.tags,
 *       createdAt: post?.createdAt,
 *     })
 *   );
 *
 *   return <PostContent post={post} />;
 * }
 * ```
 *
 * @example
 * Expose user session context:
 * ```tsx
 * function AppRoot() {
 *   const { user, isAuthenticated } = useAuth();
 *
 *   useWebMCPContext(
 *     'context_user_session',
 *     'Get the current user session information',
 *     () => ({
 *       isAuthenticated,
 *       userId: user?.id,
 *       email: user?.email,
 *       permissions: user?.permissions,
 *     })
 *   );
 *
 *   return <App />;
 * }
 * ```
 */
export function useWebMCPContext<T>(
  name: string,
  description: string,
  getValue: () => T
): WebMCPReturn<T> {
  const getValueRef = useRef(getValue);
  getValueRef.current = getValue;

  return useWebMCP<Record<string, never>, T>({
    name,
    description,
    annotations: {
      title: `Context: ${name}`,
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    handler: async () => {
      return getValueRef.current();
    },
    formatOutput: (output) => {
      if (typeof output === 'string') {
        return output;
      }
      return JSON.stringify(output, null, 2);
    },
  });
}
