# Common WebMCP Patterns by App Type

Real-world examples showing how to structure tools for different types of applications.

## Pattern: Todo List App

```
Phase 1 - Read-Only:
✓ list_todos (readOnlyHint: true)
  - Input: { filter?, sortBy? }
  - Returns: { todos: [...], totalCount: number }

✓ get_todo_by_id (readOnlyHint: true)
  - Input: { id: string }
  - Returns: { todo: {...} }

Phase 2 - Read-Write:
✓ fill_todo_form
  - Input: { text, priority?, dueDate? }
  - Sets form fields, doesn't create

✓ set_filter
  - Input: { status: 'all' | 'active' | 'completed' }
  - Changes visible todos

Phase 3 - Destructive:
✓ create_todo (destructiveHint: true)
  - Creates the todo permanently

✓ delete_todo (destructiveHint: true)
  - Input: { id: string }
  - Permanently removes todo

✓ mark_complete (destructiveHint: true)
  - Input: { id: string, completed: boolean }
  - Changes todo state permanently
```

## Pattern: E-Commerce Site

```
Phase 1 - Read-Only:
✓ search_products
  - Input: { query: string, filters?, page? }
  - Returns: { products: [...], total: number, page: number }

✓ get_product_details
  - Input: { productId: string }
  - Returns: { product: {...}, inStock: boolean, variants: [...] }

✓ get_cart_contents
  - Returns: { items: [...], subtotal: number, tax: number, total: number }

✓ get_shipping_options
  - Input: { address: {...} }
  - Returns: { options: [...] }

Phase 2 - Read-Write:
✓ fill_checkout_form
  - Input: { address: {...}, payment: {...} }
  - Populates form fields

✓ set_quantity
  - Input: { itemId: string, quantity: number }
  - Updates cart UI only (not cart state)

✓ apply_filters
  - Input: { category?, priceRange?, brand? }
  - Changes visible products

✓ navigate_to_page
  - Input: { page: 'products' | 'cart' | 'checkout' }

Phase 3 - Destructive:
✓ add_to_cart (destructiveHint: true)
  - Input: { productId: string, quantity: number, variant? }
  - Changes cart state permanently

✓ remove_from_cart (destructiveHint: true)
  - Input: { itemId: string }

✓ submit_order (destructiveHint: true)
  - Requires: Checkout form filled, payment validated
  - Actually places the order

✓ apply_coupon (destructiveHint: true)
  - Input: { code: string }
  - Validates and applies discount
```

## Pattern: Admin Dashboard

```
Phase 1 - Read-Only:
✓ list_users
  - Input: { page?, limit?, search?, role? }
  - Returns: { users: [...], total: number, page: number }

✓ get_user_details
  - Input: { userId: string }
  - Returns: { user: {...}, permissions: [...], activity: [...] }

✓ get_analytics
  - Input: { startDate: string, endDate: string, metrics: [...] }
  - Returns: { data: {...}, charts: [...] }

✓ search_logs
  - Input: { query: string, level?, startDate?, endDate? }
  - Returns: { logs: [...], count: number }

Phase 2 - Read-Write:
✓ fill_user_form
  - Input: { name?, email?, role?, permissions? }
  - For create/edit workflows

✓ set_date_range
  - Input: { start: string, end: string }
  - Updates analytics view

✓ apply_filters
  - Input: { status?, role?, lastActive? }
  - Filters user list

Phase 3 - Destructive:
✓ create_user (destructiveHint: true)
  - Input: { name: string, email: string, role: string }
  - Creates new user account

✓ update_user (destructiveHint: true)
  - Input: { userId: string, updates: {...} }
  - Modifies user record

✓ delete_user (destructiveHint: true)
  - Input: { userId: string }
  - Requires: Admin role, confirmation dialog
  - Permanently removes user

✓ ban_user (destructiveHint: true)
  - Input: { userId: string, reason: string }
  - Suspends user account

✓ reset_password (destructiveHint: true)
  - Input: { userId: string }
  - Sends password reset email
```

