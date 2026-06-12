import React from "react";
import ReactDOM from "react-dom/client";
import App from "./v2/App";
import StandaloneHome from "./StandaloneHome";
import "./v2/index.css";

function shouldRenderExtensionApp() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("standalone") === "1") {
    return false;
  }
  if (params.get("extension") === "1") {
    return true;
  }
  return Boolean(
    window.__WEBFLOW_SECTION_BUILDER_BRIDGE__ || window.webflow || window.Webflow
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {shouldRenderExtensionApp() ? <App /> : <StandaloneHome />}
  </React.StrictMode>
);
