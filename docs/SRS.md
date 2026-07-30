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
  * **Tag Config (Extended)**: Each tag defines `tag_id`, `name`, `unit`, `register_type`, `address`, `bit_offset` (for packed booleans), `data_type`, `byte_order` (for Endianness handling: ABCD, CDAB, etc.), and a `scale` multiplier.
* **Workspaces (Sessions)**: The master configuration file linking physical connection parameters (Baud rate, IP) to instantiated Device Profiles (Slave IDs) and saving the user's dashboard layout. Sessions also contain dynamic system parameters, such as the UI rendering throttle interval (`ui_throttle_ms`).
* **Workspace Configurator UI**: A dedicated interface allowing users to dynamically create, edit, and apply Workspace Sessions without restarting the application. It includes forms for Connection settings (TCP/Serial) and a data grid for building Device Profiles and Tags.

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
* **Data Hub (Tag Dictionary)**: A centralized in-memory state repository. Workers push structured tag updates directly into this hub.
* **Binary Payload Decoder**: A high-performance Rust engine living inside the Protocol Adapters. It slices raw byte streams (`Vec<u8>`) based on register offsets, handles complex Endianness (Byte Swapping), extracts specific bits via masks, and applies scaling multipliers, outputting strongly-typed `TagValue`s to the Data Hub.
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

### 6.4 Integration & Extensions (Plugins & AI)
Modules enabling universal adaptability and intelligent diagnostics.
* **Plugin Registry**: A central orchestrator in the Rust Core that initializes plugins, manages their lifecycles (`start`, `stop`), and aggregates their dynamic JSON schemas to auto-generate UI settings forms.
* **Dual Internal Event Buses**: `tokio::sync::broadcast` channels allowing plugins to passively listen without blocking the main Data Hub. AI plugins subscribe to the high-level Tag Update bus, while Protocol Sniffers subscribe to a dedicated Raw Traffic bus (which employs a zero-cost strategy, only cloning byte arrays if the Sniffer UI is active).
* **AI Copilot Service**: Connects to local (Ollama) or cloud LLMs via the gRPC plugin interface. Enforces Structured Output (JSON schemas) to prevent hallucinations and strictly requires a Human-In-The-Loop confirmation step via the Command Context API before dispatching any hardware write commands.

## 7. Device Profiling and Tag Mapping Architecture

### 7.1 Configuration as Code (Text-First Approach)
To ensure enterprise-grade reliability and seamless integration into modern engineering workflows, the system employs a "Text-First" architecture for hardware configurations. Device profiles (Register Maps) are strictly defined using human-readable schemas (YAML or JSON).
* **Version Control and Portability**: Configurations are treated as standard source code. This allows engineers to version control configurations via Git, track differential changes, automate deployments, and share standardized device templates across the community.
* **UI as an Interface**: The visual configuration builder within the frontend acts strictly as a graphical wrapper that generates and modifies these underlying text schemas. The core Rust engine parses these files at startup, ensuring the system remains functional and configurable via text editors even without the UI.

### 7.2 Decoupled Network Polling
The architecture strictly decouples physical network requests from abstract application tags to prevent network congestion and optimize bus bandwidth (e.g., on RS-485 networks).
* **Contiguous Block Polling**: Instead of dispatching individual network queries for every UI tag, the network worker (e.g., Modbus Engine) evaluates the device profile and reads large, contiguous blocks of memory (Polling Groups).
* **Local Buffer Storage**: The retrieved raw byte arrays are cached in the core's operational memory, effectively creating a local replica of the device's memory map.

