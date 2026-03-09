import { API_BASE } from "./utils/api";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { AuthProvider } from "./context/AuthContext";
import { DataProvider } from "./context/DataContext";

// @ts-ignore
import { registerSW } from 'virtual:pwa-register';

// ✅ Added detailed logging to catch installation crashes
registerSW({ 
  immediate: true,
  onOfflineReady() {
    console.log('✅ PWA: App is ready to work offline');
  },
  onRegisterError(error: any) {
    console.error('❌ PWA: Service worker registration error', error);
  }
});

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