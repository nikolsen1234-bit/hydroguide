import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "leaflet/dist/leaflet.css";
import "./index.css";
import { ConfigurationProvider } from "./context/ConfigurationContext";
import { LanguageProvider } from "./i18n";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LanguageProvider>
        <ConfigurationProvider>
          <App />
        </ConfigurationProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>
);
