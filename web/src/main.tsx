import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/table.css";
import "./styles/table-editing.css";
import "./styles/filters.css";
import "./styles/editors.css";
import "./styles/schema.css";

import ReactDOM from "react-dom/client";

import App from "./App";
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
