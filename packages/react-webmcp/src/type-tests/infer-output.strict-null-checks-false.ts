import type { z } from 'zod';
import type { InferOutput } from '../types.js';

type IsEqual<Left, Right> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : false
  : false;

type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;

type UndefinedFallsBackToUnknown = Assert<IsEqual<InferOutput<undefined>, unknown>>;
type ZodOutput = InferOutput<{ name: z.ZodString }>;
type ZodOutputIsNotAny = Assert<IsEqual<IsAny<ZodOutput>, false>>;

declare const zodOutput: ZodOutput;
export const zodName: string = zodOutput.name;

type JsonOutput = InferOutput<{
  type: 'object';
  properties: {
    total: { type: 'number' };
  };
  required: ['total'];
}>;

declare const jsonOutput: JsonOutput;
export const jsonTotal: number = jsonOutput.total;

type HandlerWithoutOutputSchema = () => Promise<InferOutput<undefined>>;
export const handlerWithoutOutputSchema: HandlerWithoutOutputSchema = async () => ({
  items: [],
  total: 0,
});

export const typeRegressionAssertion: UndefinedFallsBackToUnknown = true;
export const zodAnyAssertion: ZodOutputIsNotAny = true;
