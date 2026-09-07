import { z } from 'zod';

// HTML inputs submit an empty string when an optional image is not supplied.
export const optionalImageUrl = z.string().trim().pipe(
  z.union([z.literal(''), z.string().url({ message: 'Please enter a valid URL.' })]),
).optional().nullable();
