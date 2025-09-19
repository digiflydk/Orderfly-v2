// Sørger for at .openapi() findes på Zod-typer (krævet af @asteasolutions/zod-to-openapi)
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

/**
 * Gør .openapi() tilgængelig på alle Zod-typer.
 * Skal importeres FØR schemas/registry bruges.
 */
extendZodWithOpenApi(z);
