import express from "express";
import authRoutes from "./routes/auth.routes";
import fileRoutes from "./routes/file.routes";
import processingRoutes from "./routes/processing.routes";
import summaryRoutes from "./routes/summary.routes";
import quizRoutes from "./routes/quiz.routes";
import flashcardRoutes from "./routes/flashcard.routes";
import studySessionRoutes from "./routes/studySession.routes";

import { errorHandler } from "./middleware/errorHandler.middleware";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL1,
  process.env.FRONTEND_URL2,
  process.env.FRONTEND_URL3,

  // add more URLs as needed
];
console.log("Allowed Origins:", allowedOrigins);
app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (like mobile apps, curl, etc.)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

app.use(express.json());

// Middleware to log every request
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/file", fileRoutes);
app.use("/api/processing", processingRoutes);
app.use("/api/summary", summaryRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/flashcards", flashcardRoutes);
app.use("/api/study-sessions", studySessionRoutes);

// 404 handler for all unmatched routes
app.use((req, res, next) => {
  res.status(404).json({ error: "Route not found" });
});

app.get("/", (req, res) => {
  res.send("API running");
});

// Global error handler (should be last)
app.use(errorHandler);

export default app;
