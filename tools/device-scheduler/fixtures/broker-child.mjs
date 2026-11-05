import { startBroker } from "../server.mjs";
const [directory, socketPath, policyPath] = process.argv.slice(2);
const broker = await startBroker({ directory, socketPath, policyPath });
process.send("ready");
broker.closed?.then(result => process.send({ closed: result }));
