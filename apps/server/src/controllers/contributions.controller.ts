import { asyncHandler } from "../utils/async-handler";
import { getContributionsOverview } from "../services/portfolio.service";
import {
  createContribution as insertContribution,
  deleteContribution,
  findContributionById,
  listContributions as listContributionRecords,
  updateContribution
} from "../repositories/investment.repository";
import { contributionSchema, contributionUpdateSchema } from "../validators/contribution.validator";
import { created, noContent, ok } from "../utils/api-response";
import { notFound } from "../utils/http-error";

export const listContributions = asyncHandler(async (_request, response) => {
  if (_request.query.mode === "records") {
    ok(response, await listContributionRecords());
    return;
  }

  ok(response, await getContributionsOverview());
});

export const showContribution = asyncHandler(async (request, response) => {
  const contribution = await findContributionById(String(request.params.id));
  if (!contribution) throw notFound("Contribution not found");
  ok(response, contribution);
});

export const createContribution = asyncHandler(async (request, response) => {
  const input = contributionSchema.parse(request.body);
  const contribution = await insertContribution(input);

  created(response, contribution);
});

export const updateContributionRecord = asyncHandler(async (request, response) => {
  const input = contributionUpdateSchema.parse(request.body);
  const contribution = await updateContribution(String(request.params.id), input);

  if (!contribution) throw notFound("Contribution not found");

  ok(response, contribution);
});

export const deleteContributionRecord = asyncHandler(async (request, response) => {
  const deleted = await deleteContribution(String(request.params.id));
  if (!deleted) throw notFound("Contribution not found");
  noContent(response);
});
