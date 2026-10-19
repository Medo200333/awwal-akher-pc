import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const linkSchema = z.object({
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  https: z.boolean(),
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

const chunkSchema = linkSchema.extend({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: z.string().trim().min(1).max(64),
  eventSearchId: z.string().trim().min(1).max(32),
  eventPos: z.number().int().min(0).max(1_000_000),
  variant: z.number().int().min(0).max(3),
  pageSize: z.number().int().min(0).max(30),
  usersDone: z.boolean(),
  userSearchId: z.string().trim().max(32),
  userPos: z.number().int().min(0).max(1_000_000),
});

export type DeviceLinkInput = z.infer<typeof linkSchema>;
export type ChunkInput = z.infer<typeof chunkSchema>;

export const testDeviceFn = createServerFn({ method: "POST" })
  .validator((data: DeviceLinkInput) => linkSchema.parse(data))
  .handler(async ({ data }) => {
    const { testDevice } = await import("./hikvision.server");
    return testDevice(data);
  });

const cloudLoginSchema = z.object({
  account: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(128),
  imageCode: z.string().trim().max(12).optional(),
  featureCode: z.string().trim().max(64).optional(),
});

const cloudChunkSchema = z.object({
  apiBase: z.string().trim().min(8).max(160),
  sessionId: z.string().trim().min(8).max(256),
  featureCode: z.string().trim().min(8).max(64),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: z.string().trim().min(1).max(64),
  pageIndex: z.number().int().min(1).max(500),
});

export type CloudLoginInput = z.infer<typeof cloudLoginSchema>;
export type CloudChunkInput = z.infer<typeof cloudChunkSchema>;

export const hikLoginFn = createServerFn({ method: "POST" })
  .validator((data: CloudLoginInput) => cloudLoginSchema.parse(data))
  .handler(async ({ data }) => {
    const { hikLogin } = await import("./hik-connect.server");
    return hikLogin(data.account, data.password, data.imageCode ?? "", data.featureCode ?? "");
  });

export const hikPullFn = createServerFn({ method: "POST" })
  .validator((data: CloudChunkInput) => cloudChunkSchema.parse(data))
  .handler(async ({ data }) => {
    const { hikPullChunk } = await import("./hik-connect.server");
    return hikPullChunk(data);
  });

export const pullChunkFn = createServerFn({ method: "POST" })
  .validator((data: ChunkInput) => chunkSchema.parse(data))
  .handler(async ({ data }) => {
    const { pullChunk } = await import("./hikvision.server");
    return pullChunk(data);
  });
