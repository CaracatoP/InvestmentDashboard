import { Router } from "express";
import {
  approveByToken,
  changePasswordController,
  confirmApproveByToken,
  confirmRejectByToken,
  forgotPassword,
  login,
  logout,
  me,
  register,
  rejectByToken,
  resetPasswordController
} from "../controllers/auth.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { csrfProtection } from "../middlewares/csrf.middleware";
import { rateLimit } from "../middlewares/rate-limit";

export const authRoutes = Router();

const authLimiter = rateLimit({ keyPrefix: "auth", windowMs: 15 * 60 * 1000, max: 40 });
const passwordLimiter = rateLimit({ keyPrefix: "password", windowMs: 15 * 60 * 1000, max: 10 });
const approvalLimiter = rateLimit({ keyPrefix: "approval", windowMs: 15 * 60 * 1000, max: 30 });

authRoutes.post("/register", authLimiter, register);
authRoutes.post("/login", authLimiter, login);
authRoutes.post("/logout", requireAuth, csrfProtection, logout);
authRoutes.get("/me", requireAuth, me);
authRoutes.post("/forgot-password", passwordLimiter, forgotPassword);
authRoutes.post("/reset-password", passwordLimiter, resetPasswordController);
authRoutes.post("/change-password", requireAuth, csrfProtection, passwordLimiter, changePasswordController);
authRoutes.get("/approvals/:token/approve", approvalLimiter, confirmApproveByToken);
authRoutes.get("/approvals/:token/reject", approvalLimiter, confirmRejectByToken);
authRoutes.post("/approvals/:token/approve", approvalLimiter, approveByToken);
authRoutes.post("/approvals/:token/reject", approvalLimiter, rejectByToken);
