# Channel Editor Component Specification

## Overview
The `ChannelEditor` component (`src/components/devices/ChannelEditor.tsx`) is responsible for managing the configuration of communication channels (e.g., Modbus TCP, Modbus RTU). It acts as the primary interface for users to define network parameters and control the connection state of a specific channel.

## Design Philosophy
Following the High-Density IDE design language:
- **Data Density**: Compact inputs (`h-7`, `text-[11px]`) to maximize screen real estate.
- **Immediate Feedback**: Real-time validation with visual cues (red borders) for invalid inputs.
- **Safety First**: "Connect" and "Save" actions are strictly disabled until all edge cases and validation rules are satisfied.
- **Robust Async State**: Immune to race conditions during connection/disconnection lifecycles.

## State Management & Race Conditions
The component previously suffered from race conditions where the UI would overwrite the backend's connection status.
- **Fix**: The UI sets its internal state to `connecting` **strictly before** awaiting the IPC call to `startChannel`. This ensures that if the backend connects instantaneously and emits `connection-status (ok)`, the `ok` state is preserved and not overwritten by a delayed `connecting` state.
- **Auto-Save**: The current form values are automatically saved to the store before initiating a connection, ensuring the backend always uses the latest user inputs.

## Modbus TCP Transport Validation Rules
The TCP transport configuration involves three critical inputs: IP Address, TCP Port, and Response Timeout. To prevent backend panics, invalid network requests, and poor UX, the following strict validation rules and edge case handling are implemented.

### 1. IP Address / Hostname (`ipAddress`)
- **Type**: `string`
- **Validation**:
  - Must not be empty.
  - Must not have leading or trailing whitespaces.
  - Must be a valid IPv4 address (4 octets, 0-255, no leading zeros like `01`).
  - `localhost` is explicitly allowed.
  - Basic fallback for hostnames and IPv6: `/^[a-zA-Z0-9.\-:]+$/`.
- **Edge Cases Handled**:
  - Empty string defaults to invalid (blocks connection).
  - Out-of-bounds IPv4 (e.g., `256.256.256.256`) is blocked.

### 2. TCP Port (`tcpPort`)
- **Type**: `number | ''` (Empty string allowed during typing)
- **Validation**:
  - Must be a valid number.
  - Must be within the strict TCP port range: `1` to `65535`.
- **Edge Cases Handled**:
  - **Backspace Bug**: Users can now fully delete the input field. Empty string resolves to `""` in local state (instead of defaulting back to `502`), but fails validation, blocking save/connect.
  - **Zero**: `0` is treated as an invalid port (fails validation).
  - **Out of bounds**: Negative numbers or ports > `65535` are invalid.

### 3. Response Timeout (`responseTimeoutMs`)
- **Type**: `number | ''`
- **Validation**:
  - Must be a valid number.
  - Range: `50` ms to `30,000` ms (30 seconds).
- **Edge Cases Handled**:
  - **Too Small**: Values `< 50ms` are blocked. This prevents situations where network latency causes every packet to drop instantly, masquerading as a broken connection.
  - **Too Large**: Values `> 30000ms` are blocked to prevent the backend socket and UI from hanging indefinitely on dead connections.
  - **Negative/Zero**: Blocked to prevent Rust backend panics when converting to `Duration`.

## Modbus Serial (RTU) Transport Validation Rules
The Serial transport configuration requires a valid COM Port name. Incorrect port names cause immediate filesystem errors in the Rust backend.

### 1. COM Port (`portName`)
- **Type**: `string`
- **Validation/UX**:
  - Replaced raw text input with a strict `<select>` dropdown.
  - Users cannot type invalid paths or make typos. They must choose from the list of ports actively scanned by the OS (via `tokio-serial::available_ports()`).
  - **Fallback Preservation**: If a user loads a saved session with a previously configured port (e.g., `/dev/ttyUSB0`) that is currently unplugged, this port is still injected into the `<select>` list to preserve configuration state.
- **Edge Cases Handled**:
  - The strict selection guarantees that leading/trailing whitespaces or completely invalid paths are impossible to input.

### 2. IPC Data Flow (Bridge)
- The frontend converts the `ChannelNode` into the strictly typed `ConnectionConfig` for Rust via `src/core/ipc/bridge.ts`.
- **Critical Mapping**: The user's selected `portName` is dynamically mapped to the `port` field in the Rust configuration payload, removing legacy hardcoded defaults (e.g., `COM1`), ensuring cross-platform compatibility (macOS/Linux `/dev/*` paths).

## UI Behavior on Validation Failure
When `isConfigValid` evaluates to `false`:
1. The offending input field receives a red border and red focus ring (`border-red-500/50 focus-visible:ring-red-500`).
2. A helper text (`text-[9px] text-red-400`) appears below the input explaining the constraint.
3. The **Connect** button is disabled, styled as `bg-secondary/50 text-secondary-foreground/50 cursor-not-allowed`.
4. The **Save** button is similarly disabled.

## Status Button Logic
The Connect/Disconnect button accurately reflects the channel's lifecycle:
- **Connecting**: Shows a spinning loader and the text `Stop`.
- **Faulted**: If the backend fails to connect (e.g., TCP Timeout), the button correctly stops spinning and shows `Stop (Faulted)`, allowing the user to easily reset or disconnect.
- **Connected (ok)**: Shows the unplug icon and `Disconnect`.

## IDE Mode UI Behaviors

### 1. Auto-Save on Connect
- To streamline UX, clicking the **Connect** button automatically saves any uncommitted changes to the global state (`useUIStore`) before dispatching the connection command to Rust.
- **Visual Feedback**: When an auto-save occurs during a connect action, the **Save** button briefly transitions to a "Saved! ✔" state for 2 seconds to explicitly signal to the user that their latest inputs were accepted and applied.

### 2. Strict State Locking (Active Connections)
- When a channel is in a `connecting` or `ok` (running) state, all configuration inputs (IP, Ports, Timeouts, etc.) are strictly disabled (`disabled={isRunning}`) and styled with `opacity-50` and `cursor-not-allowed`.
- **Reasoning**: This prevents the user from modifying parameters while the background Rust worker is polling. It ensures that the UI always perfectly reflects the configuration that the backend is currently using. Users must explicitly click **Disconnect** (Stop) to unlock the form and make changes.
