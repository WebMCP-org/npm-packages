import { useWebMCP } from '@mcp-b/react-webmcp';
import { useCallback, useState } from 'react';
import { z } from 'zod';

// Type definitions
interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

interface AppState {
  notes: Note[];
  theme: 'light' | 'dark';
}

/**
 * WebMCP Demo App
 *
 * This app demonstrates the @mcp-b/react-webmcp hooks:
 * - useWebMCP with outputSchema for typed structured responses
 * - useWebMCP with deps for automatic tool re-registration
 * - Multiple tools working together
 *
 * The app provides a simple notes interface that AI can interact with.
 */
export function App() {
  const [state, setState] = useState<AppState>({
    notes: [
      {
        id: '1',
        title: 'Welcome Note',
        content:
          'This is a demo of WebMCP React hooks. AI assistants can create, read, and manage notes.',
        createdAt: new Date().toISOString(),
      },
    ],
    theme: 'light',
  });

  const addNote = useCallback((title: string, content: string) => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title,
      content,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      notes: [...prev.notes, newNote],
    }));
    return newNote;
  }, []);

  const deleteNote = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      notes: prev.notes.filter((n) => n.id !== id),
    }));
  }, []);

  const toggleTheme = useCallback(() => {
    setState((prev) => ({
      ...prev,
      theme: prev.theme === 'light' ? 'dark' : 'light',
    }));
  }, []);

  // Derive primitive values for deps to minimize re-registrations
  const noteCount = state.notes.length;
  const noteIds = state.notes.map((n) => n.id).join(',');

  /**
   * Tool: notes_list
   *
   * Lists all notes with outputSchema for typed responses.
   * Uses deps to re-register when notes change.
   */
  useWebMCP(
    {
      name: 'notes_list',
      description: `List all notes. Currently ${noteCount} note(s) available.`,
      outputSchema: {
        notes: z
          .array(
            z.object({
              id: z.string().describe('Unique note identifier'),
              title: z.string().describe('Note title'),
              content: z.string().describe('Note content'),
              createdAt: z.string().describe('ISO timestamp when created'),
            })
          )
          .describe('Array of all notes'),
        count: z.number().describe('Total number of notes'),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      handler: async () => ({
        notes: state.notes,
        count: state.notes.length,
      }),
    },
    [noteCount, noteIds] // Re-register when notes change
  );

  /**
   * Tool: notes_create
   *
   * Creates a new note with inputSchema validation and outputSchema.
   */
  useWebMCP({
    name: 'notes_create',
    description: 'Create a new note with a title and content.',
    inputSchema: {
      title: z.string().min(1).max(100).describe('Title for the new note'),
      content: z.string().min(1).describe('Content/body of the note'),
    },
    outputSchema: {
      success: z.boolean().describe('Whether the note was created'),
      note: z
        .object({
          id: z.string(),
          title: z.string(),
          content: z.string(),
          createdAt: z.string(),
        })
        .describe('The created note'),
    },
    annotations: {
      idempotentHint: false,
    },
    handler: async ({ title, content }) => {
      const note = addNote(title, content);
      return { success: true, note };
    },
    onSuccess: (result) => {
      console.log('Note created:', result.note.title);
    },
  });

  /**
   * Tool: notes_delete
   *
   * Deletes a note by ID.
   */
  useWebMCP(
    {
      name: 'notes_delete',
      description: 'Delete a note by its ID.',
      inputSchema: {
        id: z.string().describe('The ID of the note to delete'),
      },
      outputSchema: {
        success: z.boolean().describe('Whether the deletion succeeded'),
        deletedId: z.string().describe('The ID that was deleted'),
      },
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
      },
      handler: async ({ id }) => {
        const exists = state.notes.some((n) => n.id === id);
        if (!exists) {
          throw new Error(`Note with ID "${id}" not found`);
        }
        deleteNote(id);
        return { success: true, deletedId: id };
      },
    },
    [noteIds] // Re-register when notes change (to validate IDs)
  );

  /**
   * Tool: app_get_theme
   *
   * Gets the current theme setting.
   */
  useWebMCP(
    {
      name: 'app_get_theme',
      description: `Get current app theme. Currently: ${state.theme}`,
      outputSchema: {
        theme: z.enum(['light', 'dark']).describe('Current theme setting'),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      handler: async () => ({ theme: state.theme }),
    },
    [state.theme]
  );

  /**
   * Tool: app_toggle_theme
   *
   * Toggles between light and dark theme.
   */
  useWebMCP({
    name: 'app_toggle_theme',
    description: 'Toggle between light and dark theme.',
    outputSchema: {
      newTheme: z.enum(['light', 'dark']).describe('The new theme after toggle'),
    },
    annotations: {
      idempotentHint: false,
    },
    handler: async () => {
      toggleTheme();
      const newTheme = state.theme === 'light' ? 'dark' : 'light';
      return { newTheme } as const;
    },
  });

  const isDark = state.theme === 'dark';

  return (
    <div
      className={`min-h-screen transition-colors duration-200 ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}
    >
      <div className="max-w-2xl mx-auto p-6">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">WebMCP Demo</h1>
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              React hooks for AI-powered applications
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition-colors ${
              isDark
                ? 'bg-gray-800 hover:bg-gray-700'
                : 'bg-white hover:bg-gray-100 border border-gray-200'
            }`}
            title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
          >
            {isDark ? '🌞' : '🌙'}
          </button>
        </header>

        {/* Tool Status */}
        <section
          className={`rounded-lg p-4 mb-6 ${isDark ? 'bg-gray-800' : 'bg-white border border-gray-200'}`}
        >
          <h2 className="text-lg font-semibold mb-2">Available MCP Tools</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div
              className={`flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
            >
              <span className="text-green-500">●</span>
              <code>notes_list</code>
            </div>
            <div
              className={`flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
            >
              <span className="text-green-500">●</span>
              <code>notes_create</code>
            </div>
            <div
              className={`flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
            >
              <span className="text-green-500">●</span>
              <code>notes_delete</code>
            </div>
            <div
              className={`flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
            >
              <span className="text-green-500">●</span>
              <code>app_get_theme</code>
            </div>
            <div
              className={`flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
            >
              <span className="text-green-500">●</span>
              <code>app_toggle_theme</code>
            </div>
          </div>
        </section>

        {/* Notes List */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Notes ({state.notes.length})</h2>
          </div>

          {state.notes.length === 0 ? (
            <div
              className={`text-center py-12 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-white border border-gray-200'}`}
            >
              <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                No notes yet. Ask an AI assistant to create one!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {state.notes.map((note) => (
                <article
                  key={note.id}
                  className={`rounded-lg p-4 ${isDark ? 'bg-gray-800' : 'bg-white border border-gray-200'}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{note.title}</h3>
                      <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {note.content}
                      </p>
                      <p className={`text-xs mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        {new Date(note.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteNote(note.id)}
                      className={'p-1 rounded hover:bg-red-500/10 text-red-500 transition-colors'}
                      title="Delete note"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Footer */}
        <footer
          className={`mt-12 pt-6 border-t text-center text-sm ${isDark ? 'border-gray-800 text-gray-500' : 'border-gray-200 text-gray-400'}`}
        >
          <p>
            Built with <code>@mcp-b/react-webmcp</code>
          </p>
          <p className="mt-1">
            <a
              href="https://docs.mcp-b.ai/packages/react-webmcp"
              target="_blank"
              rel="noopener noreferrer"
              className={`hover:underline ${isDark ? 'text-blue-400' : 'text-blue-600'}`}
            >
              Documentation
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
