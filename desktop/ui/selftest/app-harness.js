// The real practice stack (launcher + runtime + surface) over the REAL Rust store: the Store Port transport posts to the
// self-test server, which forwards to `qs-scenario port-serve`. Everything except the Tauri IPC is the shipped code.
import { createStorePort } from '../web/src/store-port.js';
import { createPracticeRuntime } from '../web/src/practice/runtime.js';
import { renderLauncher } from '../web/src/practice/launcher.js';

const transport = async (command, args) => (await fetch('/port', { method: 'POST', body: JSON.stringify({ command, args }) })).json();
const port = createStorePort(transport);
const rt = await createPracticeRuntime(port);
await renderLauncher(document.getElementById('main'), rt);
window.appHarness = { port, rt };
document.title = 'app-ready';
