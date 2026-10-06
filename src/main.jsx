import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./monitoring.css";
import "./live-monitoring.css";
import "./invite.css";
import "./lecturer-review.css";
import "./movement-log.css";
import "./sidebar-toggle.css";
import "./fixed-topbar.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
