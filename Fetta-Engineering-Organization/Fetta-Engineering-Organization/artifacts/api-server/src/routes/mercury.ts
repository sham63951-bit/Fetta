import { Router, type IRouter } from "express";
import {
  getMercuryManifest,
  getMercuryStatus,
  startMercuryIngestion,
} from "../lib/mercury";

const router: IRouter = Router();

router.post("/mercury/ingest", async (req, res) => {
  const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
  if (!contentType.includes("zip") && !contentType.includes("octet-stream")) {
    res.status(415).json({ error: "Mercury expects a ZIP archive body." });
    return;
  }
  const archiveName = String(req.headers["x-fetta-archive-name"] ?? "repository.zip");
  try {
    const result = await startMercuryIngestion(req, archiveName);
    res.status(202).json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Unable to accept repository archive.",
    });
  }
});

router.get("/mercury/ingest/:ingestionId", async (req, res) => {
  try {
    res.json(await getMercuryStatus(String(req.params.ingestionId)));
  } catch {
    res.status(404).json({ error: "Mercury ingestion not found." });
  }
});

router.get("/mercury/ingest/:ingestionId/manifest", async (req, res) => {
  try {
    res.json(await getMercuryManifest(String(req.params.ingestionId)));
  } catch {
    res.status(404).json({ error: "Mercury manifest is not ready." });
  }
});

export default router;