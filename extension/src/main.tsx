import React from "react";
import ReactDOM from "react-dom/client";
import App from "./v2/App";
import StandaloneHome from "./StandaloneHome";
import "./v2/index.css";

// Bump on every bundle rebuild so you can confirm which bundle Webflow loaded
// (open the Designer dev console). Backend fixes deploy separately via git.
const BUNDLE_VERSION = "2026-07-15b · rename sections inline (name drives section_{key}); cleaner output: standard scaffold on normal sections, single clean class per node (no duplicate combos), section-wide backgrounds on the section";
// eslint-disable-next-line no-console
console.log(`%c[Webflow Builder] bundle ${BUNDLE_VERSION}`, "color:#00d09c;font-weight:bold");

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