### 7.3 Advanced Tag Resolution (N-to-1 and 1-to-N Mapping)
Abstract tags within the Data Hub do not initiate physical network requests. Instead, they resolve their values passively by reading from the local memory buffer using predefined offsets, data types, and bitmasks. This enables highly efficient data transformations:
* **Multiple Registers to One Tag (N-to-1)**: A single abstract tag can span multiple physical registers. For example, a Float32 tag reads 4 consecutive bytes (two 16-bit registers) from a specified offset, concatenating them into a single floating-point value.
* **One Register to Multiple Tags (1-to-N)**: A single 16-bit register containing a packed bitmask (e.g., device alarm flags) can populate multiple independent Boolean tags. Each tag references the identical buffer offset but extracts its state using a specific bit index, completely eliminating redundant network queries.

### 7.4 Granular Endianness Control
To accommodate inconsistent hardware implementations and non-standard byte arrangements across varying manufacturers, byte-order (Endianness) resolution is supported at both the global device profile level and the individual tag level. This guarantees accurate byte-swapping (e.g., ABCD, CDAB, BADC) for specific variables without disrupting the data integrity of the rest of the device map.

### 7.5 Protocol-Agnostic Tag Resolution
The Tag Mapping architecture is inherently protocol-agnostic, designed to support a vast ecosystem of industrial standards via the Plugin Registry. The resolution strategy adapts based on the protocol family:
* **Memory-Mapped Protocols (e.g., Modbus, CAN, Profinet)**: The system utilizes the memory-buffer approach, relying on raw byte retrieval, explicit memory offsets, bitmasks, and endianness rules to extract tag values.
* **High-Level & Event-Driven Protocols (e.g., MQTT, OPC UA, REST)**: For protocols that transmit pre-structured payloads (such as JSON over MQTT or Object Nodes in OPC UA), the device profile schema seamlessly substitutes byte offsets with protocol-specific identifiers (e.g., MQTT Topics with JSONPath expressions, or OPC UA NodeIDs).

Regardless of the data origin or protocol complexity, all worker plugins normalize the extracted data and dispatch standardized UpdateTag payloads to the central Data Hub, ensuring universal interoperability at the UI and AI-Analyst levels.

## 8. Core Terminology & Data Ontology
To maintain architectural clarity between hardware protocols and the abstract UI, the system strictly adheres to the following data ontology:
* **Data Point**: The raw, protocol-specific source of information originating from the physical device or external service (e.g., a Modbus Holding Register, an MQTT Topic, or an OPC UA Node).
* **Data Binding (Tag Mapping)**: The set of configuration parameters (defined in the device profile schema) that instructs the plugin worker on how to extract, parse, and cast a Data Point into a standardized format.
* **Tag State**: The runtime object stored within the in-memory Data Hub. It represents the resolved state of a mapped Data Point and strictly consists of three properties: the normalized Value, the precise Timestamp of the last successful read, and the data Quality indicator (Good, Bad, or Timeout).

## 9. Data Hub Interface (State Inspector)
The Data Hub tab departs from legacy SCADA tabular views, adopting an advanced IDE-style State Inspector paradigm. It serves as the central interface where engineers can monitor, filter, and interact with the globally resolved tag dictionary in real-time.

### 9.1 Live Tag Explorer
The core component of the Data Hub is a high-performance, real-time state table updated continuously via Tauri IPC batching.
* **Tag Identification**: Displays the unique Tag ID and a human-readable description.
* **Live Value**: Renders the current tag state using a strict monospace font to ensure visual stability during rapid data fluctuations.
* **Quality Indicator (QoS)**: A visual color-coded marker indicating data health: Green (Good), Yellow (Stale/Timeout warning), and Red (Bad/Disconnected).
* **Inline Sparklines**: Integrates miniature line charts directly within the table rows, visualizing the last 60 seconds of data trends to provide immediate contextual history without requiring a dedicated dashboard view.
* **Source Binding**: Displays a visual badge indicating the physical data origin (e.g., a Modbus icon paired with COM3 : 40012 or an MQTT icon with its corresponding topic string).

