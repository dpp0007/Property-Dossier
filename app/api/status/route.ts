import { hasKey } from "@/lib/tinyfish";
export const GET = () => Response.json({ hasKey: hasKey() });
