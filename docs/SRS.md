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
* **Device Profiles (Templates)**: Reusable JSON files describing a specific device's memory map (registers, data types) independent of connection parameters.
* **Workspaces (Sessions)**: The master configuration file linking physical connection parameters (Baud rate, IP) to instantiated Device Profiles (Slave IDs) and saving the user's dashboard layout.

### 3.2 Core Protocol Communications & Auto-Recovery
* **Concurrent Multi-Protocol Polling**: Simultaneous polling across multiple Modbus RTU (serial) and Modbus TCP interfaces.
* **Graceful Degradation & Auto-Recovery**: The system distinguishes between _Transport Errors_ (OS-level port denial) and _Device Errors_ (bus timeouts). Faulty ports transition to a non-blocking "Faulted" state. A background retry loop automatically attempts to recover the connection without requiring user intervention.

### 3.3 Advanced UI Visualization & Diagnostics
* **Tree View Navigation**: Hierarchical layout displaying physical ports as parent nodes and devices as children. Real-time status indicators (Red for Transport Error, Yellow/Orange for Device Timeout, Green for OK).
* **Unified Drag-and-Drop Dashboards**: Users can drag Tags from entirely different physical networks (e.g., a Modbus RTU sensor and a TCP gateway) onto a single, shared time-series chart for cross-system correlation.
* **Asynchronous Time-Series Alignment**: Charts dynamically interpolate data points from sources with vastly different, asynchronous polling rates (e.g., 100ms vs 2000ms).
* **Stale Data Handling**: Upon connection loss, the last known values are retained on the UI but visually dimmed (semi-transparent) alongside a timestamp indicating the last successful read.

### 3.4 Extensibility & Protocol Plugins
* **Lightweight Scripting Engine**: Embedded interpreter (e.g., Lua/Rhai) for custom payload parsing on the UI layer.
* **External Microservices (gRPC)**: Local gRPC interface for heavy, community-driven protocol drivers (e.g., OPC UA) running as independent processes.

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
* **Payload Decoder**: TypeScript utilities (utilizing DataView) that parse incoming raw byte arrays into Float32, Int16, or strings on the fly prior to rendering.

### 6.4 Integration & Extensions (Plugins & AI)
Modules enabling universal adaptability and intelligent diagnostics.
* **AI Copilot Service**: Connects to local (Ollama) or cloud LLMs. Enforces Structured Output (JSON schemas) to prevent hallucinations and strictly requires a Human-In-The-Loop confirmation step before dispatching any hardware write commands.
* **Plugin Gateway**: Interfaces for embedded UI parsing scripts (Lua/JS) or external gRPC endpoints for heavy protocol drivers (e.g., OPC UA) developed by the community.

## 7. Concurrency & IPC Optimization

### 7.1 Threading Model: Message Passing via mpsc Channels
To guarantee absolute system stability, eliminate data races, and prevent deadlocks under harsh industrial network conditions, the Rust backend implements a strict **Message Passing** concurrency model instead of shared mutable state.
* **Isolated Producers (Connection Workers)**: Independent Tokio asynchronous tasks (`tokio::spawn`) continuously poll physical ports (COM or TCP). Upon receiving raw byte payloads, workers immediately package them into structured messages and push them into an `mpsc` sender channel, ensuring that a lagging connection never blocks other active lines.
* **Single Consumer (Data Hub Manager)**: A dedicated, single-threaded manager processes incoming messages in a non-blocking background loop (`while let Some(msg) = receiver.recv().await`). Since this manager holds exclusive mutation rights over the in-memory Tag Dictionary, internal thread locks (`RwLock` or `Mutex`) are entirely eliminated for state updates.

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
* **Throttled Emission**: A background timer (firing every 100ms) flushes accumulated changes, packing them into a single unified JSON payload dispatched via Tauri Events (`app.emit`). This guarantees a smooth, predictable UI render rate (10 FPS) regardless of backend polling intensity.
