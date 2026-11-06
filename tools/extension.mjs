import { joinSession } from "@github/copilot-sdk/extension";
import { deviceTools, attachDeviceSession } from "./task-runtime/lib/device-session.mjs";
let adapter;
const session = await joinSession({ tools: deviceTools(() => adapter) });
adapter = attachDeviceSession(session);
