# UI/UX Architecture & Requirements

## 1. Vision & Core Philosophy
The frontend is built using **React** and **Tailwind CSS**. Moving away from traditional legacy SCADA interfaces, the application adopts a professional **desktop engineering workspace (IDE pattern)**. 
Key principles:
- **High Data Density**: Maximizing the amount of actionable information on screen without clutter.
- **Responsiveness**: Fluid UI that reacts instantly to data changes without blocking the main thread.
- **Minimal Visual Noise**: Focus on data and diagnostics rather than decorative elements.

## 2. Visual Language & Aesthetics
### 2.1 Color Palette
- **Dark-Mode First**: Deep graphite and zinc backgrounds (`zinc-900`, `zinc-800`) to reduce eye strain during prolonged debugging sessions.
- **Status Indicators**: Industrial orange and neon status colors (green/red) serve as active RX/TX pulse indicators.
- **Semantic Colors**: Warning/Error states use high-contrast accents to ensure they are immediately visible against the dark background.

### 2.2 Typography
- **Monospace Enforcement**: Strict monospace fonts (e.g., JetBrains Mono, Fira Code) are enforced for numerical values, hexadecimal sniffer logs, and tag registers. This guarantees exact byte alignment and readability.
- **UI Text**: Clean sans-serif (e.g., Inter or Roboto) for standard UI elements (labels, buttons, tooltips).

## 3. Global Layout (IDE Pattern)
The application follows a structured, multi-panel IDE layout:
- **Activity Bar**: A slim left-side panel for global navigation. Modes include: Devices/Ports, Data Hub, Sniffer, AI Analyst, Settings.
- **Contextual Side Bar**: A hierarchical tree view displaying the structure of the selected activity (e.g., `COM3 -> Modbus RTU -> Slave ID 1 -> Register Groups`). Real-time status indicators (Red/Yellow/Green) reflect hardware health.
- **Split-Screen Workspace**: The main area supports multi-panel splitting, allowing engineers to view real-time graphical charts alongside raw HEX sniffer streams simultaneously.
- **Bottom Drawer (Command Injection)**: A collapsible panel for system logs, terminal output, and manual intervention.

## 4. Dual-Mode Main Workspace
To serve both the initial hardware setup phase and continuous daily monitoring, the primary workspace supports two interchangeable visual modes that render the same underlying global state.

### 4.1 Grid Dashboard Mode (Operator View)
- A structured, snap-to-grid layout optimized for high-density information display.
- **Use Case**: Standardized monitoring of charts, gauges, and real-time register values.
- **Features**: Drag-and-drop widget placement, resizable panels, and cross-system correlation on shared charts.

### 4.2 Infinite Canvas / Topology Mode (Engineer View)
- A node-based, interactive canvas (powered by libraries like React Flow).
- **Use Case**: Spatial organization and visual tracing of data flow across the entire architecture.
- **Features**: 
  - Hardware ports, the core Data Hub, Plugins (AI, Sniffer), and UI Widgets are represented as visual cards (nodes). 
  - Engineers can map data routing by connecting edges between nodes.

## 5. Dynamic Interactions & Control
### 5.1 Micro-Animations (Live Pulse)
- Pulsing indicators located next to tags and network ports visually confirm successful cyclic polling loops.
- Stale data or hardware timeouts result in visual dimming (semi-transparent) and the cessation of pulse animations.

### 5.2 Command Injection Panel (Human-In-The-Loop)
- A collapsible, terminal-style bottom drawer.
- **AI Integration**: When the AI Analyst plugin generates a hardware write-intent (e.g., writing to a PLC register), the request surfaces in this panel.
- **Safety First**: It mandates explicit manual operator approval before the Rust core dispatches the physical write command, ensuring no unverified commands are sent to physical hardware.

## 6. Technical UI Constraints
- **Tailwind CSS**: Utility-first styling with a strict design token system.
- **Component Library**: (To be determined - recommendation: headless components like Radix UI or shadcn/ui to maintain full styling control).
- **Virtualization**: Long lists (like hex sniffer logs) must be virtualized (e.g., via `@tanstack/react-virtual`) to maintain 60 FPS.
- **IPC Throttling**: The UI state is updated via batched IPC payloads (Tauri events) to prevent React re-render starvation.
