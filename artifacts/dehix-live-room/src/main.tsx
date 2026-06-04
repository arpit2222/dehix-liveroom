import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter, setUnauthorizedHandler } from "@workspace/api-client-react";

setAuthTokenGetter(() => localStorage.getItem("dehix_token"));
setUnauthorizedHandler(() => {
  localStorage.removeItem("dehix_token");
  localStorage.removeItem("dehix_user");
  window.dispatchEvent(new Event("dehix:auth-cleared"));
});

document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(<App />);