### 9.2 Manual Override & Command Injection
The Data Hub provides a secure, bidirectional interaction model for writable tags.
* **Intent Generation**: Interacting with a writable tag opens an inline input field. Submitting a new value does not execute an immediate hardware write. Instead, it generates a pending command (Intent).
* **Operator Approval**: The Intent is routed to the Command Injection Panel, enforcing a strict Human-In-The-Loop policy. The operator must explicitly approve the action before the Rust core dispatches the write request to the respective hardware worker.

### 9.3 Virtual Tags Manager
A dedicated sub-module for creating and managing derived (calculated) tags.
* **Data Transformation**: Engineers can instantiate virtual tags that do not directly poll physical hardware. Instead, these tags link to existing raw tags (e.g., a raw ADC value ranging from 0-4095) and apply mathematical formulas or interpolation logic to yield processed metrics (e.g., Tank Volume in Liters).
* **Embedded Scripting Engine**: To provide maximum flexibility without compromising performance, the Rust core embeds a lightweight scripting engine (e.g., **Rhai**). This allows engineers to write safe, sandboxed transformation scripts (e.g., `if raw_val > 4000 { ... }`) directly in the UI, which are compiled and executed efficiently in the backend.

### 9.4 Advanced Grouping & Filtering
To effectively manage large-scale industrial architectures containing thousands of tags, the interface implements a robust query engine.
* **Command-Palette Search**: Supports advanced query syntax (e.g., `type:bool quality:bad`), allowing engineers to instantly isolate degraded sensors, filter by data types, or group tags based on specific device profiles and protocols.

### 9.5 Alarm & Event (A&E) Engine
To ensure proactive monitoring, the Data Hub includes a built-in alarm evaluation engine.
* **Threshold & State Alarms**: Users can define operational limits (e.g., High-High, High, Low, Low-Low) for numeric tags or state triggers for boolean tags.
* **Lifecycle & Acknowledgment**: When an alarm triggers, it enters an 'Active' state and is displayed in a dedicated UI Alarm Panel. Operators must explicitly 'Acknowledge' (ACK) critical alarms.
* **Event Persistence**: All alarm state transitions (Triggered, Acknowledged, Cleared) are durably logged into the Tier 2 Embedded SQLite database to form a reliable Audit Trail.

## 10. Concurrency & IPC Optimization

### 10.1 Threading Model: Message Passing via mpsc Channels
To guarantee absolute system stability, eliminate data races, and prevent deadlocks under harsh industrial network conditions, the Rust backend implements a strict **Message Passing** concurrency model instead of shared mutable state.
* **Isolated Producers (Connection Workers)**: Independent Tokio asynchronous tasks (`tokio::spawn`) continuously poll physical ports (COM or TCP). Workers implement a zero-cost **Native Async Trait** (Rust 1.75+) to avoid dynamic allocation overhead (`Box`). Upon receiving raw byte payloads, workers immediately package them into structured messages and push them into an `mpsc` sender channel.
* **Single Consumer (Data Hub Manager)**: A dedicated, single-threaded manager processes incoming messages in a non-blocking background loop. To prevent queue buildup under peak loads, the manager implements **Batch Draining**: after awaiting the first message via `recv().await`, it instantly drains all remaining messages in the queue using `try_recv()` before the next tick. Since this manager holds exclusive mutation rights over the in-memory Tag Dictionary, internal thread locks (`RwLock` or `Mutex`) are entirely eliminated for state updates.

**Core Message Contracts:**

*1. Data Hub Bus (Abstract Tag State):*
```rust
pub enum HubMessage {
    UpdateTag { tag_id: String, raw_payload: Vec<u8> },
    DeviceFault { device_id: String, error_code: u8 },
    PortStatusChange { port_id: String, is_open: bool },
}
```

*2. Diagnostic Bus (Raw Channel Traffic for Sniffers):*
```rust
pub enum TrafficDirection {
    Tx,
    Rx,
}

#[derive(Clone)]
pub enum SnifferMessage {
    RawTraffic {
        port_id: String,
        direction: TrafficDirection,
        payload: Vec<u8>,
        timestamp: u64,
    },
}
```

