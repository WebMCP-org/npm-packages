# WebMCP Framework Examples

Runnable mini apps showing how to register a WebMCP tool in common frontend frameworks.

Each example is a standalone project with minimal scaffolding — install, run, and see a registered tool in action.

| Framework                           | Tool Registered                    | StackBlitz                                                                                                                                                                |
| ----------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [React](./frameworks/react/)        | `say_hello` (via `useWebMCP` hook) | [![Open](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/WebMCP-org/npm-packages/tree/main/examples/frameworks/react)   |
| [Vue](./frameworks/vue/)            | `current_route`                    | [![Open](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/WebMCP-org/npm-packages/tree/main/examples/frameworks/vue)     |
| [Svelte](./frameworks/svelte/)      | `get_info`                         | [![Open](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/WebMCP-org/npm-packages/tree/main/examples/frameworks/svelte)  |
| [Next.js](./frameworks/nextjs/)     | `get_status`                       | [![Open](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/WebMCP-org/npm-packages/tree/main/examples/frameworks/nextjs)  |
| [Angular](./frameworks/angular/)    | `get_status`                       | [![Open](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/WebMCP-org/npm-packages/tree/main/examples/frameworks/angular) |
| [Astro](./frameworks/astro/)        | `get_status`                       | [![Open](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/WebMCP-org/npm-packages/tree/main/examples/frameworks/astro)   |
| [Vanilla TS](./frameworks/vanilla/) | `get_status`                       | [![Open](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/WebMCP-org/npm-packages/tree/main/examples/frameworks/vanilla) |

## Running Locally

```bash
cd examples/frameworks/<name>
pnpm install
pnpm dev
```

Then verify the registered tool is on the page by checking for `navigator.modelContext.tools` in the browser console.

## Cloning a Single Example (Sparse Checkout)

You can clone just one example without pulling the entire monorepo:

```bash
git clone --filter=blob:none --no-checkout https://github.com/WebMCP-org/npm-packages.git
cd npm-packages
git sparse-checkout set examples/frameworks/react
git checkout main
```

Replace `react` with any framework name (`vue`, `svelte`, `nextjs`, `angular`, `astro`, `vanilla`).
