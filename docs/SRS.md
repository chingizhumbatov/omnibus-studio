# Software Requirements Specification (SRS) - V3

**Cross-Platform Open-Source Universal Industrial Client**

## 1. Executive Summary & Project Vision
This document outlines the functional, technical, and architectural requirements for an open-source, high-performance, cross-platform industrial client application. The tool serves as a universal protocol monitor driven by a robust plugin ecosystem, featuring advanced diagnostics, AI integration, and a unified data architecture designed for reliability in harsh industrial network environments.

## 2. Target System Architecture & Technology Stack
The application leverages a decoupled architecture using **Tauri v2 (Rust + React/TypeScript)**.
* **Unified Data Hub (Tag Dictionary)**: The Rust core maintains an abstract dictionary of Tags (raw byte payloads). The frontend subscribes to these tags, entirely agnostic of the underlying physical protocols.
* **Isolated Connection Workers**: Each physical port (e.g., COM3, TCP socket) runs on a dedicated Tokio asynchronous worker thread. This guarantees that hardware timeouts, CRC errors, or electrical faults on one RS-485 line do not block or degrade the polling performance of other active connections.
* **Event Bus**: Workers push raw data into the Data Hub, which batches state changes and emits a unified IPC payload to the React frontend to prevent UI thread starvation during high-frequency polling.

## 3. Functional Requirements

### 3.1 Configuration Management: Profiles & Workspaces
* **Device Profiles (Templates)**: Reusable JSON files describing a specific device's memory map (registers, data types) independent of connection parameters. Supports complex data types including Int64/Float64, Arrays, and Raw byte streams.
* **Workspaces (Sessions)**: The master configuration file linking physical connection parameters (Baud rate, IP) to instantiated Device Profiles (Slave IDs) and saving the user's dashboard layout. Sessions also contain dynamic system parameters, such as the UI rendering throttle interval (`ui_throttle_ms`).

### 3.2 Core Protocol Communications & Auto-Recovery
* **Concurrent Multi-Protocol Polling**: Simultaneous polling across multiple Modbus RTU (serial) and Modbus TCP interfaces.
* **Graceful Degradation & Auto-Recovery**: The system distinguishes between _Transport Errors_ (OS-level port denial) and _Device Errors_ (bus timeouts). Faulty ports transition to a non-blocking "Faulted" state. A background retry loop automatically attempts to recover the connection without requiring user intervention.

### 3.3 Advanced UI Visualization & Diagnostics
* **Tree View Navigation**: Hierarchical layout displaying physical ports as parent nodes and devices as children. Real-time status indicators (Red for Transport Error, Yellow/Orange for Device Timeout, Green for OK).
* **Unified Drag-and-Drop Dashboards**: Users can drag Tags from entirely different physical networks (e.g., a Modbus RTU sensor and a TCP gateway) onto a single, shared time-series chart for cross-system correlation.
* **Asynchronous Time-Series Alignment**: Charts dynamically interpolate data points from sources with vastly different, asynchronous polling rates (e.g., 100ms vs 2000ms).
* **Stale Data Handling**: Upon connection loss, the last known values are retained on the UI but visually dimmed (semi-transparent) alongside a timestamp indicating the last successful read.

### 3.4 Extensibility & Protocol Plugins
The application features a hybrid plugin architecture allowing community-driven extensions:
* **Native Rust Plugins**: High-performance, in-tree compiled extensions for direct hardware access (e.g., Modbus RTU, Modbus TCP, low-level sniffers).
* **External Microservices (gRPC/IPC)**: Out-of-tree processes communicating via local sockets, ideal for AI diagnostic services (Python) or heavy external drivers (OPC UA).

### 3.5 AI-Powered Diagnostic Assistant
* **Local-First & Cloud BYOK**: Support for local LLMs (e.g., Ollama with Structured Output/Grammars) to maintain air-gapped security, alongside optional Cloud APIs (OpenAI/Anthropic via Function Calling).
* **Human-In-The-Loop Execution**: AI returns structured JSON intents. All write commands strictly require manual operator approval before being sent to the hardware.

## 4. Distribution & CI/CD
* **Multi-Platform Packaging**: Automated builds for `.exe`, `.dmg`, `.AppImage`, and `.deb` via GitHub Actions.
* **Licensing**: GNU General Public License v3 (GPLv3) to ensure copyleft protection and foster community contributions.

