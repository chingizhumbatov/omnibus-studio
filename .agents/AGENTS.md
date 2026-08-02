## Strict Coding Guidelines
1. **Zero-Assumption Policy**
Do not invent or assume business requirements. If the prompt does not specify exactly how to handle a specific hardware error (e.g., an RS-485 bus timeout or a broken TCP socket), you must stop and ask for clarification. Silent failures or falling back to default values are strictly prohibited in systems programming.

2. **Total Ban on Hidden Panics and Lazy Code**
The Rust core must not contain any `.unwrap()`, `.expect()`, or `panic!()` macros in production code. All errors must be explicitly propagated via `Result` and handled appropriately. Additionally: no pseudo-code and no `// TODO: implement this later` comments. If you are tasked with writing a function, it must be logically complete and ready for compilation.

3. **Contract-First Development**
Before implementing the logic for Tokio workers or the Tauri IPC bridge, you must first define and present the exact data structures (Rust struct or enum, TypeScript interface). You are strictly forbidden from writing message-passing logic or UI state management until the data contracts are explicitly approved by the user.

4. **Dependency Diet**
Prioritize the simplest and most straightforward native solutions. Do not introduce heavy third-party libraries for trivial tasks. Every new dependency (Cargo crate or npm package) must be explicitly justified and approved by the user before being added to the project.

5. **Strict Context Isolation (Single Focus)**
Solve only the specific task requested in the current prompt. If you are asked to write the `mpsc` channel logic for the Data Hub, do not attempt to draft React UI components or suggest frontend design improvements in the same response. Stay strictly within the requested architectural boundaries.

6. **Style Guide Enforcement**
- **Rust Backend**: Enforce standard `rustfmt` formatting and strict `cargo clippy` linting.
- **Frontend (TypeScript/Tauri)**: Enforce ESLint with `@typescript-eslint/recommended` and Prettier for code formatting.

7. **Git Commit Conventional Standard**
All commits must strictly follow the Conventional Commits specification. Messages must be in English and use the imperative mood (e.g., `feat: add ...`). Valid types are `feat`, `fix`, `chore`, `refactor`, `docs`, `style`, `perf`, `test`. Include scopes (`core`, `ui`, `ipc`) when appropriate.

8. **UI Design Standard (High-Density IDE Mode)**
- **Do not** use standard web/shadcn spacing (e.g. `p-6`, `h-10`, `text-sm`) for main workspace editors.
- **Do** use strict High-Density IDE Mode (like VS Code) to fit more data on screen without scrolling:
  - Base typography: `text-[11px]` (sometimes `text-xs`), headers `uppercase tracking-wider`.
  - Inputs/Selects: `h-7` (28px height) with `px-2 py-1`.
  - Spacing/Gaps: Compact padding like `p-3`, `gap-3`, `px-3 py-1.5`.
  - Containers: `rounded-lg shadow-sm`.
  - Focus rings: subtle (`focus-visible:ring-1 focus-visible:ring-primary`).
