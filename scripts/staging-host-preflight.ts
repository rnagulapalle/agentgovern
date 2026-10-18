import { readFile } from "node:fs/promises";
import { stagingHostAdmission } from "../runtime/temporal/staging-host";
async function main() {
  const [inventoryPath, planPath, extra] = process.argv.slice(2);
  if (!inventoryPath || !planPath || extra) throw Error("Expected inventory and resource-plan file paths");
  const inventory: unknown = JSON.parse(await readFile(inventoryPath, "utf8"));
  const plan: unknown = JSON.parse(await readFile(planPath, "utf8"));
  const result = stagingHostAdmission(inventory, plan);
  console.log(JSON.stringify({ scope: "read-only host memory admission", ...result, notVerified: ["CPU, disk, network or sustained capacity", "runtime resource limits match declared plan", "database and provider isolation", "remote operational acceptance", "release eligibility"] }, null, 2));
  if (!result.admitted) process.exitCode = 1;
}
main().catch(() => { console.error("Host admission unavailable: provide fresh sanitized inventory and a complete resource plan. Nothing was deployed."); process.exitCode = 1; });
