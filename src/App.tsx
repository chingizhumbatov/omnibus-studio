import { useEffect } from "react";
import { RootLayout } from "./components/layout/RootLayout";
import { initIpcBridge } from "./core/ipc/bridge";

function App() {
  useEffect(() => {
    initIpcBridge().catch(console.error);
  }, []);

  return (
    <RootLayout />
  );
}

export default App;
