import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import AppErrorBoundary from "./components/AppErrorBoundary.jsx";
import "./style.css";

createRoot(document.getElementById("root")).render(
  <AppErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </AppErrorBoundary>
);
