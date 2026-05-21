import { useEffect, useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { AppShell } from "./components/AppShell";
import { ModulePanel } from "./components/ModulePanel";
import { loadSnapshot } from "./lib/snapshot";
import { mockSnapshot } from "./data/mockSnapshot";
import type { AppSnapshot, ModuleKey } from "./types";
import "./App.css";

function App() {
  const [activeModule, setActiveModule] = useState<ModuleKey>("dashboard");
  const [snapshot, setSnapshot] = useState<AppSnapshot>(mockSnapshot);

  useEffect(() => {
    loadSnapshot().then(setSnapshot);
  }, []);

  return (
    <AppShell
      activeModule={activeModule}
      snapshot={snapshot}
      onNavigate={setActiveModule}
    >
      {activeModule === "dashboard" ? (
        <Dashboard snapshot={snapshot} />
      ) : (
        <ModulePanel moduleKey={activeModule} snapshot={snapshot} />
      )}
    </AppShell>
  );
}

export default App;
