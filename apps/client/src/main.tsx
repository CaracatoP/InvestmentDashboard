import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes/router";
import "./styles/globals.css";
import { applyThemePreference, getStoredThemePreference } from "./theme/app-theme";

applyThemePreference(getStoredThemePreference());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
