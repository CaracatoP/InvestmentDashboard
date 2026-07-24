import { z } from "zod";

export const allocationSchema = z.object({
  allocations: z
    .array(
      z.object({
        category: z.string().min(2),
        targetPercentage: z.number().min(0).max(100),
        priority: z.number().int().positive().optional()
      })
    )
    .min(1)
    .refine((allocations) => allocations.reduce((total, item) => total + item.targetPercentage, 0) === 100, {
      message: "Allocation targets must add up to 100"
    })
});
