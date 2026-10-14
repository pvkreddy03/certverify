import { hostedPreflight } from "../lib/hosting/preflight";
if (process.argv.length !== 2) throw new Error("Offline preflight accepts no arguments and never applies migrations or deploys.");
const report = hostedPreflight(process.env);
console.log(JSON.stringify(report, null, 2));
if (!report.readyForHostedVerification) process.exitCode = 2;
