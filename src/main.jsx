import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import Overlay from "./Overlay";
import { initEngine } from "./engine";

const isOverlay = location.hash === "#overlay";
if (isOverlay) document.documentElement.classList.add("overlay-root");
else initEngine();

createRoot(document.getElementById("root")).render(isOverlay ? <Overlay /> : <App />);
