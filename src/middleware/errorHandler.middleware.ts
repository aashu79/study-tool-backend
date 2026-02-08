import { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";
  console.error(`Error in ${req.method} ${req.url}:`, err);
  res.status(status).json({ error: message });
}