### 10.2 IPC Batching & UI Throttling
To prevent virtual DOM thread starvation on the React frontend during high-frequency polling, the system avoids emitting individual events per tag update:
* **Interval-Based Batching**: The backend aggregates tag modifications in a temporary dirty set.
* **Configurable Throttled Emission**: A background timer (configurable per session, e.g., every 100ms) flushes accumulated changes, packing them into a single unified JSON payload dispatched via Tauri Events (`app.emit`).
* **Binary IPC for Heavy Payloads**: While standard tag updates use JSON batched events, requests for massive payloads (e.g., Raw byte arrays representing oscillograms) utilize Tauri v2's native `tauri::ipc::Response`. This allows the Rust backend to send raw `ArrayBuffer` directly to the JavaScript V8 engine, entirely bypassing expensive JSON serialization.

### 10.3 Protocol Polling Optimization & Endianness
To maximize throughput and prevent hardware faults (such as Modbus timeouts on unmapped registers), the Protocol Adapters implement intelligent request grouping and robust byte handling:
* **Smart Chunking**: Instead of sending a separate network request per tag, adapters sort tags by address and group them into contiguous "chunks". The adapter splits a chunk into multiple requests if it detects a gap (empty registers) or a different register type, guaranteeing that the system never queries unmapped hardware memory that could cause an `Illegal Data Address` exception.
* **Endianness Engine**: Industrial protocols like Modbus define 16-bit word transmission (Big-Endian) but lack standards for 32/64-bit numbers. The Rust Payload Decoder natively supports Byte/Word Swapping (`ABCD`, `CDAB`, `BADC`, `DCBA`) with `ABCD` (Standard Big-Endian) serving as the default, ensuring correct floating-point and large integer extraction across all manufacturer anomalies.

## 11. Plugin & Extension Architecture

To satisfy the requirements of a truly universal client, the core implements a rigorous, decoupled plugin system. 

### 11.1 Hybrid Runtime Model
Because Rust lacks a stable ABI for dynamic loading (`.dll`/`.so`), the system utilizes a **Hybrid Plugin Model**:
1. **Compile-time Native Plugins (Rust)**: High-frequency protocols (Modbus RTU, Serial Clients) are written in Rust and statically compiled via cargo feature flags. They implement the `ConnectionWorker` native async trait, guaranteeing zero-overhead hardware access.
2. **Runtime Microservice Plugins (gRPC/IPC)**: External analysis tools (e.g., Python-based AI Data Analyzers) run as independent processes. The Rust core acts as a gRPC server, allowing these plugins to connect, subscribe to data, and issue commands securely.

### 11.2 Core Plugin Infrastructure
To support both Native and Microservice plugins, the core provides internal APIs:
* **Plugin Registry**: Manages the `init()`, `start()`, and `stop()` lifecycle of all registered extensions.
* **Dual Broadcast Event Buses (`tokio::sync::broadcast`)**:
  * *Tag State Bus*: The Data Hub echoes all `HubMessage::UpdateTag` events here. High-level plugins (like AI) subscribe to this bus.
  * *Raw Traffic Bus*: Connection workers push `SnifferMessage::RawTraffic` events directly to this bus. Low-level plugins (Sniffers) subscribe here to capture byte-level chronological traffic (TX/RX) per physical port. Workers utilize a "Zero-Cost" optimization, only allocating and emitting raw bytes if `receiver_count() > 0`.
* **Command Injection (Context API)**: Plugins are granted a sandboxed `Context` object. If an AI plugin detects an anomaly and wants to reset a register, it uses this API to push a command into the Data Hub. (Note: AI commands are flagged to require explicit human approval on the UI).
* **Dynamic Configuration (Schema API)**: Plugins define their settings via JSON Schema. The core sends these schemas to the React frontend, which dynamically renders the correct forms (e.g., a Baud Rate dropdown for Modbus, or an API Key field for the AI plugin).

