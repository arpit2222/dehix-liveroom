import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter, setUnauthorizedHandler, setBaseUrl } from "@workspace/api-client-react";

const apiBaseUrl = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

setBaseUrl(apiBaseUrl || null);
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  if (typeof input === "string" && input.startsWith("/api/")) {
    return originalFetch(apiBaseUrl + input, init);
  }
  return originalFetch(input, init);
};
setAuthTokenGetter(() => localStorage.getItem("dehix_token"));
setUnauthorizedHandler(() => {
  localStorage.removeItem("dehix_token");
  localStorage.removeItem("dehix_user");
  window.dispatchEvent(new Event("dehix:auth-cleared"));
});

const savedTheme = localStorage.getItem("dehix_theme");
document.documentElement.classList.toggle("dark", savedTheme === "dark");

createRoot(document.getElementById("root")!).render(<App />);
