import type { Response } from "express";

export function ok<T>(response: Response, data: T) {
  response.json({ data });
}

export function created<T>(response: Response, data: T) {
  response.status(201).json({ data });
}

export function noContent(response: Response) {
  response.status(204).send();
}
