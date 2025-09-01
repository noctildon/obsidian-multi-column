import { z } from "zod";

export const SettingSchema = z.object({
	defaultColumns: z.number().default(2),
	showColumnBorders: z.boolean().default(false),
	buttonSize: z.number().min(0.5).max(2.0).default(1.0),
});
