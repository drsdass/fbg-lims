import "./styles.css";
import "./globals.js";
import "./app.js";

if ("serviceWorker" in navigator && location.protocol === "https:") window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
