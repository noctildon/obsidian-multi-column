import { z } from "zod";

export const SettingSchema = z.object({
	defaultColumns: z.number().default(2),
	enableInteractiveEditing: z.boolean().default(true),
	showColumnBorders: z.boolean().default(false),
});
