import { Router } from "express";
import { listCalendarEvents } from "../controllers/calendar.controller";

export const calendarRoutes = Router();

calendarRoutes.get("/", listCalendarEvents);
