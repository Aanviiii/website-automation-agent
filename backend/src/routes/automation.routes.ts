/** Routes for the automation API. */
import { Router } from "express";
import { streamAutomation, getHistory } from "../controllers/automation.controller";

const router = Router();

// GET because EventSource (SSE) only supports GET. Inputs come via query string.
router.get("/automate/stream", streamAutomation);
router.get("/history", getHistory);

export default router;
