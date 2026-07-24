import { asyncHandler } from "../utils/async-handler";
import { getAssetDetails, getPortfolio } from "../services/portfolio.service";
import { createAsset, deleteAsset, findAssetById, listAssets, updateAsset } from "../repositories/investment.repository";
import { assetSchema, assetUpdateSchema } from "../validators/asset.validator";
import { created, noContent, ok } from "../utils/api-response";
import { notFound } from "../utils/http-error";

export const listAssetPortfolio = asyncHandler(async (_request, response) => {
  if (_request.query.mode === "records") {
    ok(response, await listAssets());
    return;
  }

  ok(response, await getPortfolio());
});

export const showAsset = asyncHandler(async (request, response) => {
  const identifier = String(request.params.id);
  const asset = identifier.length === 24 ? await findAssetById(identifier) : await getAssetDetails(identifier);

  if (!asset) throw notFound("Asset not found");

  ok(response, asset);
});

export const createAssetRecord = asyncHandler(async (request, response) => {
  const input = assetSchema.parse(request.body);
  created(response, await createAsset(input));
});

export const updateAssetRecord = asyncHandler(async (request, response) => {
  const input = assetUpdateSchema.parse(request.body);
  const asset = await updateAsset(String(request.params.id), input);

  if (!asset) throw notFound("Asset not found");

  ok(response, asset);
});

export const deleteAssetRecord = asyncHandler(async (request, response) => {
  const deleted = await deleteAsset(String(request.params.id));
  if (!deleted) throw notFound("Asset not found");
  noContent(response);
});
