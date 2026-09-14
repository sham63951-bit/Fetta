/**
 * Phase 1 API Routes
 * 
 * POST /api/projects/:projectId/phase1/attach - Attach and scan repository
 * GET /api/projects/:projectId/phase1/context - Retrieve Phase 1 context
 */

import { Router, type IRouter } from "express";
import { validatePath } from "../lib/tool-executor";
import { Phase1Scanner } from "../lib/phase1-scanner";
import {
  persistPhase1Context,
  retrievePhase1Context,
  hasPhase1Context,
} from "../lib/phase1-persistence";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * POST /api/projects/:projectId/phase1/attach
 * Attach a repository to a project and run Phase 1 scan
 */
router.post(
  "/projects/:projectId/phase1/attach",
  async (req, res) => {
    const projectId = String(req.params.projectId);
    const { repositoryPath } = req.body;

    try {
      // Validate input
      if (!repositoryPath || typeof repositoryPath !== "string") {
        res.status(400).json({
          error: "repositoryPath is required and must be a string",
        });
        return;
      }

      // Validate path is safe
      const normalized = validatePath(repositoryPath, ".");
      if (!normalized) {
        res.status(400).json({
          error: "Repository path is invalid or outside allowed boundaries",
        });
        return;
      }

      logger.info(
        { projectId, repositoryPath },
        "Starting Phase 1 scan",
      );

      const startTime = Date.now();

      // Run Phase 1 scan
      const scanner = new Phase1Scanner(repositoryPath);
      const contextLayer = await scanner.scan();

      const scanDuration = Date.now() - startTime;

      logger.info(
        {
          projectId,
          scanDuration,
          filesScanned: contextLayer.scan.filesScanned,
          technologies: contextLayer.technologies.length,
          components: contextLayer.components.length,
        },
        "Phase 1 scan completed",
      );

      // Persist results
      const result = await persistPhase1Context(projectId, contextLayer);

      res.json({
        success: true,
        scanId: result.scanId,
        projectId,
        scan: {
          duration: contextLayer.scan.durationMs,
          filesScanned: contextLayer.scan.filesScanned,
          filesSkipped: contextLayer.scan.filesSkipped,
          bytesScanned: contextLayer.scan.bytesScanned,
          errors: contextLayer.scan.errors,
        },
        context: {
          technologies: contextLayer.technologies.length,
          components: contextLayer.components.length,
          entryPoints: contextLayer.entryPoints.length,
          classification: contextLayer.structure.classification,
          hasWorkspaces: contextLayer.structure.hasWorkspaces,
        },
      });
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      logger.error(
        { projectId, error: err },
        "Phase 1 scan failed",
      );

      res.status(500).json({
        error: `Phase 1 scan failed: ${err}`,
      });
    }
  },
);

/**
 * GET /api/projects/:projectId/phase1/context
 * Retrieve Phase 1 context for a project
 */
router.get("/projects/:projectId/phase1/context", async (req, res) => {
  const projectId = String(req.params.projectId);

  try {
    const hasContext = await hasPhase1Context(projectId);

    if (!hasContext) {
      res.status(404).json({
        error: "Project has not been attached or Phase 1 scan not completed",
      });
      return;
    }

    const context = await retrievePhase1Context(projectId);

    if (!context) {
      res.status(404).json({
        error: "Unable to retrieve Phase 1 context",
      });
      return;
    }

    res.json(context);
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    logger.error({ projectId, error: err }, "Failed to retrieve Phase 1 context");

    res.status(500).json({
      error: `Failed to retrieve context: ${err}`,
    });
  }
});

export default router;
