import { API_BASE } from "./utils/api";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { AuthProvider } from "./context/AuthContext";
import { DataProvider } from "./context/DataContext";

// @ts-ignore - This is a virtual module provided by vite-plugin-pwa
import { registerSW } from 'virtual:pwa-register';

// Register service worker for PWA offline capabilities
registerSW({ immediate: true });

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <AuthProvider>
      <DataProvider>
        <App />
      </DataProvider>
    </AuthProvider>
  </React.StrictMode>
);