## 6. Core Application Modules

### 6.1 System Core (Rust Backend)
Operates at the OS level utilizing the Tokio asynchronous runtime to ensure high-performance, non-blocking hardware I/O.
* **Isolated Connection Workers**: Independent coroutines managing dedicated physical ports (COM or TCP). If a fault or timeout occurs on one line, the respective worker enters a background auto-recovery loop without blocking the polling cycles of other active connections.
* **Data Hub (Tag Dictionary)**: A centralized in-memory state repository. Workers push raw bytes (`Vec<u8>`) read from hardware registers directly into this hub.
* **Workspace Manager**: Handles file system operations, loading JSON Device Profiles, and initializing full workspace sessions upon application startup.

### 6.2 IPC Bridge & Event Bus (Tauri)
The communication layer isolating the React frontend from direct hardware access.
* **Commands API**: Tauri invoke functions allowing the frontend to securely request port initialization, modify configurations, or dispatch write commands.
* **Event Broadcaster**: A mechanism that batches state changes from the Data Hub and emits unified payloads (e.g., every 100ms) to the frontend, preventing virtual DOM thread starvation during high-frequency polling.

### 6.3 Frontend (React + TypeScript)
Acts as a "smart client" strictly responsible for data parsing, state management, and real-time visualization.
* **Tree View Navigation**: A sidebar displaying the hierarchy of physical ports and instantiated devices, complete with real-time connection status indicators (Transport/Device errors).
* **Dashboard System (Canvas)**: A dynamic grid supporting drag-and-drop, allowing tags from disparate physical networks to be placed onto shared widgets.
* **Time-Series Charts**: Renders asynchronous timelines, dynamically interpolating mixed-frequency data and visually dimming stale data during connection timeouts.
* **Payload Decoder**: TypeScript utilities (utilizing DataView) that parse incoming raw byte arrays into standard types (Float32/64, Int16/32/64), strings, and arrays on the fly prior to rendering.

### 6.4 Integration & Extensions (Plugins & AI)
Modules enabling universal adaptability and intelligent diagnostics.
* **Plugin Registry**: A central orchestrator in the Rust Core that initializes plugins, manages their lifecycles (`start`, `stop`), and aggregates their dynamic JSON schemas to auto-generate UI settings forms.
* **Internal Event Bus**: A `tokio::sync::broadcast` channel allowing plugins (like Sniffers or AI) to passively listen to all Tag updates without blocking the main Data Hub.
* **AI Copilot Service**: Connects to local (Ollama) or cloud LLMs via the gRPC plugin interface. Enforces Structured Output (JSON schemas) to prevent hallucinations and strictly requires a Human-In-The-Loop confirmation step via the Command Context API before dispatching any hardware write commands.

## 7. Concurrency & IPC Optimization

### 7.1 Threading Model: Message Passing via mpsc Channels
To guarantee absolute system stability, eliminate data races, and prevent deadlocks under harsh industrial network conditions, the Rust backend implements a strict **Message Passing** concurrency model instead of shared mutable state.
* **Isolated Producers (Connection Workers)**: Independent Tokio asynchronous tasks (`tokio::spawn`) continuously poll physical ports (COM or TCP). Workers implement a zero-cost **Native Async Trait** (Rust 1.75+) to avoid dynamic allocation overhead (`Box`). Upon receiving raw byte payloads, workers immediately package them into structured messages and push them into an `mpsc` sender channel.
* **Single Consumer (Data Hub Manager)**: A dedicated, single-threaded manager processes incoming messages in a non-blocking background loop. To prevent queue buildup under peak loads, the manager implements **Batch Draining**: after awaiting the first message via `recv().await`, it instantly drains all remaining messages in the queue using `try_recv()` before the next tick. Since this manager holds exclusive mutation rights over the in-memory Tag Dictionary, internal thread locks (`RwLock` or `Mutex`) are entirely eliminated for state updates.

**Core Message Contract:**
```rust
pub enum HubMessage {
    UpdateTag { tag_id: String, raw_payload: Vec<u8> },
    DeviceFault { device_id: String, error_code: u8 },
    PortStatusChange { port_id: String, is_open: bool },
}
```

