import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import Overlay from "./Overlay";
import { initEngine } from "./engine";
import { hydrate } from "./store";

const isOverlay = location.hash === "#overlay";
if (isOverlay) document.documentElement.classList.add("overlay-root");

hydrate().then(() => {
  if (!isOverlay) initEngine();
  createRoot(document.getElementById("root")).render(isOverlay ? <Overlay /> : <App />);
});
