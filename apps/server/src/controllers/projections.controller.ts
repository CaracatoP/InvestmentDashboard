import { asyncHandler } from "../utils/async-handler";
import { calculateProjection } from "../services/projection.service";
import { projectionSchema } from "../validators/projection.validator";
import { ok } from "../utils/api-response";

export const calculateProjectionController = asyncHandler(async (request, response) => {
  const input = projectionSchema.parse(request.body);

  ok(response, calculateProjection(input));
});
