import { Router } from "express";
import {
  approveAdminUser,
  disableAdminUser,
  listAdminUsers,
  reactivateAdminUser,
  rejectAdminUser
} from "../controllers/admin-users.controller";
import { requireAdmin } from "../middlewares/auth.middleware";

export const adminRoutes = Router();

adminRoutes.use(requireAdmin);
adminRoutes.get("/users", listAdminUsers);
adminRoutes.post("/users/:userId/approve", approveAdminUser);
adminRoutes.post("/users/:userId/reject", rejectAdminUser);
adminRoutes.post("/users/:userId/disable", disableAdminUser);
adminRoutes.post("/users/:userId/reactivate", reactivateAdminUser);
