import {
  approveUserByAdmin,
  disableUser,
  listUsers,
  reactivateUser,
  rejectUserByAdmin
} from "../services/auth.service";
import { ok } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";
import { requireCurrentRequestAuth } from "../utils/request-auth";

export const listAdminUsers = asyncHandler(async (_request, response) => {
  ok(response, await listUsers());
});

export const approveAdminUser = asyncHandler(async (request, response) => {
  const auth = requireCurrentRequestAuth(request);
  ok(response, await approveUserByAdmin(String(request.params.userId), auth.userId));
});

export const rejectAdminUser = asyncHandler(async (request, response) => {
  const auth = requireCurrentRequestAuth(request);
  ok(response, await rejectUserByAdmin(String(request.params.userId), auth.userId));
});

export const disableAdminUser = asyncHandler(async (request, response) => {
  const auth = requireCurrentRequestAuth(request);
  ok(response, await disableUser(String(request.params.userId), auth.userId));
});

export const reactivateAdminUser = asyncHandler(async (request, response) => {
  const auth = requireCurrentRequestAuth(request);
  ok(response, await reactivateUser(String(request.params.userId), auth.userId));
});