### 7.2 IPC Batching & UI Throttling
To prevent virtual DOM thread starvation on the React frontend during high-frequency polling, the system avoids emitting individual events per tag update:
* **Interval-Based Batching**: The backend aggregates tag modifications in a temporary dirty set.
* **Configurable Throttled Emission**: A background timer (configurable per session, e.g., every 100ms) flushes accumulated changes, packing them into a single unified JSON payload dispatched via Tauri Events (`app.emit`).
* **Binary IPC for Heavy Payloads**: While standard tag updates use JSON batched events, requests for massive payloads (e.g., Raw byte arrays representing oscillograms) utilize Tauri v2's native `tauri::ipc::Response`. This allows the Rust backend to send raw `ArrayBuffer` directly to the JavaScript V8 engine, entirely bypassing expensive JSON serialization.

## 8. Plugin & Extension Architecture

To satisfy the requirements of a truly universal client, the core implements a rigorous, decoupled plugin system. 

### 8.1 Hybrid Runtime Model
Because Rust lacks a stable ABI for dynamic loading (`.dll`/`.so`), the system utilizes a **Hybrid Plugin Model**:
1. **Compile-time Native Plugins (Rust)**: High-frequency protocols (Modbus RTU, Serial Clients) are written in Rust and statically compiled via cargo feature flags. They implement the `ConnectionWorker` native async trait, guaranteeing zero-overhead hardware access.
2. **Runtime Microservice Plugins (gRPC/IPC)**: External analysis tools (e.g., Python-based AI Data Analyzers) run as independent processes. The Rust core acts as a gRPC server, allowing these plugins to connect, subscribe to data, and issue commands securely.

### 8.2 Core Plugin Infrastructure
To support both Native and Microservice plugins, the core provides internal APIs:
* **Plugin Registry**: Manages the `init()`, `start()`, and `stop()` lifecycle of all registered extensions.
* **Broadcast Event Bus (`tokio::sync::broadcast`)**: The Data Hub echoes all `HubMessage::UpdateTag` events to this bus. Plugins (like a Modbus Sniffer) can subscribe to this bus and passively log or analyze traffic without causing a bottleneck in the primary `mpsc` channel.
* **Command Injection (Context API)**: Plugins are granted a sandboxed `Context` object. If an AI plugin detects an anomaly and wants to reset a register, it uses this API to push a command into the Data Hub. (Note: AI commands are flagged to require explicit human approval on the UI).
* **Dynamic Configuration (Schema API)**: Plugins define their settings via JSON Schema. The core sends these schemas to the React frontend, which dynamically renders the correct forms (e.g., a Baud Rate dropdown for Modbus, or an API Key field for the AI plugin).

### 8.3 Developer Experience (DX) & Open Source Workflow
To foster a strong open-source community, the extension system provides two distinct workflows tailored to different developer needs:

#### 1. In-Tree Native Rust Plugins
**Target Audience**: Developers building high-performance protocol drivers (e.g., Modbus, MQTT, CAN) or low-level sniffers.
**Workflow**:
1. Clone the Omnibus Studio repository.
2. Create a new module inside `src-tauri/src/plugins/`.
3. Implement the `ConnectionWorker` (for hardware polling) and `PluginDefinition` (to provide the UI settings JSON Schema) traits.
4. Register the plugin in the central `plugin_registry.rs`.
5. Submit a Pull Request. Once merged, the plugin is compiled statically into the application, ensuring zero-overhead execution and out-of-the-box availability for all users.

#### 2. Out-of-Tree Microservice Plugins (gRPC)
**Target Audience**: Data scientists, AI engineers, or corporate integrators writing custom analytics, AI models, or bridging heavy enterprise systems (OPC UA) in languages like Python, Go, or C#.
**Workflow**:
1. **No Rust Required**: The developer does not need to clone the main repository or compile Rust code.
2. **Download Schema**: They download the official `omnibus.proto` file.
3. **Generate & Code**: Using standard gRPC tools, they generate a client for their preferred language (e.g., Python) and write a script that connects to the Omnibus Studio local gRPC server (e.g., `localhost:50051`).
4. **Subscribe & Act**: The script subscribes to the tag data stream. When anomalous data is detected, the script can issue a write command back to the core (which will prompt the user for safety confirmation on the UI).
5. **Distribution**: The developer can independently publish their script on GitHub. End-users simply run the script alongside their pre-compiled Omnibus Studio executable to magically link the systems together.