### 11.3 Developer Experience (DX) & Open Source Workflow
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

## 12. Data Persistence Strategy

Due to the extreme volume of time-series data generated by industrial polling (e.g., thousands of tags every 100ms), writing all telemetry directly to a local disk would cause severe I/O bottlenecks and rapid SSD degradation. To maintain a "Zero Bloat", high-performance core, the system utilizes a **Three-Tier Data Strategy**:

### 12.1 Tier 1: In-Memory Ring Buffer (Real-Time Data)
The core Data Hub maintains an in-memory ring buffer (e.g., the last 10,000 points) for every active tag. 
* **Purpose**: Feeds the React frontend with immediate historical context to render smooth, sliding time-series charts without any disk I/O latency.
* **Lifecycle**: Ephemeral. Data is lost on application restart or when the buffer wraps around.

### 12.2 Tier 2: Configuration & Metadata Store
The system stores configurations and system events persistently:
* **JSON Configuration Files**: Workspaces, Device Profiles, and UI Layouts are stored as raw `.json` files in the OS-specific AppData directory (e.g., `~/.config/omnibus-studio/workspaces/`). This ensures manual debuggability, easy sharing/version control, and rapid initial development.
* **Embedded SQLite (Future/Audit Logs)**: A lightweight SQLite database embedded directly into the Rust core will strictly store low-frequency, high-value data, such as Audit Trails (who wrote what value to which register) and System Events (hardware fault records).

### 12.3 Tier 3: External TSDB via Plugins (Long-Term Telemetry)
For long-term retention of raw telemetry (months/years of data), the core offloads the responsibility entirely to the plugin ecosystem.
* **Mechanism**: Dedicated Exporter Plugins (e.g., an InfluxDB or TimescaleDB exporter) subscribe to the `Broadcast Event Bus`.
* **Execution**: These plugins independently batch tag updates and asynchronously flush them to external enterprise Time-Series Databases (TSDB) running on local servers or in the cloud, completely isolating the core system from heavy disk write loads.

### 12.4 Data Export & Reporting Module
To satisfy SCADA/HMI compliance and operational review requirements, the system provides native export capabilities.
* **On-Demand Extraction**: Operators can query historical time-series trends (from the TSDB or Ring Buffer) and system event logs (from SQLite).
* **Standardized Formats**: Extracted data can be exported directly from the client interface into standard formats (CSV, PDF) for shift handovers, daily operator logs, or external auditing.

## 13. System Logging Strategy

To ensure robust diagnostics and debugging, the Rust core employs a structured, asynchronous logging architecture based on the `tracing` ecosystem.

### 13.1 Structured & Contextual Logging
Unlike simple text logs, the core uses **Spans** to track the lifecycle of asynchronous tasks. For example, all logs emitted by a specific hardware worker will inherently carry the connection context (e.g., `[worker=COM3]`). This enables filtering logs by specific devices or plugins without parsing raw text.

### 13.2 Multi-Target Emission
The logging system simultaneously writes to three sinks:
1. **Console (stdout)**: Active primarily during development (`CLI Runner`) for real-time debugging.
2. **Rolling File Appender**: Production logs are saved to the OS-specific AppData directory (e.g., `~/.config/omnibus-studio/logs/`). These files are automatically rotated (e.g., daily or at 10MB limits) to prevent disk exhaustion.
3. **Tauri Event Bridge (UI Console)**: Severe warnings (`WARN`) and critical errors (`ERROR`) are captured by a custom `tracing` subscriber and emitted as Tauri events. The React frontend consumes these events to display real-time notifications or populate an in-app "System Console" for the operator.

### 13.3 Dynamic Log Levels
The system supports dynamic log level adjustments. By default, it operates at `INFO`. For in-depth diagnostics (e.g., analyzing raw hex bytes sent over RS-485), the operator can elevate the target worker's log level to `DEBUG` or `TRACE` dynamically without restarting the application.
