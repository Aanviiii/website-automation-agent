import { runAutomation } from "./src/agent/automationTask";
(async () => {
  const r = await runAutomation({
    url: "https://ui.shadcn.com/docs/forms/react-hook-form",
    name: "Himanshu Rathi",
    description: "Filled automatically by the Website Automation Agent.",
  });
  console.log("RESULT:", JSON.stringify(r, null, 2));
  process.exit(0);
})();
