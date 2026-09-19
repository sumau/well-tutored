import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  getTrustedOrigins,
  isTrustedOrigin,
  requireTrustedMutationOrigin,
  RequestOriginError,
} from "./middlewares/request-origin";
import { apiErrorHandler } from "./middlewares/api-error-handler";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, false);
        return;
      }
      if (isTrustedOrigin(origin)) {
        callback(null, true);
        return;
      }

      logger.warn(
        {
          origin,
          trustedOrigins: [...getTrustedOrigins()],
        },
        "CORS request rejected",
      );
      callback(new RequestOriginError());
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);
app.use("/api/workspace", requireTrustedMutationOrigin);

app.use("/api", router);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found." });
});
app.use(apiErrorHandler);

export default app;
