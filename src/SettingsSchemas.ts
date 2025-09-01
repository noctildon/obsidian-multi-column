import { z } from "zod";

export const SettingSchema = z.object({
	defaultColumns: z.number().default(2),
	showColumnBorders: z.boolean().default(false),
});
