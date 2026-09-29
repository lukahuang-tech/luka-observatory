import { z } from "zod";
export const viewSchema = z
  .object({
    space: z.string().max(100),
    ids: z.array(z.string().max(150)).max(8),
    start: z.string().regex(/^(18|19|20)\d{2}-(0[1-9]|1[0-2])-01$/),
    end: z.string().regex(/^(18|19|20|21)\d{2}-(0[1-9]|1[0-2])-01$/),
    frequency: z.enum(["M", "A"]),
    transform: z.enum(["level", "index", "yoy"]),
    seriesOptions: z
      .record(
        z.object({ transform: z.enum(["level", "index", "yoy", "change"]) }),
      )
      .optional(),
  })
  .refine((v) => v.start <= v.end, "开始月份必须早于结束月份。");
