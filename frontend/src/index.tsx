import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { AuthProvider } from "./context/AuthContext";
import { DataProvider } from "./context/DataContext";
import { TimerProvider } from "./context/TimerContext";
import FloatingTimer from "./components/FloatingTimer";

// Disable PWA/service-worker during staging tester launch.
// Old cached bundles can keep stale auth code alive.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => registrations.forEach((registration) => registration.unregister()))
      .catch(() => {});

    if ('caches' in window) {
      caches.keys()
        .then((keys) => keys.forEach((key) => caches.delete(key)))
        .catch(() => {});
    }
  });
}

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <AuthProvider>
      <DataProvider>
        <TimerProvider>
          <App />
          <FloatingTimer />
        </TimerProvider>
      </DataProvider>
    </AuthProvider>
  </React.StrictMode>
);
