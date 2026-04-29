import { BadRequestException, PipeTransform } from "@nestjs/common";
import type { ZodTypeAny, infer as zInfer } from "zod";

/**
 * Validates and transforms request payloads with a Zod schema. Schema parse
 * errors surface as a 400 with a flattened issue list.
 */
export class ZodValidationPipe<S extends ZodTypeAny>
  implements PipeTransform<unknown, zInfer<S>>
{
  constructor(private readonly schema: S) {}

  transform(value: unknown): zInfer<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Validation failed",
        issues: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
          code: i.code,
        })),
      });
    }
    return result.data;
  }
}
