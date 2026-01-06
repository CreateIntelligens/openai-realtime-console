import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./components/App";
import "./base.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