**Reference Use Case: Model Context Protocol (MCP) Server**
The gRPC microservice architecture is the officially recommended approach for integrating Omnibus Studio with AI assistants via the **Model Context Protocol (MCP)**.
Instead of bloating the Rust core with an HTTP/SSE server and prompt-engineering logic, developers can create a lightweight Python or Node.js MCP server script. This script communicates with an AI (like Claude Desktop) over standard `stdio` and translates MCP tool calls into `gRPC` commands sent to Omnibus Studio. This decoupling allows the community to freely iterate on AI prompts and MCP tool definitions without requiring core Rust updates, while the core continues to strictly manage the physical hardware and ensure Human-In-The-Loop safety for all AI-initiated write commands.

## 9. Data Persistence Strategy

Due to the extreme volume of time-series data generated by industrial polling (e.g., thousands of tags every 100ms), writing all telemetry directly to a local disk would cause severe I/O bottlenecks and rapid SSD degradation. To maintain a "Zero Bloat", high-performance core, the system utilizes a **Three-Tier Data Strategy**:

### 9.1 Tier 1: In-Memory Ring Buffer (Real-Time Data)
The core Data Hub maintains an in-memory ring buffer (e.g., the last 10,000 points) for every active tag. 
* **Purpose**: Feeds the React frontend with immediate historical context to render smooth, sliding time-series charts without any disk I/O latency.
* **Lifecycle**: Ephemeral. Data is lost on application restart or when the buffer wraps around.

### 9.2 Tier 2: Embedded SQLite (Metadata & Audit Logs)
A lightweight SQLite database is embedded directly into the Rust core. It strictly stores low-frequency, high-value data:
* **Configuration**: Workspaces, Device Profiles, and UI Layouts.
* **Audit Trail**: Logs of human operator actions (who wrote what value to which register) and safety overrides.
* **System Events**: Hardware fault records, connection timeouts, and system errors.

### 9.3 Tier 3: External TSDB via Plugins (Long-Term Telemetry)
For long-term retention of raw telemetry (months/years of data), the core offloads the responsibility entirely to the plugin ecosystem.
* **Mechanism**: Dedicated Exporter Plugins (e.g., an InfluxDB or TimescaleDB exporter) subscribe to the `Broadcast Event Bus`.
* **Execution**: These plugins independently batch tag updates and asynchronously flush them to external enterprise Time-Series Databases (TSDB) running on local servers or in the cloud, completely isolating the core system from heavy disk write loads.

## 10. System Logging Strategy

To ensure robust diagnostics and debugging, the Rust core employs a structured, asynchronous logging architecture based on the `tracing` ecosystem.

### 10.1 Structured & Contextual Logging
Unlike simple text logs, the core uses **Spans** to track the lifecycle of asynchronous tasks. For example, all logs emitted by a specific hardware worker will inherently carry the connection context (e.g., `[worker=COM3]`). This enables filtering logs by specific devices or plugins without parsing raw text.

### 10.2 Multi-Target Emission
The logging system simultaneously writes to three sinks:
1. **Console (stdout)**: Active primarily during development (`CLI Runner`) for real-time debugging.
2. **Rolling File Appender**: Production logs are saved to the OS-specific AppData directory (e.g., `~/.config/omnibus-studio/logs/`). These files are automatically rotated (e.g., daily or at 10MB limits) to prevent disk exhaustion.
3. **Tauri Event Bridge (UI Console)**: Severe warnings (`WARN`) and critical errors (`ERROR`) are captured by a custom `tracing` subscriber and emitted as Tauri events. The React frontend consumes these events to display real-time notifications or populate an in-app "System Console" for the operator.

### 10.3 Dynamic Log Levels
The system supports dynamic log level adjustments. By default, it operates at `INFO`. For in-depth diagnostics (e.g., analyzing raw hex bytes sent over RS-485), the operator can elevate the target worker's log level to `DEBUG` or `TRACE` dynamically without restarting the application.
