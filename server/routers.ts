import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { getAddressFlow } from "./blockstream";

const isLikelyBitcoinAddress = (value: string) =>
  /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(value) || /^bc1[ac-hj-np-z02-9]{11,71}$/i.test(value);

const bitcoinAddressInput = z.object({
  address: z.string().trim().refine(isLikelyBitcoinAddress, "请输入有效的 BTC 主网地址。"),
  limit: z.number().int().min(1).max(5).default(5),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  bitcoin: router({
    addressFlow: publicProcedure.input(bitcoinAddressInput).query(({ input }) => getAddressFlow(input.address, input.limit)),
  }),
});

export type AppRouter = typeof appRouter;
