import cors from "cors";
import path from "path";
import router from "./app/routes";
import cookieParser from "cookie-parser";
import notFound from "./app/middlewares/notFound";
import express, { Application, Request, Response } from "express";
import globalErrorHandler from "./app/middlewares/globalErrorHandler";

const app: Application = express();

// parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "https://whatsrealeasy-nu.vercel.app",
      "https://www.advanceaimarketing.cloud",
      "https://advanceaimarketing.cloud",
      "https://ai.advanceaimarketing.cloud",
    ],
    credentials: true,
  })
);

// app routes
app.use("/api/v1", router);

app.get("/", async (req: Request, res: Response) => {
  res.render("index.ejs");
});

app.use(globalErrorHandler);
app.use(notFound);

export default app;