## Pattern: Social Media Platform

```
Phase 1 - Read-Only:
✓ get_feed
  - Input: { page?, filter?: 'all' | 'following' | 'trending' }
  - Returns: { posts: [...], nextPage: string | null }

✓ get_post_details
  - Input: { postId: string }
  - Returns: { post: {...}, comments: [...], likes: number }

✓ get_user_profile
  - Input: { username: string }
  - Returns: { user: {...}, posts: [...], followers: number }

✓ search_posts
  - Input: { query: string, hashtags?, mentions? }
  - Returns: { posts: [...], users: [...] }

Phase 2 - Read-Write:
✓ fill_post_form
  - Input: { text: string, images?, tags? }
  - Populates compose UI

✓ set_privacy
  - Input: { privacy: 'public' | 'followers' | 'private' }
  - Updates post form

Phase 3 - Destructive:
✓ create_post (destructiveHint: true)
  - Publishes the post

✓ delete_post (destructiveHint: true)
  - Input: { postId: string }
  - Requires: Ownership check

✓ like_post (destructiveHint: true)
  - Input: { postId: string }

✓ add_comment (destructiveHint: true)
  - Input: { postId: string, text: string }

✓ follow_user (destructiveHint: true)
  - Input: { userId: string }
```

## Pattern: Project Management Tool

```
Phase 1 - Read-Only:
✓ list_projects
  - Input: { workspace: string, status?, archived? }
  - Returns: { projects: [...] }

✓ get_project_details
  - Input: { projectId: string }
  - Returns: { project: {...}, tasks: [...], members: [...] }

✓ list_tasks
  - Input: { projectId: string, assignee?, status?, priority? }
  - Returns: { tasks: [...] }

✓ get_task_details
  - Input: { taskId: string }
  - Returns: { task: {...}, comments: [...], history: [...] }

Phase 2 - Read-Write:
✓ fill_task_form
  - Input: { title, description?, assignee?, dueDate?, priority? }

✓ set_filters
  - Input: { status?, assignee?, labels? }

✓ update_kanban_view
  - Input: { view: 'board' | 'list' | 'calendar' }

Phase 3 - Destructive:
✓ create_task (destructiveHint: true)
  - Creates new task

✓ move_task (destructiveHint: true)
  - Input: { taskId: string, status: string, position: number }

✓ assign_task (destructiveHint: true)
  - Input: { taskId: string, assigneeId: string }

✓ delete_task (destructiveHint: true)
  - Input: { taskId: string }
  - Requires: Permission check

✓ archive_project (destructiveHint: true)
  - Input: { projectId: string }
  - Requires: Admin/owner confirmation
```

## Common Patterns Across All Apps

### Search Pattern
```
✓ search_X
  - Input: { query: string, filters?, page?, limit? }
  - Returns: { results: [...], total: number, page: number }
  - Always read-only
```

### CRUD Pattern
```
✓ list_X (read-only)
✓ get_X_by_id (read-only)
✓ fill_X_form (read-write)
✓ create_X (destructive)
✓ update_X (destructive)
✓ delete_X (destructive)
```

### Filter Pattern
```
✓ get_filter_options (read-only)
  - Returns available filters

✓ apply_filters (read-write)
  - Updates UI without reloading data

✓ search_with_filters (read-only)
  - Actually fetches filtered results
```

### Form Pattern (Two-Tool)
```
✓ fill_X_form (read-write)
  - Populates fields, user sees it

✓ submit_X_form (destructive)
  - Actually submits
```

## Key Insights

1. **Always start with read-only tools** - Let the LLM see before acting
2. **Separate fill from submit** - Two-tool pattern for all forms
3. **Permission checks in destructive tools** - Validate before acting
4. **Consistent naming** - `domain_verb_noun` format throughout
5. **Include filtering in read tools** - Make queries flexible
6. **Return structured data** - Always include metadata (counts, pages, etc.)
7. **Tool overload solution** - Component-scoped registration (only register tools for current page)
